import type { Design, Parcel, RegionShape } from "@redan/schema";
import type { ArchetypeName, GradeResult, Shot, Vec2 } from "@redan/sim";
import { SHAPE_TABLE } from "@redan/schema";

/**
 * Dev-only diagnostic visualizer: renders a parcel + design + GradeResult as
 * an inline SVG hole diagram, plus doc-5-style plain-language feedback. This
 * is NOT the doc's "renderer surface interface" deliverable (the tiny
 * fillCell/strokePath/drawText abstraction the real game renderer will sit
 * behind) — it's a standalone tool for seeing a hole while packages/sim and
 * packages/schema are still being built out.
 */

const MARGIN_X = 15;
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 15;

/**
 * Fixed archetype -> {color slot, dash pattern, marker shape} mapping.
 * Colors are the dataviz skill's default categorical slots 1-4 (blue/orange/
 * aqua/yellow) for their recognizability, but that 4th pairing (orange vs.
 * yellow) fails the palette's own all-pairs CVD/contrast validator — see
 * `node scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100" --pairs all`.
 * Traces are lines that can cross anywhere on the diagram, not a fixed
 * legend order, so this can't lean on "adjacent pairs only." The fix is the
 * one the skill prescribes for a failing pair: secondary encoding — each
 * archetype also gets a distinct dash pattern and marker shape, and every
 * trace is drawn with a surface-color halo stroke so it reads against
 * whatever terrain color it crosses. Identity never depends on hue alone.
 */
const ARCHETYPE_STYLE: Record<
  ArchetypeName,
  { varName: string; dash: string; marker: "circle" | "square" | "triangle" | "diamond" }
> = {
  BOMBER: { varName: "--arc-bomber", dash: "none", marker: "circle" },
  STRAIGHT: { varName: "--arc-straight", dash: "6 3", marker: "square" },
  SCRAMBLER: { varName: "--arc-scrambler", dash: "1 3", marker: "triangle" },
  TOUCH: { varName: "--arc-touch", dash: "8 3 2 3", marker: "diamond" },
};

function svgX(portraitX: number, width: number): number {
  return portraitX + width / 2;
}

function svgY(portraitY: number, height: number): number {
  return height - MARGIN_BOTTOM - portraitY;
}

function footprintExtent(shape: RegionShape, scale: number): number {
  if (shape.kind === "circle") return shape.radius * scale;
  return Math.max(shape.halfLength, shape.halfWidth) * scale;
}

function holeLength(parcel: Parcel, design: Design): number {
  let max = 120;
  for (const piece of design.pieces) {
    const def = SHAPE_TABLE[piece.shapeId];
    const extent = def ? footprintExtent(def.footprint, piece.scale) : 10;
    max = Math.max(max, piece.y + extent);
  }
  for (const feature of parcel.elevationFeatures ?? []) {
    max = Math.max(max, feature.y + feature.radius);
  }
  return max;
}

function markerPath(shape: (typeof ARCHETYPE_STYLE)[ArchetypeName]["marker"], cx: number, cy: number, r: number): string {
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

/** Inverse of @redan/schema's toSimPoint: sim (x=downrange, y=lateral) -> portrait (x=lateral, y=downrange). */
function toPortraitPoint(sim: Vec2): Vec2 {
  return { x: -sim.y, y: sim.x };
}

function renderPiece(piece: Design["pieces"][number], width: number, height: number): string {
  const def = SHAPE_TABLE[piece.shapeId];
  if (!def) return "";
  const cx = svgX(piece.x, width);
  const cy = svgY(piece.y, height);
  const fill = `var(--terrain-${def.lieType})`;

  if (def.footprint.kind === "circle") {
    const r = def.footprint.radius * piece.scale;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="var(--diagram-line)" stroke-width="0.6" />`;
  }
  const hl = def.footprint.halfLength * piece.scale;
  const hw = def.footprint.halfWidth * piece.scale;
  // Rect rotation here mirrors @redan/schema's portrait rot convention
  // (local +x at rot=0), but only circular hazards exist in content today —
  // this path hasn't been cross-checked visually against a real placement.
  return `<rect x="${cx - hl}" y="${cy - hw}" width="${hl * 2}" height="${hw * 2}" fill="${fill}" stroke="var(--diagram-line)" stroke-width="0.6" transform="rotate(${-piece.rot} ${cx} ${cy})" />`;
}

function svgPolyline(points: Vec2[], width: number, height: number): string {
  return points.map((p) => `${svgX(p.x, width)},${svgY(p.y, height)}`).join(" ");
}

/**
 * Draws each shot's actual curved flight (`shot.path`, sampled by
 * flight.ts#resolveFlight) rather than a straight line to its rest point —
 * spin and wind are otherwise invisible in the diagram. Falls back to a
 * straight segment to `shot.to` when `path` is absent.
 *
 * A penalty shot (water/OB) is drawn in two visually distinct pieces, not
 * one continuous line: the attempted flight (faded, in the archetype's
 * color) out to wherever it actually landed, then a short muted dotted
 * connector to `shot.to` — which for OB is stroke-and-distance, i.e. back
 * at `shot.from`. Joining those into one solid line reads as a nonsensical
 * zigzag (the ball appearing to fly out toward a hazard and instantly snap
 * back); drawing the reset as its own faint segment tells the honest story
 * instead — this shot was attempted, then replayed.
 */
function renderTrace(archetype: ArchetypeName, shots: Shot[], width: number, height: number): string {
  const style = ARCHETYPE_STYLE[archetype];
  const colorVar = `var(${style.varName})`;
  const parts: string[] = [];

  for (const shot of shots) {
    const flight = [toPortraitPoint(shot.from), ...(shot.path ?? []).map(toPortraitPoint)];
    const landing = toPortraitPoint(shot.to);

    if (shot.penaltyStrokes > 0) {
      const flightSvg = svgPolyline(flight, width, height);
      parts.push(`<polyline points="${flightSvg}" fill="none" stroke="var(--surface)" stroke-width="3.2" stroke-linejoin="round" />`);
      parts.push(
        `<polyline points="${flightSvg}" fill="none" stroke="${colorVar}" stroke-width="1.4" stroke-dasharray="${style.dash}" stroke-linejoin="round" stroke-opacity="0.5" />`,
      );
      const last = flight[flight.length - 1]!;
      const dropSvg = svgPolyline([last, landing], width, height);
      parts.push(`<polyline points="${dropSvg}" fill="none" stroke="var(--diagram-line)" stroke-width="0.8" stroke-dasharray="1 2" />`);
    } else {
      const svgPoints = svgPolyline([...flight, landing], width, height);
      parts.push(`<polyline points="${svgPoints}" fill="none" stroke="var(--surface)" stroke-width="3.2" stroke-linejoin="round" />`);
      parts.push(
        `<polyline points="${svgPoints}" fill="none" stroke="${colorVar}" stroke-width="1.4" stroke-dasharray="${style.dash}" stroke-linejoin="round" />`,
      );
    }

    const cx = svgX(landing.x, width);
    const cy = svgY(landing.y, height);
    parts.push(`<g fill="${colorVar}" stroke="var(--surface)" stroke-width="0.8">${markerPath(style.marker, cx, cy, 2.4)}</g>`);
  }

  return parts.join("\n");
}

/**
 * Concentric rings per mound (warm) or hollow (cool), darkening toward the
 * center — a cheap contour-map stand-in so 2D terrain is visible in the
 * diagram, not just mechanically present in the sim.
 */
function renderElevationFeatures(parcel: Parcel, width: number, height: number): string {
  const features = parcel.elevationFeatures;
  if (!features || features.length === 0) return "";

  return features
    .map((f) => {
      const cx = svgX(f.x, width);
      const cy = svgY(f.y, height);
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
  const width = parcel.obHalfWidth * 2 + MARGIN_X * 2;
  const length = holeLength(parcel, design);
  const height = length + MARGIN_TOP + MARGIN_BOTTOM;

  const fairwayX0 = svgX(-parcel.corridorHalfWidth, width);
  const fairwayW = parcel.corridorHalfWidth * 2;
  const fairwayY = svgY(length, height);
  const fairwayH = svgY(0, height) - fairwayY;

  const obLeft = svgX(-parcel.obHalfWidth, width);
  const obRight = svgX(parcel.obHalfWidth, width);
  const obTop = svgY(length, height);
  const obBottom = svgY(0, height);

  const teeX = svgX(0, width);
  const teeY = svgY(0, height);

  const elevationFeatures = renderElevationFeatures(parcel, width, height);
  const pieces = design.pieces.map((p) => renderPiece(p, width, height)).join("\n");
  const traces = result.traces.map((t) => renderTrace(t.archetype, t.shots, width, height)).join("\n");

  return `<figure class="hole-figure">
  <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Portrait diagram of parcel ${parcel.id}: tee at bottom, green near top, with each archetype's played route overlaid.">
    <rect x="0" y="0" width="${width}" height="${height}" fill="var(--terrain-rough)" />
    <line x1="${obLeft}" y1="${obTop}" x2="${obLeft}" y2="${obBottom}" stroke="var(--ob-line)" stroke-width="0.7" stroke-dasharray="2 2" />
    <line x1="${obRight}" y1="${obTop}" x2="${obRight}" y2="${obBottom}" stroke="var(--ob-line)" stroke-width="0.7" stroke-dasharray="2 2" />
    <rect x="${fairwayX0}" y="${fairwayY}" width="${fairwayW}" height="${fairwayH}" fill="var(--terrain-fairway)" />
    ${elevationFeatures}
    ${pieces}
    <polygon points="${teeX - 2.2},${teeY} ${teeX + 2.2},${teeY} ${teeX},${teeY - 3.6}" fill="var(--diagram-tee)" />
    ${traces}
  </svg>
  <figcaption>${parcel.id} — tee at bottom, green at top. Each line is one archetype's actual curved route through this design; shaded rings are mounds/hollows.</figcaption>
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

export interface Verdict {
  stars: 0 | 1 | 2 | 3;
  sentences: string[];
}

/**
 * Doc 5's star gates and coaching-sentence idea, applied to a GradeResult.
 * The four bracketed examples in the doc are reproduced closely; everything
 * else here (the "good" cases, the exact wording) is my own composition in
 * the same voice, not verbatim from the doc — a first pass, not settled.
 */
export function describeResult(parcel: Parcel, result: GradeResult): Verdict {
  const { field, spread, sd, routes, used, cap, parOK } = result.metrics;
  const sentences: string[] = [];

  sentences.push(`Plays as a par ${parcel.par} — field average ${field.toFixed(2)}.`);

  const means = Object.entries(result.archetypes) as [ArchetypeName, { mean: number }][];
  const best = means.reduce((a, b) => (b[1].mean < a[1].mean ? b : a));
  const worst = means.reduce((a, b) => (b[1].mean > a[1].mean ? b : a));

  let stars: 0 | 1 | 2 | 3 = 0;
  if (parOK && spread < 0.85) {
    stars = 1;
    if (routes > 1 && sd > 0.62 && sd < 1.75) {
      stars = 2;
      if (used < cap) stars = 3;
    }
  }

  if (spread >= 0.85) {
    sentences.push(
      `${best[0]} beat ${worst[0]} by ${spread.toFixed(2)}. One kind of player is being handed the hole.`,
    );
  } else if (routes <= 1) {
    sentences.push("Every archetype played the identical line. There is no decision here.");
  }

  if (sd < 0.62) {
    sentences.push(`Scores barely varied (σ ${sd.toFixed(2)}). Nothing is at stake.`);
  } else if (sd > 1.75) {
    sentences.push(`Scores were everywhere (σ ${sd.toFixed(2)}). It's a lottery, not a test.`);
  } else {
    sentences.push(`Real spread (σ ${sd.toFixed(2)}) — skill is rewarded.`);
  }

  if (stars === 3) {
    const unspent = cap - used;
    sentences.push(`${unspent} piece${unspent === 1 ? "" : "s"} unspent — the land did the work.`);
  }

  return { stars, sentences };
}
