"""
Layer 0: batch orchestrator for the Vogue pipeline.

Reads a list of collection URLs, skips everything already done, and runs only the
new work. Designed so the operating model is "paste URLs into collections.json and
commit" -- see design.md section 8.

    python run_pipeline.py --dry-run          # show the plan and cost, call nothing
    python run_pipeline.py                    # scrape + map whatever is new
    python run_pipeline.py --only scrape      # just Layer 1
    python run_pipeline.py --recheck          # re-scrape, re-map only if content changed

Exit code is non-zero if any collection failed, so CI goes red while still having
completed all the work it could.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import hashlib
import io
import json
import logging
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import flatten
import match_details
import scraper
import tag_images

# Everything the engine reads and writes lives beside this file, so the pipeline
# behaves identically whether it is launched from here, from the repo root, or by CI.
HERE = Path(__file__).resolve().parent

STAGES = ("scrape", "match", "tag", "flatten")

# All human-facing times -- log filenames, log lines and manifest timestamps -- use
# this zone, so a run reads the same on your machine and in CI (which runs in UTC).
# A fixed offset is exact for India: there is no daylight saving, and it avoids
# depending on the tzdata package being present on Windows.
DISPLAY_TZ = timezone(timedelta(hours=5, minutes=30), "IST")

# Bump this to invalidate every scrape stage on the next run (rolls a fix out
# across the whole corpus).
PIPELINE_VERSION = 2

# Measured on gemini-2.5-flash: ~3,790 input + ~619 output tokens per detail.
COST_PER_DETAIL_USD = 0.0027

# Tagging sends one image (two for a detail, which carries its parent look) plus the
# collection summary, so it prices per image rather than per detail.
COST_PER_IMAGE_USD = 0.0023

# Used only to price a --dry-run for a collection nobody has scraped yet, where the
# real detail count is unknowable without fetching the page.
TYPICAL_DETAILS = 115

# LOG goes to console and file; DETAIL_LOG carries the layers' own chatter to the
# file only, so the console stays a clean one-line-per-stage summary.
LOG = logging.getLogger("pipeline")
DETAIL_LOG = logging.getLogger("pipeline.detail")


@contextlib.contextmanager
def captured_output(verbose: bool):
    """Swallow a layer's print() output and route it to the log file."""
    buffer = io.StringIO()
    try:
        with contextlib.redirect_stdout(buffer):
            yield
    finally:
        for line in buffer.getvalue().splitlines():
            if line.strip():
                (LOG if verbose else DETAIL_LOG).info("           | %s", line.rstrip())


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Batch-run the Vogue scrape + map pipeline.")
    p.add_argument("--input", default=str(HERE / "collections.json"),
                   help="JSON file mapping designer -> URLs (default: collections.json).")
    p.add_argument("--inputs-dir", default=str(HERE / "inputs"),
                   help="Optional directory of {designer}.txt URL lists (default: inputs/).")
    p.add_argument("--url", action="append", default=[],
                   help="Scrape this URL instead of reading the input file. Repeatable.")
    p.add_argument("--data-dir", default=str(HERE / "data"), help="Where outputs are written.")
    p.add_argument("--state-dir", default=str(HERE / "state"),
                   help="Where the manifest and run summaries live.")
    p.add_argument("--log-dir", default=str(HERE / "logs"), help="Where run logs are written.")

    p.add_argument("--only", choices=STAGES, default=None, help="Run only this stage.")
    p.add_argument("--force", choices=(*STAGES, "all"), default=None,
                   help="Re-run even when the manifest says the stage is done.")
    p.add_argument("--recheck", action="store_true",
                   help="Re-scrape everything; re-map only where the content fingerprint changed.")
    p.add_argument("--dry-run", action="store_true",
                   help="Print the plan and estimated cost. Makes no network or API calls.")

    p.add_argument("--max-collections", type=int, default=0,
                   help="Process at most N collections this run (0 = no limit).")
    p.add_argument("--max-cost", type=float, default=0.0,
                   help="Stop starting new match stages once the estimate exceeds this (USD).")
    p.add_argument("--delay", type=float, default=2.0,
                   help="Seconds to wait between collections (default 2).")
    p.add_argument("--fail-fast", action="store_true", help="Abort on the first failure.")
    p.add_argument("--verbose", action="store_true",
                   help="Echo each layer's own output to the console (it always goes to the log file).")
    p.add_argument("--min-tag-ratio", type=float, default=0.8,
                   help="Warn when fewer than this fraction of images yielded an <img> tag.")

    # Passed through to the layers.
    p.add_argument("--model", default=match_details.DEFAULT_MODEL)
    p.add_argument("--window", type=int, default=6)
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--image-size", choices=scraper.IMAGE_SIZES, default="original")
    p.add_argument("--image-width", type=int, default=512,
                   help="Rendition width for detail matching.")
    p.add_argument("--tag-image-width", type=int, default=768,
                   help="Rendition width for tagging (needs more detail than matching).")
    p.add_argument("--jsonl", action="store_true",
                   help="Write flattened output as newline-delimited JSON instead of an array.")
    p.add_argument("--skip-unmatched", action="store_true",
                   help="Omit unmatched details from the flattened output (kept by default).")
    p.add_argument("--timeout", type=int, default=90_000)
    p.add_argument("--headful", action="store_true")
    return p.parse_args(argv)


# --------------------------------------------------------------------------- #
# Input
# --------------------------------------------------------------------------- #

def _split_urls(value: Any) -> list[str]:
    """Accept a list, or a comma/newline-separated string. Pasting should be easy."""
    if isinstance(value, list):
        parts = [str(v) for v in value]
    else:
        parts = str(value).replace("\n", ",").split(",")
    return [p.strip() for p in parts if p.strip() and not p.strip().startswith("#")]


def load_inputs(args: argparse.Namespace) -> list[tuple[str, str]]:
    """Return (designer_key, canonical_url) pairs, de-duplicated, order preserved."""
    pairs: list[tuple[str, str]] = []

    if args.url:
        for url in args.url:
            _, designer_slug = scraper.split_collection_url(url)
            pairs.append((designer_slug or "unknown", url))
    else:
        path = Path(args.input)
        if path.exists():
            raw = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                raise SystemExit(f"{path} must be a JSON object of designer -> URLs.")
            for designer_key, value in raw.items():
                for url in _split_urls(value):
                    pairs.append((str(designer_key).strip().lower(), url))

        inputs_dir = Path(args.inputs_dir)
        if inputs_dir.is_dir():
            for file in sorted(inputs_dir.glob("*.txt")):
                for url in _split_urls(file.read_text(encoding="utf-8")):
                    pairs.append((file.stem.strip().lower(), url))

    if not pairs:
        raise SystemExit(
            f"No URLs found. Create {args.input} like "
            '{"prada": ["https://www.vogue.com/fashion-shows/fall-2025-ready-to-wear/prada"]} '
            "or pass --url."
        )

    seen: set[str] = set()
    unique: list[tuple[str, str]] = []
    skipped_bad = 0
    for designer_key, url in pairs:
        collection_slug, designer_slug = scraper.split_collection_url(url)
        if not collection_slug or not designer_slug:
            LOG.warning("  ignoring URL that is not /fashion-shows/{collection}/{designer}: %s", url)
            skipped_bad += 1
            continue
        canonical = scraper.canonical_page_url(url)
        if canonical in seen:
            continue
        seen.add(canonical)
        unique.append((designer_key, canonical))

    if skipped_bad:
        LOG.warning("  %d malformed URL(s) ignored", skipped_bad)
    return unique


# --------------------------------------------------------------------------- #
# Manifest
# --------------------------------------------------------------------------- #

def now_iso() -> str:
    """Timestamp for the manifest: ISO 8601 carrying the +05:30 offset, so it is
    unambiguous to a machine and still readable at a glance."""
    stamped = datetime.now(DISPLAY_TZ).strftime("%Y-%m-%dT%H:%M:%S%z")
    return f"{stamped[:-2]}:{stamped[-2:]}"  # +0530 -> +05:30


def run_stamp() -> str:
    """Filename stamp, e.g. 2026-08-02_16-28-35_IST."""
    return datetime.now(DISPLAY_TZ).strftime("%Y-%m-%d_%H-%M-%S_IST")


class ISTFormatter(logging.Formatter):
    """Render log times in DISPLAY_TZ regardless of the machine's own clock."""

    def formatTime(self, record, datefmt=None):  # noqa: N802 - logging's own name
        moment = datetime.fromtimestamp(record.created, DISPLAY_TZ)
        return moment.strftime(datefmt or "%Y-%m-%d %H:%M:%S IST")


def load_manifest(path: Path) -> dict:
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            data.setdefault("collections", {})
            _normalise_paths(data)
            return data
        except json.JSONDecodeError:
            LOG.warning("manifest at %s is unreadable; starting a fresh one", path)
    return {"pipeline_version": PIPELINE_VERSION, "collections": {}}


def _normalise_paths(manifest: dict) -> None:
    """Rewrite any Windows-style stored path to forward slashes, in place.

    A manifest written on Windows carries `data\\raw\\x.json`. On Linux that is a
    single filename, not a path, so `exists()` returns False and every collection
    would be silently re-scraped and re-paid-for on the first CI run.
    """
    for entry in manifest.get("collections", {}).values():
        for stage in (entry.get("stages") or {}).values():
            for key in ("output", "quarantine"):
                value = stage.get(key)
                if isinstance(value, str) and "\\" in value:
                    stage[key] = value.replace("\\", "/")


def build_summary(manifest: dict) -> dict:
    """Roll the per-collection ledger up into one at-a-glance block.

    Sits at the top of the manifest so the state of the whole corpus -- per designer
    and per stage -- can be read without opening any other file.
    """
    by_designer: dict[str, dict] = {}
    stage_counts = {name: {"ok": 0, "failed": 0, "suspect": 0, "pending": 0}
                    for name in STAGES}
    totals = {"collections": 0, "looks": 0, "details": 0, "details_attached": 0,
              "images_tagged": 0, "mongo_documents": 0, "est_cost_usd": 0.0}

    for entry in manifest.get("collections", {}).values():
        stages = entry.get("stages") or {}
        scrape, match, tag, flat = (stages.get(s) or {} for s in STAGES)
        slug = scraper.safe_filename(entry.get("designer") or
                                     entry.get("designer_key") or "unknown").lower()

        bucket = by_designer.setdefault(slug, {
            "designer": entry.get("designer") or slug, "collections": 0,
            "looks": 0, "details": 0, "details_attached": 0,
            "images_tagged": 0, "mongo_documents": 0, "est_cost_usd": 0.0,
            "last_run": "", "collection_names": [], "incomplete": [],
        })

        bucket["collections"] += 1
        totals["collections"] += 1
        for key, source, field in (("looks", scrape, "looks"),
                                   ("details", scrape, "details"),
                                   ("details_attached", match, "details_attached"),
                                   ("images_tagged", tag, "images_tagged"),
                                   ("mongo_documents", flat, "documents")):
            value = int(source.get(field) or 0)
            bucket[key] += value
            totals[key] += value
        cost = float(match.get("est_cost_usd") or 0) + float(tag.get("est_cost_usd") or 0)
        bucket["est_cost_usd"] = round(bucket["est_cost_usd"] + cost, 4)
        totals["est_cost_usd"] = round(totals["est_cost_usd"] + cost, 4)

        name = entry.get("collection_name") or "?"
        bucket["collection_names"].append(name)
        if entry.get("last_run", "") > bucket["last_run"]:
            bucket["last_run"] = entry["last_run"]

        for stage_name in STAGES:
            status = (stages.get(stage_name) or {}).get("status")
            key = status if status in ("ok", "failed", "suspect") else "pending"
            stage_counts[stage_name][key] += 1
            if key != "ok":
                bucket["incomplete"].append(f"{name}:{stage_name}={key}")

    return {
        "updated_at": now_iso(),
        "designers": len(by_designer),
        **totals,
        "by_stage": stage_counts,
        "by_designer": dict(sorted(by_designer.items())),
    }


def save_manifest(path: Path, manifest: dict) -> None:
    manifest["pipeline_version"] = PIPELINE_VERSION
    summary = build_summary(manifest)
    # Rebuild the dict so `summary` reads first in the file.
    ordered = {"pipeline_version": PIPELINE_VERSION, "summary": summary,
               "collections": manifest.get("collections", {})}
    manifest.clear()
    manifest.update(ordered)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")


def fingerprint(payload: dict) -> str:
    """Content identity: SHA-256 over the sorted photo ids of every image."""
    ids: list[str] = []
    for look in payload.get("looks", []):
        pid = scraper.photo_id(look.get("runway_img_asset") or "")
        if pid:
            ids.append(pid)
        for detail in look.get("details_images", []):
            pid = scraper.photo_id(detail.get("details_img_asset") or "")
            if pid:
                ids.append(pid)
    for detail in payload.get("details_gallery", []):
        pid = scraper.photo_id(detail.get("details_img_asset") or "")
        if pid:
            ids.append(pid)
    digest = hashlib.sha256("|".join(sorted(set(ids))).encode()).hexdigest()
    return f"sha256:{digest[:32]}"


def stage_of(entry: dict, name: str) -> dict:
    return (entry.get("stages") or {}).get(name) or {}


def rel_to_here(path: Path) -> str:
    """Store manifest paths relative to the engine folder, with forward slashes.

    Absolute paths would break the moment the repo is checked out somewhere else
    (every CI run), and CWD-relative paths break whenever the pipeline is launched
    from a different directory -- either way the skip check silently fails and the
    collection is scraped and paid for again.
    """
    try:
        return Path(path).resolve().relative_to(HERE).as_posix()
    except ValueError:
        return Path(path).as_posix()


def resolve_here(stored: str | None) -> Path | None:
    """Turn a manifest path back into a real one, anchored to the engine folder."""
    if not stored:
        return None
    path = Path(stored)
    return path if path.is_absolute() else HERE / path


# --------------------------------------------------------------------------- #
# Logging
# --------------------------------------------------------------------------- #

def setup_logging(log_dir: Path, stamp: str) -> Path:
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"run_{stamp}.log"

    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setFormatter(ISTFormatter("%(asctime)s  %(message)s"))

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter("%(message)s"))

    for logger in (LOG, DETAIL_LOG):
        logger.setLevel(logging.INFO)
        logger.handlers.clear()
        logger.propagate = False
        logger.addHandler(file_handler)
    LOG.addHandler(console)
    return log_path


def stage_line(stage: str, verb: str, message: str = "") -> None:
    LOG.info("         %-7s %-6s %s", stage, verb, message)


# --------------------------------------------------------------------------- #
# Stages
# --------------------------------------------------------------------------- #

def scrape_namespace(url: str, args: argparse.Namespace) -> SimpleNamespace:
    return SimpleNamespace(
        url=url, out=None, image_size=args.image_size, detail_mapping="none",
        strategy="auto", timeout=args.timeout, headful=args.headful, no_tags=False,
    )


def match_namespace(raw_path: Path, out_path: Path, args: argparse.Namespace) -> SimpleNamespace:
    return SimpleNamespace(
        raw=str(raw_path), out=str(out_path), model=args.model, window=args.window,
        workers=args.workers, image_width=args.image_width, limit=0,
        min_confidence=0.45, forced_min_confidence=0.3, no_gap_fill=False,
        cache=None, no_cache=False,
    )


def tag_namespace(mapped_path: Path, out_path: Path, args: argparse.Namespace) -> SimpleNamespace:
    return SimpleNamespace(
        mapped=str(mapped_path), out=str(out_path), model=args.model,
        workers=args.workers, image_width=args.tag_image_width, limit=0,
        summary_chars=3000, cache=None, no_cache=False,
    )


def flatten_namespace(tagged_path: Path, out_path: Path,
                      args: argparse.Namespace) -> SimpleNamespace:
    return SimpleNamespace(
        tagged=str(tagged_path), out=str(out_path),
        jsonl=args.jsonl, skip_unmatched=args.skip_unmatched,
    )


def designer_folder(entry: dict, fallback: str) -> str:
    """Folder name for a designer: lowercase, underscored, stable across runs."""
    name = entry.get("designer") or fallback
    return scraper.safe_filename(str(name)).lower() or "unknown"


def validate_scrape(payload: dict, previous: dict, min_tag_ratio: float) -> tuple[bool, str]:
    """Guardrail: never let a degraded scrape overwrite a good one."""
    looks = payload.get("looks") or []
    details = payload.get("details_gallery") or []
    if not looks:
        return False, "no looks extracted"
    missing_assets = [l["look_number"] for l in looks if not l.get("runway_img_asset")]
    if missing_assets:
        return False, f"{len(missing_assets)} look(s) have no image asset"

    total = len(looks) + len(details)
    tags = int((payload.get("mapping") or {}).get("tags_captured") or 0)
    if total and tags / total < min_tag_ratio:
        LOG.warning("         scrape  WARN   only %d/%d images yielded an <img> tag", tags, total)

    prior_looks = int(previous.get("looks") or 0)
    if prior_looks and len(looks) < prior_looks * 0.8:
        return False, (f"regression: {len(looks)} looks now vs {prior_looks} previously "
                       "-- quarantined, existing file left untouched")
    return True, ""


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    stamp = run_stamp()

    data_dir, state_dir = Path(args.data_dir), Path(args.state_dir)
    raw_dir, mapped_dir = data_dir / "raw", data_dir / "mapped"
    tagged_dir, quarantine_dir = data_dir / "tagged", data_dir / "quarantine"
    flattened_dir = data_dir / "flattened"
    for directory in (raw_dir, mapped_dir, tagged_dir, flattened_dir, state_dir / "runs"):
        directory.mkdir(parents=True, exist_ok=True)

    log_path = setup_logging(Path(args.log_dir), stamp)
    manifest_path = state_dir / "manifest.json"
    manifest = load_manifest(manifest_path)
    entries = manifest["collections"]

    collections = load_inputs(args)
    if args.max_collections:
        collections = collections[: args.max_collections]

    stale_version = manifest.get("pipeline_version") != PIPELINE_VERSION
    # Plain ASCII throughout: these logs get opened in Notepad and PowerShell, where
    # anything fancier turns into mojibake.
    LOG.info("run %s | %d collection(s) | pipeline v%d%s",
             now_iso(), len(collections), PIPELINE_VERSION,
             "  (version changed - scrapes invalidated)" if stale_version else "")
    if args.dry_run:
        LOG.info("DRY RUN - no network or API calls will be made\n")

    counts = {"scraped": 0, "matched": 0, "tagged": 0, "flattened": 0,
              "skipped": 0, "failed": 0, "suspect": 0}
    est_cost = 0.0
    rows: list[dict] = []
    started = time.time()

    for position, (designer_key, url) in enumerate(collections, start=1):
        collection_slug, designer_slug = scraper.split_collection_url(url)
        entry = entries.setdefault(url, {})
        entry.setdefault("first_seen", now_iso())
        entry["designer_key"] = designer_key
        entry.setdefault("collection_name", collection_slug)
        entry.setdefault("designer", designer_slug.replace("-", " ").title())
        entry.setdefault("stages", {})

        LOG.info("[%2d/%d] %s | %s", position, len(collections), designer_key, collection_slug)
        row = {"url": url, "designer": designer_key, "collection": collection_slug,
               "scrape": "skip", "match": "skip", "tag": "skip", "flatten": "skip",
               "error": None}

        prior_scrape = stage_of(entry, "scrape")
        prior_match = stage_of(entry, "match")
        prior_tag = stage_of(entry, "tag")
        prior_flatten = stage_of(entry, "flatten")

        # Outputs are filed under data/<stage>/<designer>/ so everything for one
        # designer sits together.
        folder = designer_folder(entry, designer_key)
        base_name = (f"{scraper.safe_filename(entry['designer'])}_"
                     f"{scraper.safe_filename(collection_slug)}")
        raw_path = resolve_here(prior_scrape.get("output")) or (
            raw_dir / folder / f"{base_name}_raw.json")

        force_scrape = args.force in ("scrape", "all") or args.recheck
        scrape_done = (
            prior_scrape.get("status") == "ok"
            and raw_path.exists()
            and prior_scrape.get("pipeline_version") == PIPELINE_VERSION
            and not force_scrape
        )

        # ---------------- scrape ----------------
        payload = None
        if args.only == "match":
            if not raw_path.exists():
                stage_line("scrape", "FAIL", "no raw file and --only match was given")
                counts["failed"] += 1
                row["scrape"] = "fail"
                rows.append(row)
                continue
        elif scrape_done:
            stage_line("scrape", "SKIP",
                       f"done {prior_scrape.get('at','?')[:10]} "
                       f"({prior_scrape.get('looks','?')} looks, "
                       f"{prior_scrape.get('details','?')} details)")
            counts["skipped"] += 1
        elif args.dry_run:
            stage_line("scrape", "PLAN", "would scrape")
            row["scrape"] = "plan"
            counts["scraped"] += 1
        else:
            stage_line("scrape", "RUN")
            try:
                with captured_output(args.verbose):
                    payload = asyncio.run(scraper.scrape(scrape_namespace(url, args)))
            except SystemExit as exc:
                stage_line("scrape", "FAIL", str(exc))
                entry["stages"]["scrape"] = {"status": "failed", "at": now_iso(), "error": str(exc)}
                counts["failed"] += 1
                row.update(scrape="fail", error=str(exc))
                rows.append(row)
                save_manifest(manifest_path, manifest)
                if args.fail_fast:
                    return 1
                continue
            except Exception as exc:  # noqa: BLE001 - one bad page must not kill the run
                stage_line("scrape", "FAIL", f"{type(exc).__name__}: {exc}")
                entry["stages"]["scrape"] = {"status": "failed", "at": now_iso(),
                                             "error": f"{type(exc).__name__}: {exc}"}
                counts["failed"] += 1
                row.update(scrape="fail", error=str(exc))
                rows.append(row)
                save_manifest(manifest_path, manifest)
                if args.fail_fast:
                    return 1
                continue

            ok, reason = validate_scrape(payload, prior_scrape, args.min_tag_ratio)
            mapping = payload.get("mapping") or {}
            if not ok:
                quarantine_dir.mkdir(parents=True, exist_ok=True)
                target = quarantine_dir / f"{raw_path.stem}_{stamp}.json"
                target.write_text(json.dumps(payload, indent=2, ensure_ascii=False),
                                  encoding="utf-8")
                stage_line("scrape", "SUSPECT", reason)
                entry["stages"]["scrape"] = {**prior_scrape, "status": "suspect",
                                             "at": now_iso(), "error": reason,
                                             "quarantine": rel_to_here(target)}
                counts["suspect"] += 1
                counts["failed"] += 1
                row.update(scrape="suspect", error=reason)
                rows.append(row)
                save_manifest(manifest_path, manifest)
                if args.fail_fast:
                    return 1
                continue

            entry["designer"] = payload.get("designer") or entry["designer"]
            entry["collection_name"] = payload.get("collection_name") or collection_slug
            folder = designer_folder(entry, designer_key)
            base_name = (f"{scraper.safe_filename(entry['designer'])}_"
                         f"{scraper.safe_filename(entry['collection_name'])}")
            raw_path = raw_dir / folder / f"{base_name}_raw.json"
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            raw_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False),
                                encoding="utf-8")
            entry["stages"]["scrape"] = {
                "status": "ok", "at": now_iso(), "pipeline_version": PIPELINE_VERSION,
                "looks": mapping.get("looks_found"), "details": mapping.get("details_found"),
                "tags": mapping.get("tags_captured"), "strategy": mapping.get("strategy"),
                "fingerprint": fingerprint(payload), "output": rel_to_here(raw_path),
            }
            stage_line("scrape", "OK", f"{mapping.get('looks_found')} looks, "
                                       f"{mapping.get('details_found')} details, "
                                       f"{mapping.get('tags_captured')} tags")
            counts["scraped"] += 1
            row["scrape"] = "ok"
            save_manifest(manifest_path, manifest)

        # ---------------- match ----------------
        if args.only == "scrape":
            rows.append(row)
            entry["last_run"] = now_iso()
            continue

        current_scrape = stage_of(entry, "scrape")
        current_fp = current_scrape.get("fingerprint")
        force_match = args.force in ("match", "all")
        content_changed = bool(current_fp) and prior_match.get("source_fingerprint") != current_fp
        mapped_path = resolve_here(prior_match.get("output")) or (
            mapped_dir / folder / f"{raw_path.stem.replace('_raw','')}_mapped.json")
        mapped_path.parent.mkdir(parents=True, exist_ok=True)

        match_done = (
            prior_match.get("status") == "ok"
            and mapped_path.exists()
            and prior_match.get("model") == args.model
            and not content_changed
            and not force_match
        )
        n_details = int(current_scrape.get("details") or 0)

        if match_done:
            stage_line("match", "SKIP",
                       f"done {prior_match.get('at','?')[:10]} "
                       f"({prior_match.get('details_attached','?')} attached)")
            counts["skipped"] += 1
        elif args.dry_run:
            known = n_details > 0
            assumed = n_details if known else TYPICAL_DETAILS
            cost = assumed * COST_PER_DETAIL_USD
            est_cost += cost
            reason = "content changed" if content_changed and prior_match else "not yet mapped"
            detail_text = (f"{assumed} details" if known
                           else f"~{assumed} details (assumed, page not fetched)")
            stage_line("match", "PLAN", f"{detail_text}, ~${cost:.2f} ({reason})")
            row["match"] = "plan"
        elif args.max_cost and est_cost + n_details * COST_PER_DETAIL_USD > args.max_cost:
            stage_line("match", "SKIP", f"--max-cost ${args.max_cost:.2f} would be exceeded")
            row["match"] = "budget"
        else:
            if not raw_path.exists():
                stage_line("match", "FAIL", "raw file missing")
                counts["failed"] += 1
                row.update(match="fail", error="raw file missing")
                rows.append(row)
                continue
            stage_line("match", "RUN", f"{n_details or '?'} details -> {args.model}")
            began = time.time()
            try:
                with captured_output(args.verbose):
                    result = match_details.run(match_namespace(raw_path, mapped_path, args))
            except SystemExit as exc:
                stage_line("match", "FAIL", str(exc))
                entry["stages"]["match"] = {"status": "failed", "at": now_iso(), "error": str(exc)}
                counts["failed"] += 1
                row.update(match="fail", error=str(exc))
                rows.append(row)
                save_manifest(manifest_path, manifest)
                if args.fail_fast:
                    return 1
                continue
            except Exception as exc:  # noqa: BLE001
                stage_line("match", "FAIL", f"{type(exc).__name__}: {exc}")
                entry["stages"]["match"] = {"status": "failed", "at": now_iso(),
                                            "error": f"{type(exc).__name__}: {exc}"}
                counts["failed"] += 1
                row.update(match="fail", error=str(exc))
                rows.append(row)
                save_manifest(manifest_path, manifest)
                if args.fail_fast:
                    return 1
                continue

            info = result.get("mapping") or {}
            cost = n_details * COST_PER_DETAIL_USD
            est_cost += cost
            entry["stages"]["match"] = {
                "status": "ok", "at": now_iso(), "model": args.model,
                "source_fingerprint": current_fp,
                "details_attached": info.get("details_attached"),
                "unmatched": info.get("details_unmatched"),
                "looks_with_details": info.get("looks_with_details"),
                "est_cost_usd": round(cost, 4), "output": rel_to_here(mapped_path),
            }
            stage_line("match", "OK",
                       f"{info.get('details_attached')}/{info.get('details_found')} attached, "
                       f"{info.get('looks_with_details')}/{info.get('looks_found')} looks   "
                       f"{time.time()-began:.0f}s  ~${cost:.2f}")
            counts["matched"] += 1
            row["match"] = "ok"
            save_manifest(manifest_path, manifest)

        # ---------------- tag ----------------
        if args.only in ("scrape", "match"):
            entry["last_run"] = now_iso()
            rows.append(row)
            continue

        current_match = stage_of(entry, "match")
        tagged_path = resolve_here(prior_tag.get("output")) or (
            tagged_dir / folder / f"{raw_path.stem.replace('_raw','')}_tagged.json")
        tagged_path.parent.mkdir(parents=True, exist_ok=True)

        # Re-mapping changes which parent look each detail is described against, so a
        # newer match stage makes existing tags stale.
        remapped = prior_tag.get("built_on_match_at") != current_match.get("at")
        n_images = int(current_scrape.get("looks") or 0) + int(current_scrape.get("details") or 0)

        tag_done = (
            prior_tag.get("status") == "ok"
            and tagged_path.exists()
            and prior_tag.get("model") == args.model
            and prior_tag.get("prompt_version") == tag_images.PROMPT_VERSION
            and not remapped
            and args.force not in ("tag", "all")
        )

        if tag_done:
            stage_line("tag", "SKIP",
                       f"done {prior_tag.get('at','?')[:10]} "
                       f"({prior_tag.get('images_tagged','?')} images)")
            counts["skipped"] += 1
        elif args.dry_run:
            assumed = n_images or 170
            cost = assumed * COST_PER_IMAGE_USD
            est_cost += cost
            known = n_images > 0
            stage_line("tag", "PLAN",
                       f"{assumed} images{'' if known else ' (assumed)'}, ~${cost:.2f}")
            row["tag"] = "plan"
        elif args.max_cost and est_cost + n_images * COST_PER_IMAGE_USD > args.max_cost:
            stage_line("tag", "SKIP", f"--max-cost ${args.max_cost:.2f} would be exceeded")
            row["tag"] = "budget"
        elif not mapped_path.exists():
            stage_line("tag", "FAIL", "mapped file missing")
            counts["failed"] += 1
            row.update(tag="fail", error="mapped file missing")
        else:
            stage_line("tag", "RUN", f"{n_images or '?'} images -> {args.model}")
            began = time.time()
            try:
                with captured_output(args.verbose):
                    tagged = tag_images.run(tag_namespace(mapped_path, tagged_path, args))
            except (SystemExit, Exception) as exc:  # noqa: BLE001
                stage_line("tag", "FAIL", f"{type(exc).__name__}: {exc}")
                entry["stages"]["tag"] = {"status": "failed", "at": now_iso(),
                                          "error": f"{type(exc).__name__}: {exc}"}
                counts["failed"] += 1
                row.update(tag="fail", error=str(exc))
                rows.append(row)
                save_manifest(manifest_path, manifest)
                if args.fail_fast:
                    return 1
                continue

            info = tagged.get("tagging") or {}
            cost = int(info.get("images_total") or n_images) * COST_PER_IMAGE_USD
            est_cost += cost
            entry["stages"]["tag"] = {
                "status": "ok", "at": now_iso(), "model": args.model,
                "prompt_version": tag_images.PROMPT_VERSION,
                "source_fingerprint": current_fp,
                "built_on_match_at": current_match.get("at"),
                "images_tagged": info.get("images_tagged"),
                "images_failed": info.get("images_failed"),
                "est_cost_usd": round(cost, 4), "output": rel_to_here(tagged_path),
            }
            stage_line("tag", "OK",
                       f"{info.get('images_tagged')}/{info.get('images_total')} images   "
                       f"{time.time()-began:.0f}s  ~${cost:.2f}")
            counts["tagged"] += 1
            row["tag"] = "ok"
            save_manifest(manifest_path, manifest)

        # ---------------- flatten ----------------
        if args.only in ("scrape", "match", "tag"):
            entry["last_run"] = now_iso()
            rows.append(row)
            continue

        current_tag = stage_of(entry, "tag")
        suffix = ".jsonl" if args.jsonl else ".json"
        flat_path = resolve_here(prior_flatten.get("output")) or (
            flattened_dir / folder /
            f"{raw_path.stem.replace('_raw','')}_flattened{suffix}")
        flat_path.parent.mkdir(parents=True, exist_ok=True)

        # Flattening is a pure copy of the tagged file, so it is stale the moment
        # tagging is re-run.
        flatten_done = (
            prior_flatten.get("status") == "ok"
            and flat_path.exists()
            and prior_flatten.get("built_on_tag_at") == current_tag.get("at")
            and args.force not in ("flatten", "all")
        )

        if flatten_done:
            stage_line("flatten", "SKIP",
                       f"done {prior_flatten.get('at','?')[:10]} "
                       f"({prior_flatten.get('documents','?')} docs)")
            counts["skipped"] += 1
        elif args.dry_run:
            stage_line("flatten", "PLAN", "free, no API calls")
            row["flatten"] = "plan"
        elif not tagged_path.exists():
            stage_line("flatten", "FAIL", "tagged file missing")
            counts["failed"] += 1
            row.update(flatten="fail", error="tagged file missing")
        else:
            stage_line("flatten", "RUN")
            try:
                with captured_output(args.verbose):
                    documents = flatten.run(flatten_namespace(tagged_path, flat_path, args))
            except (SystemExit, Exception) as exc:  # noqa: BLE001
                stage_line("flatten", "FAIL", f"{type(exc).__name__}: {exc}")
                entry["stages"]["flatten"] = {"status": "failed", "at": now_iso(),
                                              "error": f"{type(exc).__name__}: {exc}"}
                counts["failed"] += 1
                row.update(flatten="fail", error=str(exc))
                rows.append(row)
                save_manifest(manifest_path, manifest)
                if args.fail_fast:
                    return 1
                continue

            looks_out = sum(1 for d in documents if d.get("look_number") is not None)
            entry["stages"]["flatten"] = {
                "status": "ok", "at": now_iso(),
                "built_on_tag_at": current_tag.get("at"),
                "documents": len(documents), "looks": looks_out,
                "unmatched_details": len(documents) - looks_out,
                "output": rel_to_here(flat_path),
            }
            stage_line("flatten", "OK", f"{len(documents)} documents "
                                        f"({looks_out} looks) ready for Mongo")
            counts["flattened"] += 1
            row["flatten"] = "ok"
            save_manifest(manifest_path, manifest)

        entry["last_run"] = now_iso()
        rows.append(row)
        if args.delay and position < len(collections) and not args.dry_run:
            time.sleep(args.delay)

    save_manifest(manifest_path, manifest)

    LOG.info("%s", "-" * 64)
    LOG.info("scraped %d   matched %d   tagged %d   flattened %d   "
             "skipped %d   failed %d   suspect %d",
             counts["scraped"], counts["matched"], counts["tagged"], counts["flattened"],
             counts["skipped"], counts["failed"], counts["suspect"])
    # The estimate prices every detail that went through a match stage; calls served
    # from the response cache cost nothing, so this is an upper bound.
    LOG.info("gemini ~$%.2f est (upper bound; cached calls cost nothing)   "
             "elapsed %.0fs   log: %s", est_cost, time.time() - started, log_path)

    summary = {"run": stamp, "at": now_iso(), "pipeline_version": PIPELINE_VERSION,
               "dry_run": args.dry_run, "counts": counts,
               "est_cost_usd": round(est_cost, 4), "collections": rows}
    runs_dir = state_dir / "runs"
    (runs_dir / f"run_{stamp}.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    (runs_dir / "latest.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

    # Per-designer slices of this run, so everything for one designer -- data, logs and
    # run history -- can be found under that designer's name.
    for slug in {r["designer"] for r in rows}:
        subset = [r for r in rows if r["designer"] == slug]
        folder = runs_dir / scraper.safe_filename(slug).lower()
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"run_{stamp}.json").write_text(
            json.dumps({**summary, "designer": slug, "collections": subset},
                       indent=2, ensure_ascii=False), encoding="utf-8")
        lines = [f"{r['collection']}: scrape={r['scrape']} match={r['match']} "
                 f"tag={r['tag']}" + (f" error={r['error']}" if r["error"] else "")
                 for r in subset]
        designer_log = Path(args.log_dir) / scraper.safe_filename(slug).lower()
        designer_log.mkdir(parents=True, exist_ok=True)
        (designer_log / f"run_{stamp}.log").write_text(
            f"run {stamp}\n" + "\n".join(lines) + "\n", encoding="utf-8")

    return 1 if counts["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
