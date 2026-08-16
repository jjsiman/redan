import type { Design, Parcel, PortraitCorridorStation, RegionShape } from "@redan/schema";
import type { GolferId, GradeResult, Shot, Vec2 } from "@redan/sim";
import { describeResultFromGolfers, offsetPolyline } from "@redan/sim";
import { SHAPE_TABLE, toPortraitPoint } from "@redan/schema";

/**
 * Dev-only diagnostic visualizer: renders a parcel + design + GradeResult as
 * an inline SVG hole diagram, plus doc-5-style plain-language feedback. This
 * is NOT the doc's "renderer surface interface" deliverable (the tiny
 * fillCell/strokePath/drawText abstraction the real game renderer will sit
 * behind, built in apps/web) — it's a standalone tool for seeing a hole
 * while packages/sim and packages/schema are still being built out.
 */

const MARGIN = 18;

/**
 * Fixed golfer -> {color slot, dash pattern, marker shape} mapping, keyed by
 * traits.ts's ROSTER ids (not imported directly — this file only needs the
 * style, not the roster itself, so any golfer id not listed here just falls
 * back to a neutral gray rather than failing to render).
 *
 * Colors loosely follow the dataviz skill's categorical approach (distinct
 * hues, not adjacent), but with 7 slots instead of 4 there are more
 * near-neighbors than a validated 4-color palette guarantees — dash pattern
 * and marker shape are the real disambiguators here, same as before. Every
 * trace also gets a surface-color halo stroke so it reads against whatever
 * terrain color it crosses; identity never depends on hue alone.
 */
const GOLFER_STYLE: Record<
  string,
  { varName: string; dash: string; marker: "circle" | "square" | "triangle" | "diamond" }
> = {
  basher: { varName: "--arc-basher", dash: "none", marker: "circle" },
  plodder: { varName: "--arc-plodder", dash: "6 3", marker: "square" },
  "wedge-artist": { varName: "--arc-wedge-artist", dash: "1 3", marker: "triangle" },
  houdini: { varName: "--arc-houdini", dash: "8 3 2 3", marker: "diamond" },
  drawer: { varName: "--arc-drawer", dash: "3 6", marker: "circle" },
  fader: { varName: "--arc-fader", dash: "10 2 2 2", marker: "square" },
  "iron-man": { varName: "--arc-iron-man", dash: "2 2", marker: "triangle" },
};
const FALLBACK_STYLE = { varName: "--ink-muted", dash: "4 2", marker: "circle" as const };

function styleFor(golfer: GolferId) {
  return GOLFER_STYLE[golfer] ?? FALLBACK_STYLE;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function expandBounds(b: Bounds, x: number, y: number, pad = 0): void {
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

function corridorPoints(corridor: PortraitCorridorStation[]): Vec2[] {
  return corridor.map((s) => ({ x: s.cx, y: s.y }));
}

function computeBounds(parcel: Parcel, design: Design): Bounds {
  const b: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 120 };
  const pts = corridorPoints(parcel.corridor);
  const obWidths = parcel.corridor.map((s) => s.obHalfWidth);
  const { left, right } = offsetPolyline(pts, obWidths);
  for (const p of [...left, ...right]) expandBounds(b, p.x, p.y);

  for (const piece of [...design.pieces, ...(parcel.fixedRegions ?? [])]) {
    const def = SHAPE_TABLE[piece.shapeId];
    const extent = def ? footprintExtent(def.footprint, piece.scale) : 10;
    expandBounds(b, piece.x, piece.y, extent);
  }
  for (const feature of parcel.elevationFeatures ?? []) {
    expandBounds(b, feature.x, feature.y, feature.radius);
  }
  return b;
}

function markerPath(shape: "circle" | "square" | "triangle" | "diamond", cx: number, cy: number, r: number): string {
  switch (shape) {
    case "circle":
      return `<circle cx="${cx}" cy="${cy}" r="${r}" />`;
    case "square":
      return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" />`;
    case "triangle":
      return `<polygon points="${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}" />`;
    case "diamond":
      return `<polygon points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" />`;
  }
}

interface Frame {
  bounds: Bounds;
  width: number;
  height: number;
}

function makeFrame(bounds: Bounds): Frame {
  return {
    bounds,
    width: bounds.maxX - bounds.minX + MARGIN * 2,
    height: bounds.maxY - bounds.minY + MARGIN * 2,
  };
}

function svgX(frame: Frame, portraitX: number): number {
  return portraitX - frame.bounds.minX + MARGIN;
}

function svgY(frame: Frame, portraitY: number): number {
  return frame.height - MARGIN - (portraitY - frame.bounds.minY);
}

function svgPolygon(frame: Frame, points: Vec2[]): string {
  return points.map((p) => `${svgX(frame, p.x)},${svgY(frame, p.y)}`).join(" ");
}

function renderPiece(frame: Frame, piece: Design["pieces"][number], fixed: boolean): string {
  const def = SHAPE_TABLE[piece.shapeId];
  if (!def) return "";
  const cx = svgX(frame, piece.x);
  const cy = svgY(frame, piece.y);
  const fill = `var(--terrain-${def.lieType})`;
  // Fixed (parcel-authored, un-removable) regions get a hatch-like dashed
  // outline so they read as different in kind from player-placed pieces.
  const strokeDasharray = fixed ? `2 1.5` : `none`;

  if (def.footprint.kind === "circle") {
    const r = def.footprint.radius * piece.scale;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="var(--diagram-line)" stroke-width="0.6" stroke-dasharray="${strokeDasharray}" />`;
  }
  if (def.footprint.kind === "rect") {
    const hl = def.footprint.halfLength * piece.scale;
    const hw = def.footprint.halfWidth * piece.scale;
    return `<rect x="${cx - hl}" y="${cy - hw}" width="${hl * 2}" height="${hw * 2}" fill="${fill}" stroke="var(--diagram-line)" stroke-width="0.6" stroke-dasharray="${strokeDasharray}" transform="rotate(${-piece.rot} ${cx} ${cy})" />`;
  }
  // Matches the rect case above: local coordinates map directly (no flip —
  // footprint points are in the piece's own local frame, not the outer
  // portrait frame), and rot is applied as an SVG transform, not baked into
  // the points, for the same reason the rect case uses `transform=`.
  const pts = def.footprint.points.map((p) => `${cx + p.x * piece.scale},${cy + p.y * piece.scale}`).join(" ");
  return `<polygon points="${pts}" fill="${fill}" stroke="var(--diagram-line)" stroke-width="0.6" stroke-dasharray="${strokeDasharray}" transform="rotate(${-piece.rot} ${cx} ${cy})" />`;
}

function svgPolyline(frame: Frame, points: Vec2[]): string {
  return points.map((p) => `${svgX(frame, p.x)},${svgY(frame, p.y)}`).join(" ");
}

/**
 * Draws each shot's actual curved flight (`shot.path`, sampled by
 * flight.ts#resolveFlight) rather than a straight line to its rest point —
 * spin and wind are otherwise invisible in the diagram. Falls back to a
 * straight segment to `shot.to` when `path` is absent.
 *
 * A penalty shot (water/OB) is drawn in two visually distinct pieces, not
 * one continuous line: the attempted flight (faded, in the golfer's color)
 * out to wherever it actually landed, then a short muted dotted connector to
 * `shot.to` — which for OB is stroke-and-distance, i.e. back at `shot.from`.
 * Joining those into one solid line reads as a nonsensical zigzag; drawing
 * the reset as its own faint segment tells the honest story instead.
 */
function renderTrace(frame: Frame, golfer: GolferId, shots: Shot[]): string {
  const style = styleFor(golfer);
  const colorVar = `var(${style.varName})`;
  const parts: string[] = [];

  for (const shot of shots) {
    const flight = [toPortraitPoint(shot.from), ...(shot.path ?? []).map(toPortraitPoint)];
    const landing = toPortraitPoint(shot.to);

    if (shot.penaltyStrokes > 0) {
      const flightSvg = svgPolyline(frame, flight);
      parts.push(`<polyline points="${flightSvg}" fill="none" stroke="var(--surface)" stroke-width="3.2" stroke-linejoin="round" />`);
      parts.push(
        `<polyline points="${flightSvg}" fill="none" stroke="${colorVar}" stroke-width="1.4" stroke-dasharray="${style.dash}" stroke-linejoin="round" stroke-opacity="0.5" />`,
      );
      const last = flight[flight.length - 1]!;
      const dropSvg = svgPolyline(frame, [last, landing]);
      parts.push(`<polyline points="${dropSvg}" fill="none" stroke="var(--diagram-line)" stroke-width="0.8" stroke-dasharray="1 2" />`);
    } else {
      const svgPoints = svgPolyline(frame, [...flight, landing]);
      parts.push(`<polyline points="${svgPoints}" fill="none" stroke="var(--surface)" stroke-width="3.2" stroke-linejoin="round" />`);
      parts.push(
        `<polyline points="${svgPoints}" fill="none" stroke="${colorVar}" stroke-width="1.4" stroke-dasharray="${style.dash}" stroke-linejoin="round" />`,
      );
    }

    const cx = svgX(frame, landing.x);
    const cy = svgY(frame, landing.y);
    parts.push(`<g fill="${colorVar}" stroke="var(--surface)" stroke-width="0.8">${markerPath(style.marker, cx, cy, 2.4)}</g>`);
  }

  return parts.join("\n");
}

/**
 * Concentric rings per mound (warm) or hollow (cool), darkening toward the
 * center — a cheap contour-map stand-in so 2D terrain is visible in the
 * diagram, not just mechanically present in the sim.
 */
function renderElevationFeatures(frame: Frame, parcel: Parcel): string {
  const features = parcel.elevationFeatures;
  if (!features || features.length === 0) return "";

  return features
    .map((f) => {
      const cx = svgX(frame, f.x);
      const cy = svgY(frame, f.y);
      const colorVar = f.height >= 0 ? "var(--terrain-mound)" : "var(--terrain-hollow)";
      return [1, 0.66, 0.33]
        .map((frac, i) => {
          const r = f.radius * frac;
          const opacity = 0.12 + i * 0.08;
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colorVar}" fill-opacity="${opacity}" />`;
        })
        .join("");
    })
    .join("\n");
}

export function renderHoleSvg(parcel: Parcel, design: Design, result: GradeResult): string {
  const bounds = computeBounds(parcel, design);
  const frame = makeFrame(bounds);

  const centerline = corridorPoints(parcel.corridor);
  const fairwayHalfWidths = parcel.corridor.map((s) => s.halfWidth);
  const obHalfWidths = parcel.corridor.map((s) => s.obHalfWidth);
  const fairwayRibbon = offsetPolyline(centerline, fairwayHalfWidths);
  const obRibbon = offsetPolyline(centerline, obHalfWidths);

  const fairwayPolygon = svgPolygon(frame, [...fairwayRibbon.left, ...fairwayRibbon.right.slice().reverse()]);
  const obLeftLine = svgPolyline(frame, obRibbon.left);
  const obRightLine = svgPolyline(frame, obRibbon.right);

  const tee = centerline[0] ?? { x: 0, y: 0 };
  const teeX = svgX(frame, tee.x);
  const teeY = svgY(frame, tee.y);

  const elevationFeatures = renderElevationFeatures(frame, parcel);
  const fixedRegions = (parcel.fixedRegions ?? []).map((p) => renderPiece(frame, p, true)).join("\n");
  const pieces = design.pieces.map((p) => renderPiece(frame, p, false)).join("\n");
  const traces = result.traces.map((t) => renderTrace(frame, t.golfer, t.shots)).join("\n");

  return `<figure class="hole-figure">
  <svg viewBox="0 0 ${frame.width} ${frame.height}" role="img" aria-label="Portrait diagram of parcel ${parcel.id}: tee at bottom, green near top, with each golfer's played route overlaid.">
    <rect x="0" y="0" width="${frame.width}" height="${frame.height}" fill="var(--terrain-rough)" />
    <polyline points="${obLeftLine}" fill="none" stroke="var(--ob-line)" stroke-width="0.7" stroke-dasharray="2 2" />
    <polyline points="${obRightLine}" fill="none" stroke="var(--ob-line)" stroke-width="0.7" stroke-dasharray="2 2" />
    <polygon points="${fairwayPolygon}" fill="var(--terrain-fairway)" />
    ${elevationFeatures}
    ${fixedRegions}
    ${pieces}
    <polygon points="${teeX - 2.2},${teeY} ${teeX + 2.2},${teeY} ${teeX},${teeY - 3.6}" fill="var(--diagram-tee)" />
    ${traces}
  </svg>
  <figcaption>${parcel.id} — tee at bottom, green at top. Each line is one golfer's actual curved route through this design; dashed-outline shapes are fixed (un-removable) terrain; shaded rings are mounds/hollows.</figcaption>
</figure>`;
}

export function renderElevationSvg(parcel: Parcel): string | null {
  const profile = parcel.elevationProfile;
  if (!profile || profile.length < 2) return null;

  const width = 220;
  const height = 46;
  const maxY = Math.max(...profile.map((s) => s.y));
  const zs = profile.map((s) => s.z);
  const minZ = Math.min(0, ...zs);
  const maxZ = Math.max(0, ...zs);
  const zRange = maxZ - minZ || 1;

  const px = (y: number) => (y / maxY) * (width - 8) + 4;
  const py = (z: number) => height - 6 - ((z - minZ) / zRange) * (height - 12);

  const points = profile.map((s) => `${px(s.y)},${py(s.z)}`).join(" ");

  return `<figure class="elevation-figure">
  <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Elevation profile from tee to green: rises to ${maxZ.toFixed(0)} feet.">
    <line x1="4" y1="${py(0)}" x2="${width - 4}" y2="${py(0)}" stroke="var(--diagram-line)" stroke-width="0.5" stroke-dasharray="1 2" />
    <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round" />
  </svg>
  <figcaption>Elevation, tee to green (peak ${maxZ.toFixed(0)} ft)</figcaption>
</figure>`;
}

export type { Verdict } from "@redan/sim";

/**
 * Doc 5's star gates and coaching-sentence idea, applied to a GradeResult.
 * The logic itself now lives in `@redan/sim`'s `verdict.ts`, shared with
 * `apps/web`'s editor so the two never drift on what a star means — this
 * stays a thin `Parcel`-shaped wrapper for this package's existing callers.
 */
export function describeResult(parcel: Parcel, result: GradeResult) {
  return describeResultFromGolfers(parcel.par, result.metrics, result.golfers);
}
