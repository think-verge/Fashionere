"""All prompt templates.

Image prompts combine relevant trend `descriptor`s + the target category + a
shared `style_anchor` (passed in by the pipeline for cohesion). The narrative
prompt and the resolver prompts (query parse / image describe) live here too.
"""
from __future__ import annotations

STYLE_ANCHOR = (
    "editorial fashion photography, soft natural light, "
    "minimal seamless background, sharp detail, no text, no logo"
)


def build_style_anchor(aesthetic: str | None) -> str:
    """Build a query-specific style anchor that frames every image prompt."""
    base = "editorial fashion photography, soft natural light, minimal seamless background, sharp detail, no text, no logo"
    if not aesthetic:
        return base
    return f"{aesthetic} aesthetic, {base}"


# ---------- Image prompts (one per kind) ----------

def hero_prompt(
    category, color_desc, silhouette_desc, material_desc, aesthetic_desc,
    style_anchor=STYLE_ANCHOR, gender_modifier: str = "",
):
    subject = f"{gender_modifier} " if gender_modifier else ""
    return (
        f"A {subject}{category} garment, {silhouette_desc}, in {color_desc}, made of {material_desc}, "
        f"{aesthetic_desc}. Full garment shown clearly. {style_anchor}."
    )


def silhouette_prompt(category, silhouette_desc, style_anchor=STYLE_ANCHOR, gender_modifier: str = ""):
    return (
        f"Technical fashion flat sketch line drawing of a {category}, {silhouette_desc}. "
        f"Clean black lines on white background, front view, minimal."
    )


def texture_prompt(material_desc, style_anchor=STYLE_ANCHOR, gender_modifier: str = ""):
    return (
        f"Extreme close-up macro photograph of {material_desc} fabric. "
        f"Fills the frame, high detail, soft light."
    )


def pattern_prompt(pattern_desc, color_desc, style_anchor=STYLE_ANCHOR, gender_modifier: str = ""):
    # Framed as a flat-lay photo of printed fabric: conveys the pattern while
    # avoiding image-recitation refusals triggered by "seamless/tileable" stock
    # pattern phrasing.
    return (
        f"A flat-lay photograph of fabric printed with {pattern_desc}, in {color_desc}. "
        f"Soft natural light, minimal seamless background, sharp detail, no text, no logo."
    )


def detail_prompt(category, detail_desc, color_desc, style_anchor=STYLE_ANCHOR, gender_modifier: str = ""):
    return (
        f"Close-up of a garment construction detail: {detail_desc} on a {category}, "
        f"in {color_desc}. {style_anchor}."
    )


def styling_prompt(
    category, color_desc, aesthetic_desc, style_anchor=STYLE_ANCHOR, gender_modifier: str = "",
):
    subject = f"{gender_modifier} model" if gender_modifier else "a model"
    return (
        f"Full-length editorial fashion photo of {subject} wearing a {category}, "
        f"in {color_desc}, styled {aesthetic_desc}. {style_anchor}."
    )


def colorway_prompt(
    category, silhouette_desc, alt_color_desc, style_anchor=STYLE_ANCHOR, gender_modifier: str = "",
):
    subject = f"{gender_modifier} " if gender_modifier else ""
    return (
        f"A {subject}{category}, {silhouette_desc}, in {alt_color_desc}. Full garment. {style_anchor}."
    )


# ---------- LLM text prompt (narrative + keywords + names) ----------

NARRATIVE_SYSTEM = (
    "You are a fashion creative director. Given a set of current trends for a garment "
    "category, write a concise moodboard summary. Return ONLY valid JSON, no markdown."
)


def narrative_user(category, season, market, trends, brief=None) -> str:
    lines = [
        f"- [{t.type}] {t.label} ({t.lifecycle_stage}, confidence {t.confidence_score}): {t.descriptor}"
        for t in trends
    ]
    trend_block = "\n".join(lines) if lines else "- (no strong trends found)"
    brief_block = ""
    if brief:
        parts = []
        if brief.gender:
            parts.append(f"gender={brief.gender}")
        if brief.age_group:
            parts.append(f"age_group={brief.age_group}")
        if brief.occasion:
            parts.append(f"occasion={brief.occasion}")
        if brief.aesthetic:
            parts.append(f"aesthetic={brief.aesthetic}")
        if parts:
            brief_block = f"Creative Brief: {', '.join(parts)}\n"
    return (
        f"Category: {category}\n"
        f"Season/Market: {season or 'n/a'} / {market or 'n/a'}\n"
        f"{brief_block}"
        f"Trends:\n{trend_block}\n\n"
        "Return JSON exactly:\n"
        "{\n"
        '  "narrative": "<2-3 sentence evocative mood paragraph>",\n'
        '  "keywords": ["<6-10 aesthetic keywords>"],\n'
        '  "name_suggestions": ["<3 collection/theme name ideas>"]\n'
        "}"
    )


# ---------- Resolver prompts ----------

QUERY_PARSE_SYSTEM = (
    "You are a fashion creative analyst. Parse a short fashion request and extract structured "
    "intent. Return ONLY valid JSON, no markdown, no explanation."
)


def query_parse_user(query: str) -> str:
    return (
        f'Request: "{query}"\n\n'
        "Return JSON exactly:\n"
        "{\n"
        '  "category": "<single garment category, e.g. swimwear|dresses|denim|t-shirts>",\n'
        '  "season": "<e.g. SS27 or null>",\n'
        '  "market": "<e.g. womenswear or null>",\n'
        '  "aesthetic": "<the dominant style or era, e.g. \'90s minimalist\' | \'Y2K glamour\' | \'coastal casual\' or null>",\n'
        '  "style_keywords": ["<6-10 concise style descriptors that capture the mood, silhouette, fabric feel, and era — used to match relevant trends>"\n'
        "  ]\n"
        "}"
    )


BRIEF_SYSTEM = (
    "You are a senior fashion creative director with deep knowledge of gendered fashion conventions. "
    "Given a parsed fashion query, build a structured creative brief that defines what is contextually "
    "appropriate for this EXACT combination of category, gender, and occasion. "
    "Gender is a hard constraint — never suggest silhouettes, garments, or aesthetics that cross "
    "gender boundaries unless the query explicitly asks for it. "
    "Be specific — use real garment names, not vague descriptors. "
    "Return ONLY valid JSON, no markdown."
)


def brief_user(query: str, parsed: dict) -> str:
    return (
        f'Raw query: "{query}"\n'
        f'Parsed category: {parsed.get("category")}\n'
        f'Parsed aesthetic: {parsed.get("aesthetic")}\n'
        f'Parsed market: {parsed.get("market")}\n\n'
        "Build a creative brief. Apply these rules strictly:\n\n"
        "compatible_materials: list ONLY materials that make sense for this specific category. "
        "For denim list denim fabrics (stretch denim, raw selvedge, cotton twill), NOT wool or silk. "
        "For beachwear list quick-dry synthetics, terry, linen — NOT heavy wools or formal fabrics.\n\n"
        "compatible_silhouettes: list ONLY silhouettes that a real person of this gender would actually wear "
        "in this specific occasion and culture. Be ruthlessly gender-specific — if gender is male, "
        "NEVER include feminine silhouettes (kimono, wrap dress, cover-up, sarong, kaftan). "
        "If gender is female, NEVER include masculine-coded silhouettes. "
        "For male beachwear: board shorts, swim trunks, short-sleeve shirt, muscle tee, polo. "
        "For female beachwear: bikini, one-piece, sarong, wrap dress, cover-up. "
        "Use specific garment names, NOT vague terms like 'relaxed fit' or 'resort wear' "
        "that could match unrelated trends.\n\n"
        "compatible_colors: list ONLY colors that are characteristic of this specific aesthetic and location context. "
        "Be specific about hue and tone — 'coral', 'turquoise', 'neon yellow' not just 'warm tones'. "
        "For Miami heat / tropical: coral, turquoise, neon yellow, hot pink, ocean blue, sun orange. "
        "For minimal/quiet luxury: off-white, stone, warm grey, navy. "
        "For bohemian: earthy terracotta, rust, sage green, sand. "
        "IMPORTANT: if the query has a strong location/vibe (e.g. Miami, Ibiza, Tokyo street), let that "
        "define the colors — do NOT default to neutral or generic palettes like white or beige "
        "unless the query explicitly asks for minimal/clean aesthetics.\n\n"
        "injection_context should be a single paragraph giving full creative direction for an LLM "
        "generating fashion image descriptors — include what fits AND explicit exclusions.\n\n"
        "Return JSON exactly:\n"
        "{\n"
        '  "gender": "<male|female|unisex|null>",\n'
        '  "age_group": "<youth|adult|senior|null>",\n'
        '  "occasion": "<casual|formal|streetwear|activewear|eveningwear|null>",\n'
        '  "dominant_fabric": "<the fabric that defines this category, or null if open>",\n'
        '  "compatible_materials": ["<material>", ...],\n'
        '  "compatible_patterns": ["<pattern>", ...],\n'
        '  "compatible_silhouettes": ["<silhouette>", ...],\n'
        '  "compatible_colors": ["<color family or specific color>", ...],\n'
        '  "prompt_gender_modifier": "<e.g. \'young male model\' | \'female model\' | \'\'>",\n'
        '  "injection_context": "<full creative direction paragraph>"\n'
        "}"
    )


AESTHETIC_INJECT_SYSTEM = (
    "You are a fashion creative director with deep knowledge of fashion aesthetics, eras, and movements. "
    "Given a trending aesthetic and garment category, generate concise image-prompt-ready descriptors "
    "for missing trend attributes. Each descriptor must be specific, evocative, and 5-15 words. "
    "Return ONLY valid JSON, no markdown."
)


def aesthetic_inject_user(aesthetic_label: str, category: str, missing_types: list[str]) -> str:
    type_lines = "\n".join(
        f'  "{t}": "<5-15 word descriptor specific to {aesthetic_label} for {category}>"'
        for t in missing_types
    )
    return (
        f'Trending aesthetic: "{aesthetic_label}"\n'
        f'Garment category: "{category}"\n'
        f'Missing trend types: {missing_types}\n\n'
        f'Generate image-prompt-ready descriptors for each missing type, '
        f'drawn from your knowledge of what "{aesthetic_label}" looks like in fashion.\n'
        f'Also return a palette of 3-5 colors characteristic of this aesthetic.\n\n'
        f'Return JSON exactly:\n'
        f'{{\n'
        f'{type_lines},\n'
        f'  "palette": [\n'
        f'    {{"name": "<color name>", "hex": "<#rrggbb>", "family": "<color family>"}}\n'
        f'  ]\n'
        f'}}'
    )


def build_edit_instruction(color: str | None, pattern: str | None, fabric: str | None) -> str:
    """Build a Gemini edit instruction from the provided overrides."""
    parts = []
    if color:
        parts.append(f"change the garment color to {color}")
    if pattern:
        parts.append(f"apply a {pattern} pattern to the garment")
    if fabric:
        parts.append(f"change the fabric to {fabric}")
    if not parts:
        return ""
    instruction = ", ".join(parts)
    return (
        f"Edit this fashion image: {instruction}. "
        "Keep the garment silhouette, pose, model, and background exactly the same. "
        "Only change the specified visual attributes of the garment."
    )


def swap_prompt_descriptors(
    prompt: str,
    color: str | None = None,
    pattern: str | None = None,
) -> str:
    """Return a new prompt with color/pattern overrides appended as directives."""
    overrides = []
    if color:
        overrides.append(f"color: {color}")
    if pattern:
        overrides.append(f"pattern: {pattern}")
    if not overrides:
        return prompt
    return prompt.rstrip(".") + ". Override: " + ", ".join(overrides) + "."


IMAGE_DESCRIBE_SYSTEM = (
    "You are a fashion vision assistant. Describe the uploaded garment image: identify "
    "its category and key attributes. Return ONLY valid JSON, no markdown."
)


def image_describe_user(image_url: str) -> str:
    return (
        f"Image URL: {image_url}\n\n"
        "Return JSON exactly:\n"
        '{ "category": "<garment category>", "attributes": { "<key>": "<value>" } }'
    )
