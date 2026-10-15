import type { IGarmentRead, IModelConfig, IOutfit, ShotView } from "../../models/ModelShoot.js";

// Stage 3 prompts. Two kinds of rule, kept deliberately small:
//  - the garment's DESIGN is fixed (read once from the flat): nothing added, removed, split or moved;
//  - no wardrobe malfunctions, ever.
// Everything else — styling, outfit, the model — is the designer's call.

const S = { type: "STRING" };

export const DESIGN_KEYS = ["fastenings", "ties_belts", "collar", "sleeves_cuffs", "hem", "pockets", "other_details"] as const;

/** Garment read + stylist: colours, fixed construction, and a suggested outfit around the garment. */
export function garmentReadPrompt(type: string, gender: string, closeupCount: number) {
  return (
    `Image 1 is a ${type}${closeupCount ? `; images 2–${closeupCount + 1} are zoomed crops of image 1` : ""}. Judge only from these images.` +
    `\n1. COLOURS: its dominant colour (covering most of it) and accent colours (print lines, trims, hardware).` +
    `\n2. DESIGN — the garment's fixed construction, with type, count and placement; "none" where not applicable.` +
    ` Describe ONLY what is clearly visible. Never infer hidden, concealed or optional features ("concealed zipper", "can also be buckled"); if you are not sure something is there, leave it out:` +
    ` fastenings; ties_belts (each tie or belt: continuous or separate, where it attaches, how it is tied as designed); collar; sleeves_cuffs (length, cuff construction);` +
    ` hem (shape, where it falls); pockets; other_details (pleats, yokes, tabs, trims, topstitching).` +
    `\n3. STYLING — define the rest of a ${gender} model's look so it is cohesive and the garment is the focus.` +
    ` Supporting pieces contrast with the garment's dominant colour, never match it: choose a contrasting neutral that complements it (e.g. navy or charcoal against brown, cream against black).` +
    ` Use "none" for any slot not needed (e.g. no top or bottoms with a dress or jumpsuit; no inner top unless the garment shows one).` +
    ` Each piece: colour + fabric + cut, under 15 words.`
  );
}

export const GARMENT_READ_SCHEMA = {
  type: "OBJECT",
  properties: {
    dominant_colour: S,
    accent_colours: S,
    design: { type: "OBJECT", properties: Object.fromEntries(DESIGN_KEYS.map((k) => [k, S])), required: [...DESIGN_KEYS] },
    top: S,
    bottoms: S,
    shoes: S,
    accessories: S,
  },
  required: ["dominant_colour", "accent_colours", "design", "top", "bottoms", "shoes", "accessories"],
};

const isSet = (v?: string | null) => !!v && v.trim().toLowerCase() !== "none";

function designLines(read: IGarmentRead) {
  return Object.entries(read.design ?? {})
    .filter(([, v]) => isSet(v))
    .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`)
    .join("\n");
}

/** The garment's construction as plain lines, for the editorial agents. */
export function constructionText(read: IGarmentRead) {
  return designLines(read);
}

function garmentRules(type: string, read: IGarmentRead) {
  return (
    `THE ${type.toUpperCase()}'S DESIGN IS FIXED — exact colours (${read.dominant_colour}, with ${read.accent_colours}; do not lighten, desaturate or shift the hue), identical print scale and placement, identical fabric and:\n${designLines(read)}` +
    `\nNever add, remove, split or move any fastening, tie, belt, pocket, tab, trim or seam, or change the collar, cuffs, hem shape or length.` +
    ` No zippers, buckles, snaps, rings or hardware that are not visible on the garment reference.`
  );
}

export const WARDROBE_RULES =
  `NO WARDROBE MALFUNCTIONS: every piece sits properly and securely on the body — nothing slipping off a shoulder, riding up, gaping between buttons, twisted or caught;` +
  ` no unintended skin, underwear or bra visible; nothing sheer or see-through unless the design is. A tasteful, professional fashion editorial with natural, relaxed poses and natural anatomy.`;

export function outfitLine(o: IOutfit) {
  const parts = (["top", "bottoms", "shoes", "accessories"] as const).filter((k) => isSet(o[k])).map((k) => `${k}: ${o[k]}`);
  return parts.length ? parts.join("; ") : "none";
}

const SETTING =
  `Setting: a plain seamless warm beige studio backdrop, soft warm sunlight through a window casting gentle diagonal shadows on the backdrop, quiet minimal luxury mood.` +
  ` High-end fashion magazine photography, photorealistic, sharp focus on the garment, natural skin texture. No logos, brand names, text or watermarks anywhere.`;

function refsLine(closeupCount: number, first = 1) {
  return closeupCount
    ? `; images ${first + 1}${closeupCount > 1 ? `–${first + closeupCount}` : ""} are close-ups of the same garment for its exact fabric, print and hardware.`
    : ".";
}

/** The main (hero) image: the configured model wearing the garment, full length, in the studio. */
export function mainPrompt(type: string, cfg: IModelConfig, read: IGarmentRead, outfit: IOutfit, closeupCount: number) {
  return (
    `A magazine fashion editorial photograph, shot in a studio. A ${cfg.height} ${cfg.gender} fashion model, ${cfg.age}, clothing size ${cfg.size}, ${cfg.skin_tone} skin, ${cfg.hair},` +
    ` standing naturally and still, facing the camera, calm direct gaze, arms relaxed at the sides. Full length, head to toe, with the whole outfit in frame.` +
    `\nThe model is wearing EXACTLY the ${type} shown in image 1 (front view)${refsLine(closeupCount)}` +
    `\n${garmentRules(type, read)}` +
    `\nRest of the outfit: ${outfitLine(outfit)}. Nothing covers or hides the ${type}.` +
    `\n${WARDROBE_RULES}` +
    `\n${SETTING}`
  );
}

/**
 * Generated photographs can carry a garment error (a buckle where the flat has a tie); anything built from them
 * would copy it. So the flat is the authority on construction, the photograph only on model, outfit and styling.
 */
function flatIsAuthority(type: string, flat: number) {
  return (
    ` The ${type}'s construction — fastenings, ties and belts, hardware, pockets, collar, cuffs, hem — comes ONLY from image ${flat}:` +
    ` wherever image 1 shows any of these differently (e.g. a buckle, zipper, pocket or trim that image ${flat} does not have), follow image ${flat}.`
  );
}

/** A designer's edit of the current main image: change only what was asked. */
export function editMainPrompt(type: string, instruction: string, read: IGarmentRead) {
  return (
    `Image 1 is a fashion editorial photograph; image 2 is the ${type} the model wears. Edit image 1: ${instruction.trim()}` +
    `\nChange only that. Keep everything else identical — the same model, face, pose, framing, studio, light and the rest of the outfit.` +
    flatIsAuthority(type, 2) +
    `\n${garmentRules(type, read)}` +
    `\n${WARDROBE_RULES}` +
    ` Photorealistic. No logos, text or watermarks.`
  );
}

/** Art director: new shot ideas for every batch — nothing predefined. */
export function artDirectorPrompt(type: string, count: number, hasBack: boolean) {
  return (
    `You are the art director of a fashion magazine editorial. Image 1 is the approved main photograph of the model wearing the hero ${type}; image 2 is the garment itself.` +
    ` Invent ${count} NEW photographs for the same editorial story — fresh ideas, not standard catalogue poses — that together make a varied magazine spread:` +
    ` a mix of framings (e.g. a close crop, waist-up, full length) and angles, each one showing the garment clearly and flatteringly.` +
    ` Poses are natural, relaxed and tasteful; hands never hide the garment's details.` +
    ` Same model, same complete outfit, same studio and light as image 1.` +
    (hasBack ? ` At most one shot may be a back view.` : ` No back views.`) +
    ` For each: title (2-4 words), view (front | three_quarter | side | back | close_detail), framing (what is in frame), pose (body, hands, gaze), camera (angle, lens feel).`
  );
}

export const ART_DIRECTOR_SCHEMA = {
  type: "OBJECT",
  properties: {
    shots: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { title: S, view: { type: "STRING", enum: ["front", "three_quarter", "side", "back", "close_detail"] }, framing: S, pose: S, camera: S },
        required: ["title", "view", "framing", "pose", "camera"],
      },
    },
  },
  required: ["shots"],
};

export interface ShotIdea {
  title: string;
  view: ShotView;
  framing: string;
  pose: string;
  camera: string;
}

// ---- Editorial: a writer agent drafts, an editor agent rewrites to the house style ----

/** The house style both agents follow. */
const HOUSE_STYLE =
  `HOUSE STYLE — a fashion magazine feature about a single garment, in the manner of a glossy fashion magazine's product story:` +
  ` third person only, about the garment itself (never "I", "me", "my", "we", "our", and never the designer or the design process);` +
  ` cohesive, flowing paragraphs that carry the reader from one idea to the next — never lists, bullet points, fragments or headings inside the text;` +
  ` chic and evocative but easy to understand: sensory and specific (how the cloth looks, feels and moves, how the light catches it, what moment it suits),` +
  ` in plain, precise words with varied sentence rhythm; no catalogue or technical language ("provides", "features", "utilitarian detail", "construction", "silhouette is defined by"),` +
  ` no jargon and no clichés ("effortlessly chic", "must-have", "elevate", "timeless staple", "statement piece");` +
  ` describe only what is truly visible — colour, cloth, cut and detailing — and how it is worn; no brand names, no prices, no invented details.`;

/** Writer agent: drafts the whole feature and picks the detail crops on the flat. */
export function editorialWriterPrompt(type: string, construction: string, outfit: string, shotCount: number) {
  return (
    `You are a features writer for a high-end fashion magazine. Image 1 is the hero photograph of a model wearing a ${type}; image 2 is the ${type} itself, photographed flat` +
    (shotCount ? `; images 3${shotCount > 1 ? `–${shotCount + 2}` : ""} are further photographs from the same shoot.` : ".") +
    `
The garment's construction, as read from the flat:
${construction}
Styled with: ${outfit}.` +
    `
${HOUSE_STYLE}` +
    `
Write the feature:` +
    `
- look_name: ONE evocative word naming the look, drawn from its colour, cloth or mood (like "Umber" or "Tidewater").` +
    `
- headline: "The <look_name> <plain garment word>" (e.g. "The Umber jacket").` +
    `
- standfirst: 1–2 sentences that set up the piece and make the reader want to continue.` +
    `
- hero_caption: one sentence describing what the model wears in image 1, garment first, then the styling.` +
    `
- opening: exactly 3 paragraphs of 2–4 sentences — the cloth and colour; the cut and silhouette; the construction and detailing seen up close.` +
    `
- pull_quote: one line of 5–10 words about the garment, no trailing full stop.` +
    `
- details: 6 distinct construction details clearly visible on image 2, most characteristic first (e.g. a pocket, closure, tie or belt, cuff, collar, hem, trim),` +
    ` each with box_2d [ymin, xmin, ymax, xmax] on image 2 (0–1000) tightly framing that detail with a small margin, and a one-sentence caption.` +
    ` Never choose or frame a region that shows a label, tag, logo or any text (e.g. a neck label inside the collar).` +
    `
- closing: exactly 2 paragraphs of 2–4 sentences — how it is styled and worn, and how its character changes with the way it is worn.` +
    (shotCount ? `
- shot_captions: one short sentence for each of images 3${shotCount > 1 ? `–${shotCount + 2}` : ""}, in order.` : `
- shot_captions: an empty list.`) +
    `
- credit_line: one sentence naming the piece, its cloth and its key construction, in the style of a magazine credit.` +
    `
- fabric: the cloth as seen, 2–5 words. palette: its 2–3 main colours as evocative names joined with " / ".`
  );
}

const S_ARR = { type: "ARRAY", items: S };
export const EDITORIAL_WRITER_SCHEMA = {
  type: "OBJECT",
  properties: {
    look_name: S, headline: S, standfirst: S, hero_caption: S, opening: S_ARR, pull_quote: S,
    details: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { label: S, box_2d: { type: "ARRAY", items: { type: "INTEGER" } }, caption: S }, required: ["label", "box_2d", "caption"] },
    },
    closing: S_ARR, shot_captions: S_ARR, credit_line: S, fabric: S, palette: S,
  },
  required: ["look_name", "headline", "standfirst", "hero_caption", "opening", "pull_quote", "details", "closing", "shot_captions", "credit_line", "fabric", "palette"],
};

/** The text an editor can change; the writer's detail boxes are kept as they are. */
export interface EditorialText {
  look_name: string;
  headline: string;
  standfirst: string;
  hero_caption: string;
  opening: string[];
  pull_quote: string;
  detail_captions: string[];
  closing: string[];
  shot_captions: string[];
  credit_line: string;
  fabric: string;
  palette: string;
}

/** Editor agent: rewrites the draft to the house style and checks every claim against the photographs. */
export function editorialEditorPrompt(type: string, construction: string, draft: EditorialText) {
  return (
    `You are the fashion editor of a high-end magazine, editing a feature about a ${type}. Image 1 is the hero photograph; image 2 is the ${type} photographed flat.` +
    `
The garment's construction, as read from the flat:
${construction}` +
    `
${HOUSE_STYLE}` +
    `
Rewrite the draft below so it reads as one polished, cohesive magazine feature:` +
    ` enforce the house style everywhere (remove any first person, any list-like writing and any sales language); make the paragraphs flow into one another;` +
    ` keep the language chic but easy to understand; correct or remove anything the photographs and construction do not support;` +
    ` make the headline, standfirst, pull quote and captions match the body in voice.` +
    ` Keep the same structure: 3 opening paragraphs, 2 closing paragraphs, ${draft.detail_captions.length} detail captions and ${draft.shot_captions.length} shot captions, in the same order.` +
    `
DRAFT (JSON):
${JSON.stringify(draft)}`
  );
}

export const EDITORIAL_EDITOR_SCHEMA = {
  type: "OBJECT",
  properties: {
    look_name: S, headline: S, standfirst: S, hero_caption: S, opening: S_ARR, pull_quote: S, detail_captions: S_ARR,
    closing: S_ARR, shot_captions: S_ARR, credit_line: S, fabric: S, palette: S,
  },
  required: ["look_name", "headline", "standfirst", "hero_caption", "opening", "pull_quote", "detail_captions", "closing", "shot_captions", "credit_line", "fabric", "palette"],
};

/** One editorial shot from the approved main image. Back views use the back flat as the garment reference. */
export function shotPrompt(type: string, idea: ShotIdea, read: IGarmentRead, useBack: boolean, closeupCount: number) {
  return (
    `Image 1 is the approved main photograph from a fashion magazine editorial. Create a NEW photograph from the same shoot: the SAME model (identical face, skin tone, hair, body),` +
    ` the SAME complete outfit (identical pieces, colours and fabrics), the SAME studio backdrop and light, and the ${type} styled as in image 1 (how open, how it is tied).` +
    ` Image 2 is the exact ${useBack ? "BACK view" : "front view"} of the ${type}${useBack ? "." : refsLine(closeupCount, 2)}` +
    flatIsAuthority(type, 2) +
    (useBack
      ? ` From behind, the back must look exactly like image 2: front details (front fastenings, front pockets, the front of a tie or knot) are NOT visible and must not be moved onto the back.`
      : "") +
    `\nThis photograph — "${idea.title}": framing: ${idea.framing}. Pose: ${idea.pose}. Camera: ${idea.camera}.` +
    `\n${garmentRules(type, read)}` +
    `\n${WARDROBE_RULES}` +
    `\nHigh-end fashion magazine photography, photorealistic, natural skin texture, sharp focus on the garment. No logos, text or watermarks.`
  );
}
