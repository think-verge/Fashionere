import os
import uuid
import json
from datetime import datetime
from dotenv import load_dotenv
from typing import List, Literal, Dict, Any
from pydantic import BaseModel, Field

from langchain_community.document_loaders import WebBaseLoader
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate

# 1. Load Environment Variables (.env file)
load_dotenv()

# 2. Define the Target Schema using Pydantic
class RawObservation(BaseModel):
    # Default factories automatically generate IDs and timestamps for each record [cite: 11]
    observation_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()), 
        description="Unique ID for the observation"
    )
    source: str = Field(
        default="lyst_index", 
        description="Where the data came from"
    )
    source_url: str = Field(
        default="https://lyst.com/the-lyst-index/q1-26/?paid_session_id=3c751013-5a04-4151-9a72-0f1d4b1122c0", 
        description="Source URL (provenance)"
    )
    captured_date: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat(), 
        description="When this run saw it"
    )
    # Added "brand" to accommodate Lyst Index's focus on brand rankings
    raw_type: Literal["product", "search_term", "hashtag", "palette", "editorial", "brand"] = Field(
        default="editorial",
        description="Type of raw data"
    )
    extracted_attributes: Dict[str, Any] = Field(
        description="Normalized bits pulled out (e.g., {'brand': 'Miu Miu', 'product': 'ballet flats', 'vibe': 'balletcore'})"
    )
    demand_direction: Literal["rising", "peaking", "fading", "unknown"] = Field(
        description="Trend demand direction based on the text context. Default to 'unknown' if not explicitly stated."
    )
    raw_text: str = Field(
        description="A 1-2 sentence original description or keywords kept for re-processing."
    )

class TrendList(BaseModel):
    observations: List[RawObservation] = Field(
        description="List of the fashion trends, hot products, and brand movements extracted from the article."
    )

# 3. Scrape the Content
def scrape_trends(url: str) -> str:
    """Scrapes the raw text content from the given URL."""
    loader = WebBaseLoader(url)
    docs = loader.load()
    return docs[0].page_content if docs else ""

# 4. Process with Gemini via LangChain
def extract_trend_data(text: str) -> TrendList:
    """Passes scraped text to Gemini to extract structured JSON data."""
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-pro", 
        temperature=0, 
        max_tokens=8192
    )

    # Binds the Pydantic schema to force structured JSON output [cite: 7, 10]
    structured_llm = llm.with_structured_output(TrendList)

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert fashion data analyst. Extract the hottest brands, products, and fashion movements from the provided Lyst Index text. Map each distinct trend or brand ranking into a RawObservation object. Be highly specific in the 'extracted_attributes' dictionary."),
        ("human", "Here is the scraped article text:\n\n{text}")
    ])

    chain = prompt | structured_llm

    print("Extracting structured data with Gemini...")
    return chain.invoke({"text": text})

# 5. Save Data Locally
def save_to_json(data: TrendList, save_dir: str):
    """Saves the parsed Pydantic model to a JSON file with a timestamped filename."""
    
    # Create the directory if it does not exist [cite: 17]
    os.makedirs(save_dir, exist_ok=True)
    
    # Generate timestamp (Format: YYYYMMDD_HHMMSS) 
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"lyst_raw_observations_{timestamp}.json"
    
    # Construct the full file path safely
    filepath = os.path.join(save_dir, filename)
    
    # Dump the Pydantic object directly to a JSON formatted string and save [cite: 19]
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(data.model_dump_json(indent=2))
        
    print(f"\n✅ Success! Data saved to:\n{filepath}")

if __name__ == "__main__":
    target_url = "https://lyst.com/the-lyst-index/q1-26/?paid_session_id=3c751013-5a04-4151-9a72-0f1d4b1122c0"
    
    # Using 'r' makes it a raw string, preventing issues with Windows backslashes [cite: 16]
    output_folder = r"C:\Users\JaswanthPall_fnohyb7\Desktop\VS  Code\Centior\Raw_data"
    
    print(f"Scraping {target_url}...")
    raw_content = scrape_trends(target_url)
    
    if raw_content:
        # 1. Extract data via LangChain + Gemini
        results = extract_trend_data(raw_content)
        
        # 2. Save the extracted data
        save_to_json(results, output_folder)
    else:
        print("Failed to scrape content.")