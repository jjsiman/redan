import type { LieType } from "@redan/sim";

/**
 * The one place every renderer (tray mode's vector shapes, land mode's
 * rasterizer) gets its lie colors from. Sits upstream of both `parcel.ts`
 * and `grid.ts` — `grid.ts` already imports from `parcel.ts`, so the
 * palette has to live above both to avoid a cycle.
 *
 * `base`/`shade`/`patch`/`rim` are all flat fills, never gradients — land
 * mode's rasterizer (`grid.ts`) picks exactly one of the four per tile, then
 * multiplies by the hillshade layer. `base` alone is what tray mode's vector
 * shapes use (`parcel.ts#drawPiece`/`drawHole`), so those colors are
 * unchanged from before this pass.
 */
export interface LiePalette {
  /** Flat fill — tray mode's only color, and land mode's most common tile. */
  base: string;
  /** Per-tile speckle step (doc §6.4's "deterministic per-cell dither"). */
  shade: string;
  /** Low-frequency mottle step — see texture.ts's `valueNoise2`. */
  patch: string;
  /** 1-tile inner boundary color, drawn on the side that borders a different lie. */
  rim: string;
}

/**
 * Tuned so every lie is visually distinct — `tee` and `ob` used to share a
 * hex with `fairway`/`rough` respectively (both `#bcd9a0` and `#93ab77`
 * before this pass), which made the tee box and the OB frame invisible.
 * Rim colors are picked per surface (sand lip, shoreline, green collar, mow
 * line) rather than one global outline, so a seam reads correctly from both
 * sides it borders.
 */
export const LIE_PALETTE: Record<LieType, LiePalette> = {
  tee: { base: "#a9cf8d", shade: "#9ec27f", patch: "#b4d699", rim: "#6f8f52" },
  fairway: { base: "#bcd9a0", shade: "#aecf94", patch: "#c4deab", rim: "#7fa15c" },
  rough: { base: "#93ab77", shade: "#87a06e", patch: "#9bb281", rim: "#5f7139" },
  green: { base: "#dcefc0", shade: "#cfe6ac", patch: "#e4f2cc", rim: "#3f5c2a" },
  bunker: { base: "#e8d9a8", shade: "#ddcb96", patch: "#efe2b8", rim: "#f4ecd2" },
  water: { base: "#a9cfe0", shade: "#9cc3d6", patch: "#b6d8e8", rim: "#e3f1f7" },
  deep: { base: "#6b7d43", shade: "#5f7139", patch: "#748750", rim: "#40501f" },
  ob: { base: "#a89f8c", shade: "#9c937f", patch: "#b1a897", rim: "#8a7256" },
};

/**
 * Decorative-only palette for `native-area` fixed regions (land mode's
 * `grid.ts#nativeAreaAt`) — `native-area`'s `lieType` is `"rough"` (same
 * distance/dispersion factors as plain rough, terrain.ts's `LIE_FACTORS`;
 * this changes nothing about scoring), so without a separate palette it
 * rendered as literally indistinguishable from ordinary rough — invisible
 * except where it happened to cut a hole in the fairway or green. A warmer,
 * golden fescue-like tone (vs. `rough`'s cooler olive) reads as an
 * intentional native-grass feature instead. Reuses `rough`'s general
 * saturation/lightness range so it still sits comfortably in the same
 * "unmown" family, not a jarring fifth color. `grid.ts`'s rim pass compares
 * `LieType` ids, not palettes, so a native-area tile still gets its own
 * `rim` color where it borders a genuinely different lie (fairway, green) —
 * only the boundary against plain rough (same `LieType`) goes unoutlined,
 * a flat texture change instead. Acceptable for now; flagged in
 * packages/sim/README.md's known-simplifications alongside the rest of land
 * mode's unvalidated visual choices.
 */
export const NATIVE_AREA_PALETTE: LiePalette = {
  base: "#c3ae5f",
  shade: "#b39c4c",
  patch: "#cdba72",
  rim: "#7a6530",
};

/** Flat-fill colors only — tray mode's vector shapes, and land mode's non-rim tiles' `base`. */
export const TERRAIN_COLORS: Record<LieType, string> = Object.fromEntries(
  (Object.keys(LIE_PALETTE) as LieType[]).map((lie) => [lie, LIE_PALETTE[lie].base]),
) as Record<LieType, string>;
