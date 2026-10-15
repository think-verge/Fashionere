// Small helpers shared by the Stage 3 components (kept out of component files for fast refresh).

/** A variation is named by its latest Stage 2 refinement. */
export const variationName = (g: { accumulated_edits: string[] }) => {
  const last = g.accumulated_edits[g.accumulated_edits.length - 1];
  return last ? last.charAt(0).toUpperCase() + last.slice(1) : "Original concept";
};

/** Query key for a garment's Stage 2 variations (the compare view and the compare button share it). */
export const variationsQueryKey = (conceptId: string | undefined) => ["model-shoot-variations", conceptId];
