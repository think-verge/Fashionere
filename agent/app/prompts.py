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

def hero_prompt(category, color_desc, silhouette_desc, material_desc, aesthetic_desc, style_anchor=STYLE_ANCHOR):
    return (
        f"A {category} garment, {silhouette_desc}, in {color_desc}, made of {material_desc}, "
        f"{aesthetic_desc}. Full garment shown clearly. {style_anchor}."
    )


def silhouette_prompt(category, silhouette_desc, style_anchor=STYLE_ANCHOR):
    return (
        f"Technical fashion flat sketch line drawing of a {category}, {silhouette_desc}. "
        f"Clean black lines on white background, front view, minimal."
    )


def texture_prompt(material_desc, style_anchor=STYLE_ANCHOR):
    return (
        f"Extreme close-up macro photograph of {material_desc} fabric. "
        f"Fills the frame, high detail, soft light."
    )


def pattern_prompt(pattern_desc, color_desc, style_anchor=STYLE_ANCHOR):
    # Framed as a flat-lay photo of printed fabric: conveys the pattern while
    # avoiding image-recitation refusals triggered by "seamless/tileable" stock
    # pattern phrasing.
    return (
        f"A flat-lay photograph of fabric printed with {pattern_desc}, in {color_desc}. "
        f"Soft natural light, minimal seamless background, sharp detail, no text, no logo."
    )


def detail_prompt(category, detail_desc, color_desc, style_anchor=STYLE_ANCHOR):
    return (
        f"Close-up of a garment construction detail: {detail_desc} on a {category}, "
        f"in {color_desc}. {style_anchor}."
    )


def styling_prompt(category, color_desc, aesthetic_desc, style_anchor=STYLE_ANCHOR):
    return (
        f"Full-length editorial fashion photo of a model wearing a {category}, "
        f"in {color_desc}, styled {aesthetic_desc}. {style_anchor}."
    )


def colorway_prompt(category, silhouette_desc, alt_color_desc, style_anchor=STYLE_ANCHOR):
    return (
        f"A {category}, {silhouette_desc}, in {alt_color_desc}. Full garment. {style_anchor}."
    )


# ---------- LLM text prompt (narrative + keywords + names) ----------

NARRATIVE_SYSTEM = (
    "You are a fashion creative director. Given a set of current trends for a garment "
    "category, write a concise moodboard summary. Return ONLY valid JSON, no markdown."
)


def narrative_user(category, season, market, trends) -> str:
    lines = [
        f"- [{t.type}] {t.label} ({t.lifecycle_stage}, confidence {t.confidence_score}): {t.descriptor}"
        for t in trends
    ]
    trend_block = "\n".join(lines) if lines else "- (no strong trends found)"
    return (
        f"Category: {category}\n"
        f"Season/Market: {season or 'n/a'} / {market or 'n/a'}\n"
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
