"""
Phase 1b: attach Vogue detail close-ups to their parent runway look.

Vogue publishes no look->detail link -- the detail gallery is an independent
running sequence (e.g. 99 details for 81 looks), so neither URL counters nor
array positions can be trusted. Two properties make the mapping recoverable:

  1. ORDER   Runway photographers shoot details in show order, so the sequence of
             parent look numbers is monotonically non-decreasing. A detail is
             therefore confined to a narrow window around its positional prior.
  2. IDENTITY A close-up shares exact colour, fabric, trim, shoes, bag, jewellery,
             hair and makeup with its parent look, which a vision model can verify.

This module combines the two: Gemini ranks candidate looks inside each detail's
window, then a dynamic program picks the globally optimal assignment that is both
highest-confidence and monotonically non-decreasing. Details that genuinely match
nothing are left unassigned rather than forced onto a look.

Usage:
    python match_details.py --raw Valentino_fall_2025_ready_to_wear_raw.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import types

DEFAULT_MODEL = "gemini-2.5-flash"

PROMPT = """You are matching a runway close-up ("detail") photograph to the full-body
runway look it was shot from, within a single fashion show.

The FIRST image is the detail close-up. Each following image is a candidate
full-body look, preceded by its look number.

Judge on garment identity only: exact colour, fabric and texture, pattern, trim,
buttons, embroidery, hosiery, shoes, bag, jewellery, headwear, hair and makeup.
Every photo shares the same runway set and lighting, so ignore the background
completely. A detail often shows only a fragment (a cuff, a shoe, a bag), so
reason from whichever garment elements are visible.

Return JSON only:
{"look_number": <int|null>, "confidence": <0.0-1.0>, "evidence": "<short reason>",
 "alternates": [{"look_number": <int>, "confidence": <0.0-1.0>}]}

- "look_number" is your single best match, or null if none is convincing.
- "alternates" holds up to 3 runner-up look numbers with their own confidences.
- Only use numbers from the candidate look numbers shown."""

# Second pass. The first pass abstains when a secondary element disagrees -- e.g.
# rejecting a detail whose lace and hosiery match a look exactly because the bag
# looks like a different model. Since every detail in a show was shot from some
# look, a detail bracketed by confident neighbours can be re-asked as a forced
# choice over the narrow interval its neighbours allow.
FORCED_PROMPT = """You are matching a runway close-up ("detail") photograph to the
full-body runway look it was shot from, within a single fashion show.

The FIRST image is the detail close-up. Each following image is a candidate
full-body look, preceded by its look number. The correct parent look IS one of
these candidates -- the show order guarantees it -- so choose the single most
likely one rather than declining.

Weigh the garment first: colour, fabric, texture, pattern, embroidery, trim and
hosiery, plus hair, makeup and headwear. Weigh accessories last -- a model can be
photographed holding a different bag between the runway pass and the detail shot,
so a mismatched bag alone must not rule out an otherwise exact garment match.
Every photo shares the same set and lighting, so ignore the background.

Return JSON only:
{"look_number": <int>, "confidence": <0.0-1.0>, "evidence": "<short reason>",
 "alternates": [{"look_number": <int>, "confidence": <0.0-1.0>}]}

Report confidence honestly -- a forced choice may legitimately be low."""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "look_number": {"type": "integer", "nullable": True},
        "confidence": {"type": "number"},
        "evidence": {"type": "string"},
        "alternates": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "look_number": {"type": "integer"},
                    "confidence": {"type": "number"},
                },
                "required": ["look_number", "confidence"],
            },
        },
    },
    "required": ["look_number", "confidence", "evidence"],
}


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Attach Vogue detail close-ups to their parent runway look."
    )
    parser.add_argument("--raw", required=True, help="Raw JSON produced by scraper.py")
    parser.add_argument(
        "--out",
        default=None,
        help="Output path. Defaults to the input name with _mapped.json.",
    )
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Default: {DEFAULT_MODEL}")
    parser.add_argument(
        "--window",
        type=int,
        default=6,
        help="Candidate looks to consider either side of the positional prior "
             "(default 6, i.e. 13 candidates).",
    )
    parser.add_argument("--workers", type=int, default=4, help="Parallel Gemini calls.")
    parser.add_argument(
        "--image-width", type=int, default=512, help="Rendition width sent to Gemini."
    )
    parser.add_argument(
        "--limit", type=int, default=0, help="Only process the first N details (smoke test)."
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.45,
        help="Discard matches below this confidence (default 0.45).",
    )
    parser.add_argument(
        "--forced-min-confidence",
        type=float,
        default=0.3,
        help="Confidence floor for the gap-fill second pass (default 0.3).",
    )
    parser.add_argument(
        "--no-gap-fill",
        action="store_true",
        help="Skip the forced-choice second pass over details the first pass declined.",
    )
    parser.add_argument(
        "--cache",
        default=None,
        help="Vision response cache. Defaults to .match_cache_{stem}.json next to --out.",
    )
    parser.add_argument(
        "--no-cache", action="store_true", help="Ignore and do not write the cache."
    )
    return parser.parse_args(argv)


# --------------------------------------------------------------------------- #
# Image fetching
# --------------------------------------------------------------------------- #

_image_lock = threading.Lock()
_image_cache: dict[str, bytes] = {}


def at_width(url: str, width: int) -> str:
    """Ask the Condé Nast CDN for a specific rendition width."""
    if "/pass/" in url:
        return url.replace("/pass/", f"/w_{width},c_limit/", 1)
    return re.sub(r"/w_\d+(?:(?:,|%2C)[^/]*)?/", f"/w_{width},c_limit/", url, count=1)


def fetch_image(url: str, width: int, attempts: int = 3) -> bytes:
    key = f"{url}|{width}"
    with _image_lock:
        if key in _image_cache:
            return _image_cache[key]

    target = at_width(url, width)
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(
                target, headers={"User-Agent": "Mozilla/5.0"}
            )
            with urllib.request.urlopen(request, timeout=60) as response:
                blob = response.read()
            with _image_lock:
                _image_cache[key] = blob
            return blob
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Could not fetch {target}: {last}")


# --------------------------------------------------------------------------- #
# Candidate windows from the monotonic prior
# --------------------------------------------------------------------------- #

def candidate_window(detail_index: int, n_details: int, look_numbers: list[int],
                     window: int) -> list[int]:
    """Look numbers plausibly matching detail `detail_index` (1-based).

    Details run in show order, so detail j sits near look j * n_looks / n_details.
    """
    n_looks = len(look_numbers)
    centre = round((detail_index - 0.5) * n_looks / max(n_details, 1))
    lo = max(0, centre - window - 1)
    hi = min(n_looks, centre + window)
    if hi - lo < 1:
        lo, hi = 0, min(n_looks, 2 * window + 1)
    return look_numbers[lo:hi]


# --------------------------------------------------------------------------- #
# Vision scoring
# --------------------------------------------------------------------------- #

def score_detail(client: genai.Client, model: str, detail_url: str,
                 look_urls: dict[int, str], candidates: list[int],
                 width: int, prompt: str = PROMPT) -> dict[str, Any]:
    """Ask Gemini which candidate look this detail was shot from."""
    parts = [
        types.Part.from_text(text=prompt),
        types.Part.from_text(text="DETAIL close-up to match:"),
        types.Part.from_bytes(data=fetch_image(detail_url, width), mime_type="image/jpeg"),
    ]
    for number in candidates:
        parts.append(types.Part.from_text(text=f"CANDIDATE LOOK {number}:"))
        parts.append(
            types.Part.from_bytes(
                data=fetch_image(look_urls[number], width), mime_type="image/jpeg"
            )
        )

    last: Exception | None = None
    for attempt in range(4):
        try:
            response = client.models.generate_content(
                model=model,
                contents=[types.Content(role="user", parts=parts)],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=RESPONSE_SCHEMA,
                    temperature=0.0,
                ),
            )
            return json.loads(response.text)
        except Exception as exc:  # transient API errors and malformed JSON alike
            last = exc
            time.sleep(2.0 * (attempt + 1))
    raise RuntimeError(f"Gemini scoring failed after retries: {last}")


def collect_candidates(result: dict[str, Any], allowed: list[int],
                       min_confidence: float) -> list[tuple[int, float]]:
    """Flatten a vision result into ranked (look_number, confidence) pairs."""
    allowed_set = set(allowed)
    ranked: dict[int, float] = {}

    best = result.get("look_number")
    if isinstance(best, int) and best in allowed_set:
        ranked[best] = max(ranked.get(best, 0.0), float(result.get("confidence") or 0.0))

    for alternate in result.get("alternates") or []:
        number = alternate.get("look_number")
        if isinstance(number, int) and number in allowed_set:
            confidence = float(alternate.get("confidence") or 0.0)
            ranked[number] = max(ranked.get(number, 0.0), confidence)

    return sorted(
        ((n, c) for n, c in ranked.items() if c >= min_confidence),
        key=lambda pair: -pair[1],
    )


# --------------------------------------------------------------------------- #
# Monotonic alignment
# --------------------------------------------------------------------------- #

def monotonic_bounds(assignments: list[int | None], index: int,
                     look_numbers: list[int]) -> tuple[int, int]:
    """The inclusive look range an unassigned detail may occupy without breaking order."""
    lower = next(
        (a for a in reversed(assignments[:index]) if a is not None), look_numbers[0]
    )
    upper = next(
        (a for a in assignments[index + 1:] if a is not None), look_numbers[-1]
    )
    if upper < lower:
        upper = lower
    return lower, upper


def align_monotonic(candidates_per_detail: list[list[tuple[int, float]]],
                    look_numbers: list[int]) -> list[int | None]:
    """Pick the highest-confidence assignment that never runs backwards.

    Dynamic program over (detail index, last assigned look). Each detail may take
    any candidate at or after the previous assignment, or be skipped at zero
    score, so a detail matching nothing is dropped instead of distorting the rest.
    """
    if not candidates_per_detail:
        return []

    # Index look numbers so "last assigned" is a small integer state.
    order = {number: i for i, number in enumerate(look_numbers)}
    n_states = len(look_numbers) + 1  # state 0 = nothing assigned yet

    neg = float("-inf")
    best = [neg] * n_states
    best[0] = 0.0
    # back[j][state] -> (previous_state, chosen_look_or_None)
    back: list[dict[int, tuple[int, int | None]]] = []

    for candidates in candidates_per_detail:
        nxt = [neg] * n_states
        trace: dict[int, tuple[int, int | None]] = {}

        for state in range(n_states):
            if best[state] == neg:
                continue
            # Option 1: skip this detail, state unchanged.
            if best[state] > nxt[state]:
                nxt[state] = best[state]
                trace[state] = (state, None)
            # Option 2: assign a candidate at or after the current position.
            for look_number, confidence in candidates:
                new_state = order[look_number] + 1
                if new_state < state:
                    continue
                score = best[state] + confidence
                if score > nxt[new_state]:
                    nxt[new_state] = score
                    trace[new_state] = (state, look_number)

        back.append(trace)
        best = nxt

    # Walk the best final state back to front.
    state = max(range(n_states), key=lambda s: best[s])
    assignments: list[int | None] = []
    for trace in reversed(back):
        previous, chosen = trace.get(state, (state, None))
        assignments.append(chosen)
        state = previous
    assignments.reverse()
    return assignments


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

def load_cache(path: Path | None) -> dict[str, Any]:
    if path and path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def run(args: argparse.Namespace) -> dict[str, Any]:
    raw_path = Path(args.raw)
    payload = json.loads(raw_path.read_text(encoding="utf-8"))

    looks: list[dict] = payload["looks"]
    details: list[dict] = payload.get("details_gallery") or []
    if not looks:
        raise SystemExit(f"{raw_path} contains no looks.")
    if not details:
        raise SystemExit(
            f"{raw_path} has an empty 'details_gallery' -- nothing to match. Run this "
            "against the Layer 1 *_raw.json, not an already-mapped file."
        )
    if not isinstance(details[0], dict):
        raise SystemExit(
            f"{raw_path} is in the pre-Layer-1 format (details_gallery holds plain "
            "URLs). Re-run scraper.py to regenerate it with image tags."
        )

    # The positional prior depends on the true detail count, so keep it before
    # --limit truncates the work list -- otherwise a smoke test spreads a handful
    # of details across the whole show and every window misses.
    n_details_total = len(details)
    if args.limit:
        details = details[: args.limit]

    look_numbers = [look["look_number"] for look in looks]
    # Vision works on the CDN asset, never the slideshow permalink.
    look_urls = {look["look_number"]: look["runway_img_asset"] for look in looks}
    detail_assets = [detail["details_img_asset"] for detail in details]

    out_path = Path(args.out) if args.out else raw_path.with_name(
        raw_path.stem.replace("_raw", "") + "_mapped.json"
    )
    cache_path = None
    if not args.no_cache:
        cache_path = Path(args.cache) if args.cache else out_path.with_name(
            f".match_cache_{raw_path.stem}.json"
        )
    cache = load_cache(cache_path)
    cache_lock = threading.Lock()

    # Prefer the .env sitting beside this module, then fall back to the usual
    # upward search. A real environment variable always wins (load_dotenv does not
    # override), which is what lets CI supply the key from repository secrets.
    load_dotenv(Path(__file__).resolve().parent / ".env")
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit(
            "GEMINI_API_KEY is not set. Put it in scrape_engine/.env or export it."
        )
    client = genai.Client(api_key=api_key)

    print(f"-> {payload.get('designer')} {payload.get('collection_name')}: "
          f"{len(looks)} looks, {len(details)} details")
    print(f"   model={args.model} window=+/-{args.window} workers={args.workers}")

    windows = [
        candidate_window(index, n_details_total, look_numbers, args.window)
        for index in range(1, len(details) + 1)
    ]

    done = 0
    progress_lock = threading.Lock()

    def work(index: int) -> dict[str, Any]:
        nonlocal done
        detail_url = detail_assets[index]
        candidates = windows[index]
        key = f"{args.model}|{args.image_width}|{detail_url}|{candidates[0]}-{candidates[-1]}"

        with cache_lock:
            hit = cache.get(key)
        if hit is not None:
            result = hit
        else:
            result = score_detail(
                client, args.model, detail_url, look_urls, candidates, args.image_width
            )
            with cache_lock:
                cache[key] = result

        with progress_lock:
            done += 1
            if done % 10 == 0 or done == len(details):
                print(f"   scored {done}/{len(details)}")
        return result

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(work, range(len(details))))

    if cache_path:
        cache_path.write_text(json.dumps(cache, indent=1), encoding="utf-8")

    ranked = [
        collect_candidates(result, window, args.min_confidence)
        for result, window in zip(results, windows)
    ]
    raw_picks = [(r[0][0] if r else None) for r in ranked]
    assignments = align_monotonic(ranked, look_numbers)

    # Gap-fill: re-ask the declined details as a forced choice over the narrow
    # interval their confident neighbours leave open.
    gap_filled = 0
    gap_filled_indices: set[int] = set()
    pending = [i for i, a in enumerate(assignments) if a is None]
    if pending and not args.no_gap_fill:
        print(f"   gap-fill pass over {len(pending)} declined detail(s)")

        def refill(index: int) -> tuple[int, dict[str, Any], list[int]] | None:
            lower, upper = monotonic_bounds(assignments, index, look_numbers)
            candidates = [n for n in look_numbers if lower <= n <= upper]
            if not candidates:
                return None
            key = (f"forced|{args.model}|{args.image_width}|{detail_assets[index]}"
                   f"|{candidates[0]}-{candidates[-1]}")
            with cache_lock:
                hit = cache.get(key)
            if hit is not None:
                result = hit
            else:
                result = score_detail(
                    client, args.model, detail_assets[index], look_urls, candidates,
                    args.image_width, prompt=FORCED_PROMPT,
                )
                with cache_lock:
                    cache[key] = result
            return index, result, candidates

        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for outcome in pool.map(refill, pending):
                if outcome is None:
                    continue
                index, result, candidates = outcome
                extra = collect_candidates(result, candidates, args.forced_min_confidence)
                if extra:
                    ranked[index] = extra
                    results[index] = result
                    gap_filled_indices.add(index)
                    gap_filled += 1

        if gap_filled:
            assignments = align_monotonic(ranked, look_numbers)
        if cache_path:
            cache_path.write_text(json.dumps(cache, indent=1), encoding="utf-8")

    # Rebuild details_images from the aligned assignment.
    by_number = {look["look_number"]: look for look in looks}
    for look in looks:
        look["details_images"] = []

    provenance = []
    unmatched: list[dict] = []
    for index, (detail, assigned) in enumerate(zip(details, assignments), start=1):
        confidence = 0.0
        if assigned is not None:
            confidence = next(
                (c for n, c in ranked[index - 1] if n == assigned), 0.0
            )
            by_number[assigned]["details_images"].append(detail)
        else:
            unmatched.append(detail)
        provenance.append(
            {
                "detail_index": detail.get("detail_index", index),
                "details_img_url": detail.get("details_img_url", ""),
                "details_img_asset": detail.get("details_img_asset", ""),
                "look_number": assigned,
                "confidence": round(confidence, 3),
                "evidence": (results[index - 1].get("evidence") or "")[:300],
                "vision_pick": raw_picks[index - 1],
                "adjusted_for_order": raw_picks[index - 1] != assigned,
                "pass": "gap-fill" if (index - 1) in gap_filled_indices else "primary",
            }
        )

    attached = sum(1 for a in assignments if a is not None)
    adjusted = sum(1 for p in provenance if p["adjusted_for_order"])
    covered = sum(1 for look in looks if look["details_images"])

    # Matched details now live under their parent look; keep only the leftovers here
    # so the document has exactly one copy of each close-up.
    payload["details_gallery"] = unmatched
    payload["detail_matches"] = provenance
    payload["mapping"] = {
        **payload.get("mapping", {}),
        "detail_policy": "vision-monotonic",
        "matcher_model": args.model,
        "window": args.window,
        "min_confidence": args.min_confidence,
        "details_found": len(details),
        "details_attached": attached,
        "details_unmatched": len(unmatched),
        "looks_with_details": covered,
        "reordered_by_alignment": adjusted,
        "note": (
            "Details matched to looks by Gemini vision inside a monotonic window, "
            "then globally aligned so parent look numbers never run backwards. "
            "Per-detail confidence and evidence are in 'detail_matches'."
        ),
    }

    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"\n   attached      : {attached}/{len(details)} details")
    print(f"   unmatched     : {len(details) - attached}")
    print(f"   looks covered : {covered}/{len(looks)}")
    print(f"   order-adjusted: {adjusted}")
    if cache_path:
        print(f"   cache         : {cache_path.name}")
    print(f"\nSaved -> {out_path.resolve()}")
    return payload


def main(argv: list[str] | None = None) -> int:
    run(parse_args(argv))
    return 0


if __name__ == "__main__":
    sys.exit(main())
