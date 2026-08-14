"""
Layer 3: tag every runway look and detail image with searchable attributes.

Runs a vision pass over each image in a mapped collection and attaches an
`image_description`, `fabric`, `patterns`, `Colors`, `theme`, `keywords` and
`collection_keywords`. The output is written for retrieval -- keyword search now,
vector embeddings later -- so descriptions favour concrete garment and construction
nouns over prose.

A detail close-up is always sent together with its parent runway look, so a shoe
frame is described as "the tortoiseshell pump from the black cocoon coat look"
rather than a context-free "a brown pump".

Usage:
    python tag_images.py --mapped data/mapped/prada/Prada_fall_2025_ready_to_wear_mapped.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import types

from match_details import fetch_image

DEFAULT_MODEL = "gemini-2.5-flash"

# Bump when the prompts or schema change, so Layer 0 knows existing tags are stale.
PROMPT_VERSION = 2

_SHARED_RULES = """
Judge only what is visible in the photograph. Every image in this show was shot on the
same runway under the same lighting, so never mention the set, background, floor or
lighting.

Write for search. Descriptions are indexed for keyword lookup and will later be
embedded as vectors, so use concrete garment vocabulary -- silhouette, construction,
neckline, hem, closure, fabric, trim, footwear, accessories -- and avoid filler like
"stunning", "effortless" or "the model wears".

Fields:
- "image_description": ONE sentence that starts immediately with the garment.
  Begin with the item itself, e.g. "Oversized black wool coat-dress with...".
  Never open with "A close-up of", "A full-body runway look", "The model wears",
  "This image shows" or any similar framing -- those waste the words that matter most
  for search.
- "fabric": the materials you can actually identify, garment by garment.
- "patterns": surface pattern or print motifs, lowercase, e.g. ["polka dot"],
  ["herringbone"], ["floral", "stripe"]. Use exactly ["solid"] when there is no
  pattern. Techniques such as lace, sequins or embroidery belong in "fabric", not here.
- "Colors": each distinct colour you can see. Runway lighting shifts colour, so report
  the colour the garment actually is, not the literal pixel value. "pantone_code" must
  use the Pantone Fashion, Home + Interiors (TCX) system in exactly the format
  "19-4005 (Stretch Limo)" -- four-digit code, then the colour name in brackets. Never
  use the printing/PMS system ("Pantone Black C") and never write "TCX" in the value.
- "theme": a short styling characterisation of this image.
- "keywords": 5-10 terms describing WHAT IS IN THIS IMAGE -- garment types,
  construction details, silhouette, accessories. Never copy the collection's themes here.
- "collection_keywords": 4-8 SHORT tags from the COLLECTION SUMMARY below that this
  image expresses. One to four words each, lowercase, e.g. "rescaling", "shapeless",
  "exposed seams", "ugly is exciting". Never copy a whole sentence or clause from the
  summary -- these are search tags, not quotations.
"""

LOOK_PROMPT = """You are cataloguing a full-body runway look from {designer},
{collection}.
""" + _SHARED_RULES + """
Describe the outfit as a whole: silhouette, layering, construction, fabric, styling,
accessories and footwear.

COLLECTION SUMMARY (for collection_keywords only):
{summary}
"""

DETAIL_PROMPT = """You are cataloguing a runway close-up ("detail") from {designer},
{collection}.

The FIRST image is the close-up you must describe. The SECOND image is the full-body
look it was shot from, given purely as context.
""" + _SHARED_RULES + """
Describe ONLY what the close-up shows, but name it in relation to the garment it belongs
to -- e.g. "the tortoiseshell pointed pump worn with the black cocoon coat-dress". Do not
describe parts of the outfit that are not visible in the close-up.

COLLECTION SUMMARY (for collection_keywords only):
{summary}
"""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "image_description": {"type": "string"},
        "fabric": {"type": "string"},
        "patterns": {"type": "array", "items": {"type": "string"}},
        "Colors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "color_name": {"type": "string"},
                    "hex_code": {"type": "string"},
                    "pantone_code": {"type": "string"},
                },
                "required": ["color_name", "hex_code", "pantone_code"],
            },
        },
        "theme": {"type": "string"},
        "keywords": {"type": "array", "items": {"type": "string"}},
        "collection_keywords": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["image_description", "fabric", "patterns", "Colors", "theme",
                 "keywords", "collection_keywords"],
}

TAG_FIELDS = ("image_description", "fabric", "patterns", "Colors", "theme",
              "keywords", "collection_keywords")

# Key order in the written JSON. `dict.update()` appends, which would otherwise leave a
# look's own description sitting *after* its details_images array -- readable output
# needs the annotation next to the image it describes, with the nested details last.
LOOK_HEAD = ("look_number", "runway_img", "runway_img_asset", "runway_img_alt")
DETAIL_HEAD = ("detail_index", "details_img_url", "details_img_asset", "details_img_alt")
_TAG_KEY_RE = re.compile(r"^(?:runway_img|details_img)_\d+_tag$")


def reorder_record(obj: dict, head: tuple[str, ...], tail: tuple[str, ...] = ()) -> None:
    """Rewrite `obj` in place into a stable, readable key order.

    head -> the dynamic `*_img_N_tag` key -> annotation fields -> tail -> anything else.
    """
    tag_keys = [k for k in obj if _TAG_KEY_RE.match(k)]
    ordered: dict[str, Any] = {}
    for key in (*head, *tag_keys, *TAG_FIELDS, *tail):
        if key in obj:
            ordered[key] = obj[key]
    for key, value in obj.items():  # anything unanticipated keeps its relative order
        if key not in ordered:
            ordered[key] = value
    obj.clear()
    obj.update(ordered)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Tag runway looks and detail images with searchable attributes."
    )
    p.add_argument("--mapped", required=True, help="Mapped JSON produced by match_details.py")
    p.add_argument("--out", default=None,
                   help="Output path. Defaults to the input name with _tagged.json.")
    p.add_argument("--model", default=DEFAULT_MODEL, help=f"Default: {DEFAULT_MODEL}")
    p.add_argument("--workers", type=int, default=4, help="Parallel Gemini calls.")
    p.add_argument("--image-width", type=int, default=768,
                   help="Rendition width sent to Gemini (default 768; detail work needs "
                        "more resolution than matching).")
    p.add_argument("--limit", type=int, default=0,
                   help="Only tag the first N images (smoke test).")
    p.add_argument("--summary-chars", type=int, default=3000,
                   help="How much of the collection summary to send as context.")
    p.add_argument("--cache", default=None,
                   help="Vision response cache. Defaults to .tag_cache_{stem}.json.")
    p.add_argument("--no-cache", action="store_true",
                   help="Ignore and do not write the cache.")
    return p.parse_args(argv)


# --------------------------------------------------------------------------- #
# Work items
# --------------------------------------------------------------------------- #

def collect_jobs(payload: dict) -> list[dict]:
    """Flatten the collection into one job per image, in document order."""
    jobs: list[dict] = []
    for look in payload.get("looks", []):
        asset = look.get("runway_img_asset")
        if asset:
            jobs.append({
                "kind": "look", "asset": asset, "parent_asset": None,
                "label": f"look {look['look_number']}", "target": look,
            })
        for detail in look.get("details_images", []):
            detail_asset = detail.get("details_img_asset")
            if detail_asset:
                jobs.append({
                    "kind": "detail", "asset": detail_asset, "parent_asset": asset,
                    "label": f"look {look['look_number']} detail {detail.get('detail_index')}",
                    "target": detail,
                })
    # Details that matched no look still deserve tagging; they have no parent context.
    for detail in payload.get("details_gallery", []):
        detail_asset = detail.get("details_img_asset")
        if detail_asset:
            jobs.append({
                "kind": "detail", "asset": detail_asset, "parent_asset": None,
                "label": f"unmatched detail {detail.get('detail_index')}",
                "target": detail,
            })
    return jobs


# --------------------------------------------------------------------------- #
# Vision
# --------------------------------------------------------------------------- #

def tag_image(client: genai.Client, model: str, job: dict, meta: dict,
              width: int) -> dict[str, Any]:
    """Describe one image. Detail shots are accompanied by their parent look."""
    template = LOOK_PROMPT if job["kind"] == "look" else DETAIL_PROMPT
    prompt = template.format(
        designer=meta["designer"], collection=meta["collection_name"],
        summary=meta["summary"],
    )

    parts = [types.Part.from_text(text=prompt)]
    if job["kind"] == "detail":
        parts.append(types.Part.from_text(text="CLOSE-UP to describe:"))
    parts.append(types.Part.from_bytes(data=fetch_image(job["asset"], width),
                                       mime_type="image/jpeg"))
    if job["parent_asset"]:
        parts.append(types.Part.from_text(text="PARENT LOOK (context only):"))
        parts.append(types.Part.from_bytes(data=fetch_image(job["parent_asset"], width),
                                           mime_type="image/jpeg"))

    last: Exception | None = None
    for attempt in range(4):
        try:
            response = client.models.generate_content(
                model=model,
                contents=[types.Content(role="user", parts=parts)],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=RESPONSE_SCHEMA,
                    temperature=0.2,
                ),
            )
            return json.loads(response.text)
        except Exception as exc:  # transient API errors and malformed JSON alike
            last = exc
            time.sleep(2.0 * (attempt + 1))
    raise RuntimeError(f"Gemini tagging failed after retries: {last}")


HEX_RE = re.compile(r"^#[0-9A-F]{6}$")

# A "collection keyword" longer than this is a quotation from the summary, not a tag.
MAX_KEYWORD_WORDS = 5


def normalise(result: dict[str, Any]) -> dict[str, Any]:
    """Keep only the schema fields, tidied.

    Runs on cached model output as well as fresh, so tightening it here re-cleans an
    existing collection for free.
    """
    colors = []
    for entry in result.get("Colors") or []:
        if not isinstance(entry, dict):
            continue
        hex_code = str(entry.get("hex_code") or "").strip().upper()
        if hex_code and not hex_code.startswith("#"):
            hex_code = "#" + hex_code
        # The model occasionally answers "#N/A" (usually when it has named a Pantone
        # swatch rather than looked at the pixels). Blank it rather than propagate a
        # value that looks like a colour but is not one -- the name still has search
        # value on its own.
        if not HEX_RE.match(hex_code):
            hex_code = ""
        name = str(entry.get("color_name") or "").strip()
        if not name and not hex_code:
            continue
        colors.append({
            "color_name": name,
            "hex_code": hex_code,
            "pantone_code": str(entry.get("pantone_code") or "").strip(),
        })

    def strings(key: str) -> list[str]:
        return [str(v).strip() for v in (result.get(key) or []) if str(v).strip()]

    # Drop sentence-length entries: they are quotations lifted from the summary and
    # are useless as search tags.
    collection_keywords = [k for k in strings("collection_keywords")
                           if len(k.split()) <= MAX_KEYWORD_WORDS]

    return {
        "image_description": str(result.get("image_description") or "").strip(),
        "fabric": str(result.get("fabric") or "").strip(),
        "patterns": strings("patterns") or ["solid"],
        "Colors": colors,
        "theme": str(result.get("theme") or "").strip(),
        "keywords": strings("keywords"),
        "collection_keywords": collection_keywords,
    }


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

def load_cache(path: Path | None) -> dict:
    if path and path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def run(args: argparse.Namespace) -> dict[str, Any]:
    mapped_path = Path(args.mapped)
    payload = json.loads(mapped_path.read_text(encoding="utf-8"))

    jobs = collect_jobs(payload)
    if not jobs:
        raise SystemExit(f"{mapped_path} contains no images to tag.")
    if args.limit:
        jobs = jobs[: args.limit]

    out_path = Path(args.out) if args.out else mapped_path.with_name(
        mapped_path.stem.replace("_mapped", "") + "_tagged.json")
    cache_path = None
    if not args.no_cache:
        cache_path = Path(args.cache) if args.cache else out_path.with_name(
            f".tag_cache_{mapped_path.stem}.json")
    cache = load_cache(cache_path)
    cache_lock = threading.Lock()

    load_dotenv(Path(__file__).resolve().parent / ".env")
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY is not set. Put it in scrape_engine/.env.")
    client = genai.Client(api_key=api_key)

    meta = {
        "designer": payload.get("designer", ""),
        "collection_name": payload.get("collection_name", ""),
        "summary": (payload.get("summary") or "")[: args.summary_chars],
    }

    print(f"-> {meta['designer']} {meta['collection_name']}: {len(jobs)} images to tag")
    print(f"   model={args.model} width={args.image_width} workers={args.workers} "
          f"prompt_v{PROMPT_VERSION}")

    done = 0
    failures: list[str] = []
    progress_lock = threading.Lock()

    def work(job: dict) -> dict[str, Any] | None:
        nonlocal done
        key = (f"{args.model}|v{PROMPT_VERSION}|{args.image_width}|"
               f"{job['asset']}|{job['parent_asset'] or '-'}")
        with cache_lock:
            hit = cache.get(key)
        if hit is not None:
            result = hit
        else:
            try:
                result = tag_image(client, args.model, job, meta, args.image_width)
            except Exception as exc:  # noqa: BLE001 - one bad image must not kill the run
                with progress_lock:
                    failures.append(f"{job['label']}: {type(exc).__name__}")
                return None
            with cache_lock:
                cache[key] = result

        with progress_lock:
            done += 1
            if done % 20 == 0 or done == len(jobs):
                print(f"   tagged {done}/{len(jobs)}")
        return normalise(result)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(work, jobs))

    if cache_path:
        cache_path.write_text(json.dumps(cache, indent=1), encoding="utf-8")

    tagged = 0
    colors_total = colors_no_hex = 0
    for job, result in zip(jobs, results):
        if result is None:
            continue
        job["target"].update(result)
        tagged += 1
        colors_total += len(result["Colors"])
        colors_no_hex += sum(1 for c in result["Colors"] if not c["hex_code"])

    # Put every record into canonical key order, whether or not it got tagged.
    for look in payload.get("looks", []):
        for detail in look.get("details_images", []):
            reorder_record(detail, DETAIL_HEAD)
        reorder_record(look, LOOK_HEAD, ("details_images",))
    for detail in payload.get("details_gallery", []):
        reorder_record(detail, DETAIL_HEAD)

    payload["tagging"] = {
        "model": args.model,
        "prompt_version": PROMPT_VERSION,
        "image_width": args.image_width,
        "images_total": len(jobs),
        "images_tagged": tagged,
        "images_failed": len(failures),
        "colors_total": colors_total,
        "colors_missing_hex": colors_no_hex,
        "failures": failures[:20],
    }

    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n   tagged  : {tagged}/{len(jobs)} images")
    if failures:
        print(f"   failed  : {len(failures)} -> {failures[:3]}")
    if cache_path:
        print(f"   cache   : {cache_path.name}")
    print(f"\nSaved -> {out_path.resolve()}")
    return payload


def main(argv: list[str] | None = None) -> int:
    run(parse_args(argv))
    return 0


if __name__ == "__main__":
    sys.exit(main())
