"""Tag every canonical Look that has no tags yet.

Reads canonical_looks (in MongoDB) where `tags` is missing, calls Gemini once
per look with a closed-vocabulary prompt, and writes the tag block back.

Idempotent: skips looks that already have `tags`. Safe to interrupt and resume.

Usage:
    # dry-run: tag N looks, print result, don't write
    python -m trend_engine.jobs.tag_canonical --limit 3 --dry-run

    # tag all untagged looks
    python -m trend_engine.jobs.tag_canonical

    # tag only a specific brand
    python -m trend_engine.jobs.tag_canonical --brand valentino
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import dotenv_values
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "core"))

from trend_engine.config import config
from trend_engine.normalize import color as color_norm
from trend_engine.registries import vocabulary as vocab
from trend_engine.schema.extraction import LookExtraction
from trend_engine.schema.look import RawColor
from fashionairre_core.vocab_normalize import VocabNormalizer

_FIBER_VN = VocabNormalizer("fibers")

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
log = logging.getLogger("tag_canonical")

SYSTEM_INSTRUCTION = """You are a fashion tagger. Convert ONE look's text (and images, if provided)
into structured tags, following these rules exactly:
1. TAG ONLY THE PRIMARY PRODUCT. If images are provided, they show a model wearing
   the product styled with other items (other garments, accessories, shoes). These other
   items are STYLING, not the product. Tag only what is intrinsic to the primary garment
   named in the text. Do NOT tag other garments the model happens to be wearing (styling
   shorts, bra tops, other layered pieces) or accessories (sunglasses, bags, jewelry, shoes).
2. CLOSED VOCABULARY: every `value` must be an id from the ALLOWED list for that dimension.
   If nothing fits, set value to "__unmapped__" and add the phrase to `unmapped`.
3. EVIDENCE:
   - For attributes stated in text: quote the exact phrase in `evidence`.
   - For attributes visible in the image ON THE PRIMARY PRODUCT: set `evidence` to
     "[image] <short description>" e.g. "[image] check pattern on jacket shell",
     "[image] cropped hem above waist on jacket".
   Never tag anything you cannot see or read.
4. NO BRAND MARKS: never tag a logo, monogram, or house crest as a pattern.
5. ROUTE KEYWORDS: send descriptive/mood keywords that are not concrete product attributes
   to `routed_to_vibe`.
6. NO GUESSING: if unsure, lower `confidence` or use "__unmapped__". Do NOT tag colors —
   colors are handled separately."""


def _look_text(doc: dict) -> str:
    """Assemble a searchable text blob for one canonical Look."""
    parts: list[str] = []

    nt = doc.get("native_text") or {}
    if nt.get("summary"):
        parts.append(f"Summary: {nt['summary']}")
    if nt.get("description"):
        parts.append(f"Description: {nt['description']}")
    if nt.get("product_name"):
        parts.append(f"Name: {nt['product_name']}")
    if nt.get("family_name"):
        parts.append(f"Category: {nt['family_name']}")
    if nt.get("subfamily_name"):
        parts.append(f"Subcategory: {nt['subfamily_name']}")
    if nt.get("keywords"):
        parts.append("Keywords: " + ", ".join(nt["keywords"]))
    if nt.get("collection_keywords"):
        parts.append("Collection themes: " + ", ".join(nt["collection_keywords"]))
    if nt.get("attributes"):
        parts.append("Attributes: " + ", ".join(str(a) for a in nt["attributes"]))
    if nt.get("tags"):
        parts.append("Tags: " + ", ".join(str(t) for t in nt["tags"]))

    ext = doc.get("extraction") or {}
    ll = ext.get("look_level") or {}
    if ll.get("silhouette_description"):
        parts.append(f"Silhouette: {ll['silhouette_description']}")
    if ll.get("styling_notes"):
        parts.append(f"Styling: {ll['styling_notes']}")

    # existing raw fabric/pattern extraction phrases as evidence
    fab_phrases, pat_phrases = [], []
    for g in ext.get("garments") or []:
        piece = g.get("piece")
        for f in g.get("fabrics") or []:
            ev = f.get("evidence") or f.get("description") or f.get("material")
            if ev:
                fab_phrases.append(f"{piece + ': ' if piece else ''}{ev}")
        for p in g.get("patterns") or []:
            ev = p.get("evidence") or p.get("description") or p.get("motif")
            if ev:
                pat_phrases.append(f"{piece + ': ' if piece else ''}{ev}")
    if fab_phrases:
        parts.append("Fabric phrases: " + "; ".join(fab_phrases))
    if pat_phrases:
        parts.append("Pattern phrases: " + "; ".join(pat_phrases))

    return "\n".join(p for p in parts if p and p.strip())


def _split_compound_names(name: str | None) -> list[str]:
    """Split retail's compound color labels ('Black / Ecru') into parts.
    Returns [name] unchanged when there is no separator."""
    if not name:
        return []
    parts = re.split(r"\s*[/,+]\s*|\s+&\s+", name)
    return [p.strip() for p in parts if p and p.strip()]


def _color_tags(doc: dict) -> list[dict]:
    """Run the deterministic color normalizer. Compound retail names like
    'Black / Ecru' are split into two independent color tags."""
    tags: list[dict] = []
    seen: set[str] = set()
    ext = doc.get("extraction") or {}
    all_colors: list[dict] = []
    for g in ext.get("garments") or []:
        all_colors.extend(g.get("color_palette") or [])

    for i, cd in enumerate(all_colors):
        parts = _split_compound_names(cd.get("name"))
        is_compound = len(parts) > 1
        # when the label lists multiple colors, the single stored hex represents
        # only one of them (or an average) — trust the name for each split part
        # and skip the hex-override path
        for j, part in enumerate(parts or [cd.get("name") or ""]):
            hex_for_class = None if is_compound else cd.get("hex")
            rc = RawColor(name=part, hex=hex_for_class, pantone=cd.get("pantone"))
            fam = color_norm.classify(rc)
            if fam in seen:
                continue
            seen.add(fam)
            tags.append({
                "family": fam,
                "name": part,
                "hex": cd.get("hex") or "",
                "pantone": cd.get("pantone"),
                "role": cd.get("role") or ("dominant" if (i == 0 and j == 0) else "accent"),
                "origin": "look",
                "confidence": 1.0,
            })
    return tags


def _fiber_tags(doc: dict) -> list[dict]:
    """Deterministic fiber tags from composition or fabric material text.
    Fibers are the retail axis (polyester, viscose, wool). No LLM needed."""
    tags: list[dict] = []
    seen: set[str] = set()
    ext = doc.get("extraction") or {}
    for g in ext.get("garments") or []:
        for f in g.get("fabrics") or []:
            for text_key in ("material", "description", "evidence"):
                text = f.get(text_key) or ""
                pct_match = re.search(r"(\d{1,3})\s*%", text)
                pct = float(pct_match.group(1)) if pct_match else None
                for fid in _FIBER_VN.match(text):
                    if fid in seen:
                        continue
                    seen.add(fid)
                    tags.append({
                        "value": fid,
                        "percentage": pct,
                        "part": f.get("description", "").split(":")[0] if ":" in (f.get("description") or "") else None,
                        "evidence": text.strip(),
                        "origin": "look",
                        "confidence": 1.0,
                    })
    return tags


def _build_prompt(text: str, product_name: str | None = None) -> str:
    allowed = "\n\n".join(
        f"{d.upper()} — allowed ids:\n{vocab.prompt_block(d)}" for d in vocab.DIMENSIONS
    )
    header = f"PRIMARY PRODUCT: {product_name}\n\n" if product_name else ""
    return (
        f"{header}LOOK TEXT:\n{text}\n\n"
        f"ALLOWED VOCABULARY (choose ids ONLY from these):\n{allowed}\n\n"
        "Return JSON with fabrics, patterns, silhouettes, themes, details, routed_to_vibe, "
        "and unmapped — describing ONLY the primary product."
    )


def _evidence_found(evidence: str | None, haystack_lower: str) -> bool:
    e = (evidence or "").strip().lower()
    if not e:
        return False
    if e in haystack_lower:
        return True
    words = [w for w in re.split(r"[\s/,\-]+", e) if len(w) > 3]
    return bool(words) and all(w in haystack_lower for w in words)


def _client():
    from google import genai
    if not config.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set — add it to .env.")
    return genai.Client(api_key=config.GEMINI_API_KEY)


def _pick_vision_images(doc: dict, max_images: int = 3) -> list[dict]:
    """Pick front + up to 2 detail images (from the first variant) for vision."""
    imgs = doc.get("images") or []
    if not imgs:
        return []
    # prefer c0 variant only — enough signal, keeps token cost down
    first_variant = [i for i in imgs if i.get("image_id", "").startswith("c0_")] or imgs
    fronts = [i for i in first_variant if i.get("role") == "product_front"]
    details = [i for i in first_variant if i.get("role") == "product_detail"]
    chosen = fronts[:1] + details[: max_images - 1]
    return [i for i in chosen if i.get("url")][:max_images]


def _fetch_image_bytes(url: str, timeout: int = 15) -> bytes | None:
    """Fetch an image, sending a browser UA (retailer CDNs reject default agents)."""
    import urllib.request
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Referer": "https://www.zara.com/",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except Exception as e:
        log.warning("Image fetch failed for %s: %s", url[:80], e)
        return None


def _extract_llm(text: str, client, model: str, images: list[dict] | None = None,
                  product_name: str | None = None) -> LookExtraction:
    from google.genai import types
    contents: list = [_build_prompt(text, product_name=product_name)]
    if images:
        for img in images:
            data = _fetch_image_bytes(img["url"])
            if data:
                contents.append(types.Part.from_bytes(data=data, mime_type="image/jpeg"))
    resp = client.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            temperature=0.0,
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=LookExtraction,
        ),
    )
    out = resp.parsed
    if out is None:
        out = LookExtraction.model_validate_json(resp.text)
    return out


def _dedup(items: list[dict]) -> list[dict]:
    seen, out = set(), []
    for it in items:
        v = it.get("value")
        if v in seen:
            continue
        seen.add(v)
        out.append(it)
    return out


def tag_one(doc: dict, client, model: str, conf_min: float, use_vision: bool = False) -> tuple[dict, list[dict], list[str]]:
    """Tag one canonical Look doc. Returns (tags_block, unmapped_entries, vibe_phrases)."""
    text = _look_text(doc)
    hay = text.lower()
    fibers = _fiber_tags(doc)
    colors = _color_tags(doc)

    if not text.strip() and not use_vision:
        return {"colors": colors, "fibers": fibers, "fabrics": [], "patterns": [],
                "silhouettes": [], "themes": [], "details": []}, [], []

    images_used: list[dict] = _pick_vision_images(doc) if use_vision else []
    product_name = (doc.get("native_text") or {}).get("product_name")
    ex = _extract_llm(text, client, model, images=images_used or None, product_name=product_name)

    def keep(value: str, dim: str, evidence: str, conf: float) -> bool:
        # allow "[image]"-prefixed evidence when vision was used; otherwise require text grounding
        if evidence and evidence.strip().lower().startswith("[image]") and images_used:
            evidence_ok = True
        else:
            evidence_ok = _evidence_found(evidence, hay)
        return (
            value != "__unmapped__"
            and value in vocab.allowed_ids(dim)
            and conf >= conf_min
            and evidence_ok
        )

    tags = {
        "colors": colors,
        "fibers": fibers,
        "fabrics": _dedup([
            {"value": f.value, "material": f.material, "garment": f.garment,
             "treatment": f.treatment, "evidence": f.evidence, "origin": "look",
             "confidence": f.confidence}
            for f in ex.fabrics if keep(f.value, "fabrics", f.evidence, f.confidence)
        ]),
        "patterns": _dedup([
            {"value": p.value, "motif": p.motif, "evidence": p.evidence, "origin": "look",
             "confidence": p.confidence}
            for p in ex.patterns if keep(p.value, "patterns", p.evidence, p.confidence)
        ]),
        "silhouettes": _dedup([
            {"value": s.value, "garment": s.garment, "fit": s.fit, "evidence": s.evidence,
             "origin": "look", "confidence": s.confidence}
            for s in ex.silhouettes if keep(s.value, "silhouettes", s.evidence, s.confidence)
        ]),
        "themes": _dedup([
            {"value": t.value, "evidence": t.evidence, "origin": "look",
             "confidence": t.confidence}
            for t in ex.themes if keep(t.value, "themes", t.evidence, t.confidence)
        ]),
        "details": _dedup([
            {"value": d.value, "type": d.type, "evidence": d.evidence, "origin": "look",
             "confidence": d.confidence}
            for d in ex.details if keep(d.value, "details", d.evidence, d.confidence)
        ]),
    }
    unmapped = [{"dimension": u.dimension, "raw_phrase": u.raw_phrase} for u in ex.unmapped]
    vibe = list(dict.fromkeys(ex.routed_to_vibe or []))
    tags["_images_seen"] = [i.get("image_id") for i in images_used]
    return tags, unmapped, vibe


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="tag_canonical")
    p.add_argument("--env", default="Trend Analysis Engine/.env")
    p.add_argument("--db", default="Fashionere")
    p.add_argument("--coll", default="canonical_looks")
    p.add_argument("--brand", default=None, help="Only tag this brand_slug (e.g. valentino)")
    p.add_argument("--min-year", type=int, default=None, help="Only tag looks from this year onward (Zara/no-year always included)")
    p.add_argument("--limit", type=int, default=None, help="Cap number of looks tagged")
    p.add_argument("--model", default=config.NORMALIZE_MODEL, help="Gemini model id")
    p.add_argument("--conf-min", type=float, default=config.CONFIDENCE_MIN)
    p.add_argument("--dry-run", action="store_true", help="Don't write to MongoDB")
    p.add_argument("--sleep", type=float, default=0.0, help="Delay between calls (sec)")
    p.add_argument("--concurrency", type=int, default=8, help="Concurrent LLM calls")
    p.add_argument("--vision", choices=("auto", "on", "off"), default="auto",
                   help="Send images to Gemini: 'auto' = on for retail sources only")
    a = p.parse_args(argv)

    uri = dotenv_values(a.env).get("MONGO_URI")
    client = MongoClient(uri, serverSelectionTimeoutMS=15000)
    client.admin.command("ping")
    coll = client[a.db][a.coll]

    query: dict = {"tags": {"$exists": False}}
    if a.brand:
        query["context.brand_slug"] = a.brand
    if a.min_year:
        # include looks with year >= min-year OR no year at all (Zara)
        query["$or"] = [
            {"context.year": {"$gte": a.min_year}},
            {"context.year": {"$in": [None]}},
            {"context.year": {"$exists": False}},
        ]
    cursor = coll.find(query)
    if a.limit:
        cursor = cursor.limit(a.limit)
    docs = list(cursor)
    log.info("Found %d untagged looks (brand=%s)", len(docs), a.brand or "all")
    if not docs:
        return 0

    gclient = _client()
    tagged = 0
    failed = 0
    t0 = time.time()

    RETAIL_SOURCES = {"zara", "hm", "mango", "uniqlo", "cos", "asos"}

    def _process(idx_doc):
        idx, doc = idx_doc
        lid = doc.get("look_id")
        brand = doc.get("context", {}).get("brand_slug")
        source_type = (doc.get("source") or {}).get("type") or ""
        if a.vision == "on":
            use_vision = True
        elif a.vision == "off":
            use_vision = False
        else:
            use_vision = source_type in RETAIL_SOURCES or brand in RETAIL_SOURCES
        try:
            tags, unmapped, vibe = tag_one(doc, gclient, a.model, a.conf_min, use_vision=use_vision)
            if not a.dry_run:
                coll.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {
                        "tags": tags,
                        "vibe_phrases": vibe,
                        "tag_meta": {
                            "vocab_ver": "v1",
                            "prompt_ver": "tag_canonical-v1",
                            "model": a.model,
                            "source": "tag_canonical",
                        },
                    }},
                )
            return idx, lid, brand, tags, None
        except Exception as e:
            return idx, lid, brand, None, str(e)

    with ThreadPoolExecutor(max_workers=a.concurrency) as ex:
        futures = [ex.submit(_process, (i, d)) for i, d in enumerate(docs, 1)]
        for fut in as_completed(futures):
            idx, lid, brand, tags, err = fut.result()
            if err:
                log.warning("[%d/%d] FAIL %s: %s", idx, len(docs), lid, err)
                failed += 1
            else:
                summary = " ".join(
                    f"{k}={len(tags[k])}" for k in ("colors", "fibers", "fabrics",
                                                     "patterns", "silhouettes",
                                                     "details", "themes")
                )
                imgs = tags.get("_images_seen") or []
                vsuffix = f" [vision:{len(imgs)}]" if imgs else ""
                log.info("[%d/%d] %s (%s) → %s%s", idx, len(docs), lid, brand, summary, vsuffix)
                tagged += 1

    dt = time.time() - t0
    log.info("Done in %.1fs — tagged %d, failed %d (%.1fs/look avg)",
             dt, tagged, failed, dt / max(len(docs), 1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
