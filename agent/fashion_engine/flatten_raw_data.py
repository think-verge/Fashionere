import json

def flatten_json(input_filepath: str, output_filepath: str):
    # Open the raw mapping.json file with utf-8 encoding
    try:
        with open(input_filepath, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Could not find {input_filepath}")
        return

    if not raw_data or len(raw_data) < 2:
        print("Error: JSON structure is invalid or contains no runway looks.")
        return

    # 1. Extract Top-Level Metadata from the first object[cite: 1]
    meta = raw_data[0]
    designer = meta.get("Designer", "Unknown")
    page_url = meta.get("Page_Url", "")
    collection_name = meta.get("Name", "")
    summary = meta.get("Summary", "")

    flattened_documents = []

    # 2. Iterate through each runway look (starting from index 1)[cite: 1]
    for idx, look in enumerate(raw_data[1:], start=1):
        
        # Extract the dynamic runway_img key (e.g., runway_img_1, runway_img_2)[cite: 1]
        runway_img_key = next((k for k in look.keys() if k.startswith("runway_img")), None)
        runway_img_url = look.get(runway_img_key, "") if runway_img_key else ""

        # Normalize the nested details_images array[cite: 1]
        normalized_details = []
        for detail in look.get("details_images", []):
            detail_img_key = next((k for k in detail.keys() if k.startswith("details_img")), None)
            if detail_img_key:
                # Extract the index number to dynamically grab the correct description key[cite: 1]
                idx_str = detail_img_key.split('_')[-1]
                desc_key = f"Details Image_{idx_str} Description"
                
                normalized_details.append({
                    "details_img_url": detail.get(detail_img_key, ""),
                    "description": detail.get(desc_key, ""),
                    "fabric": detail.get("Fabric", ""),
                    "colors": detail.get("Colors", ""),
                    "theme": detail.get("Theme", ""),
                    "hex_code": detail.get("HEX Code", ""),
                    "keywords": detail.get("Keywords", [])
                })

        # Create the flattened record[cite: 1]
        doc = {
            "source": "vogue", 
            "designer": designer,
            "page_url": page_url,
            "collection_name": collection_name,
            "summary": summary,
            "look_number": idx,
            "runway_img": runway_img_url,
            "image_description": look.get("Image Description", ""),
            "fabric": look.get("Fabric", ""),
            "colors": look.get("Colors", ""),
            "theme": look.get("Theme", ""),
            "hex_code": look.get("HEX Code", ""),
            "keywords": look.get("Keywords", []),
            "details_images": normalized_details
        }
        flattened_documents.append(doc)

    # 3. Save the flattened data to a new JSON file
    with open(output_filepath, "w", encoding="utf-8") as f:
        json.dump(flattened_documents, f, indent=2, ensure_ascii=False)

    print(f"Success! Flattened {len(flattened_documents)} looks and saved to {output_filepath}")

if __name__ == "__main__":
    flatten_json(
        input_filepath="mapping.json_", 
        output_filepath="flattened_mapping.json"
    )