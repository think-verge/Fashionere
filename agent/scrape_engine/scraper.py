"""
Vogue Scraper & Data Mapping Engine (Phase 1).

Extracts a runway collection from Vogue.com and emits the raw JSON described in
design.md: designer / collection metadata plus an ordered array of looks, each
with its full-body `runway_img` and a `details_images` array.

Two extraction strategies, per design.md Section 3B:

  Strategy 1 (primary)  -- read the embedded state object Vogue ships in the HTML
                           and use its already-mapped gallery structure.
  Strategy 2 (fallback) -- drive the rendered gallery with Playwright, scrolling
                           each slideshow and reading images in document order
                           with a running look counter.

Usage:
    python scraper.py --url "https://www.vogue.com/fashion-shows/fall-2025-ready-to-wear/valentino"
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import unquote, urlparse, urlunparse

from bs4 import BeautifulSoup
from playwright.async_api import (
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

# Vogue has shipped its page state under several global names over the years.
# design.md mandates __NEXT_DATA__; the live site currently uses the Condé Nast
# Verso key __PRELOADED_STATE__. Try them in order, then fall back to a generic
# deep search so a future rename does not break the scraper.
STATE_GLOBALS = (
    "__NEXT_DATA__",
    "__PRELOADED_STATE__",
    "__APOLLO_STATE__",
    "__INITIAL_STATE__",
)

COLLECTION = "collection"
DETAIL = "detail"

# Keys that, when present on a look object, hold genuinely pre-nested details.
NESTED_DETAIL_KEYS = ("details", "detailimages", "detailslides", "detailitems")

IMAGE_SIZES = ("sm", "md", "lg", "xl", "original")

# Image hosts that serve runway photography (as opposed to logos and ad creative).
ASSET_HOSTS = ("assets.vogue.com/photos", "media.vogue.com")


# --------------------------------------------------------------------------- #
# Phase A: input handling
# --------------------------------------------------------------------------- #

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape a Vogue runway collection into raw mapped JSON."
    )
    parser.add_argument(
        "--url",
        required=True,
        help='Collection URL, e.g. "https://www.vogue.com/fashion-shows/'
             'fall-2025-ready-to-wear/valentino"',
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Output path. Defaults to {designer}_{collection_name}_raw.json",
    )
    parser.add_argument(
        "--image-size",
        choices=IMAGE_SIZES,
        default="original",
        help="Which rendition to record per image (default: original, full resolution).",
    )
    parser.add_argument(
        "--detail-mapping",
        choices=("none", "sequential"),
        default="none",
        help=(
            "How to attach close-up details to looks when Vogue publishes no "
            "look->detail link. 'none' (default) leaves details unattached in "
            "details_gallery for downstream vision matching. 'sequential' "
            "aligns detail N to look N -- fast, but unverified and often wrong."
        ),
    )
    parser.add_argument(
        "--strategy",
        choices=("auto", "state", "dom"),
        default="auto",
        help="Force an extraction strategy. Default 'auto' tries state then DOM.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=90_000,
        help="Page load timeout in milliseconds (default: 90000).",
    )
    parser.add_argument(
        "--headful",
        action="store_true",
        help="Run a visible browser (useful for debugging bot walls).",
    )
    parser.add_argument(
        "--no-tags",
        action="store_true",
        help="Skip the <img> tag capture pass (faster; leaves *_tag keys empty).",
    )
    return parser.parse_args(argv)


def split_collection_url(url: str) -> tuple[str, str]:
    """Return (collection_slug, designer_slug) from a Vogue fashion-shows URL."""
    parts = [p for p in urlparse(url).path.split("/") if p]
    if "fashion-shows" in parts:
        tail = parts[parts.index("fashion-shows") + 1:]
        # /fashion-shows/{collection}/{designer}[/slideshow/...]
        if len(tail) >= 2:
            return tail[0], tail[1]
        if len(tail) == 1:
            return tail[0], ""
    return "", (parts[-1] if parts else "")


def canonical_page_url(url: str) -> str:
    """Strip any /slideshow/... suffix, query and fragment down to the show page."""
    parsed = urlparse(url)
    path = parsed.path
    if "/slideshow" in path:
        path = path.split("/slideshow", 1)[0]
    return urlunparse((parsed.scheme, parsed.netloc, path.rstrip("/"), "", "", ""))


# --------------------------------------------------------------------------- #
# Image URL helpers
# --------------------------------------------------------------------------- #

def to_original(url: str) -> str:
    """Rewrite a Condé Nast transform URL to its full-resolution `pass` rendition.

    Handles both the literal (`/w_1280,c_limit/`) and percent-encoded
    (`/w_1280%2Cc_limit/`) forms that Vogue emits in different attributes.
    """
    return re.sub(r"/w_\d+(?:(?:,|%2C)[^/]*)?/", "/pass/", url, count=1, flags=re.I)


def parse_srcset(srcset: str) -> list[tuple[int, str]]:
    """Parse a srcset into (width, url) pairs.

    Cannot split on "," -- Condé Nast URLs contain literal commas
    (`/master/w_120,c_limit/...`). Match URL + width descriptor instead.
    """
    pairs = [
        (int(width), url)
        for url, width in re.findall(r"(https?://\S+?)\s+(\d+)w", srcset)
    ]
    if pairs:
        return pairs
    return [(0, u) for u in re.findall(r"https?://\S+", srcset)]


def choose_rendition(candidates: list[tuple[int, str]], size: str) -> str:
    """Pick one URL from (width, url) candidates for the requested size."""
    if not candidates:
        return ""
    if size == "original":
        return to_original(max(candidates, key=lambda c: c[0])[1])
    if size == "xl":
        return max(candidates, key=lambda c: c[0])[1]

    target = {"sm": 360, "md": 1024, "lg": 1280}[size]
    at_or_below = [c for c in candidates if 0 < c[0] <= target]
    if at_or_below:
        return max(at_or_below, key=lambda c: c[0])[1]
    return min(candidates, key=lambda c: c[0] or 10**9)[1]


def best_image_url(image: dict, size: str) -> str:
    """Pick a single URL for a state-object image (sources keyed sm/md/lg/xl)."""
    sources = image.get("sources") or image.get("segmentedSources") or {}
    candidates: list[tuple[int, str]] = []

    def collect(container: Any) -> None:
        if isinstance(container, dict):
            if isinstance(container.get("url"), str):
                candidates.append((int(container.get("width") or 0), container["url"]))
            if isinstance(container.get("srcset"), str):
                candidates.extend(parse_srcset(container["srcset"]))
            for key, value in container.items():
                if key not in ("url", "srcset") and isinstance(value, (dict, list)):
                    collect(value)
        elif isinstance(container, list):
            for value in container:
                collect(value)

    collect(sources)
    if not candidates and isinstance(image.get("url"), str):
        candidates.append((0, image["url"]))
    return choose_rendition(candidates, size)


def asset_filename(url: str) -> str:
    return unquote(urlparse(url).path.rsplit("/", 1)[-1]).lower()


def is_runway_asset(url: str) -> bool:
    if not any(host in url for host in ASSET_HOSTS):
        return False
    name = asset_filename(url)
    return bool(re.search(r"^\d{3,6}[-_]|credit[-_]|gorunway|[-_]detail", name))


def is_detail_asset(url: str, context: str = "") -> bool:
    name = asset_filename(url)
    if re.search(r"[-_]details?[-_.]", name):
        return True
    return "/slideshow/details" in context.lower()


def photo_id(url: str) -> str | None:
    """The Condé Nast asset id in `/photos/{id}/`.

    This is the join key between the state object and the rendered DOM: both name
    the same id for the same photograph, so `<img>` tags can be attached without
    relying on array position.
    """
    match = re.search(r"/photos/([0-9a-f]{12,})/", url, re.I)
    return match.group(1).lower() if match else None


def slideshow_url(base: str, kind: str, index: int, state_url: str = "") -> str:
    """Absolute slideshow permalink, e.g. `…/valentino/slideshow/collection#1`.

    Prefers the path the state object publishes; falls back to composing it, which
    is what the DOM strategy needs since slideshow images carry no anchor.
    """
    if state_url:
        if state_url.startswith("http"):
            return state_url
        origin = urlparse(base)
        return urlunparse((origin.scheme, origin.netloc, *urlparse(state_url)[2:]))
    path = "collection" if kind == COLLECTION else "details"
    return f"{base}/slideshow/{path}#{index}"


def make_look_record(look_number: int, page_url: str, asset: str, alt: str) -> dict:
    """One look, in the Layer 1 schema. The tag key carries its own look number."""
    return {
        "look_number": look_number,
        "runway_img": page_url,
        "runway_img_asset": asset,
        "runway_img_alt": alt,
        f"runway_img_{look_number}_tag": "",
        "details_images": [],
    }


def make_detail_record(detail_index: int, page_url: str, asset: str, alt: str) -> dict:
    """One close-up, in the Layer 1 schema."""
    return {
        "detail_index": detail_index,
        "details_img_url": page_url,
        "details_img_asset": asset,
        "details_img_alt": alt,
        f"details_img_{detail_index}_tag": "",
    }


# --------------------------------------------------------------------------- #
# Strategy 1: the embedded state object
# --------------------------------------------------------------------------- #

def _walk(node: Any) -> Iterator[Any]:
    """Yield every dict and list in the tree, depth first."""
    stack = [node]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            yield current
            stack.extend(current.values())
        elif isinstance(current, list):
            yield current
            stack.extend(current)


def _is_gallery_item(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("image"), dict)
        and ("lookNumber" in value or "caption" in value or "url" in value)
    )


def _classify(gallery: dict) -> str | None:
    """Label a gallery as the runway (collection) or close-up (detail) sequence."""
    probe = " ".join(
        str(gallery.get(k, "")) for k in ("id", "title", "galleryType", "name", "type")
    ).lower()
    items = gallery.get("items") or []
    if items and isinstance(items[0], dict):
        probe += " " + str(items[0].get("url", "")).lower()
        probe += " " + str(items[0].get("caption", "")).lower()

    if "beauty" in probe or "backstage" in probe:
        return None
    if "detail" in probe:
        return DETAIL
    if "collection" in probe or "look" in probe or "runway" in probe:
        return COLLECTION
    return None


def find_galleries(state: dict) -> dict[str, list[dict]]:
    """Locate the runway and detail image sequences inside the state object.

    Handles the `{galleries: [{id, items}]}` shape, the flat
    `{galleryItems: {collection: [...], detail: [...]}}` shape, and falls back to
    a generic scan for any list of gallery items.
    """
    found: dict[str, list[dict]] = {}

    def offer(kind: str | None, items: list) -> None:
        if kind and len(items) > len(found.get(kind, [])):
            found[kind] = items

    for node in _walk(state):
        if not isinstance(node, dict):
            continue

        # Shape A: a list of gallery groups, each with id/title + items.
        groups = node.get("galleries")
        if isinstance(groups, list):
            for group in groups:
                if not isinstance(group, dict):
                    continue
                items = group.get("items")
                if isinstance(items, list) and items and _is_gallery_item(items[0]):
                    offer(_classify(group), items)

        # Shape B: a dict keyed directly by gallery kind.
        bucket = node.get("galleryItems")
        if isinstance(bucket, dict):
            for key, items in bucket.items():
                if isinstance(items, list) and items and _is_gallery_item(items[0]):
                    offer(_classify({"id": key, "items": items}), items)

    if COLLECTION in found:
        return found

    # Generic fallback: any list of gallery items, classified by its own contents.
    for node in _walk(state):
        if isinstance(node, list) and node and _is_gallery_item(node[0]):
            offer(_classify({"items": node}), node)
    return found


def _look_number(item: dict, index: int) -> int:
    for key in ("lookNumber", "look_number", "slideNumber"):
        raw = item.get(key)
        if raw not in (None, ""):
            digits = re.sub(r"\D", "", str(raw))
            if digits:
                return int(digits)
    match = re.search(r"(\d+)", str(item.get("caption") or ""))
    if match:
        return int(match.group(1))
    return index


def _nested_details(item: dict, size: str, start_index: int) -> list[dict]:
    """Return details Vogue nested *inside* a look, if any (design.md 4, Strategy 1).

    Vogue does not currently nest details, but the shape is honoured so that a page
    which does publish the link is used directly instead of being re-derived.
    """
    records: list[dict] = []
    for key, value in item.items():
        if key.lower().replace("_", "") not in NESTED_DETAIL_KEYS:
            continue
        if not isinstance(value, list):
            continue
        for entry in value:
            if isinstance(entry, str):
                asset, alt, url = entry, "", ""
            elif isinstance(entry, dict):
                image = entry["image"] if isinstance(entry.get("image"), dict) else entry
                asset = best_image_url(image, size)
                alt = str(image.get("altText") or "")
                url = str(entry.get("url") or "")
            else:
                continue
            if asset:
                records.append(
                    make_detail_record(start_index + len(records), url, asset, alt)
                )
    return records


def looks_from_state(items: list[dict], size: str, base: str) -> list[dict]:
    looks = []
    for index, item in enumerate(items, start=1):
        image = item.get("image") or {}
        number = _look_number(item, index)
        record = make_look_record(
            number,
            slideshow_url(base, COLLECTION, number, str(item.get("url") or "")),
            best_image_url(image, size),
            str(image.get("altText") or ""),
        )
        record["details_images"] = _nested_details(item, size, 1)
        looks.append(record)
    return looks


def details_from_state(items: list[dict], size: str, base: str) -> list[dict]:
    records = []
    for index, item in enumerate(items, start=1):
        image = item.get("image") or {}
        asset = best_image_url(image, size)
        if not asset:
            continue
        records.append(
            make_detail_record(
                index,
                slideshow_url(base, DETAIL, index, str(item.get("url") or "")),
                asset,
                str(image.get("altText") or ""),
            )
        )
    return records


# --------------------------------------------------------------------------- #
# Strategy 2: visual DOM traversal via Playwright
# --------------------------------------------------------------------------- #

# Collect every image in document order together with enough surrounding context
# to tell a runway look from a close-up detail.
_COLLECT_JS = """
() => Array.from(document.querySelectorAll('img')).map(img => {
    const link = img.closest('a');
    let signature = '';
    let node = img.parentElement;
    for (let i = 0; i < 5 && node; i++) {
        signature += ' ' + (node.className || '') + ' ' + (node.id || '');
        node = node.parentElement;
    }
    return {
        src: img.currentSrc || img.getAttribute('src') || '',
        srcset: img.getAttribute('srcset') || '',
        alt: img.getAttribute('alt') || '',
        href: link ? (link.getAttribute('href') || '') : '',
        signature: signature,
    };
})
"""


async def _scroll_until_stable(page, rounds: int = 60, pause: int = 600) -> None:
    """Scroll to the foot of the page until the runway image count stops growing."""
    stable, last = 0, -1
    for _ in range(rounds):
        count = await page.evaluate(
            """() => Array.from(document.querySelectorAll('img'))
                 .filter(i => (i.currentSrc || i.src || '').includes('/photos/')).length"""
        )
        stable = stable + 1 if count == last else 0
        last = count
        if stable >= 3:
            return
        await page.evaluate("window.scrollBy(0, document.body.scrollHeight)")
        await page.wait_for_timeout(pause)


async def _ordered_assets(page, size: str, slugs: tuple[str, str]) -> list[tuple[str, str]]:
    """Return document-order (url, context) pairs for runway photography only."""
    entries = await page.evaluate(_COLLECT_JS)
    collection_slug, designer_slug = slugs

    rows: list[tuple[str, str]] = []
    for entry in entries:
        candidates = parse_srcset(entry["srcset"])
        if entry["src"].startswith("http"):
            width = re.search(r"/w_(\d+)", entry["src"])
            candidates.append((int(width.group(1)) if width else 0, entry["src"]))
        url = choose_rendition(candidates, size)
        if not url or not is_runway_asset(url):
            continue
        context = " ".join((url, entry["alt"], entry["href"], entry["signature"])).lower()
        if "backstage" in context or "beauty" in context:
            continue
        rows.append((url, context))

    # Prefer assets whose filename carries this show's slug; that removes the
    # "more from this designer" recirculation cards at the foot of the page.
    scoped = [
        row for row in rows
        if collection_slug and collection_slug in asset_filename(row[0])
    ]
    if not scoped and designer_slug:
        scoped = [row for row in rows if designer_slug in asset_filename(row[0])]

    chosen = scoped or rows
    seen: set[str] = set()
    unique: list[tuple[str, str]] = []
    for url, context in chosen:
        key = asset_filename(url)
        if key not in seen:
            seen.add(key)
            unique.append((url, context))
    return unique


def running_counter_map(rows: list[tuple[str, str]], base: str) -> tuple[list[dict], list[dict]]:
    """design.md Strategy 2: walk the sequence, incrementing on each primary look.

    A close-up attaches to the look that most recently preceded it; close-ups seen
    before any look are returned as unattached.
    """
    looks: list[dict] = []
    loose: list[dict] = []
    current_look_number = 0

    for url, context in rows:
        if is_detail_asset(url, context):
            record = make_detail_record(
                len(loose) + sum(len(l["details_images"]) for l in looks) + 1,
                "", url, "",
            )
            if current_look_number and looks:
                looks[-1]["details_images"].append(record)
            else:
                loose.append(record)
        else:
            current_look_number += 1
            looks.append(
                make_look_record(
                    current_look_number,
                    slideshow_url(base, COLLECTION, current_look_number),
                    url,
                    "",
                )
            )
    return looks, loose


async def dom_strategy(page, url: str, timeout: int, size: str) -> tuple[list[dict], list[str]]:
    """Extract looks and details by driving the rendered galleries."""
    base = canonical_page_url(url)
    slugs = split_collection_url(url)

    # The show page only renders a six-image teaser per gallery, so read the
    # dedicated slideshows, which paginate the complete sequence on scroll.
    looks: list[dict] = []
    details: list[str] = []

    for kind, path in ((COLLECTION, "/slideshow/collection"), (DETAIL, "/slideshow/details")):
        try:
            response = await page.goto(base + path, wait_until="domcontentloaded", timeout=timeout)
        except PlaywrightTimeoutError:
            continue
        if response is not None and response.status >= 400:
            continue
        await _scroll_until_stable(page)
        rows = await _ordered_assets(page, size, slugs)
        if kind == COLLECTION:
            runway_rows = [r for r in rows if not is_detail_asset(*r)]
            looks = [
                make_look_record(i, slideshow_url(base, COLLECTION, i), url, "")
                for i, (url, _context) in enumerate(runway_rows, start=1)
            ]
        else:
            details = [
                make_detail_record(i, slideshow_url(base, DETAIL, i), url, "")
                for i, (url, _context) in enumerate(rows, start=1)
            ]

    if looks:
        return looks, details

    # Last resort: the interleaved show page with the running look counter.
    try:
        await page.goto(base, wait_until="domcontentloaded", timeout=timeout)
    except PlaywrightTimeoutError:
        return [], details
    await _scroll_until_stable(page)
    rows = await _ordered_assets(page, size, slugs)
    looks, loose = running_counter_map(rows, base)
    return looks, details or loose


# --------------------------------------------------------------------------- #
# <img> tag capture
# --------------------------------------------------------------------------- #

# The state object carries no markup, so tags are read from the rendered DOM and
# joined back on by photo id.
_TAG_JS = """
() => Array.from(document.querySelectorAll('img'))
    .filter(i => ((i.currentSrc || i.src || '') + (i.getAttribute('srcset') || ''))
                 .includes('/photos/'))
    .map(i => ({
        outer: i.outerHTML,
        src: i.currentSrc || i.getAttribute('src') || '',
        srcset: i.getAttribute('srcset') || '',
        alt: i.getAttribute('alt') || '',
    }))
"""


async def capture_tags(page, url: str, timeout: int) -> dict[str, dict[str, str]]:
    """Map photo id -> {tag, alt} for every gallery image across both slideshows."""
    base = canonical_page_url(url)
    tags: dict[str, dict[str, str]] = {}

    for path in ("/slideshow/collection", "/slideshow/details"):
        try:
            response = await page.goto(
                base + path, wait_until="domcontentloaded", timeout=timeout
            )
        except PlaywrightTimeoutError:
            continue
        if response is not None and response.status >= 400:
            continue
        await _scroll_until_stable(page)
        for entry in await page.evaluate(_TAG_JS):
            identifier = photo_id(entry["src"]) or photo_id(entry["srcset"])
            if identifier and identifier not in tags:
                tags[identifier] = {"tag": entry["outer"], "alt": entry["alt"]}
    return tags


def attach_tags(looks: list[dict], details: list[dict],
                tags: dict[str, dict[str, str]]) -> int:
    """Fill the dynamic `*_tag` keys from captured markup. Returns how many matched."""
    matched = 0

    def apply(record: dict, asset_key: str, tag_key: str, alt_key: str) -> None:
        nonlocal matched
        identifier = photo_id(record.get(asset_key) or "")
        found = tags.get(identifier) if identifier else None
        if not found:
            return
        record[tag_key] = found["tag"]
        if not record.get(alt_key):
            record[alt_key] = found["alt"]
        matched += 1

    for look in looks:
        apply(look, "runway_img_asset",
              f"runway_img_{look['look_number']}_tag", "runway_img_alt")
        for detail in look["details_images"]:
            apply(detail, "details_img_asset",
                  f"details_img_{detail['detail_index']}_tag", "details_img_alt")
    for detail in details:
        apply(detail, "details_img_asset",
              f"details_img_{detail['detail_index']}_tag", "details_img_alt")
    return matched


# --------------------------------------------------------------------------- #
# Metadata (design.md Phase C step 1)
# --------------------------------------------------------------------------- #

def extract_metadata(state: dict | None, html: str, url: str) -> dict:
    collection_slug, designer_slug = split_collection_url(url)
    designer, summary = "", ""

    if state:
        for node in _walk(state):
            if not isinstance(node, dict):
                continue
            if not designer:
                for key in ("brand", "designer"):
                    value = node.get(key)
                    if isinstance(value, str) and value.strip():
                        designer = value.strip()
                        break
                    if isinstance(value, dict) and isinstance(value.get("name"), str):
                        designer = value["name"].strip()
                        break
            if not summary and isinstance(node.get("review"), (list, dict)):
                summary = flatten_rich_text(node["review"])
            if designer and summary:
                break

    soup = BeautifulSoup(html, "lxml")
    if not designer:
        designer = designer_slug.replace("-", " ").title()
    if not summary:
        meta = soup.find("meta", attrs={"name": "description"}) or soup.find(
            "meta", attrs={"property": "og:description"}
        )
        if meta and meta.get("content"):
            summary = meta["content"].strip()

    return {
        "designer": designer,
        "collection_name": collection_slug,
        "summary": summary,
    }


def flatten_rich_text(node: Any) -> str:
    """Flatten Verso's nested ["tag", {attrs}, ...children] AST into plain text."""
    chunks: list[str] = []

    def visit(value: Any) -> None:
        if isinstance(value, str):
            chunks.append(value)
        elif isinstance(value, dict):
            for key in ("text", "content", "children"):
                if key in value:
                    visit(value[key])
        elif isinstance(value, list):
            start = 0
            if value and isinstance(value[0], str) and len(value) > 1:
                start = 2 if isinstance(value[1], dict) else 1
            for child in value[start:]:
                visit(child)

    visit(node)
    text = re.sub(r"\s{2,}", " ", " ".join(c.strip() for c in chunks if c and c.strip()))
    return re.sub(r"\s+([,.;:!?])", r"\1", text).strip()


# --------------------------------------------------------------------------- #
# Mapping policy
# --------------------------------------------------------------------------- #

def attach_details(looks: list[dict], details: list[dict], policy: str) -> tuple[int, str]:
    """Apply the chosen look->detail attachment policy. Returns (attached, note)."""
    already = sum(len(look["details_images"]) for look in looks)
    if already:
        return already, "Details were nested per look in the source data."
    if not details:
        return 0, "No detail gallery found for this show."

    if policy == "sequential":
        attached = 0
        for look in looks:
            index = look["look_number"] - 1
            if 0 <= index < len(details):
                look["details_images"].append(details[index])
                attached += 1
        return attached, (
            "UNVERIFIED: detail N attached to look N by position. Vogue publishes no "
            "look->detail link, so these pairings are very likely wrong in places."
        )

    return 0, (
        "Vogue publishes no look->detail link for this show: the detail gallery is an "
        "independent running sequence with its own count. Details are preserved in "
        "'details_gallery' for downstream vision-based matching rather than guessed at."
    )


# --------------------------------------------------------------------------- #
# Phase C: export
# --------------------------------------------------------------------------- #

def safe_filename(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", text or "").strip("_") or "unknown"


def build_payload(url: str, meta: dict, looks: list[dict], details: list[dict],
                  strategy: str, policy: str, note: str, attached: int,
                  tags_matched: int) -> dict:
    return {
        "source": "vogue",
        "designer": meta["designer"],
        "source_url": canonical_page_url(url),
        "collection_name": meta["collection_name"],
        "summary": meta["summary"],
        "looks": looks,
        "details_gallery": details,
        # --- provenance; additive, safe for downstream consumers to ignore ---
        "mapping": {
            "strategy": strategy,
            "detail_policy": policy,
            "looks_found": len(looks),
            "details_found": len(details),
            "details_attached": attached,
            "tags_captured": tags_matched,
            "note": note,
        },
    }


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

def state_from_script_tags(html: str) -> dict | None:
    """Recover the state object from a <script id="__NEXT_DATA__"> style tag.

    design.md Strategy 1 targets this tag directly; kept as a path for when the
    JavaScript globals are unavailable (e.g. cached HTML parsed offline).
    """
    soup = BeautifulSoup(html, "lxml")
    for key in STATE_GLOBALS:
        tag = soup.find("script", id=key)
        if tag and tag.string:
            try:
                return json.loads(tag.string)
            except json.JSONDecodeError:
                continue
    for tag in soup.find_all("script"):
        text = tag.string or ""
        for key in STATE_GLOBALS:
            marker = f"window.{key}"
            if marker in text:
                blob = _balanced_json_after(text, text.index(marker))
                if blob:
                    try:
                        return json.loads(blob)
                    except json.JSONDecodeError:
                        continue
    return None


def _balanced_json_after(text: str, start: int) -> str | None:
    """Extract the first brace-balanced JSON object at or after `start`."""
    open_at = text.find("{", start)
    if open_at == -1:
        return None
    depth, in_string, escaped = 0, False, False
    for i in range(open_at, len(text)):
        ch = text[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[open_at:i + 1]
    return None


async def scrape(args: argparse.Namespace) -> dict:
    target = canonical_page_url(args.url)
    print(f"-> Loading {target}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=not args.headful)
        context = await browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1440, "height": 900},
            locale="en-US",
        )
        page = await context.new_page()
        try:
            response = await page.goto(target, wait_until="domcontentloaded", timeout=args.timeout)
        except PlaywrightTimeoutError:
            await browser.close()
            raise SystemExit(f"Timed out loading {target} after {args.timeout} ms.")
        if response is not None and response.status >= 400:
            await browser.close()
            raise SystemExit(f"{target} returned HTTP {response.status}.")

        state = await page.evaluate(
            """(keys) => {
                for (const k of keys) {
                    const v = window[k];
                    if (v) {
                        try { return JSON.parse(JSON.stringify(v)); } catch (e) {}
                    }
                }
                return null;
            }""",
            list(STATE_GLOBALS),
        )
        html = await page.content()
        if state is None:
            state = state_from_script_tags(html)

        looks: list[dict] = []
        details: list[dict] = []
        strategy = "none"

        if args.strategy in ("auto", "state"):
            if state:
                galleries = find_galleries(state)
                if galleries.get(COLLECTION):
                    looks = looks_from_state(galleries[COLLECTION], args.image_size, target)
                    details = details_from_state(
                        galleries.get(DETAIL, []), args.image_size, target
                    )
                    strategy = "embedded-state"
                    print(f"   Strategy 1 (embedded state): "
                          f"{len(looks)} looks, {len(details)} details")
                else:
                    print("   Strategy 1: state object found but it holds no gallery.")
            else:
                print("   Strategy 1: no embedded state object on the page.")

        if not looks and args.strategy in ("auto", "dom"):
            print("   Strategy 2 (DOM traversal): driving the slideshows...")
            looks, details = await dom_strategy(page, target, args.timeout, args.image_size)
            strategy = "dom-traversal"
            print(f"   Strategy 2 (DOM traversal): "
                  f"{len(looks)} looks, {len(details)} details")

        if not looks:
            await browser.close()
            raise SystemExit(
                "No looks extracted. The page layout may have changed, or the request "
                "was blocked -- rerun with --headful to inspect."
            )

        tags_matched = 0
        if not args.no_tags:
            print("   Capturing <img> tags from the slideshows...")
            tags = await capture_tags(page, target, args.timeout)
            tags_matched = attach_tags(looks, details, tags)
            print(f"   tags captured: {tags_matched}/{len(looks) + len(details)} images")

        await browser.close()

    meta = extract_metadata(state, html, target)
    attached, note = attach_details(looks, details, args.detail_mapping)
    return build_payload(
        target, meta, looks, details, strategy, args.detail_mapping, note, attached,
        tags_matched,
    )


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    payload = asyncio.run(scrape(args))

    out_path = Path(
        args.out
        or f"{safe_filename(payload['designer'])}_"
           f"{safe_filename(payload['collection_name'])}_raw.json"
    )
    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    mapping = payload["mapping"]
    print(f"\n   designer   : {payload['designer']}")
    print(f"   collection : {payload['collection_name']}")
    print(f"   summary    : {len(payload['summary'])} chars")
    print(f"   looks      : {mapping['looks_found']}")
    print(f"   details    : {mapping['details_found']} "
          f"({mapping['details_attached']} attached to looks)")
    print(f"   img tags   : {mapping['tags_captured']}")
    print(f"   note       : {mapping['note']}")
    print(f"\nSaved -> {out_path.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
