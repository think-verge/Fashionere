"""Local drag-and-drop web app (FastAPI): upload one look, get its deconstruction.

The browser sends the dropped images as multipart/form-data to
``POST /api/deconstruct``; the server runs the same engine as the CLI (vision
read on runway + detail shots, text-to-image sketch), saves a JSON record +
sketch, and returns the result for live display.

    python -m src.webapp [--output ./output] [--port 8000] [--host 127.0.0.1]

One look per upload: every uploaded detail shot is treated as belonging to the
single uploaded runway look — no relationship.json needed. Uploaded source
photos are NOT stored (IP plan Layer 2 stays out); only the deconstructed facts
+ the generated sketch are persisted.
"""

from __future__ import annotations

import argparse
import base64
import threading
import time
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse

from . import config, deconstruct, store
from .config import RunConfig
from .schemas import LookRecord

app = FastAPI(title="Fashionairre Deconstruction Engine")

# Set in main() before the server starts.
_OUTPUT_DIR: Path = Path("./output")
_id_lock = threading.Lock()
_id_counter = 0


def _next_look_id() -> str:
    global _id_counter
    with _id_lock:
        _id_counter += 1
        return f"upload_{int(time.time())}_{_id_counter}"


def _data_url(png: bytes | None) -> str:
    return "data:image/png;base64," + base64.b64encode(png).decode() if png else ""


def run_deconstruction(
    runway_bytes: bytes | None,
    detail_bytes: list[bytes],
    designer: str,
    collection: str,
    source: str,
    quality: bool,
) -> dict:
    """Run the engine on one uploaded look and persist it. Returns JSON dict."""
    if runway_bytes is None and not detail_bytes:
        return {"ok": False, "error": "No images were uploaded."}

    cfg = RunConfig(input_dir="", output_dir=str(_OUTPUT_DIR), quality=quality)
    errors: list[str] = []

    # 1) Vision read: per-garment palette, fabrics, patterns.
    data, v_err = deconstruct.read_elements_from_images(runway_bytes, detail_bytes, cfg)
    if v_err:
        errors.append(v_err)
    data = data or {}
    garments_in = data.get("garments", []) or []
    ll_src = data.get("look_level", {}) or {}
    ordered = deconstruct.order_images(runway_bytes, detail_bytes)
    look_id = _next_look_id()

    # 2) Generate in parallel: one whole-look sketch + one swatch per garment's
    #    fabric/pattern (cropped from the real source images, then AI-cleaned).
    #    Keys are (garment_index, item_index).
    per_garment_patterns: list[list[dict]] = [
        [p for p in (g.get("patterns", []) or []) if (p.get("type") or "none") != "none"]
        for g in garments_in
    ]
    with ThreadPoolExecutor(max_workers=8) as ex:
        fut_sketch = ex.submit(deconstruct.generate_sketch_from_vision, data, cfg)
        fab_futs = {
            (gi, fi): ex.submit(deconstruct.generate_fabric_swatch, f, ordered, cfg)
            for gi, g in enumerate(garments_in)
            for fi, f in enumerate(g.get("fabrics", []) or [])
        }
        pat_futs = {
            (gi, pi): ex.submit(deconstruct.generate_pattern_swatch, p, ordered, cfg)
            for gi, pats in enumerate(per_garment_patterns)
            for pi, p in enumerate(pats)
        }
        sketch_png, s_err = fut_sketch.result()
        fab_res = {k: fut.result() for k, fut in fab_futs.items()}
        pat_res = {k: fut.result() for k, fut in pat_futs.items()}
    if s_err:
        errors.append(s_err)

    # 3) Save assets + build per-garment records (persist paths, keep data URLs).
    sketch_rel = store.save_sketch(_OUTPUT_DIR, look_id, sketch_png) if sketch_png else ""
    garment_records: list[dict] = []
    display_garments: list[dict] = []
    for gi, g in enumerate(garments_in):
        piece = g.get("piece", "") or "garment"
        fab_recs, fab_disp = [], []
        for fi, fab in enumerate(g.get("fabrics", []) or []):
            png, err = fab_res.get((gi, fi), (None, ""))
            rel = store.save_asset(_OUTPUT_DIR, look_id, f"g{gi}_fabric_{fi}.png", png) if png else ""
            fab_recs.append({**fab, "swatch_asset": rel})
            fab_disp.append({**fab, "swatch_asset": rel, "swatch_url": _data_url(png)})
            if err:
                errors.append(f"[{piece} / {fab.get('name', 'fabric')}] {err}")
        pat_recs, pat_disp = [], []
        for pi, pat in enumerate(per_garment_patterns[gi]):
            png, err = pat_res.get((gi, pi), (None, ""))
            rel = store.save_asset(_OUTPUT_DIR, look_id, f"g{gi}_pattern_{pi}.png", png) if png else ""
            pat_recs.append({**pat, "swatch_asset": rel})
            pat_disp.append({**pat, "swatch_asset": rel, "swatch_url": _data_url(png)})
            if err:
                errors.append(f"[{piece} / {pat.get('name', 'pattern')}] {err}")
        palette = g.get("color_palette", []) or []
        garment_records.append(
            {"piece": piece, "color_palette": palette, "fabrics": fab_recs, "patterns": pat_recs}
        )
        display_garments.append(
            {"piece": piece, "color_palette": palette, "fabrics": fab_disp, "patterns": pat_disp}
        )

    vision_ok = bool(garments_in)
    status = "failed" if not vision_ok and not sketch_png else ("partial" if errors else "complete")

    # 4) Validate/normalize + persist the full record.
    record = LookRecord.model_validate(
        {
            "look_id": look_id,
            "provenance": {
                "designer": designer.strip() or "(uploaded)",
                "collection": collection.strip(),
                "source_runway_url": source.strip(),
                "runway_image": "(uploaded, not stored)",
                "detail_images": [f"(uploaded x{len(detail_bytes)})"] if detail_bytes else [],
            },
            "garments": garment_records,
            "look_level": {
                "silhouette_description": ll_src.get("silhouette_description", ""),
                "color_story": ll_src.get("color_story", []),
                "sketch_asset": sketch_rel,
            },
            "processing": {
                "model_vision": cfg.vision_model,
                "model_image": cfg.image_model,
                "status": status,
                "errors": errors,
            },
        }
    )
    store.save_record(_OUTPUT_DIR, record.model_dump())

    # Response uses the display garments (with swatch data URLs) for live render.
    resp = record.model_dump()
    resp["garments"] = display_garments
    return {"ok": True, "record": resp, "sketch": _data_url(sketch_png)}


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return HTML_PAGE


@app.get("/favicon.ico")
def favicon() -> JSONResponse:
    return JSONResponse({}, status_code=204)


@app.post("/api/deconstruct")
async def deconstruct_endpoint(
    runway: UploadFile | None = File(None),
    details: list[UploadFile] = File(default=[]),
    designer: str = Form(""),
    collection: str = Form(""),
    source: str = Form(""),
    quality: bool = Form(False),
) -> JSONResponse:
    runway_bytes = await runway.read() if runway is not None else None
    detail_bytes = [await d.read() for d in details]
    # The engine makes blocking Gemini calls (~20-40s); run off the event loop.
    from anyio import to_thread

    try:
        result = await to_thread.run_sync(
            run_deconstruction,
            runway_bytes,
            detail_bytes,
            designer,
            collection,
            source,
            quality,
        )
    except Exception as e:  # noqa: BLE001 — surface as JSON, never a raw 500
        return JSONResponse({"ok": False, "error": f"{type(e).__name__}: {e}"})
    return JSONResponse(result)


def main(argv: list[str] | None = None) -> int:
    global _OUTPUT_DIR
    p = argparse.ArgumentParser(prog="python -m src.webapp",
                                description="Local drag-and-drop deconstruction app.")
    p.add_argument("--output", default="./output", help="Where records/sketches are saved")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--no-open", action="store_true", help="Don't auto-open a browser")
    a = p.parse_args(argv)

    _OUTPUT_DIR = Path(a.output).resolve()
    store.ensure_dirs(_OUTPUT_DIR)

    # Fail fast if the key is missing (rather than on the first upload).
    try:
        config.get_api_key()
    except config.ConfigError as e:
        print(f"Config error: {e}")
        return 2

    url = f"http://{a.host}:{a.port}/"
    print(f"Fashionairre deconstruction app running at {url}")
    print(f"Records + sketches save to: {_OUTPUT_DIR}")
    print("Press Ctrl+C to stop.")
    if not a.no_open:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host=a.host, port=a.port, log_level="warning")
    return 0


# --- Single-page UI (inline CSS + JS, no build step) -----------------------
HTML_PAGE = r"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fashionairre — Deconstruction Engine</title>
<style>
:root { color-scheme: light dark; --line: rgba(128,128,128,.35); --accent:#7c5cff; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  margin: 0; padding: 0 24px 64px; line-height: 1.5; }
.head { padding: 28px 0 16px; border-bottom: 2px solid currentColor; margin-bottom: 22px; }
.head h1 { margin: 0 0 4px; font-size: 26px; letter-spacing: .3px; }
.head .sub { opacity: .7; font-size: 14px; }
.layout { display: grid; grid-template-columns: 360px 1fr; gap: 28px; }
@media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }
.panel { border: 1px solid var(--line); border-radius: 12px; padding: 18px; }
.drop { border: 2px dashed var(--line); border-radius: 10px; padding: 18px; text-align: center;
  cursor: pointer; transition: .15s; margin-bottom: 8px; }
.drop.drag { border-color: var(--accent); background: rgba(124,92,255,.08); }
.drop h4 { margin: 0 0 4px; font-size: 13px; text-transform: uppercase; letter-spacing:.5px; }
.drop p { margin: 0; font-size: 12px; opacity: .6; }
.previews { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 14px; }
.previews .pv { position: relative; }
.previews img { width: 64px; height: 88px; object-fit: cover; border-radius: 6px; border:1px solid var(--line); }
.previews .rm { position:absolute; top:-6px; right:-6px; background:#cf222e; color:#fff; border:none;
  border-radius:50%; width:18px; height:18px; font-size:11px; cursor:pointer; line-height:1; }
label.fld { display:block; font-size:12px; opacity:.7; margin: 10px 0 3px; }
input[type=text] { width:100%; padding:7px 9px; border:1px solid var(--line); border-radius:7px;
  background:transparent; color:inherit; font-size:13px; }
.row { display:flex; align-items:center; gap:8px; margin-top:12px; font-size:13px; }
button.go { margin-top:16px; width:100%; padding:11px; border:none; border-radius:9px;
  background: var(--accent); color:#fff; font-size:15px; font-weight:600; cursor:pointer; }
button.go:disabled { opacity:.5; cursor:default; }
.status-msg { font-size:13px; margin-top:10px; min-height:18px; opacity:.8; }
.results:empty::after { content:"Upload a runway image + its detail shots, then Deconstruct.";
  opacity:.5; font-size:14px; }
.look { border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:18px; }
.look h2 { margin:0 0 4px; font-size:18px; }
.badge { font-size:11px; text-transform:uppercase; letter-spacing:.5px; padding:2px 8px;
  border-radius:999px; border:1px solid; margin-left:8px; }
.b-complete{color:#1a7f37;border-color:#1a7f37} .b-partial{color:#9a6700;border-color:#9a6700}
.b-failed{color:#cf222e;border-color:#cf222e}
.grid2 { display:grid; grid-template-columns: 300px 1fr; gap:20px; margin-top:12px; }
@media (max-width:700px){ .grid2{grid-template-columns:1fr;} }
.sketch { width:100%; max-width:280px; background:#fff; border:1px solid var(--line); border-radius:10px; }
.silhouette { font-size:13px; opacity:.85; margin:2px 0 6px; }
.look-top { display:flex; gap:28px; flex-wrap:wrap; align-items:flex-start; }
.look-top .section { flex:0 0 auto; }
.section { margin-top:18px; }
.section h3 { font-size:12px; text-transform:uppercase; letter-spacing:.6px; opacity:.6; margin:0 0 10px; }
.garment { border:1px solid var(--line); border-radius:12px; padding:14px 16px; margin-bottom:14px; }
.garment-title { margin:0 0 6px; font-size:16px; text-transform:capitalize; }
.sub { margin-top:12px; }
.sub h4 { font-size:11px; text-transform:uppercase; letter-spacing:.5px; opacity:.55; margin:0 0 8px; font-weight:600; }
/* color palette */
.palette { display:flex; flex-wrap:wrap; gap:14px; }
.pal-item { text-align:center; width:74px; }
.pal-chip { width:74px; height:74px; border-radius:12px; border:1px solid rgba(128,128,128,.35); }
.pal-name { font-size:12px; margin-top:5px; text-transform:capitalize; }
.pal-pantone { font-size:11px; font-weight:600; margin-top:2px; }
.pal-hex { font-size:10px; opacity:.55; }
/* fabric + pattern swatch grids */
.swgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:14px; }
.sw-card { border:1px solid var(--line); border-radius:12px; overflow:hidden; }
.sw-card > img { width:100%; aspect-ratio:1/1; object-fit:cover; display:block; background:rgba(128,128,128,.12); }
.sw-noimg { aspect-ratio:1/1; display:flex; align-items:center; justify-content:center; font-size:11px; }
.sw-body { padding:9px 11px; }
.sw-name { font-size:13px; font-weight:600; text-transform:capitalize; }
.sw-desc { font-size:11px; opacity:.65; margin-top:3px; line-height:1.4; }
.sw-meta { font-size:10px; opacity:.55; margin-top:5px; }
.conf{font-size:10px;padding:1px 6px;border-radius:4px;margin-left:5px}
.conf-high{background:rgba(26,127,55,.22)}.conf-medium{background:rgba(154,103,0,.22)}.conf-low{background:rgba(207,34,46,.22)}
.thumbs img { width:60px;height:82px;object-fit:cover;border-radius:6px;border:1px solid var(--line);margin:0 4px 4px 0; }
.muted{opacity:.5;font-style:italic}
.errbox{margin-top:12px;font-size:12px;color:#cf222e}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--accent);
  border-radius:50%;animation:spin .8s linear infinite;vertical-align:-2px;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<div class="head">
  <h1>Fashionairre — Deconstruction Engine</h1>
  <div class="sub">Upload one look (runway + detail shots) → color, fabric, pattern & a design sketch.</div>
</div>
<div class="layout">
  <div class="panel">
    <div class="drop" id="drop-runway">
      <h4>Runway image</h4><p>Click or drop the full-look photo (1)</p>
    </div>
    <input type="file" id="file-runway" accept="image/*" hidden>
    <div class="previews" id="pv-runway"></div>

    <div class="drop" id="drop-details">
      <h4>Detail / macro shots</h4><p>Click or drop close-ups (0–6)</p>
    </div>
    <input type="file" id="file-details" accept="image/*" multiple hidden>
    <div class="previews" id="pv-details"></div>

    <label class="fld">Designer (optional)</label>
    <input type="text" id="designer" placeholder="e.g. Chanel">
    <label class="fld">Collection (optional)</label>
    <input type="text" id="collection" placeholder="e.g. Spring 2026 Couture">
    <label class="fld">Source URL (optional)</label>
    <input type="text" id="source" placeholder="https://…">
    <div class="row"><input type="checkbox" id="quality"><label for="quality">Higher-quality read (gemini-2.5-pro, slower)</label></div>

    <button class="go" id="go">Deconstruct</button>
    <div class="status-msg" id="status"></div>
  </div>
  <div class="results" id="results"></div>
</div>
<script>
// Keep the actual File objects for multipart upload; object URLs are for preview.
const state = { runway: null, details: [] };
const esc = s => String(s==null?"":s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const urlFor = f => URL.createObjectURL(f);

function wireDrop(dropId, inputId, multiple){
  const drop=document.getElementById(dropId), input=document.getElementById(inputId);
  drop.onclick=()=>input.click();
  ['dragover','dragenter'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add('drag');}));
  ['dragleave','drop'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.remove('drag');}));
  drop.addEventListener('drop',ev=>handleFiles(ev.dataTransfer.files,multiple));
  input.addEventListener('change',()=>handleFiles(input.files,multiple));
}
function handleFiles(files, multiple){
  const arr=[...files].filter(f=>f.type.startsWith('image/'));
  for(const f of arr){
    if(multiple){ if(state.details.length<6) state.details.push(f); }
    else { state.runway=f; } }
  renderPreviews();
}
function renderPreviews(){
  document.getElementById('pv-runway').innerHTML = state.runway
    ? `<div class="pv"><img src="${urlFor(state.runway)}"><button class="rm" onclick="state.runway=null;renderPreviews()">×</button></div>` : '';
  document.getElementById('pv-details').innerHTML = state.details.map((f,i)=>
    `<div class="pv"><img src="${urlFor(f)}"><button class="rm" onclick="state.details.splice(${i},1);renderPreviews()">×</button></div>`).join('');
}
wireDrop('drop-runway','file-runway',false);
wireDrop('drop-details','file-details',true);
renderPreviews();

function paletteItem(c){ const hex=esc(c.hex||'#ccc'); const safe=/^#/.test(hex)?hex:'#ccc';
  return `<div class="pal-item"><div class="pal-chip" style="background:${safe}"></div>
    <div class="pal-name">${esc(c.name)}</div>
    <div class="pal-pantone">${c.pantone?esc(c.pantone):'—'}</div>
    <div class="pal-hex">${esc(c.role)} · ${hex}</div></div>`; }
function fabricCard(f){
  const img = f.swatch_url ? `<img src="${f.swatch_url}" alt="fabric swatch">` : '<div class="sw-noimg muted">no swatch</div>';
  const meta = [f.material,f.weight,f.finish].filter(Boolean).map(esc).join(' · ');
  return `<div class="sw-card">${img}<div class="sw-body">
    <div class="sw-name">${esc(f.name)}</div>
    ${f.description?`<div class="sw-desc">${esc(f.description)}</div>`:''}
    <div class="sw-meta">${meta}<span class="conf conf-${esc(f.confidence)}">${esc(f.confidence)}</span></div>
    </div></div>`; }
function patternCard(p){
  const img = p.swatch_url ? `<img src="${p.swatch_url}" alt="pattern swatch">` : '<div class="sw-noimg muted">no swatch</div>';
  const meta = [p.type,p.scale].filter(Boolean).map(esc).join(' · ');
  return `<div class="sw-card">${img}<div class="sw-body">
    <div class="sw-name">${esc(p.name||p.motif)}</div>
    ${p.description?`<div class="sw-desc">${esc(p.description)}</div>`:''}
    <div class="sw-meta">${meta}</div></div></div>`; }
function subsection(title, inner){ return inner ? `<div class="sub"><h4>${title}</h4>${inner}</div>` : ''; }
function section(title, inner){ return inner ? `<div class="section"><h3>${title}</h3>${inner}</div>` : ''; }

function garmentCard(g){
  const palH = (g.color_palette||[]).map(paletteItem).join('');
  const fabH = (g.fabrics||[]).map(fabricCard).join('');
  const patH = (g.patterns||[]).map(patternCard).join('');
  return `<div class="garment">
    <h3 class="garment-title">${esc(g.piece||'garment')}</h3>
    ${subsection('Colors', palH ? `<div class="palette">${palH}</div>` : '')}
    ${subsection('Fabrics', fabH ? `<div class="swgrid">${fabH}</div>` : '')}
    ${subsection('Patterns', patH ? `<div class="swgrid">${patH}</div>` : '<div class="muted">no pattern</div>')}
  </div>`;
}

function renderResult(data, srcUrls){
  const rec=data.record, ll=rec.look_level||{}, proc=rec.processing||{};
  const skH = data.sketch ? `<img class="sketch" src="${data.sketch}">` : '<span class="muted">no sketch generated</span>';
  const srcH = (srcUrls||[]).map(u=>`<img src="${u}">`).join('');
  const garH = (rec.garments||[]).map(garmentCard).join('') || '<div class="muted">no garments detected</div>';
  const errH = (proc.errors&&proc.errors.length)?`<div class="errbox">${proc.errors.map(esc).join('<br>')}</div>`:'';
  const title = [rec.provenance.designer, rec.provenance.collection].filter(Boolean).map(esc).join(' · ');
  const card=document.createElement('div'); card.className='look';
  card.innerHTML=`<h2>${title||'Uploaded look'}<span class="badge b-${esc(proc.status)}">${esc(proc.status)}</span></h2>
    ${ll.silhouette_description?`<div class="silhouette">${esc(ll.silhouette_description)}</div>`:''}
    <div class="look-top">
      ${section('Design sketch', skH)}
      ${section('Uploaded source', `<div class="thumbs">${srcH}</div>`)}
    </div>
    <div class="section"><h3>Garments</h3>${garH}</div>
    ${errH}`;
  document.getElementById('results').prepend(card);
}

document.getElementById('go').onclick=async()=>{
  if(!state.runway && state.details.length===0){ setStatus('Add at least one image first.'); return; }
  const btn=document.getElementById('go'); btn.disabled=true;
  setStatus('<span class="spinner"></span>Reading garments & generating sketch… (~20–40s)');
  // Snapshot preview URLs before the request so the result card shows what was sent.
  const srcUrls=[state.runway,...state.details].filter(Boolean).map(urlFor);
  try{
    const fd=new FormData();
    if(state.runway) fd.append('runway', state.runway);
    state.details.forEach(f=>fd.append('details', f));
    fd.append('designer', val('designer')); fd.append('collection', val('collection'));
    fd.append('source', val('source')); fd.append('quality', document.getElementById('quality').checked);
    const res=await fetch('/api/deconstruct',{method:'POST',body:fd});
    const data=await res.json();
    if(!data.ok){ setStatus('Error: '+esc(data.error||'unknown')); }
    else { setStatus('Done — status: '+esc(data.record.processing.status)); renderResult(data, srcUrls); }
  }catch(e){ setStatus('Request failed: '+esc(e.message)); }
  finally{ btn.disabled=false; }
};
function val(id){ return document.getElementById(id).value; }
function setStatus(h){ document.getElementById('status').innerHTML=h; }
</script>
</body></html>
"""


if __name__ == "__main__":
    raise SystemExit(main())
