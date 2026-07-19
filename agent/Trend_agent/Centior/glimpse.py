"""
Glimpse "Top Fashion & Apparel Trends" scraper  ->  atomic RawObservation records.

Target: https://meetglimpse.com/trends/fashion-apparel-trends/
Stack:  Selenium (renders JS) + Google Gemini 2.5 Pro via LangChain (structured output).

The page lists many individual trends. Gemini explodes the page into MANY atomic
observations — one per distinct trend-thing — each tagged with its `group`
(color/silhouette/pattern/material/item_style/aesthetic/brand) and group-specific
extracted_attributes. Schema/prompt/save logic is shared via raw_schema.py.

No hallucination:
  * temperature = 0
  * the prompt forbids inventing anything not in the text
  * any value not present is stored as "NA"
  * demand_direction is only set when the text clearly signals it
    (Glimpse "Exploding" -> rising, "Peaked" -> peaking, declining -> fading),
    otherwise "unknown".

Requirements:
    pip install selenium webdriver-manager beautifulsoup4 pydantic python-dotenv \
                langchain langchain-google-genai

.env file (same folder):
    GOOGLE_API_KEY=your_key_here
"""

import os
import time
from contextlib import suppress
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

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


# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
TARGET_URL  = "https://meetglimpse.com/trends/fashion-apparel-trends/"
SOURCE_NAME = "glimpse"                   # provenance label for the `source` field
GEMINI_MODEL = "gemini-2.5-pro"

RAW_DATA_DIR  = os.path.join(SCRIPT_DIR, "Raw_data")
RUN_TIMESTAMP = rs.run_timestamp()

SELENIUM_RETRIES = 3
PAGE_LOAD_TIMEOUT = 45
SCRIPT_TIMEOUT = 20
WAIT_TIMEOUT = 20
COMMAND_TIMEOUT = 35

# Shared Gemini extraction chain (returns atomic, group-tagged observations).
extraction_chain = rs.build_extraction_chain(GEMINI_MODEL, api_key=api_key)


# --------------------------------------------------------------------------- #
# Selenium render
# --------------------------------------------------------------------------- #
def setup_driver():
    options = Options()
    options.page_load_strategy = "eager"
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--ignore-certificate-errors")
    options.add_argument("--log-level=3")
    options.add_argument("--window-size=1920,1080")
    options.add_experimental_option("excludeSwitches", ["enable-logging"])
    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()),
        options=options,
    )
    driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
    driver.set_script_timeout(SCRIPT_TIMEOUT)
    with suppress(Exception):
        driver.command_executor._client_config.timeout = COMMAND_TIMEOUT
    return driver


def _page_text_from_html(html: str) -> str:
    soup = BeautifulSoup(html or "", "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    elements = soup.find_all(["h1", "h2", "h3", "h4", "li", "p"])
    return "\n".join(
        el.get_text(" ", strip=True)
        for el in elements
        if el.get_text(strip=True)
    )


def fetch_static_page_text(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    try:
        with urlopen(request, timeout=PAGE_LOAD_TIMEOUT) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            html = response.read().decode(charset, errors="replace")
        return _page_text_from_html(html)
    except (HTTPError, URLError, TimeoutError, OSError) as e:
        print(f"Static fetch failed: {e}")
        return ""


def render_page_text(url: str) -> str:
    last_error = None
    for attempt in range(1, SELENIUM_RETRIES + 1):
        driver = None
        try:
            driver = setup_driver()
            driver.get(url)
            WebDriverWait(driver, WAIT_TIMEOUT).until(
                EC.presence_of_element_located((By.TAG_NAME, "p"))
            )
            # Scroll to bottom so all lazy-loaded trend sections render.
            last_h = 0
            for _ in range(15):
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(1.5)
                new_h = driver.execute_script("return document.body.scrollHeight")
                if new_h == last_h:
                    break
                last_h = new_h

            text = _page_text_from_html(driver.page_source)
            if text.strip():
                return text
            raise RuntimeError("rendered page did not contain readable text")
        except KeyboardInterrupt:
            raise
        except Exception as e:
            last_error = e
            print(f"Selenium render attempt {attempt}/{SELENIUM_RETRIES} failed: {e}")
            time.sleep(2 * attempt)
        finally:
            if driver is not None:
                with suppress(Exception):
                    driver.quit()

    print("Selenium render failed. Trying static HTML fetch ...")
    text = fetch_static_page_text(url)
    if text.strip():
        return text

    raise RuntimeError(f"Could not load text from {url}") from last_error


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    if not os.environ.get("GOOGLE_API_KEY"):
        print("Warning: GOOGLE_API_KEY not found in environment/.env")

    print(f"Rendering {TARGET_URL} ...")
    raw_text = render_page_text(TARGET_URL)
    print(f"Got {len(raw_text)} chars of text. Extracting observations with {GEMINI_MODEL} ...")

    items = rs.run_extraction(extraction_chain, raw_text)
    print(f"Extracted {len(items)} atomic observations.")

    observations = rs.build_observations(
        items, source=SOURCE_NAME, source_url=TARGET_URL, captured_date=RUN_TIMESTAMP
    )
    if observations:
        path = rs.save_observations(observations, source_slug=SOURCE_NAME, raw_data_dir=RAW_DATA_DIR)
        print(f"\nDone! Wrote {len(observations)} observations to:\n{path}")
    else:
        print("\nNo observations produced.")


if __name__ == "__main__":
    main()
