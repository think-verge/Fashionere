"""Render a static index.html gallery from stored look records (look-level shape).

Vanilla HTML/CSS, no framework, no build step. Source images are referenced by a
path relative to the output dir (computed from the original input folder) with a
visible brand credit; generated swatches/sketch are referenced from the output
assets dir (their stored paths are already output-relative).
"""

from __future__ import annotations

import html
import os
from pathlib import Path

from . import config, store


def _rel_from_output(out_dir: Path, target: Path) -> str:
    try:
        return os.path.relpath(target, out_dir)
    except ValueError:  # e.g. different drives on Windows
        return target.as_uri()


def _e(x) -> str:
    return html.escape(str(x if x is not None else ""))


def _palette(palette: list[dict]) -> str:
    items = []
    for c in palette or []:
        hexv = _e(c.get("hex") or "#ccc")
        safe = hexv if hexv.startswith("#") else "#cccccc"
        pantone = _e(c.get("pantone")) or "—"
        items.append(
            f'<div class="pal-item"><div class="pal-chip" style="background:{safe}"></div>'
            f'<div class="pal-name">{_e(c.get("name"))}</div>'
            f'<div class="pal-pantone">{pantone}</div>'
            f'<div class="pal-hex">{_e(c.get("role"))} · {hexv}</div></div>'
        )
    return f'<div class="palette">{"".join(items)}</div>' if items else ""


def _swatch_card(item: dict, out_dir: Path, meta: str) -> str:
    rel = item.get("swatch_asset") or ""
    img = (
        f'<img src="{_e(rel)}" alt="swatch" loading="lazy">'
        if rel and (out_dir / rel).exists()
        else '<div class="sw-noimg muted">no swatch</div>'
    )
    desc = (
        f'<div class="sw-desc">{_e(item.get("description"))}</div>'
        if item.get("description")
        else ""
    )
    name = item.get("name") or item.get("motif") or "swatch"
    return (
        f'<div class="sw-card">{img}<div class="sw-body">'
        f'<div class="sw-name">{_e(name)}</div>{desc}'
        f'<div class="sw-meta">{meta}</div></div></div>'
    )


def _grid(cards: list[str]) -> str:
    return f'<div class="swgrid">{"".join(cards)}</div>' if cards else ""


def _section(title: str, inner: str) -> str:
    return f'<div class="section"><h3>{title}</h3>{inner}</div>' if inner else ""


def _look_card(rec: dict, out_dir: Path, input_dir: Path) -> str:
    prov = rec.get("provenance", {})
    designer, collection = _e(prov.get("designer")), _e(prov.get("collection"))
    credit = f"© {designer}, {collection} — via Vogue"

    # Source images (runway + details), relative to output dir.
    src_imgs = []
    for rel, cap in (
        [(prov.get("runway_image"), "runway")]
        + [(d, "detail") for d in (prov.get("detail_images") or [])]
    ):
        if rel and "uploaded" not in str(rel):
            p = _rel_from_output(out_dir, input_dir / rel)
            src_imgs.append(f'<img src="{_e(p)}" alt="{cap}" loading="lazy">')

    ll = rec.get("look_level", {})
    silhouette = _e(ll.get("silhouette_description"))
    sketch_rel = ll.get("sketch_asset") or ""
    sketch = (
        f'<img class="sketch" src="{_e(sketch_rel)}" alt="sketch" loading="lazy">'
        if sketch_rel and (out_dir / sketch_rel).exists()
        else '<span class="muted">no sketch</span>'
    )

    # Per-garment cards: each with its own palette / fabric / pattern swatches.
    garment_cards = []
    for g in rec.get("garments", []) or []:
        palette = _palette(g.get("color_palette", []))
        fab_cards = [
            _swatch_card(
                f, out_dir,
                " · ".join(_e(f.get(k)) for k in ("material", "weight", "finish") if f.get(k))
                + f' <span class="conf conf-{_e(f.get("confidence"))}">{_e(f.get("confidence"))}</span>',
            )
            for f in g.get("fabrics", []) or []
        ]
        pat_cards = [
            _swatch_card(p, out_dir, " · ".join(_e(p.get(k)) for k in ("type", "scale") if p.get(k)))
            for p in g.get("patterns", []) or []
        ]
        garment_cards.append(f"""
      <div class="garment">
        <h3 class="garment-title">{_e(g.get("piece", "garment"))}</h3>
        {f'<div class="sub"><h4>Colors</h4>{palette}</div>' if palette else ''}
        {f'<div class="sub"><h4>Fabrics</h4>{_grid(fab_cards)}</div>' if fab_cards else ''}
        <div class="sub"><h4>Patterns</h4>{_grid(pat_cards) or '<div class="muted">no pattern</div>'}</div>
      </div>""")

    proc = rec.get("processing", {})
    status = _e(proc.get("status"))
    errors = proc.get("errors", []) or []
    err_html = ""
    if errors:
        items = "".join(f"<li>{_e(x)}</li>" for x in errors)
        err_html = f"<details class='errors'><summary>{len(errors)} issue(s)</summary><ul>{items}</ul></details>"

    return f"""
    <section class="look">
      <header class="look-head">
        <h2>{_e(rec.get("look_id"))}</h2>
        <span class="status status-{status}">{status}</span>
        <span class="credit">{_e(credit)}</span>
      </header>
      {f'<div class="silhouette">{silhouette}</div>' if silhouette else ''}
      <div class="look-top">
        {_section("Design sketch", sketch)}
        {_section("Source", f'<div class="thumbs">{"".join(src_imgs)}</div>') if src_imgs else ''}
      </div>
      {_section("Garments", "".join(garment_cards) or '<div class="muted">no garments</div>')}
      {err_html}
    </section>"""


_CSS = """
:root { color-scheme: light dark; --line: rgba(128,128,128,.35); }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  margin: 0; padding: 0 24px 64px; line-height: 1.5; }
.page-head { padding: 32px 0 16px; border-bottom: 2px solid currentColor; margin-bottom: 24px; }
.page-head h1 { margin: 0 0 4px; font-size: 28px; }
.page-head .sub { opacity: .7; font-size: 14px; }
.look { border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin-bottom: 28px; }
.look-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
.look-head h2 { margin: 0; text-transform: capitalize; }
.status { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; padding: 2px 8px;
  border-radius: 999px; border: 1px solid; }
.status-complete { color: #1a7f37; border-color: #1a7f37; }
.status-partial  { color: #9a6700; border-color: #9a6700; }
.status-failed   { color: #cf222e; border-color: #cf222e; }
.credit { font-size: 11px; opacity: .7; margin-left: auto; }
.silhouette { font-size: 13px; opacity: .85; margin: 4px 0 2px; }
.look-top { display: flex; gap: 28px; flex-wrap: wrap; align-items: flex-start; }
.look-top .section { flex: 0 0 auto; }
.section { margin-top: 18px; }
.section h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .6px; opacity: .6; margin: 0 0 10px; }
.garment { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; }
.garment-title { margin: 0 0 6px; font-size: 16px; text-transform: capitalize; }
.sub { margin-top: 12px; }
.sub h4 { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; opacity: .55; margin: 0 0 8px; font-weight: 600; }
.palette { display: flex; flex-wrap: wrap; gap: 14px; }
.pal-item { text-align: center; width: 74px; }
.pal-chip { width: 74px; height: 74px; border-radius: 12px; border: 1px solid var(--line); }
.pal-name { font-size: 12px; margin-top: 5px; text-transform: capitalize; }
.pal-pantone { font-size: 11px; font-weight: 600; margin-top: 2px; }
.pal-hex { font-size: 10px; opacity: .55; }
.swgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px,1fr)); gap: 14px; }
.sw-card { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.sw-card > img { width: 100%; aspect-ratio: 1/1; object-fit: cover; display: block; background: rgba(128,128,128,.12); }
.sw-noimg { aspect-ratio: 1/1; display: flex; align-items: center; justify-content: center; font-size: 11px; }
.sw-body { padding: 9px 11px; }
.sw-name { font-size: 13px; font-weight: 600; text-transform: capitalize; }
.sw-desc { font-size: 11px; opacity: .65; margin-top: 3px; line-height: 1.4; }
.sw-meta { font-size: 10px; opacity: .55; margin-top: 5px; }
.conf { font-size: 10px; padding: 1px 6px; border-radius: 4px; margin-left: 5px; }
.conf-high { background: rgba(26,127,55,.22); }
.conf-medium { background: rgba(154,103,0,.22); }
.conf-low { background: rgba(207,34,46,.22); }
.sketch { width: 100%; max-width: 280px; background: #fff; border: 1px solid var(--line); border-radius: 10px; }
.thumbs img { width: 74px; height: 104px; object-fit: cover; border-radius: 6px; border: 1px solid var(--line); margin: 0 6px 6px 0; }
.muted { opacity: .5; font-style: italic; }
.errors { margin-top: 12px; font-size: 12px; color: #cf222e; }
"""


def render(out_dir: str | Path, input_dir: str | Path) -> Path:
    """Render output/index.html from stored records. Returns its path."""
    out = Path(out_dir).resolve()
    inp = Path(input_dir).resolve() if input_dir else out
    records = store.load_all_records(out)

    designer = collection = ""
    if records:
        prov = records[0].get("provenance", {})
        designer = prov.get("designer", "")
        collection = prov.get("collection", "")

    cards = "".join(_look_card(r, out, inp) for r in records)
    title = f"{designer} — {collection}".strip(" —") or "Fashionairre Gallery"
    body = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_e(title)} · Fashionairre</title>
<style>{_CSS}</style>
</head><body>
<div class="page-head">
  <h1>{_e(title)}</h1>
  <div class="sub">Deconstruction gallery · {len(records)} look(s) · generated by Fashionairre MVP</div>
</div>
{cards}
</body></html>"""

    dest = out / config.INDEX_HTML
    dest.write_text(body, encoding="utf-8")
    return dest
