# Outfit Deconstruction Plan

**Goal:** Take any outfit photo and pull it apart into four separate, reusable design elements — **color, pattern, fabric, and design sketch** — each captured cleanly enough to drop into your own designs later (recolor, remix, and drape onto other garments).

**Scope: apparel only.** This pipeline focuses on the **garments** (tops, jackets, skirts, trousers, dresses, layers). **Shoes, bags, and jewelry are out of scope** and are deliberately ignored. Every vision/reading step should be instructed explicitly: *"only describe the garments — ignore shoes, bags, and jewelry."* This gives cleaner outputs and means accessory coverage gaps in the source data don't matter.

**Current build decision:**
- **One AI provider — Gemini — for everything.** Vision reading (fabric, color, pattern recipe, garment labeling) → **Gemini 2.5 Pro/Flash**. Image generation (design sketch, pattern swatch, draping) → **Nano Banana (Gemini's image model)**. One API key covers the whole pipeline.
- **Segmentation (Grounded SAM) is skipped for now.** We rely on the runway image + detail shots fed directly to Gemini, and let Gemini focus on garments itself. See *Deferred / future upgrades* at the end for what this parks.

---

## The core principle (Gemini-only build)

Don't hand Gemini the whole photo and say "describe the outfit." The elements are tangled together (pattern sits on fabric, fabric shapes the cut, lighting coats everything). Two rules:

1. **Work per garment, not per whole outfit.** Use the pre-cropped **detail shots**, or tell Gemini to focus on one garment at a time. Gemini reads a clean close-up far better than the full busy runway frame. (This replaces the old "cut it out with segmentation" step — Gemini + detail shots do the focusing.)
2. **Match the source and the mode to the element.** Fabric & pattern → **detail shots** (close-ups). Silhouette & color story → **runway shot**. Reading jobs → Gemini *vision*; image jobs → Gemini *image* (Nano Banana).

---

## Input strategy: runway + detail shots (validated on Chanel S26 Couture)

Tested on two Chanel Spring 2026 Couture looks. With detail shots mapped to each runway look, you don't need segmentation:

- **Runway image** → whole-look elements: silhouette/sketch, overall color story, styling.
- **Detail shots (macro shots)** → close-in elements: **fabric (confirmed, not guessed), pattern/motif, trims.** The single biggest quality lift — e.g. confirming *sheer silk organza* that a runway frame reads wrong.

> 📌 **Pointer — use the JSON mapping to find the right macro shots.** Each collection folder contains a **`relationship.json`** that maps every runway image to its detail (macro) shots — e.g. `runway_img_1 → [details_img_1, details_img_2, details_img_3]`. **Before extracting color palette, fabric, and pattern/design for a look, read `relationship.json`, pull that look's mapped macro shots, and run the close-in extraction on those** (not on the runway frame). The runway image is used only for the whole-look elements (silhouette + overall color story) and as the fallback for any garment part the macro shots miss.
>
> Folder layout: `.../<Designer>/<Season>/` → `relationship.json`, `runway/`, `details/`.

**Detail shots take over the useful role Grounded SAM would have played** (a clean, high-res close-up of each part) — and do it *better*, because they're shot by a professional at macro resolution. Two things to handle:

1. **Label the detail shots.** relationship.json maps at *look* level, not *part* level — so run Gemini over each detail shot to tag what it shows ("bodice / hem / skirt motif"). Ignore ones that only show accessories.
2. **Coverage varies per look.** Detail-shot count is small (~3 per look, sometimes 1 is an accessory). For any garment part the details miss, fall back to the **runway image** and ask Gemini to read it there.

---

## Step 1 — Extract the four elements

Feed Gemini the right image (detail shot or runway) per element.

### 🎨 Color
- **Job:** the garment's palette.
- **Current build:** **Gemini vision** estimates the palette (name + approximate hex) directly from the image. Good enough to start.
- **Output:** palette + approximate hex.
- **Reliability:** Good, but **approximate** — Gemini eyeballs hex, it doesn't measure pixels.
- **Deferred:** pixel-exact hex via k-means needs an isolated garment crop, which needs segmentation — parked for now (see end).

### ✏️ Design sketch (the "silhouette")
- **Job:** turn the garment into a clean **flat line drawing** — seams, darts, collar, pockets, closures, proportions. Front-on, no body, no shadows.
- **Model:** **Nano Banana (Gemini image)** — instruct it to *redraw* the garment as a clean technical flat, not trace it (tracing keeps the wrinkles; redrawing gives clean construction lines).
- **Input:** the runway shot (full garment) works fine.
- **Output:** an editable design sketch you can redraw, modify, and drape patterns onto.
- **Reliability:** Good; it's a generative redraw, so review each output.

### ▦ Pattern (captured as a reusable asset)
- **Job:** grab the *actual print/motif* as a reusable asset, not just a name.
- **Steps:**
  1. Use the **detail shot** as the source (cleanest view of the print).
  2. **Nano Banana** cleans it up + (for repeats) makes it a **seamless tile**.
  3. **Gemini vision** writes the **recipe** — motif + scale + colors — so you can recolor/resize, not just copy.
- **Output:** a clean swatch/element **+** a recipe. *This is what you drape onto other designs.*
- **Reliability:** Medium (the AI clean-up is the variable part).
- **Two pattern types your capture must handle** (both Chanel looks tested were placement, not repeat — so don't assume tileable):
  - **Repeat / all-over** (houndstooth, stripe, check) → capture as a **seamless tile**.
  - **Placement / appliqué** (a bird motif, floral appliqué, a single embroidered emblem) → capture as a **standalone graphic element** you position, *not* tile.
  - Ask Gemini to detect which type it is first, then capture accordingly.

### 🧵 Fabric
- **Job:** best-guess the material.
- **Model:** **Gemini vision** on the detail shot (close-ups make this far more accurate — e.g. confirming sheer organza).
- **Output:** best-guess material + a confidence score.
- **Reliability:** Low–medium — you physically can't tell wool from a wool-lookalike in a photo. **Always flag it.**
- **Deferred:** a second model (e.g. Claude/GPT) to cross-check is parked — Gemini-only for now.

---

## Step 2 — The output: a reusable "kit" per look

```
runway image + detail shots
      │  (fed to Gemini; no segmentation)
      ├─ 🎨 color palette        (Gemini estimate, hex)
      ├─ ✏️ design sketch         (Nano Banana redraw)
      ├─ ▦ pattern swatch/element (Nano Banana + recipe)
      └─ 🧵 fabric read           (Gemini, + confidence)
```

Everything separated, everything reusable — lift any single element and drop it into a new design.

---

## Step 3 — Applying it (draping a pattern onto a new garment)

**Goal look:** the print follows the new garment's curves and folds, but stays evenly lit — no shadows.

- **Current build:** **Nano Banana (Gemini image)** — give it the target garment + the pattern swatch and instruct it to apply the print following the garment's folds and curves, keeping lighting even (no shadows). One model, one call.
- **Deferred (higher control):** the depth-map + ControlNet route (read folds with Depth Anything V2 → bend the swatch precisely) gives more control than a Gemini instruction, but it's non-Gemini. Park it until you need tighter control.

---

## The one "brain": Gemini

Everything runs through Gemini in two modes:

1. **Gemini vision (2.5 Pro/Flash)** — the reader: garment labeling, color estimate, fabric guess, pattern recipe, detail-shot tagging.
2. **Nano Banana (Gemini image)** — the maker: design sketch, pattern swatch clean-up/tiling, draping.

One provider, one API key, the whole pipeline.

---

## Notes to keep in mind

- **Fabric is the weak spot.** Attach a confidence score to every field — color and shape are solid, pattern usually right, fabric always a guess.
- **Give Gemini a fixed vocabulary** (e.g. Fashionpedia's fashion taxonomy) so answers stay consistent across many images.
- **Force structured JSON output.** Use Gemini's response-schema feature so every image returns the same shape (color / pattern / fabric / etc.) — that's what makes outputs usable in a product.
- **Redraw, don't trace, for sketches** — instruct Nano Banana to produce a clean technical flat, or you'll get wrinkles instead of seams.
- **Model names move fast.** "Gemini 2.5 Pro/Flash" and "Nano Banana" are today's names — check current model IDs when you build.

---

## Storage & IP strategy

Source images (Vogue/Condé Nast photos + Chanel designs) are copyrighted, and brand marks are trademarked. *Not legal advice — get counsel before any commercial use.* The architecture below keeps the safe layer usable and the risky layer contained.

**The principle: store *facts*, not *copies*.** Copyright protects the images and the artwork on garments — not the facts about them. "Camel merino with a bird appliqué" is data (safe); the actual photo or a pixel-lifted swatch is a derivative (risky).

**Four storage layers, by risk:**

| Layer | Holds | Risk | How to store |
|---|---|---|---|
| **1. Source references** | URLs, IDs, image hashes (like `relationship.json`) | None | Product DB — point to source, don't ship the photo |
| **2. Raw image cache** | The downloaded photos | High | Private, access-controlled, **processing only** — never served or redistributed |
| **3. Deconstructed metadata** ⭐ | Color hex, fabric type, motif/silhouette *descriptions*, tags, pattern recipe, provenance | Low (facts) | **The real product DB — the safe, shippable layer** |
| **4. Derived assets** | Extracted swatches, generated sketches | Medium–high (derivatives) | Internal reference only; **regenerate original versions** for anything user-facing |

Your product runs on **Layers 1 + 3**. Images (Layer 2) stay in a private processing vault; derived imagery (Layer 4) is internal until legally cleared.

**Two hard lines:**
1. **Trademarks are separate and stricter.** The CC logo and quilted trade dress are trademarks — strip/exclude brand marks during deconstruction; never reproduce them.
2. **"Inspired by" ≠ "copy of."** A palette or motif *concept* is fair inspiration; a pixel-lifted swatch of the exact design placed on your product is not. Regenerate — don't copy.

**Commercial line:** private R&D/learning = broad latitude; selling/publishing designs that reproduce the source pattern/photo/logo = real infringement risk (photo copyright *and* fashion IP); training an AI model on these images = its own contested area — flag it to a lawyer specifically.

**Practical:** keep provenance (source URL, designer, collection, date) on every element — good for trend analysis *and* as an audit trail. Segregate Layer 2 in its own locked bucket. Ship only Layers 1 and 3.

---

## Model summary table (Gemini-only build)

| Step / Element | Job | Model |
|---|---|---|
| 🎨 Color | Palette (approximate hex) | Gemini vision (2.5 Pro/Flash) |
| ✏️ Design sketch | Photo → flat line drawing | Nano Banana (Gemini image) |
| ▦ Pattern — swatch/element | Clean up + (for repeats) tile | Nano Banana (Gemini image) |
| ▦ Pattern — recipe | Motif, scale, colors | Gemini vision |
| 🧵 Fabric | Best-guess material | Gemini vision |
| Detail-shot labeling | Tag what each close-up shows | Gemini vision |
| Step 3. Draping | Apply pattern along folds | Nano Banana (Gemini image) |

---

## Deferred / future upgrades (parked for now)

These were in earlier versions of the plan and are intentionally set aside for the Gemini-only build. Add them later if you need more precision:

- **Grounded SAM (SAM 2 + Grounding DINO)** — segmentation to cut garments out and produce masks. Skipped; detail shots + Gemini cover it. Revisit if you need clean masks or process images without detail shots.
- **Pixel-exact color (k-means / ColorThief)** — precise hex. Needs an isolated garment crop (i.e. segmentation), so parked with SAM. Gemini's estimate is used meanwhile.
- **Depth + ControlNet draping (Depth Anything V2 + ControlNet)** — tighter geometric control for draping than a Gemini instruction. Revisit if Nano Banana's draping isn't precise enough.
- **Second vision model cross-check (Claude/GPT)** — for the guessy fields (fabric, pattern). Parked; Gemini-only for now.
