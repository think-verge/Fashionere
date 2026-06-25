"""
Fashion Week Data scraper  ->  normalized RawObservation records.

Stack: Selenium (renders JS) + Google Gemini via LangChain (structured output).

Flow per page:
  Selenium loads & renders the page  ->  BeautifulSoup pulls clean text
  ->  Gemini extracts attributes into a Pydantic schema (structured output)
  ->  one validated RawObservation appended incrementally to the target file.

Missing / unavailable values are stored as "NA" — never guessed.

Requirements:
    pip install selenium webdriver-manager beautifulsoup4 pydantic python-dotenv \
                langchain langchain-google-genai

.env file (same folder):
    GOOGLE_API_KEY=your_key_here
"""

import os
import uuid
import json
import time
import threading
from datetime import datetime, timezone
from typing import List, Literal, Union, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

from dotenv import load_dotenv
from pydantic import BaseModel, Field

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate

load_dotenv()
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

# Append everything into this existing file (kept as a JSON array of records).
OUTPUT_FILE = r"C:\Users\JaswanthPall_fnohyb7\Desktop\VS  Code\Centior\Raw_data\raw_observations_20260619_130906.json"

# Change if needed (e.g. "gemini-1.5-flash", "gemini-1.5-pro").
GEMINI_MODEL = "gemini-2.5-pro"

NA = "NA"
RUN_TIMESTAMP = datetime.now(timezone.utc).isoformat()
_write_lock = threading.Lock()


# --------------------------------------------------------------------------- #
# Pydantic models
# --------------------------------------------------------------------------- #
class ExtractedAttributes(BaseModel):
    """Normalized fashion attributes. Leave a list EMPTY if not present in the text.
    (Adjust this vocab to match your project's controlled vocabulary.)"""
    garments:         List[str] = Field(default_factory=list, description="e.g. blazer, trench coat, slip dress")
    colors:           List[str] = Field(default_factory=list, description="e.g. burgundy, butter yellow")
    materials:        List[str] = Field(default_factory=list, description="e.g. leather, silk, denim")
    patterns:         List[str] = Field(default_factory=list, description="e.g. floral, pinstripe, polka dot")
    silhouettes:      List[str] = Field(default_factory=list, description="e.g. oversized, A-line, tailored")
    styles:           List[str] = Field(default_factory=list, description="aesthetics e.g. minimalist, gorpcore")
    brands_designers: List[str] = Field(default_factory=list, description="named brands or designers")
    seasons:          List[str] = Field(default_factory=list, description="e.g. SS26, FW25")
    keywords:         List[str] = Field(default_factory=list, description="other salient trend keywords")


class LLMExtraction(BaseModel):
    """The part Gemini fills in from the raw text."""
    raw_type: Literal["product", "search_term", "hashtag", "palette", "editorial"] = Field(
        default="editorial", description="Type of the observation"
    )
    demand_direction: Literal["rising", "peaking", "fading", "unknown"] = Field(
        default="unknown", description="Trend momentum if clearly signaled, else 'unknown'"
    )
    extracted_attributes: ExtractedAttributes = Field(default_factory=ExtractedAttributes)


class RawObservation(BaseModel):
    observation_id: str
    source: str
    source_url: str
    captured_date: str
    raw_type: str
    extracted_attributes: Union[Dict[str, Any], str]   # dict of attrs, or "NA"
    demand_direction: str
    raw_text: str


# --------------------------------------------------------------------------- #
# LLM chain (Gemini structured output)
# --------------------------------------------------------------------------- #
_SYSTEM_PROMPT = (
    "You normalize raw fashion editorial text into structured trend attributes. "
    "Only record attributes that are EXPLICITLY present in the text. "
    "Never invent or infer values that are not supported by the text. "
    "If an attribute type is not mentioned, leave its list empty. "
    "For demand_direction, only choose rising/peaking/fading when the text clearly "
    "signals momentum; otherwise use 'unknown'."
)

llm = ChatGoogleGenerativeAI(
    model=GEMINI_MODEL,
    temperature=0,
    google_api_key=api_key,
)
structured_llm = llm.with_structured_output(LLMExtraction)
prompt = ChatPromptTemplate.from_messages([
    ("system", _SYSTEM_PROMPT),
    ("human", "Extract trend attributes from this text:\n\n{text}"),
])
extraction_chain = prompt | structured_llm


def extract_structured(raw_text: str) -> LLMExtraction:
    """Return a validated LLMExtraction. Falls back to all-empty (-> NA) on any failure."""
    if not raw_text or not raw_text.strip():
        return LLMExtraction()
    try:
        result = extraction_chain.invoke({"text": raw_text[:12000]})
        return result if isinstance(result, LLMExtraction) else LLMExtraction(**result)
    except Exception as e:
        print(f"   ⚠️  extraction failed ({e}); storing NA attributes")
        return LLMExtraction()


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
# Build record + NA handling + append
# --------------------------------------------------------------------------- #
def _na(value):
    """Empty / missing -> 'NA', otherwise return the value unchanged."""
    if value is None:
        return NA
    if isinstance(value, str) and not value.strip():
        return NA
    if isinstance(value, (list, dict)) and len(value) == 0:
        return NA
    return value


def build_observation(url: str, raw_text: str, extraction: LLMExtraction) -> dict:
    attrs = {k: _na(v) for k, v in extraction.extracted_attributes.model_dump().items()}
    if all(v == NA for v in attrs.values()):
        attrs = NA  # nothing was extracted at all

    obs = RawObservation(
        observation_id=str(uuid.uuid4()),
        source=_na(SOURCE_NAME),
        source_url=_na(url),
        captured_date=_na(RUN_TIMESTAMP),
        raw_type=_na(extraction.raw_type),
        extracted_attributes=attrs,
        demand_direction=_na(extraction.demand_direction),
        raw_text=_na(raw_text),
    )
    return obs.model_dump()


def append_observation(obs: dict):
    """Thread-safe append into the JSON array file (creates it if missing)."""
    with _write_lock:
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        data = []
        if os.path.exists(OUTPUT_FILE):
            try:
                with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                data = loaded if isinstance(loaded, list) else [loaded]
            except (json.JSONDecodeError, ValueError):
                data = []  # empty/corrupt file -> start fresh array
        data.append(obs)
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


# --------------------------------------------------------------------------- #
# Worker: render -> extract -> append
# --------------------------------------------------------------------------- #
def process_report(item):
    url = item["url"]
    try:
        raw_text = render_page_text(url)
    except Exception as e:
        return {"url": url, "error": str(e)}

    extraction = extract_structured(raw_text)
    obs = build_observation(url, raw_text, extraction)
    append_observation(obs)            # <-- scrape and append at the same time
    return {"url": url, "observation_id": obs["observation_id"]}


# --------------------------------------------------------------------------- #
# Orchestrator
# --------------------------------------------------------------------------- #
def scrape_all_reports_parallel():
    if not api_key:
        print("⚠️  No API key found in environment/.env")
        return

    report_links = get_report_links()
    print(f"Found {len(report_links)} report links.")

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_map = {executor.submit(process_report, item): item for item in report_links}
        for future in as_completed(future_map):
            result = future.result()
            if "error" in result:
                print(f"❌ {result['url']}: {result['error']}")
            else:
                print(f"✅ {result['url']} -> {result['observation_id']}")

    print(f"\nDone! Appended records to:\n{OUTPUT_FILE}")


if __name__ == "__main__":
    scrape_all_reports_parallel()