import type { Design, Parcel, PlacedShape, PortraitCorridorStation, RegionShape } from "@redan/schema";
import { SHAPE_TABLE } from "@redan/schema";
import type { GolferId, Shot, Vec2 } from "@redan/sim";
import { offsetPolyline } from "@redan/sim";
import type { Point, Surface } from "./surface.js";

/**
 * Draws a parcel/design (+ optionally a graded result's traces) onto a
 * Surface. Portrait frame throughout (x = lateral, y = distance from tee) —
 * the same math `packages/content/src/render.ts` uses for its SVG
 * diagnostic, reimplemented here against the Surface abstraction instead of
 * string-templated SVG. Deliberately duplicated rather than shared: the two
 * packages don't share a runtime dependency edge, and the math is small.
 */

export const YARDS_PER_CELL = 8;
export const PX_PER_CELL = 15;
export const PX_PER_YARD = PX_PER_CELL / YARDS_PER_CELL;
const MARGIN_YARDS = 14;

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function expand(b: Bounds, x: number, y: number, pad = 0): void {
  if (x - pad < b.minX) b.minX = x - pad;
  if (x + pad > b.maxX) b.maxX = x + pad;
  if (y - pad < b.minY) b.minY = y - pad;
  if (y + pad > b.maxY) b.maxY = y + pad;
}

function footprintExtent(shape: RegionShape, scale: number): number {
  if (shape.kind === "circle") return shape.radius * scale;
  if (shape.kind === "rect") return Math.max(shape.halfLength, shape.halfWidth) * scale;
  return Math.max(...shape.points.map((p) => Math.hypot(p.x, p.y))) * scale;
}

export function corridorPoints(corridor: PortraitCorridorStation[]): Vec2[] {
  return corridor.map((s) => ({ x: s.cx, y: s.y }));
}

export function computeBounds(parcel: Parcel, design: Design): Bounds {
  const b: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 100 };
  const pts = corridorPoints(parcel.corridor);
  const obWidths = parcel.corridor.map((s) => s.obHalfWidth);
  const { left, right } = offsetPolyline(pts, obWidths);
  for (const p of [...left, ...right]) expand(b, p.x, p.y, MARGIN_YARDS);

  for (const piece of [...design.pieces, ...(parcel.fixedRegions ?? [])]) {
    const def = SHAPE_TABLE[piece.shapeId];
    const extent = def ? footprintExtent(def.footprint, piece.scale) : 10;
    expand(b, piece.x, piece.y, extent);
  }
  for (const feature of parcel.elevationFeatures ?? []) {
    expand(b, feature.x, feature.y, feature.radius);
  }
  return b;
}

export interface Frame {
  bounds: Bounds;
  width: number;
  height: number;
}

export function makeFrame(bounds: Bounds): Frame {
  return {
    bounds,
    width: (bounds.maxX - bounds.minX) * PX_PER_YARD,
    height: (bounds.maxY - bounds.minY) * PX_PER_YARD,
  };
}

/** World (portrait yards) -> screen px. Tee at bottom: +y (downrange) maps to decreasing screen y. */
export function worldToScreen(frame: Frame, p: Vec2): Point {
  return {
    x: (p.x - frame.bounds.minX) * PX_PER_YARD,
    y: frame.height - (p.y - frame.bounds.minY) * PX_PER_YARD,
  };
}

/** Screen px -> world (portrait yards). Inverse of worldToScreen. */
export function screenToWorld(frame: Frame, p: Point): Vec2 {
  return {
    x: p.x / PX_PER_YARD + frame.bounds.minX,
    y: (frame.height - p.y) / PX_PER_YARD + frame.bounds.minY,
  };
}

/** Snaps a world point to the nearest 8-yard grid cell (doc §6.4). */
export function snapToGrid(p: Vec2): Vec2 {
  const snap = (v: number) => Math.round(v / YARDS_PER_CELL) * YARDS_PER_CELL;
  return { x: snap(p.x), y: snap(p.y) };
}

const TERRAIN_COLORS: Record<string, string> = {
  fairway: "#bcd9a0",
  rough: "#93ab77",
  green: "#dcefc0",
  bunker: "#e8d9a8",
  water: "#a9cfe0",
  deep: "#6b7d43",
  tee: "#bcd9a0",
  ob: "#93ab77",
};

function polygonScreenPoints(frame: Frame, points: Vec2[]): Point[] {
  return points.map((p) => worldToScreen(frame, p));
}

function drawPiece(surface: Surface, frame: Frame, piece: PlacedShape, fixed: boolean): void {
  const def = SHAPE_TABLE[piece.shapeId];
  if (!def) return;
  const center = worldToScreen(frame, piece);
  const color = TERRAIN_COLORS[def.lieType] ?? "#999";
  const dash = fixed ? [3, 2] : [];

  if (def.footprint.kind === "circle") {
    const r = def.footprint.radius * piece.scale * PX_PER_YARD;
    surface.fillCircle(center, r, color);
    surface.strokeCircle(center, r, "rgba(23,26,18,0.35)", 1, dash);
    return;
  }

  // rot: matches @redan/schema's portrait convention (local +x at rot=0 is
  // the piece's own local frame, not necessarily "downrange" — an author
  // rotates a piece 90deg to point its long axis along the fairway). Local
  // coordinates map directly to screen offsets (no extra flip — footprint
  // points are already in the piece's own local frame), and rot is applied
  // as a screen-space rotation around the piece's center, same convention
  // packages/content/src/render.ts uses for its SVG equivalent.
  const radScreen = (-piece.rot * Math.PI) / 180;
  const toScreenLocal = (lx: number, ly: number): Point => {
    const sx = lx * PX_PER_YARD;
    const sy = ly * PX_PER_YARD;
    const rx = sx * Math.cos(radScreen) - sy * Math.sin(radScreen);
    const ry = sx * Math.sin(radScreen) + sy * Math.cos(radScreen);
    return { x: center.x + rx, y: center.y + ry };
  };

  if (def.footprint.kind === "rect") {
    const hl = def.footprint.halfLength * piece.scale;
    const hw = def.footprint.halfWidth * piece.scale;
    const corners = [
      toScreenLocal(-hl, -hw),
      toScreenLocal(hl, -hw),
      toScreenLocal(hl, hw),
      toScreenLocal(-hl, hw),
    ];
    surface.fillPolygon(corners, color);
    surface.strokePolyline([...corners, corners[0]!], "rgba(23,26,18,0.35)", 1, dash);
    return;
  }

  const pts = def.footprint.points.map((p) => toScreenLocal(p.x * piece.scale, p.y * piece.scale));
  surface.fillPolygon(pts, color);
  surface.strokePolyline([...pts, pts[0]!], "rgba(23,26,18,0.35)", 1, dash);
}

const GOLFER_COLORS: Record<string, string> = {
  basher: "#2a78d6",
  plodder: "#eb6834",
  "wedge-artist": "#1baf7a",
  houdini: "#eda100",
  drawer: "#9b59d0",
  fader: "#d63384",
  "iron-man": "#8a5a2b",
};

function drawTrace(surface: Surface, frame: Frame, golfer: GolferId, shots: Shot[]): void {
  const color = GOLFER_COLORS[golfer] ?? "#666";
  const toPortrait = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x });

  for (const shot of shots) {
    const flight = [toPortrait(shot.from), ...(shot.path ?? []).map(toPortrait)];
    const landing = toPortrait(shot.to);
    const points = polygonScreenPoints(frame, shot.penaltyStrokes > 0 ? flight : [...flight, landing]);
    surface.strokePolyline(points, "#fbfbf5", 3, []);
    surface.strokePolyline(points, color, 1.4, shot.penaltyStrokes > 0 ? [4, 3] : []);
    const landingPx = worldToScreen(frame, landing);
    surface.fillCircle(landingPx, 2.2, color);
  }
}

export interface DrawOptions {
  traces?: { golfer: GolferId; shots: Shot[] }[];
  armedPreview?: { shapeId: string; at: Vec2; rot: number } | null;
}

export function drawHole(surface: Surface, frame: Frame, parcel: Parcel, design: Design, opts: DrawOptions = {}): void {
  surface.clear(TERRAIN_COLORS.rough!);

  const centerline = corridorPoints(parcel.corridor);
  const fairwayHalfWidths = parcel.corridor.map((s) => s.halfWidth);
  const obHalfWidths = parcel.corridor.map((s) => s.obHalfWidth);
  const fairwayRibbon = offsetPolyline(centerline, fairwayHalfWidths);
  const obRibbon = offsetPolyline(centerline, obHalfWidths);

  surface.strokePolyline(polygonScreenPoints(frame, obRibbon.left), "#b5432c", 1.4, [4, 4]);
  surface.strokePolyline(polygonScreenPoints(frame, obRibbon.right), "#b5432c", 1.4, [4, 4]);
  surface.fillPolygon(
    polygonScreenPoints(frame, [...fairwayRibbon.left, ...fairwayRibbon.right.slice().reverse()]),
    TERRAIN_COLORS.fairway!,
  );

  for (const feature of parcel.elevationFeatures ?? []) {
    const center = worldToScreen(frame, feature);
    const color = feature.height >= 0 ? "rgba(201,132,63,0.18)" : "rgba(79,95,168,0.18)";
    surface.fillCircle(center, feature.radius * PX_PER_YARD, color);
  }

  for (const piece of parcel.fixedRegions ?? []) drawPiece(surface, frame, piece, true);
  for (const piece of design.pieces) drawPiece(surface, frame, piece, false);

  const tee = centerline[0] ?? { x: 0, y: 0 };
  const teePx = worldToScreen(frame, tee);
  surface.fillPolygon(
    [
      { x: teePx.x - 4, y: teePx.y },
      { x: teePx.x + 4, y: teePx.y },
      { x: teePx.x, y: teePx.y - 7 },
    ],
    "#171a12",
  );

  for (const trace of opts.traces ?? []) drawTrace(surface, frame, trace.golfer, trace.shots);

  if (opts.armedPreview) {
    const def = SHAPE_TABLE[opts.armedPreview.shapeId];
    if (def) {
      const center = worldToScreen(frame, opts.armedPreview.at);
      const r = footprintExtent(def.footprint, 1) * PX_PER_YARD;
      surface.strokeCircle(center, r, "rgba(23,26,18,0.6)", 1.5, [3, 3]);
    }
  }
}
