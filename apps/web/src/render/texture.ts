/**
 * Deterministic, position-sampled noise for land mode's turf texture
 * (`grid.ts`). Deliberately *not* `@redan/sim`'s `createRng` (mulberry32):
 * that's a sequential stream RNG — call N gives you the Nth value in a
 * fixed sequence, which only works if you always visit cells in the same
 * order. Turf texture needs the opposite: the same world tile must produce
 * the same speckle/mottle value no matter what order the rasterizer visits
 * tiles in (and it does change order — the hillshade prepass samples a
 * coarse grid separately from the per-tile paint loop). Same reasoning as
 * `parcel.ts`'s deliberate duplication of `packages/content`'s render math:
 * small, no shared runtime dependency edge to justify factoring out.
 */

/**
 * Integer bit-mix hash, [0, 1). Same tile + same seed always gives the same
 * value. `Math.imul` keeps every multiply inside int32 — plain `*` here
 * would produce a product past 2^53 (JS doubles' exact-integer limit) and
 * silently lose low bits before the final fold. That was hygiene, not the
 * fix for the square artifacts below; measured over a 200x200 tile block it
 * already gave 32,954/40,000 distinct values with the buggy math.
 */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * One octave of value noise: `hash2` sampled on a coarse lattice (spacing
 * `1/freq` tiles) and bilinearly interpolated, giving low-frequency mottled
 * patches rather than per-tile static. `freq` is in cycles per tile — e.g.
 * `freq = 0.08` means a lattice cell spans 1/0.08 = 12.5 tiles.
 */
export function valueNoise2(x: number, y: number, seed: number, freq: number): number {
  const fx = x * freq;
  const fy = y * freq;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;

  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);

  // Smoothstep easing so the interpolation has no visible lattice creases.
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const top = v00 + (v10 - v00) * sx;
  const bottom = v01 + (v11 - v01) * sx;
  return top + (bottom - top) * sy;
}

/**
 * Three-octave fractal sum of `valueNoise2` (lacunarity 2.17, gain 0.5),
 * renormalized to [0, 1). A single octave of value noise has a single
 * lattice cell size, and a hard threshold against it traces that lattice's
 * own bilinear corner-to-corner gradient — over a large flat area that reads
 * as a soft-edged *rectangle*, not an organic patch.
 *
 * An earlier 2-octave version (3x frequency, 0.4x weight) under-delivered on
 * that goal at land mode's actual base frequency: with the octave that
 * carried most of the weight spanning ~40 world yards per lattice cell, the
 * hole's whole visible frame only crossed a handful of cells, so the result
 * still read as large soft squares (the "large square artifacts, not noise"
 * bug report this fixes) rather than organic mottle. The fix here is two
 * parts: `grid.ts` raised the base frequency so a cell is turf-sized, not
 * terrain-sized, and this function adds a third octave with a non-integer
 * lacunarity (2.17, not a round number) so no pair of octave lattices ever
 * re-aligns into one visible grid. Each octave also samples a different
 * coordinate offset (not just a different frequency) so their cell
 * boundaries don't share edges even at low frequency.
 */
export function fbm2(x: number, y: number, seed: number, freq: number): number {
  const a = valueNoise2(x, y, seed, freq);
  const b = valueNoise2(x + 1000, y - 1000, seed, freq * 2.17);
  const c = valueNoise2(x - 500, y + 500, seed, freq * 2.17 * 2.17);
  return (a + b * 0.5 + c * 0.25) / 1.75;
}

/** Hashes a string parcel id into a numeric seed for `hash2`/`valueNoise2`. */
export function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
