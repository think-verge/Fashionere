"""
Glimpse "Top Fashion & Apparel Trends" scraper  ->  RawObservation records.

Target: https://meetglimpse.com/trends/fashion-apparel-trends/
Stack:  Selenium (renders JS) + Google Gemini 2.5 Pro via LangChain (structured output).

The page lists many individual trends, each with its own momentum signal.
So this produces ONE RawObservation per trend (not per page).

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
import uuid
import json
import time
from contextlib import suppress
from datetime import datetime, timezone
from typing import List, Literal, Union, Dict, Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

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

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(SCRIPT_DIR, ".env"))


# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
TARGET_URL  = "https://meetglimpse.com/trends/fashion-apparel-trends/"
SOURCE_NAME = "glimpse"                   # provenance label for the `source` field

OUTPUT_FILE = r"C:\Users\JaswanthPall_fnohyb7\Desktop\VS  Code\Centior\Raw_data\raw_observations_20260619_130906.json"

GEMINI_MODEL = "gemini-2.5-pro"

NA = "NA"
RUN_TIMESTAMP = datetime.now(timezone.utc).isoformat()

SELENIUM_RETRIES = 3
PAGE_LOAD_TIMEOUT = 45
SCRIPT_TIMEOUT = 20
WAIT_TIMEOUT = 20
COMMAND_TIMEOUT = 35


# --------------------------------------------------------------------------- #
# Pydantic models
# --------------------------------------------------------------------------- #
class ExtractedAttributes(BaseModel):
    """Normalized fashion attributes. Leave a list EMPTY if not present in the text."""
    garments:         List[str] = Field(default_factory=list, description="e.g. cargo pants, slip dress, blazer")
    colors:           List[str] = Field(default_factory=list, description="e.g. butter yellow, burgundy")
    materials:        List[str] = Field(default_factory=list, description="e.g. leather, linen, denim")
    patterns:         List[str] = Field(default_factory=list, description="e.g. floral, animal print")
    silhouettes:      List[str] = Field(default_factory=list, description="e.g. oversized, baggy, tailored")
    styles:           List[str] = Field(default_factory=list, description="aesthetics e.g. athleisure, coastal, quiet luxury")
    brands_designers: List[str] = Field(default_factory=list, description="named brands or designers")
    seasons:          List[str] = Field(default_factory=list, description="e.g. SS26, FW25")
    keywords:         List[str] = Field(default_factory=list, description="other salient trend keywords")


class TrendObservation(BaseModel):
    """One trend extracted from the article."""
    raw_text: str = Field(description="The trend name and its short description, verbatim from the page")
    raw_type: Literal["product", "search_term", "hashtag", "palette", "editorial"] = Field(
        default="search_term", description="What kind of item this trend is"
    )
    demand_direction: Literal["rising", "peaking", "fading", "unknown"] = Field(
        default="unknown",
        description="Map ONLY from explicit signals: Exploding/growing->rising, "
                    "Peaked->peaking, declining/falling->fading, else unknown",
    )
    extracted_attributes: ExtractedAttributes = Field(default_factory=ExtractedAttributes)


class ExtractionResult(BaseModel):
    """All trends found on the page."""
    trends: List[TrendObservation] = Field(default_factory=list)


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
# Gemini chain (structured output)
# --------------------------------------------------------------------------- #
_SYSTEM_PROMPT = (
    "You extract fashion trends from the provided article text into a structured list. "
    "Create one entry per distinct trend the article describes. "
    "STRICT RULES: "
    "Only use information EXPLICITLY present in the text. Never invent, guess, or infer "
    "anything that is not stated. "
    "If an attribute is not mentioned for a trend, leave its list empty. "
    "Set demand_direction ONLY from explicit momentum wording in the text "
    "('exploding'/'rising'/'growing' -> rising, 'peaked' -> peaking, "
    "'declining'/'falling'/'fading' -> fading). If the text does not clearly state "
    "the momentum for that trend, use 'unknown'. "
    "Keep raw_text close to the article's own wording for that trend."
)

llm = ChatGoogleGenerativeAI(model=GEMINI_MODEL, temperature=0)
structured_llm = llm.with_structured_output(ExtractionResult)
prompt = ChatPromptTemplate.from_messages([
    ("system", _SYSTEM_PROMPT),
    ("human", "Extract all fashion trends from this article:\n\n{text}"),
])
extraction_chain = prompt | structured_llm


def extract_trends(raw_text: str) -> ExtractionResult:
    if not raw_text or not raw_text.strip():
        return ExtractionResult()
    try:
        result = extraction_chain.invoke({"text": raw_text[:200000]})
        return result if isinstance(result, ExtractionResult) else ExtractionResult(**result)
    except Exception as e:
        print(f"Warning: extraction failed ({e})")
        return ExtractionResult()


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
# NA handling + build + save
# --------------------------------------------------------------------------- #
def _na(value):
    if value is None:
        return NA
    if isinstance(value, str) and not value.strip():
        return NA
    if isinstance(value, (list, dict)) and len(value) == 0:
        return NA
    return value


def build_observation(url: str, trend: TrendObservation) -> dict:
    attrs = {k: _na(v) for k, v in trend.extracted_attributes.model_dump().items()}
    if all(v == NA for v in attrs.values()):
        attrs = NA

    obs = RawObservation(
        observation_id=str(uuid.uuid4()),
        source=_na(SOURCE_NAME),
        source_url=_na(url),
        captured_date=_na(RUN_TIMESTAMP),
        raw_type=_na(trend.raw_type),
        extracted_attributes=attrs,
        demand_direction=_na(trend.demand_direction),
        raw_text=_na(trend.raw_text),
    )
    return obs.model_dump()


def append_observations(observations: List[dict]):
    """Append records into the JSON array file (creates it if missing)."""
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    data = []
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            data = loaded if isinstance(loaded, list) else [loaded]
        except (json.JSONDecodeError, ValueError):
            data = []
    data.extend(observations)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    if not os.environ.get("GOOGLE_API_KEY"):
        print("Warning: GOOGLE_API_KEY not found in environment/.env")

    print(f"Rendering {TARGET_URL} ...")
    raw_text = render_page_text(TARGET_URL)
    print(f"Got {len(raw_text)} chars of text. Extracting trends with {GEMINI_MODEL} ...")

    result = extract_trends(raw_text)
    print(f"Extracted {len(result.trends)} trends.")

    observations = [build_observation(TARGET_URL, t) for t in result.trends]
    if observations:
        append_observations(observations)

    print(f"\nDone! Appended {len(observations)} records to:\n{OUTPUT_FILE}")


if __name__ == "__main__":
    main()
