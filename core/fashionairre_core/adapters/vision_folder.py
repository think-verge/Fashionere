"""vision_folder adapter — a runway image folder → canonical `Look` SHELL.

Reads a `<Brand>/<Season>/` folder (relationship.json + runway/ + details/,
the deconstruction engine's input layout) and produces a canonical Look whose
`images` point at the real files. `extraction` is left None — it is filled by the
vision extractor (the deconstruction engine); see the `deconstruction` adapter.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from fashionairre_core import identity
from fashionairre_core.schema import Context, Image, Look, Meta, Source

_IDX = re.compile(r"_(?:img_)?(\d+)$")


def _links(path: Path) -> dict[int, str]:
    m: dict[int, str] = {}
    if not path.exists():
        return m
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        mm = re.match(r"^\s*Image_(\d+)\.jpg\s*:\s*(\S+)", line)
        if mm:
            m[int(mm.group(1))] = mm.group(2)
    return m


def parse_folder(folder: str | Path, *, look_number: int = 1, brand: str | None = None) -> Look:
    folder = Path(folder)
    brand = brand or folder.parent.name.replace("_", " ")
    brand_slug = identity.slugify(brand)
    season, year, category = identity.parse_collection_name(folder.name)
    cid = identity.collection_id(brand_slug, season, year, category)
    lid = identity.look_id(brand_slug, cid, look_number)

    runway_links = _links(folder / "runway" / "Image_Links.txt")
    detail_links = _links(folder / "details" / "Image_Links.txt")

    # find this look's runway + mapped details from relationship.json
    rel = json.loads((folder / "relationship.json").read_text(encoding="utf-8"))
    entry = next((e for e in rel if any(k == f"runway_img_{look_number}" for k in e)), None)

    images: list[Image] = []
    runway_file = folder / "runway" / f"Image_{look_number}.jpg"
    images.append(Image(image_id="img0", role="runway", kind="image_file",
                        file=str(runway_file), url=runway_links.get(look_number),
                        source_page=runway_links.get(look_number)))
    if entry:
        for det in entry.get("details_images", []) or []:
            for k in det:
                mm = _IDX.search(k)
                if not mm:
                    continue
                d = int(mm.group(1))
                images.append(Image(image_id=f"img{len(images)}", role="detail", kind="image_file",
                                    file=str(folder / "details" / f"Image_{d}.jpg"),
                                    url=detail_links.get(d), source_page=det[k]))

    return Look(
        look_id=lid,
        source=Source(type="vogue", source_ref=f"{cid}#{look_number}",
                     source_url=runway_links.get(look_number)),
        context=Context(brand=brand, brand_slug=brand_slug, collection_id=cid,
                        collection_name=folder.name.replace("_", " "), season=season,
                        year=year, category=category, provenance_confidence="stated"),
        images=images,
        extraction=None,   # ← filled by the vision extractor (deconstruction engine)
        meta=Meta(scraper_ver="image-folder"),
    )
