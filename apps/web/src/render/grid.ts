import type { Design, Parcel as PortraitParcel } from "@redan/schema";
import { toSimInputs, toSimPoint } from "@redan/schema";
import type { LieType, Parcel as SimParcel, TerrainQuery, Vec2 } from "@redan/sim";
import { compileTerrain, deriveFairway, elevationAt2D, findGreen, lieAt, pieceContainsPoint } from "@redan/sim";
import type { Frame, Bounds } from "./parcel.js";
import { PX_PER_TILE, YARDS_PER_TILE, worldToScreen } from "./parcel.js";
import { LIE_PALETTE, NATIVE_AREA_PALETTE } from "./palette.js";
import { fbm2, hash2, seedFromId } from "./texture.js";
import type { Surface } from "./surface.js";

/**
 * Land mode's cell renderer (doc §6.4/§8.2: "cells... deterministic per-cell
 * dither... gives turf texture without per-frame noise"). Every tile's lie
 * comes from `@redan/sim`'s own `lieAt` — built via `compileTerrain` with
 * the SAME pieces array `grade()` would build (player pieces then
 * `parcel.fixedRegions`, so fixed terrain wins overlaps the same way) — so
 * "what you see is what's simulated" holds by construction, not because two
 * drawing routines happen to agree.
 *
 * Three passes over one art-resolution buffer, not three separate loops
 * over the scene: classify (lie per tile, sim-truth, never touched again),
 * rim (does this tile border a different lie — a decoration flag, not a
 * reclassification), colorize (turf texture + rim color + hillshade, then
 * write RGBA). Splitting rim detection from classification means a tile's
 * *lie* is always exactly what `lieAt` said, even though its *pixels* are
 * decorated based on its neighbors.
 */

const LIE_IDS: LieType[] = ["tee", "fairway", "rough", "green", "bunker", "water", "deep", "ob"];
const LIE_ID_OF: Record<LieType, number> = Object.fromEntries(LIE_IDS.map((lie, i) => [lie, i])) as Record<
  LieType,
  number
>;

export interface HillshadeLayer {
  /** Lightness multiplier per grid cell, precomputed once per parcel load — see buildHillshade's doc. */
  sample(worldX: number, worldY: number): number;
}

/**
 * Precomputes a lightness multiplier from the parcel's elevation, once per
 * parcel load rather than per tile per frame — `elevationFeatures`/
 * `elevationProfile` don't move during a green drag, so re-sampling
 * `elevationAt2D` every render for a layer that never changes would be pure
 * waste on the hot path (grid.ts's raster pass runs on every pointermove
 * that crosses an 8-yard cell — see main.ts's raster cache).
 */
export function buildHillshade(simParcel: SimParcel): HillshadeLayer {
  let minZ = Infinity;
  let maxZ = -Infinity;
  const profile = simParcel.elevationProfile ?? [];
  const features = simParcel.elevationFeatures ?? [];
  if (profile.length === 0 && features.length === 0) {
    return { sample: () => 1 };
  }
  // Sample a coarse grid once to find the parcel's actual z-range — cheap
  // (a few hundred calls, once) and avoids hardcoding an assumed range that
  // wouldn't scale to a taller or flatter generated hill.
  const xs = profile.map((p) => p.x);
  const minX = xs.length ? Math.min(...xs, 0) : 0;
  const maxX = xs.length ? Math.max(...xs, 100) : 100;
  for (let x = minX; x <= maxX; x += 20) {
    for (let y = -100; y <= 100; y += 20) {
      const z = elevationAt2D(simParcel, x, y);
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  const range = Math.max(1, maxZ - minZ);
  return {
    sample(worldX: number, worldY: number): number {
      const z = elevationAt2D(simParcel, worldX, worldY);
      const t = (z - minZ) / range; // 0..1
      // 0.85..1.15 — a gentle brighten-uphill/darken-downhill modulation,
      // enough to read as terrain without washing out the lie colors.
      return 0.85 + t * 0.3;
    },
  };
}

// hex -> [r, g, b], memoized — the palette has ~30 distinct hex strings
// total, but colorize() would otherwise re-parse one of them per tile
// (thousands of times per raster).
const rgbCache = new Map<string, [number, number, number]>();
function rgbOf(hex: string): [number, number, number] {
  let rgb = rgbCache.get(hex);
  if (!rgb) {
    const n = parseInt(hex.slice(1), 16);
    rgb = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
    rgbCache.set(hex, rgb);
  }
  return rgb;
}

function smoothstep(lo: number, hi: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * True if `p` falls inside a `native-area`-family fixed region (`native-area`,
 * `native-area-b`, `native-area-c`). Deliberately NOT the same "last piece
 * wins" priority scan `lieAt` does internally — `native-area`'s own lieType
 * is `"rough"`, so it can only ever matter for a tile `lieAt` already
 * resolved to `"rough"` (pass 1 only calls this then), and a `startsWith`
 * match against the small `fixedRegions` list is all a decorative-only
 * distinction needs.
 */
function nativeAreaAt(terrain: TerrainQuery, p: Vec2): boolean {
  for (const piece of terrain.pieces) {
    if (piece.shapeId.startsWith("native-area") && pieceContainsPoint(piece, p)) return true;
  }
  return false;
}

export interface LandRaster {
  /** RGBA, row-major, `width * height * 4` bytes. */
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  /** The tile index (in `lieAt` sample-grid units) at buffer column 0. */
  originTileX: number;
  /** The tile index at buffer row 0 (the TOP row — see the row-order note below). */
  originTileY: number;
}

/**
 * Rasterizes the hole into `YARDS_PER_TILE`-yard tiles covering `bounds`,
 * into one RGBA buffer `paintRaster` blits in a single call.
 *
 * Row order: `worldToScreen` maps +y (downrange) to *decreasing* screen y
 * (tee at the bottom of the canvas). So buffer row 0 — the first row drawn,
 * the TOP of the screen — must be the tile row with the LARGEST world y,
 * not the smallest. Row `r` therefore samples tile-y `originTileY - r`,
 * counting down as the buffer descends.
 */
export function rasterizeLand(parcel: PortraitParcel, design: Design, bounds: Bounds, hillshade: HillshadeLayer): LandRaster {
  const { parcel: simParcel, pieces } = toSimInputs(parcel, design);
  // Route the fairway toward wherever the green currently sits before
  // rasterizing, so the painted tiles match what Test would actually grade
  // — same reasoning as compileTerrain's shared assembly, one step earlier.
  const green = findGreen(pieces);
  const routed = green ? deriveFairway(simParcel, { x: green.x, y: green.y }) : simParcel;
  const terrain = compileTerrain(routed, pieces);
  const seed = seedFromId(parcel.id);

  const cx0 = Math.floor(bounds.minX / YARDS_PER_TILE);
  const cx1 = Math.ceil(bounds.maxX / YARDS_PER_TILE);
  const cy0 = Math.floor(bounds.minY / YARDS_PER_TILE);
  const cy1 = Math.ceil(bounds.maxY / YARDS_PER_TILE);
  const width = cx1 - cx0 + 1;
  const height = cy1 - cy0 + 1;
  const originTileX = cx0;
  const originTileY = cy1;

  // Pass 1: classify. Sim-truth only — nothing below this line ever
  // rewrites a `lieIds` entry.
  const lieIds = new Uint8Array(width * height);
  // Decorative-only flag, never consulted by lieAt/grade: a `"rough"` tile
  // that's specifically inside a `native-area` fixed region gets a distinct
  // texture in pass 3 (see `NATIVE_AREA_PALETTE`'s doc) instead of reading
  // as indistinguishable plain rough. `native-area`'s lieType IS `"rough"`
  // — same distance/dispersion factors, no scoring change — so this is
  // purely "which rough palette", computed alongside lieIds rather than as
  // a fourth pass since it needs the same per-tile `simPoint`.
  const roughId = LIE_ID_OF.rough;
  const isNativeArea = new Uint8Array(width * height);
  for (let r = 0; r < height; r++) {
    const cy = originTileY - r;
    for (let c = 0; c < width; c++) {
      const cx = originTileX + c;
      const i = r * width + c;
      const worldPortrait: Vec2 = { x: (cx + 0.5) * YARDS_PER_TILE, y: (cy + 0.5) * YARDS_PER_TILE };
      const simPoint = toSimPoint(worldPortrait);
      const lieId = LIE_ID_OF[lieAt(terrain, simPoint)];
      lieIds[i] = lieId;
      if (lieId === roughId) isNativeArea[i] = nativeAreaAt(terrain, simPoint) ? 1 : 0;
    }
  }

  // Pass 2: rim. A decoration flag, not a reclassification — a tile is a
  // rim tile of its OWN lie if any orthogonal neighbor differs. The outer
  // border is never a rim (nothing to outline the scene's own edge
  // against), which is also why interior indices start at 1.
  const isRim = new Uint8Array(width * height);
  for (let r = 1; r < height - 1; r++) {
    for (let c = 1; c < width - 1; c++) {
      const i = r * width + c;
      const lie = lieIds[i];
      if (lieIds[i - 1] !== lie || lieIds[i + 1] !== lie || lieIds[i - width] !== lie || lieIds[i + width] !== lie) {
        isRim[i] = 1;
      }
    }
  }

  // Pass 3: colorize. Rim tiles get their lie's dedicated boundary color
  // outright. Non-rim tiles blend continuously from `base` toward `patch`
  // by a two-octave fbm (see texture.ts's fbm2 doc for why this is a blend,
  // not a threshold: a hard cutoff against a single noise octave traces that
  // octave's own lattice-cell shape, which reads as a soft-edged rectangle
  // over a large flat area — that WAS this pass, and is what showed up as
  // land mode's "square artifacts"), then a light per-tile speckle darkens
  // a sparse subset of tiles toward `shade`. Hillshade multiplies whichever
  // color this produces, same as before this pass.
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let r = 0; r < height; r++) {
    const cy = originTileY - r;
    for (let c = 0; c < width; c++) {
      const cx = originTileX + c;
      const i = r * width + c;
      const lie = LIE_IDS[lieIds[i] ?? 0]!;
      const palette = isNativeArea[i] ? NATIVE_AREA_PALETTE : LIE_PALETTE[lie];

      let rgb: [number, number, number];
      if (isRim[i]) {
        rgb = rgbOf(palette.rim);
      } else {
        // freq 0.22 -> a lattice cell is ~4.5 tiles (9 world yards, 18 CSS
        // px at PX_PER_TILE) — turf-scale mottle, not the terrain-scale
        // (40yd) blocks an earlier 0.05 produced (see fbm2's doc). The ramp
        // is centered near patchN's own mean (~0.5, since fbm of
        // interpolated value noise is variance-reduced toward the middle)
        // rather than off to one side, so it doesn't clamp most tiles to 0
        // and isolate single lattice cells as visible squares.
        const patchN = fbm2(cx, cy, seed, 0.22);
        const patchT = smoothstep(0.35, 0.65, patchN);
        const baseRgb = rgbOf(palette.base);
        const patchRgb = rgbOf(palette.patch);
        let br = lerp(baseRgb[0], patchRgb[0], patchT);
        let bg = lerp(baseRgb[1], patchRgb[1], patchT);
        let bb = lerp(baseRgb[2], patchRgb[2], patchT);

        const speckle = hash2(cx, cy, seed + 1);
        if (speckle < 0.12) {
          const shadeRgb = rgbOf(palette.shade);
          const st = 1 - speckle / 0.12; // stronger speckle darkening the closer to the hash's low tail
          br = lerp(br, shadeRgb[0], 0.5 * st);
          bg = lerp(bg, shadeRgb[1], 0.5 * st);
          bb = lerp(bb, shadeRgb[2], 0.5 * st);
        }
        rgb = [br, bg, bb];
      }

      const worldPortrait: Vec2 = { x: (cx + 0.5) * YARDS_PER_TILE, y: (cy + 0.5) * YARDS_PER_TILE };
      const simPoint = toSimPoint(worldPortrait);
      const light = hillshade.sample(simPoint.x, simPoint.y);
      const px = i * 4;
      pixels[px] = Math.max(0, Math.min(255, Math.round(rgb[0] * light)));
      pixels[px + 1] = Math.max(0, Math.min(255, Math.round(rgb[1] * light)));
      pixels[px + 2] = Math.max(0, Math.min(255, Math.round(rgb[2] * light)));
      pixels[px + 3] = 255;
    }
  }

  return { pixels, width, height, originTileX, originTileY };
}

/** Paints a rasterized land buffer with one `drawPixelBuffer` blit — see rasterizeLand's doc. */
export function paintRaster(surface: Surface, frame: Frame, raster: LandRaster): void {
  const worldTopLeft: Vec2 = {
    x: raster.originTileX * YARDS_PER_TILE,
    y: (raster.originTileY + 1) * YARDS_PER_TILE,
  };
  const dest = worldToScreen(frame, worldTopLeft);
  surface.drawPixelBuffer(raster.pixels, raster.width, raster.height, dest, PX_PER_TILE);
}
