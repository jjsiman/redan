import type { Design, Parcel, PlacedShape, PortraitCorridorStation, RegionShape } from "@redan/schema";
import { SHAPE_TABLE, toPortraitPoint } from "@redan/schema";
import type { GolferId, Shot, Vec2 } from "@redan/sim";
import { offsetPolyline } from "@redan/sim";
import type { Point, Surface } from "./surface.js";
import { TERRAIN_COLORS } from "./palette.js";

/**
 * Draws a parcel/design (+ optionally a graded result's traces) onto a
 * Surface. Portrait frame throughout (x = lateral, y = distance from tee) —
 * the same math `packages/content/src/render.ts` uses for its SVG
 * diagnostic, reimplemented here against the Surface abstraction instead of
 * string-templated SVG. Deliberately duplicated rather than shared: the two
 * packages don't share a runtime dependency edge, and the math is small.
 */

/**
 * Scene scale is primary now, not derived from the art tile size — land
 * mode's tile granularity (`YARDS_PER_TILE`/`PX_PER_TILE`, `grid.ts`'s art
 * resolution) and the doc §6.4 design snap grid (`DESIGN_SNAP_YARDS`, what
 * `snapToGrid` uses) are two independent concepts that used to collapse
 * into one `YARDS_PER_CELL`. Splitting them means land mode's art can get
 * finer without also making the green snap in smaller, cache-busting steps.
 */
export const PX_PER_YARD = 2;
/** Land mode's art resolution — a tile is `YARDS_PER_TILE` yards, drawn `PX_PER_TILE` screen px wide. */
export const YARDS_PER_TILE = 2;
export const PX_PER_TILE = YARDS_PER_TILE * PX_PER_YARD;
/** Doc §6.4's design grid — tray placement and land mode's green drag both snap here. */
export const DESIGN_SNAP_YARDS = 8;
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

/** Exported for editor/land.ts's green-drag hazard avoidance — a piece's own bounding-circle radius, the cheapest conservative overlap test against a circular green footprint. */
export function footprintExtent(shape: RegionShape, scale: number): number {
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

/**
 * Fixed bounds for land mode, derived from `parcel.landEnvelope` alone —
 * deliberately NOT from the design (unlike `computeBounds` above). Dragging
 * the green must never resize the frame mid-drag: `worldToScreen`'s scale
 * depends on `frame.height`, so a bounds change while the pointer is down
 * would rescale the scene under the cursor and desync the next
 * `screenToWorld` from where the player is actually pointing. Falls back to
 * `computeBounds` (empty design) if the parcel somehow has no land envelope.
 */
export function computeLandBounds(parcel: Parcel): Bounds {
  const land = parcel.landEnvelope;
  if (!land) {
    return computeBounds(parcel, { parcelId: parcel.id, schemaVersion: parcel.schemaVersion, pieces: [] });
  }
  return {
    minX: -land.halfWidth - MARGIN_YARDS,
    minY: -MARGIN_YARDS,
    maxX: land.halfWidth + MARGIN_YARDS,
    maxY: land.length + MARGIN_YARDS,
  };
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

/** Snaps a world point to the nearest 8-yard design grid cell (doc §6.4). */
export function snapToGrid(p: Vec2): Vec2 {
  const snap = (v: number) => Math.round(v / DESIGN_SNAP_YARDS) * DESIGN_SNAP_YARDS;
  return { x: snap(p.x), y: snap(p.y) };
}

/** Re-exported for callers that only need the flat fill colors (tray mode, render/grid.ts). */
export { TERRAIN_COLORS };

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
  // rotates a piece 90deg to point its long axis along the fairway).
  // `sim/terrain.ts#pieceContainsPoint` is the authority for what a
  // footprint's local frame means: rot applied as a forward rotation about
  // the piece's world position, with local +y equal to world/portrait +y.
  // `worldToScreen` flips y (portrait +y is uprange-to-downrange, screen +y
  // is downward), so a local offset must get that same flip before its
  // rotation is drawn — a rect/circle footprint is y-symmetric and hid this
  // for every shape until an asymmetric polygon (SHAPE_TABLE's organic
  // trees/native-area blobs) exposed it mirrored top-to-bottom. Negating
  // `ly` here, with `radScreen` otherwise unchanged, reproduces exactly the
  // same combined transform pieceContainsPoint's inverse expects — see the
  // repo plan history for the derivation. Same convention
  // packages/content/src/render.ts uses for its SVG equivalent.
  const radScreen = (-piece.rot * Math.PI) / 180;
  const toScreenLocal = (lx: number, ly: number): Point => {
    const sx = lx * PX_PER_YARD;
    const sy = -ly * PX_PER_YARD;
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

function drawTeeMarker(surface: Surface, frame: Frame, tee: Vec2): void {
  const teePx = worldToScreen(frame, tee);
  surface.fillPolygon(
    [
      { x: teePx.x - 4, y: teePx.y },
      { x: teePx.x + 4, y: teePx.y },
      { x: teePx.x, y: teePx.y - 7 },
    ],
    "#171a12",
  );
}

/** Exported for render/grid.ts's land-mode overlay, which draws traces over the rasterized cells the same way drawHole draws them over the vector fairway. */
export function drawTrace(surface: Surface, frame: Frame, golfer: GolferId, shots: Shot[]): void {
  const color = GOLFER_COLORS[golfer] ?? "#666";

  for (const shot of shots) {
    const flight = [toPortraitPoint(shot.from), ...(shot.path ?? []).map(toPortraitPoint)];
    const landing = toPortraitPoint(shot.to);
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

  drawTeeMarker(surface, frame, centerline[0] ?? { x: 0, y: 0 });

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

/**
 * The vector layer land mode draws on top of `render/grid.ts`'s rasterized
 * cells: the tee marker, a highlight ring around the green (the only
 * draggable piece), and graded traces. Deliberately doesn't redraw
 * fairway/rough/hazards — the cells already show those, colored straight
 * from `lieAt`, so a second vector pass would be redundant at best and
 * could visually disagree with the sim at worst.
 */
export function drawLandOverlay(surface: Surface, frame: Frame, design: Design, traces?: { golfer: GolferId; shots: Shot[] }[]): void {
  drawTeeMarker(surface, frame, { x: 0, y: 0 });

  const green = design.pieces[0];
  if (green) {
    const def = SHAPE_TABLE[green.shapeId];
    const r = (def ? footprintExtent(def.footprint, green.scale) : 15) * PX_PER_YARD;
    const center = worldToScreen(frame, green);
    surface.strokeCircle(center, r, "#171a12", 1.8, []);
    surface.strokeCircle(center, r + 3, "rgba(23,26,18,0.4)", 1, [3, 2]);
  }

  for (const trace of traces ?? []) drawTrace(surface, frame, trace.golfer, trace.shots);
}
