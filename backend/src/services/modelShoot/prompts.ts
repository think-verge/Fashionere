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

/** A designer's edit of the current main image: change only what was asked. */
export function editMainPrompt(type: string, instruction: string, read: IGarmentRead) {
  return (
    `Image 1 is a fashion editorial photograph; image 2 is the ${type} the model wears. Edit image 1: ${instruction.trim()}` +
    `\nChange only that. Keep everything else identical — the same model, face, pose, framing, studio, light and the rest of the outfit.` +
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

/** The look's magazine copy, in the designer's voice, from the approved main image. */
export function editorialCopyPrompt(type: string) {
  return (
    `Image 1 is the hero photograph of a fashion editorial: a model wearing a ${type}. Describe it only as it appears in the photograph.` +
    ` Write the magazine copy for this look, as a high-end fashion magazine would print it:` +
    `\n- look_name: ONE evocative word that names the look (like "Ember" or "Tidewater"), drawn from its colour, texture or mood.` +
    `\n- title: "The <look_name> <garment>", using a plain garment word (e.g. "The Ember jacket").` +
    `\n- statement: exactly 3 short paragraphs (1–2 sentences each) in the designer's quiet first-person voice introducing the piece —` +
    ` paragraph 1 sets a moment or feeling the piece is cut for; paragraph 2 describes the garment truthfully from the photograph (colour, cloth, cut, details) in sensory language;` +
    ` paragraph 3 one line on how it is meant to be worn or lived in.` +
    ` Lyrical and precise, like a designer's note in a magazine — not a product description: no talk of the design process, no sales language ("I highly recommend", "effortlessly chic", "must-have"),` +
    ` never invent details that are not visible, no brand names, no prices.` +
    `\n- pull_quote: one line of 4–9 words, the essence of the look, without a trailing full stop.` +
    `\n- fabric: the ${type}'s cloth as seen, 2–5 words (e.g. "blue and teal plaid corduroy").` +
    `\n- palette: its 2–3 main colours as evocative names, joined with " / " (e.g. "Espresso / Mustard").`
  );
}

export const EDITORIAL_COPY_SCHEMA = {
  type: "OBJECT",
  properties: { look_name: S, title: S, statement: { type: "ARRAY", items: S }, pull_quote: S, fabric: S, palette: S },
  required: ["look_name", "title", "statement", "pull_quote", "fabric", "palette"],
};

/** One editorial shot from the approved main image. Back views use the back flat as the garment reference. */
export function shotPrompt(type: string, idea: ShotIdea, read: IGarmentRead, useBack: boolean, closeupCount: number) {
  return (
    `Image 1 is the approved main photograph from a fashion magazine editorial. Create a NEW photograph from the same shoot: the SAME model (identical face, skin tone, hair, body),` +
    ` the SAME complete outfit (identical pieces, colours and fabrics), the SAME studio backdrop and light, and the ${type} styled as in image 1.` +
    ` Image 2 is the exact ${useBack ? "BACK view" : "front view"} of the ${type}${useBack ? "." : refsLine(closeupCount, 2)}` +
    (useBack
      ? ` From behind, the back must look exactly like image 2: front details (front fastenings, front pockets, the front of a tie or knot) are NOT visible and must not be moved onto the back.`
      : "") +
    `\nThis photograph — "${idea.title}": framing: ${idea.framing}. Pose: ${idea.pose}. Camera: ${idea.camera}.` +
    `\n${garmentRules(type, read)}` +
    `\n${WARDROBE_RULES}` +
    `\nHigh-end fashion magazine photography, photorealistic, natural skin texture, sharp focus on the garment. No logos, text or watermarks.`
  );
}
