// All garment-pack prompts live here so they can be tuned without touching the pipeline.
// Rule for every prompt: the front technical flat (or a crop of it) is the single source of truth.
// Never feed the edit history or the stored combo text — they go stale after refinement.

import type { FeatureType } from "../../models/GarmentPack.js";

export type CanonicalGarment = "jacket" | "coat" | "dress" | "top" | "trousers" | "skirt" | "generic";

const BACK_SEAMS: Record<CanonicalGarment, string> = {
  jacket:
    "a horizontal back yoke seam across the shoulder blades; a single straight centre-back seam that runs continuously from the yoke seam all the way down to the bottom edge of the hem, without stopping short; the set-in sleeve seams; and the underside of the collar with its collar stand seam",
  coat: "a single straight centre-back seam running continuously from the collar to a short back vent at the hem; the set-in sleeve seams; and the underside of the collar",
  dress: "a single straight centre-back seam with a concealed zip line running down from the neckline; shoulder seams and side seams",
  top: "shoulder seams, side seams and a clean back neckline binding",
  trousers: "a back waistband with a centre-back seam, back darts or a back yoke, and side seams",
  skirt: "a back waistband, a single centre-back seam and side seams",
  generic: "a single centre-back seam, shoulder seams and side seams",
};

const ALIASES: Record<string, CanonicalGarment> = {
  jacket: "jacket", blazer: "jacket", bomber: "jacket", vest: "jacket", gilet: "jacket", zipper: "jacket",
  coat: "coat", trench: "coat", overcoat: "coat", parka: "coat",
  dress: "dress", gown: "dress", jumpsuit: "dress",
  top: "top", shirt: "top", blouse: "top", tee: "top", "t-shirt": "top", sweater: "top", knit: "top", cardigan: "top", hoodie: "top",
  trousers: "trousers", pants: "trousers", jeans: "trousers", shorts: "trousers",
  skirt: "skirt",
};

export function canonicalGarment(type: string): CanonicalGarment {
  const t = type.toLowerCase().trim();
  return ALIASES[t] ?? Object.entries(ALIASES).find(([k]) => t.includes(k))?.[1] ?? "generic";
}

const GROUND =
  "a seamless warm bone-coloured paper background (#E8DFD0), soft diffused daylight from the top left, a gentle natural contact shadow";

const NO_BRAND = " No logos, brand names, labels, tags, watermarks or text anywhere.";

const FIDELITY =
  `\nMUST: identical colour, identical print (same motif, scale, density and placement), identical fabric, identical collar, closure and hardware, identical pockets, seams, cuffs and hem as the reference. Seams are tone-on-tone, in thread exactly the fabric colour.` +
  `\nMUST NOT: add, remove, move or restyle any component; no invented buttons, snaps, rivets, zips, trims, labels or embroidery; no recolouring; no white, light or contrasting stitching unless the reference unmistakably shows it.`;

/** Images: 1 = front technical flat. */
export function flatLayPrompt(type: string): string {
  return (
    `Image 1 is a technical flat of a ${type}. Photograph this exact garment as a photorealistic top-down flat-lay product photograph: real cloth with natural softness and a few subtle, natural creases, laid out neatly and symmetrically, the same view and proportions as image 1, centred with even margins, on ${GROUND}.` +
    FIDELITY +
    NO_BRAND
  );
}

/** Images: 1 = front technical flat, 2 = crop of the real cuff (optional). */
export function backFlatPrompt(type: string, hasCuffRef: boolean): string {
  return (
    `Create the BACK view of the ${type} shown in image 1. Image 1 is the FRONT view. Photograph it as a photorealistic top-down flat-lay, turned over, on ${GROUND}.` +
    (hasCuffRef
      ? ` Image 2 shows the real cuff of this garment: both cuffs must look exactly like image 2 — the same plain band of cloth with nothing on it.`
      : "") +
    `\nMUST: identical colour, print (same motif, scale and density), fabric, silhouette, width, sleeve length, hem length, cuffs and hem finish as image 1. The back is large uninterrupted panels of printed cloth; the only construction lines are ${BACK_SEAMS[canonicalGarment(type)]}. Seams are tone-on-tone fine lines.` +
    `\nMUST NOT: no pockets of any kind, pocket flaps, rivets, snaps, buttons, buttonholes, zips, zip pullers, plackets or front openings — those exist only on the front. No buttons or plackets on the cuffs. No lining or inner fabric showing at the hem. No back pockets, extra panels, tabs, straps or decoration. No contrasting or light stitching.` +
    NO_BRAND
  );
}

/**
 * Images: 1 = crop of the feature, nothing else. Deliberately minimal: every extra input or
 * instruction gave the model room to re-compose (swap the subject, cut parts out of the garment).
 */
export function closeupPrompt(): string {
  return (
    "Turn this image into a sharp, realistic close-up photograph of the same fabric and garment parts. " +
    "Same framing, same composition, same colours, same print in the same positions. Change nothing — only make it look like a real, in-focus photograph. " +
    "Hardware stays exactly as in the image — rivets stay plain rivets, zip pulls and buttons are blank with no text or logos — and stitching is the same colour as the fabric."
  );
}

export const FEATURE_TYPES: FeatureType[] = ["pattern", "texture", "hardware", "trim", "construction", "shape"];

/** Gemini prompt: rank the garment's standout features and locate them, plus one cuff for the back-flat reference. */
export function garmentAnalysisPrompt(type: string): string {
  return (
    `This is the front-view technical flat-lay of a ${type}. A fashion photographer will shoot two close-ups of this garment, each on the feature that makes it most distinctive.` +
    `\nList the garment's standout features, most distinctive first. For each give:` +
    `\n- feature_type: one of pattern (a print or woven motif), texture (a notable weave, knit or surface such as bouclé, tweed, denim, velvet), hardware (buttons, zips, rivets, buckles, snaps), trim (braid, piping, embroidery, beading, lace, fringe), construction (collar, lapel, cuff, pleats, darts, notable seaming), shape (ruffles, gathers, drape, sculpted volume)` +
    `\n- label: a short name of the specific feature, e.g. "painted leaf print", "front zip and riveted chest pockets"` +
    `\n- caption: a short editorial caption in the form "Detail · <subject>" or "Macro · <subject>"` +
    `\n- distinctiveness: 1-10, how much this feature defines the garment's look` +
    `\n- box_2d: [ymin, xmin, ymax, xmax] normalised 0-1000, framing the best example of that feature with a clear margin around it, so the box does not slice through any other component such as a zip, placket, pocket edge or button. For a pattern, frame an area of cloth containing at least one complete motif, away from garment edges and hardware.` +
    `\nOnly list features that are clearly visible. Also return cuff_box_2d framing one sleeve cuff if the garment has sleeves.`
  );
}
