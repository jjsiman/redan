import type { Design, Parcel as PortraitParcel } from "@redan/schema";
import { toSimInputs, toSimPoint } from "@redan/schema";
import type { LieType, Parcel as SimParcel, Vec2 } from "@redan/sim";
import { compileTerrain, deriveFairway, elevationAt2D, findGreen, lieAt } from "@redan/sim";
import type { Frame, Bounds } from "./parcel.js";
import { PX_PER_CELL, TERRAIN_COLORS, YARDS_PER_CELL, worldToScreen } from "./parcel.js";
import type { Surface } from "./surface.js";

/**
 * Land mode's cell renderer (doc §6.4/§8.2: "8-yard cells at 15 screen px.
 * Deterministic per-cell dither... gives turf texture without per-frame
 * noise"). Every cell's color comes from `@redan/sim`'s own `lieAt` — built
 * via `compileTerrain` with the SAME pieces array `grade()` would build
 * (player pieces then `parcel.fixedRegions`, so fixed terrain wins overlaps
 * the same way) — so "what you see is what's simulated" holds by
 * construction, not because two drawing routines happen to agree.
 */

const LIE_DITHER_STEP: Record<LieType, string> = {
  fairway: "#aecf94",
  rough: "#87a06e",
  green: "#cfe6ac",
  bunker: "#ddcb96",
  water: "#9cc3d6",
  deep: "#5f7139",
  tee: "#aecf94",
  ob: "#7d8169",
};

/** Doc §6.4: "every 5th cell shaded, chosen from coordinates." */
function isDithered(cx: number, cy: number): boolean {
  return (cx * 7 + cy * 13) % 5 === 0;
}

export interface HillshadeLayer {
  /** Lightness multiplier per grid cell, precomputed once per parcel load — see buildHillshade's doc. */
  sample(worldX: number, worldY: number): number;
}

/**
 * Precomputes a lightness multiplier from the parcel's elevation, once per
 * parcel load rather than per cell per frame — `elevationFeatures`/
 * `elevationProfile` don't move during a green drag, so re-sampling
 * `elevationAt2D` every render for a layer that never changes would be pure
 * waste on the hot path (grid.ts's paint loop runs on every pointermove).
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

function shadeColor(hex: string, mul: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 0xff) * mul)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 0xff) * mul)));
  const b = Math.max(0, Math.min(255, Math.round((n & 0xff) * mul)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export interface Cell {
  cx: number;
  cy: number;
  color: string;
}

/**
 * Rasterizes the hole into 8-yard cells covering `bounds`. Returns a flat
 * list rather than painting directly, so the caller (main.ts) can batch by
 * color — 16-ish `fillStyle` changes instead of one per cell, see the
 * module's paint helper below. Caching across renders (keyed on the
 * pointer's snapped cell, since most drag events land in the same cell as
 * the last one) is the caller's job, not this function's — see main.ts.
 */
export function rasterizeLand(parcel: PortraitParcel, design: Design, bounds: Bounds, hillshade: HillshadeLayer): Cell[] {
  const { parcel: simParcel, pieces } = toSimInputs(parcel, design);
  // Route the fairway toward wherever the green currently sits before
  // rasterizing, so the painted cells match what Test would actually grade
  // — same reasoning as compileTerrain's shared assembly, one step earlier.
  const green = findGreen(pieces);
  const routed = green ? deriveFairway(simParcel, { x: green.x, y: green.y }) : simParcel;
  const terrain = compileTerrain(routed, pieces);

  const cells: Cell[] = [];
  const cx0 = Math.floor(bounds.minX / YARDS_PER_CELL);
  const cx1 = Math.ceil(bounds.maxX / YARDS_PER_CELL);
  const cy0 = Math.floor(bounds.minY / YARDS_PER_CELL);
  const cy1 = Math.ceil(bounds.maxY / YARDS_PER_CELL);

  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const worldPortrait: Vec2 = { x: (cx + 0.5) * YARDS_PER_CELL, y: (cy + 0.5) * YARDS_PER_CELL };
      const simPoint = toSimPoint(worldPortrait);
      const lie = lieAt(terrain, simPoint);
      const base = TERRAIN_COLORS[lie] ?? "#999";
      const dithered = isDithered(cx, cy) ? (LIE_DITHER_STEP[lie] ?? base) : base;
      const light = hillshade.sample(simPoint.x, simPoint.y);
      cells.push({ cx, cy, color: shadeColor(dithered, light) });
    }
  }
  return cells;
}

/** Paints a rasterized cell list, batched by color — see rasterizeLand's doc. */
export function paintCells(surface: Surface, frame: Frame, cells: Cell[]): void {
  const byColor = new Map<string, { cx: number; cy: number }[]>();
  for (const cell of cells) {
    let bucket = byColor.get(cell.color);
    if (!bucket) {
      bucket = [];
      byColor.set(cell.color, bucket);
    }
    bucket.push(cell);
  }
  for (const [color, bucket] of byColor) {
    for (const { cx, cy } of bucket) {
      const worldTopLeft: Vec2 = { x: cx * YARDS_PER_CELL, y: (cy + 1) * YARDS_PER_CELL };
      const screen = worldToScreen(frame, worldTopLeft);
      surface.fillCell(screen, PX_PER_CELL, color);
    }
  }
}
