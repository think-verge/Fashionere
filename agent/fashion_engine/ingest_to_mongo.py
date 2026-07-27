import os
import json
from pymongo import MongoClient
from dotenv import load_dotenv

def ingest_data(filepath: str):
    # Load environment variables from .env
    load_dotenv()

    # Fetch variables exactly as they are named in your .env
    mongo_uri = os.getenv("MONGO_URI")
    db_name = os.getenv("MONGO_DATABASE_NAME")
    collection_name = os.getenv("MONGO_TREND_RECORDS_COLLECTION")

    # Validation check
    if not all([mongo_uri, db_name, collection_name]):
        print("Error: Missing one or more required MongoDB environment variables.")
        return

    print(f"Connecting to Database: {db_name} | Collection: {collection_name}")

    try:
        # Initialize MongoDB Client
        client = MongoClient(mongo_uri)
        db = client[db_name]
        collection = db[collection_name]

        # Load the flattened JSON data
        with open(filepath, "r", encoding="utf-8") as f:
            flattened_data = json.load(f)

        if not flattened_data:
            print("The JSON file is empty.")
            return

        # Insert the data into MongoDB
        # Using insert_many for efficient bulk ingestion
        result = collection.insert_many(flattened_data)
        
        print(f"Success! Inserted {len(result.inserted_ids)} records into {collection_name}.")

    except FileNotFoundError:
        print(f"Error: Could not find {filepath}. Make sure you ran the flattening script first.")
    except Exception as e:
        print(f"An error occurred during ingestion: {e}")

if __name__ == "__main__":
    # Pointing to the file we created in the previous step
    ingest_data("flattened_mapping.json")