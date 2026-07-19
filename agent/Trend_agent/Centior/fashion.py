"""
Fashion Week Data scraper  ->  atomic, group-tagged RawObservation records.

Stack: Selenium (renders JS) + Google Gemini via LangChain (structured output).

Flow per page:
  Selenium loads & renders the page  ->  BeautifulSoup pulls clean text
  ->  Gemini explodes it into MANY atomic observations (one per trend-thing),
      each tagged with its `group` (color/silhouette/pattern/material/item_style/
      aesthetic/brand) and group-specific extracted_attributes
  ->  all observations collected and written once to a timestamped file.

The schema, extraction prompt, NA handling and saving all live in raw_schema.py
so every Centior scraper produces identical output.

Missing / unavailable values are stored as "NA" — never guessed.

Requirements:
    pip install selenium webdriver-manager beautifulsoup4 pydantic python-dotenv \
                langchain langchain-google-genai

.env file (same folder):
    GOOGLE_API_KEY=your_key_here
"""

import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from dotenv import load_dotenv

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup

import raw_schema as rs

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(SCRIPT_DIR, ".env"))
api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
if api_key:
    os.environ["GOOGLE_API_KEY"] = api_key

if not api_key:
    raise SystemExit(
        "API key not found. Set GOOGLE_API_KEY or GEMINI_API_KEY in your .env file."
    )

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
BASE_URL    = "https://fashionweekdata.com"
SOURCE_NAME = "fashionweekdata"          # provenance label for the `source` field
MAX_WORKERS = 3                          # each worker = 1 Chrome instance -> keep low (RAM)
GEMINI_MODEL = "gemini-2.5-pro"

RAW_DATA_DIR  = os.path.join(SCRIPT_DIR, "Raw_data")
RUN_TIMESTAMP = rs.run_timestamp()

# Shared Gemini extraction chain (returns atomic, group-tagged observations).
extraction_chain = rs.build_extraction_chain(GEMINI_MODEL, api_key=api_key)

# Collect observations from every worker, then write one file at the end.
_collected = []
_collect_lock = threading.Lock()


# --------------------------------------------------------------------------- #
# Selenium
# --------------------------------------------------------------------------- #
def setup_driver():
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_experimental_option("excludeSwitches", ["enable-logging"])
    return webdriver.Chrome(
        service=Service(ChromeDriverManager().install()),
        options=options,
    )


def get_report_links():
    print("Fetching initial report links...")
    driver = setup_driver()
    try:
        driver.get(BASE_URL)
        time.sleep(4)  # let the SPA render
        soup = BeautifulSoup(driver.page_source, "html.parser")

        links, seen = [], set()
        for a in soup.find_all("a", href=True):
            href = a["href"]
            text = a.get_text(" ", strip=True).lower()
            if "read report" in text or "report" in href.lower() or "index" in href.lower():
                full_url = href if href.startswith("http") else BASE_URL + href
                clean_url = full_url.split("#")[0]
                if clean_url not in seen and clean_url != BASE_URL:
                    seen.add(clean_url)
                    links.append({"title": a.get_text(" ", strip=True), "url": clean_url})
        return links
    finally:
        driver.quit()


def render_page_text(url: str) -> str:
    """Selenium-render a page and return clean text from headers/paragraphs."""
    driver = setup_driver()
    try:
        driver.get(url)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "p"))
        )
        time.sleep(2)  # let late content settle
        soup = BeautifulSoup(driver.page_source, "html.parser")
        elements = soup.find_all(["h1", "h2", "h3", "h4", "p"])
        return "\n\n".join(
            el.get_text(" ", strip=True) for el in elements if el.get_text(strip=True)
        )
    finally:
        driver.quit()  # free RAM before the LLM call


# --------------------------------------------------------------------------- #
# Worker: render -> extract atomic observations -> collect
# --------------------------------------------------------------------------- #
def process_report(item):
    url = item["url"]
    try:
        raw_text = render_page_text(url)
    except Exception as e:
        return {"url": url, "error": str(e)}

    items = rs.run_extraction(extraction_chain, raw_text)
    observations = rs.build_observations(
        items, source=SOURCE_NAME, source_url=url, captured_date=RUN_TIMESTAMP
    )
    with _collect_lock:
        _collected.extend(observations)
    return {"url": url, "count": len(observations)}


# --------------------------------------------------------------------------- #
# Orchestrator
# --------------------------------------------------------------------------- #
def scrape_all_reports_parallel():
    report_links = get_report_links()
    print(f"Found {len(report_links)} report links.")

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_map = {executor.submit(process_report, item): item for item in report_links}
        for future in as_completed(future_map):
            result = future.result()
            if "error" in result:
                print(f"FAILED {result['url']}: {result['error']}")
            else:
                print(f"OK     {result['url']} -> {result['count']} observations")

    if _collected:
        path = rs.save_observations(_collected, source_slug=SOURCE_NAME, raw_data_dir=RAW_DATA_DIR)
        print(f"\nDone! Wrote {len(_collected)} observations to:\n{path}")
    else:
        print("\nNo observations produced.")


if __name__ == "__main__":
    scrape_all_reports_parallel()
