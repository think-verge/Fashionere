"""Source adapters: each maps ONE source into the canonical `Look`.

New source = new adapter here; nothing downstream changes. The two data sources
we have today are kept separate, behind their own adapters:

  vogue_text     — the existing pre-scraped Vogue JSON (Prada; text, page-links)
  vision_folder  — a runway image folder (Chanel…; real image files)
  deconstruction — maps a deconstruction-engine record into canonical `extraction`
"""
