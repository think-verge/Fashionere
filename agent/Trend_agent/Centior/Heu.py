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
    # Default factories automatically generate IDs and timestamps for each record
    observation_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()), 
        description="Unique ID for the observation"
    )
    source: str = Field(
        default="heuritech_editorial", 
        description="Where the data came from"
    )
    source_url: str = Field(
        default="https://heuritech.com/fashion-trends-2026/", 
        description="Source URL (provenance)"
    )
    captured_date: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat(), 
        description="When this run saw it"
    )
    raw_type: Literal["product", "search_term", "hashtag", "palette", "editorial"] = Field(
        default="editorial",
        description="Type of raw data"
    )
    extracted_attributes: Dict[str, Any] = Field(
        description="Normalized bits pulled out (e.g., {'color': 'butter yellow', 'fabric': 'sheer', 'silhouette': 'baggy'})"
    )
    demand_direction: Literal["rising", "peaking", "fading", "unknown"] = Field(
        description="Trend demand direction based on the text context. Default to 'unknown' if not explicitly stated."
    )
    raw_text: str = Field(
        description="A 1-2 sentence original description or keywords kept for re-processing."
    )

class TrendList(BaseModel):
    observations: List[RawObservation] = Field(
        description="List of the top 10 fashion trends extracted from the article."
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

    structured_llm = llm.with_structured_output(TrendList)

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert fashion data analyst. Extract the top 10 Spring/Summer 2026 fashion trends from the provided text. Map each distinct trend into a RawObservation object. Be highly specific in the 'extracted_attributes' dictionary."),
        ("human", "Here is the scraped article text:\n\n{text}")
    ])

    chain = prompt | structured_llm

    print("Extracting structured data with Gemini...")
    return chain.invoke({"text": text})

# 5. Save Data Locally
def save_to_json(data: TrendList, save_dir: str):
    """Saves the parsed Pydantic model to a JSON file with a timestamped filename."""
    
    # Create the directory if it does not exist to prevent FileNotFoundError
    os.makedirs(save_dir, exist_ok=True)
    
    # Generate timestamp (Format: YYYYMMDD_HHMMSS)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"raw_observations_{timestamp}.json"
    
    # Construct the full file path safely
    filepath = os.path.join(save_dir, filename)
    
    # Dump the Pydantic object directly to a JSON formatted string and save
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(data.model_dump_json(indent=2))
        
    print(f"\n✅ Success! Data saved to:\n{filepath}")

if __name__ == "__main__":
    target_url = "https://heuritech.com/fashion-trends-2026/"
    
    # Using 'r' makes it a raw string, preventing issues with Windows backslashes
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