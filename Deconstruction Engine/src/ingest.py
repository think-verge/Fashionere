"""Ingest a collection folder into a list of Look objects with resolved paths.

Input folder layout (see PRODUCT_SPEC §4):

    <Designer>/<Season>/
      relationship.json
      runway/    Image_1.jpg, ..., Image_Links.txt
      details/   Image_1.jpg, ..., Image_Links.txt

``relationship.json`` maps at look level:
    [ { "runway_img_N": <url>,
        "details_images": [ {"details_img_X": <url>}, ... ] }, ... ]

Index-based file resolution: ``runway_img_1`` -> ``runway/Image_1.jpg``;
``details_img_4`` -> ``details/Image_4.jpg``. Missing files are recorded on the
Look (not raised) so the batch can continue.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

_IMG_KEY_RE = re.compile(r"_(?:img_)?(\d+)$")  # trailing index in "runway_img_12"
_LINKS_LINE_RE = re.compile(r"^\s*(Image_\d+\.jpg)\s*:\s*(\S+)\s*$")


@dataclass
class Look:
    """One runway look with its mapped detail (macro) shots, resolved to paths."""

    look_id: str
    designer: str
    collection: str

    runway_image_rel: str                 # e.g. "runway/Image_1.jpg"
    runway_image_path: Path
    source_runway_url: str

    detail_images_rel: list[str] = field(default_factory=list)
    detail_image_paths: list[Path] = field(default_factory=list)
    detail_source_urls: list[str] = field(default_factory=list)

    missing_files: list[str] = field(default_factory=list)  # rel paths not on disk

    @property
    def has_runway(self) -> bool:
        return self.runway_image_path.exists()


def _derive_designer_collection(input_dir: Path) -> tuple[str, str]:
    """<Designer>/<Season> -> ('Chanel', 'Spring 2026 Couture')."""
    season = input_dir.name.replace("_", " ").strip()
    designer = input_dir.parent.name.strip() if input_dir.parent else ""
    return designer or "Unknown", season or "Unknown"


def _parse_links(links_file: Path) -> dict[int, str]:
    """Parse an Image_Links.txt into {index: source_url}. Missing file -> {}."""
    mapping: dict[int, str] = {}
    if not links_file.exists():
        return mapping
    for line in links_file.read_text(encoding="utf-8", errors="replace").splitlines():
        m = _LINKS_LINE_RE.match(line)
        if not m:
            continue
        filename, url = m.group(1), m.group(2)
        idx_m = re.search(r"Image_(\d+)\.jpg", filename)
        if idx_m:
            mapping[int(idx_m.group(1))] = url
    return mapping


def _index_from_key(key: str) -> int | None:
    """'runway_img_1' -> 1; 'details_img_4' -> 4. None if no trailing index."""
    m = _IMG_KEY_RE.search(key)
    return int(m.group(1)) if m else None


def ingest(input_dir: str | Path) -> list[Look]:
    """Parse the collection folder and return a list of Look objects.

    Raises FileNotFoundError only for a missing folder or relationship.json —
    per-image absences are recorded on each Look instead.
    """
    root = Path(input_dir).expanduser().resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"Input folder not found: {root}")

    rel_json = root / "relationship.json"
    if not rel_json.exists():
        raise FileNotFoundError(f"relationship.json not found in {root}")

    try:
        mapping = json.loads(rel_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"relationship.json is not valid JSON: {e}") from e
    if not isinstance(mapping, list):
        raise ValueError("relationship.json must be a JSON array of look objects.")

    designer, collection = _derive_designer_collection(root)
    runway_urls = _parse_links(root / "runway" / "Image_Links.txt")
    detail_urls = _parse_links(root / "details" / "Image_Links.txt")

    looks: list[Look] = []
    for entry in mapping:
        if not isinstance(entry, dict):
            continue

        # Find the runway_img_N key (any key that isn't details_images).
        runway_key = next(
            (k for k in entry if k.startswith("runway_img")), None
        )
        if runway_key is None:
            continue
        r_idx = _index_from_key(runway_key)
        if r_idx is None:
            continue

        runway_rel = f"runway/Image_{r_idx}.jpg"
        runway_path = root / "runway" / f"Image_{r_idx}.jpg"

        look = Look(
            look_id=f"look_{r_idx}",
            designer=designer,
            collection=collection,
            runway_image_rel=runway_rel,
            runway_image_path=runway_path,
            source_runway_url=entry.get(runway_key) or runway_urls.get(r_idx, ""),
        )
        if not runway_path.exists():
            look.missing_files.append(runway_rel)

        for det in entry.get("details_images") or []:
            if not isinstance(det, dict):
                continue
            for det_key, det_url in det.items():
                d_idx = _index_from_key(det_key)
                if d_idx is None:
                    continue
                det_rel = f"details/Image_{d_idx}.jpg"
                det_path = root / "details" / f"Image_{d_idx}.jpg"
                look.detail_images_rel.append(det_rel)
                look.detail_image_paths.append(det_path)
                look.detail_source_urls.append(det_url or detail_urls.get(d_idx, ""))
                if not det_path.exists():
                    look.missing_files.append(det_rel)

        looks.append(look)

    return looks
