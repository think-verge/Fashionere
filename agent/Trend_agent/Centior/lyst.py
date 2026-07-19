"""
Lyst Index scraper  ->  atomic, group-tagged RawObservation records.

Target: https://lyst.com/the-lyst-index/q1-26/
Stack:  LangChain WebBaseLoader + Google Gemini 2.5 Pro (structured output).

The Lyst Index is brand-ranking-centric, so most observations land in the `brand`
group (brand, rank, movement, ranking_list, associated_products), but the page
also surfaces hot products and aesthetics, which become item_style / aesthetic
observations. Gemini explodes the page into MANY atomic observations, each tagged
with its `group`. Schema/prompt/save logic is shared via raw_schema.py.

Nothing is guessed: any value not explicitly in the text becomes "NA".

.env file (same folder):
    GOOGLE_API_KEY=your_key_here
"""

import os
from dotenv import load_dotenv
from langchain_community.document_loaders import WebBaseLoader

import raw_schema as rs

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(SCRIPT_DIR, ".env"))

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
TARGET_URL   = "https://lyst.com/the-lyst-index/q1-26/?paid_session_id=3c751013-5a04-4151-9a72-0f1d4b1122c0"
SOURCE_NAME  = "lyst_index"
GEMINI_MODEL = "gemini-2.5-pro"
RAW_DATA_DIR = os.path.join(SCRIPT_DIR, "Raw_data")


def scrape_trends(url: str) -> str:
    """Scrape the raw text content from the given URL."""
    loader = WebBaseLoader(url)
    docs = loader.load()
    return docs[0].page_content if docs else ""


def main():
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Warning: GOOGLE_API_KEY not found in environment/.env")

    print(f"Scraping {TARGET_URL} ...")
    raw_text = scrape_trends(TARGET_URL)
    if not raw_text:
        print("Failed to scrape content.")
        return

    print(f"Got {len(raw_text)} chars. Extracting atomic observations with {GEMINI_MODEL} ...")
    chain = rs.build_extraction_chain(GEMINI_MODEL, api_key=api_key)
    items = rs.run_extraction(chain, raw_text)
    print(f"Extracted {len(items)} atomic observations.")

    observations = rs.build_observations(
        items, source=SOURCE_NAME, source_url=TARGET_URL, captured_date=rs.run_timestamp()
    )
    if observations:
        path = rs.save_observations(observations, source_slug=SOURCE_NAME, raw_data_dir=RAW_DATA_DIR)
        print(f"\nDone! Wrote {len(observations)} observations to:\n{path}")
    else:
        print("\nNo observations produced.")


if __name__ == "__main__":
    main()
