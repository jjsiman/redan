import type { CorridorStation, LandEnvelope, LieType, Parcel, Piece, Vec2 } from "./types.js";
import { pieceContainsPoint } from "./terrain.js";
import { polylineLength, pointAtStation } from "./geom.js";

/**
 * Terrain-derivation module (doc 6.4: "fairway generator plus rough bands as
 * one deterministic terrain-derivation module"). Given a fixed land
 * rectangle (`Parcel.landEnvelope`) and a green position the player chose,
 * `deriveFairway` routes a fairway corridor from the tee to the green,
 * bending around `parcel.fixedRegions` (water, trees, native area) rather
 * than crossing them for free. Pure and deterministic — same parcel + same
 * green always produces the same corridor, byte for byte.
 *
 * Design notes, from a review pass against terrain.ts/geom.ts (see the repo
 * plan history for the full pressure-test):
 *
 * - A land parcel's own authored `corridor` must be `halfWidth: 0` — NOT
 *   equal to `obHalfWidth` — because `lieAt`'s fallback is "fairway if
 *   inside halfWidth, else rough"; equal widths make the whole interior
 *   fairway by construction. `halfWidth: 0` means an ungraded (un-derived)
 *   land parcel is honestly all-rough, not accidentally all-fairway.
 * - The derived corridor's `obHalfWidth` is a large sentinel, not a real
 *   boundary. `lieAt`'s in-bounds test is symmetric about whichever
 *   centerline it's given (`|offset| <= obHalfWidth`); once the centerline
 *   bends to route around a hazard, there is no per-station `obHalfWidth`
 *   that holds a FIXED boundary still — matching a fixed band `[-W, W]` at a
 *   drifted station forces the drift to be zero. So the land boundary is
 *   expressed as four fixed `ob`-lie regions (see `obBands`) framing the
 *   authored rectangle instead — literal geometry, invariant under whatever
 *   centerline the router produces.
 * - The corridor extends `runout` yards past BOTH the tee and the green.
 *   `lieAt` checks `proj.beyond` before anything else, so a corridor ending
 *   exactly at the green would resolve a few feet of harmless roll-out past
 *   the pin as OB.
 *
 * Deliberately NOT a grid/Dijkstra search: on an 8-neighbour grid, a hard
 * hazard cost makes the optimum graze hazard edges (no reason to stand off),
 * the route is 45°-quantized, and — the disqualifying problem for a corridor
 * re-derived on every green drag — the discrete argmin can flip between two
 * similar-cost routes on a one-cell green move, snapping the fairway across
 * the screen. A parametric cubic Bézier has no such discontinuity and is C²
 * smooth by construction, which is most of what makes the output read as a
 * golf hole rather than a shortest path.
 */

export interface FairwaySpec {
  /** Fairway half-width away from any hazard, yards. Default 22. */
  baseHalfWidth?: number;
  /** Narrowest the fairway is allowed to pinch to next to a hazard, yards. Default 9. */
  minHalfWidth?: number;
  /** Half-width at the tee station specifically — a tee box, not a launch pad. Default 16. */
  teeHalfWidth?: number;
  /** Yards of standoff a fairway edge tries to keep from a hazard boundary. Default 6. */
  hazardClearance?: number;
  /** Yards between emitted stations. Default 40. */
  stationSpacing?: number;
  /** Yards the corridor extends straight past BOTH the tee and the green. Default 40. */
  runout?: number;
  /** Assumed green radius (yards) for widening the station nearest the green. Default 15. */
  greenRadius?: number;
}

const DEFAULTS: Required<FairwaySpec> = {
  baseHalfWidth: 22,
  minHalfWidth: 9,
  teeHalfWidth: 16,
  hazardClearance: 6,
  stationSpacing: 40,
  runout: 40,
  greenRadius: 15,
};

/** Grid resolution for the clearance field — matches the doc's 8-yard rendering cell. */
const CELL = 8;
/** OB-frame band thickness (yards) — generous enough that no shot escapes past it. */
const OB_BAND_THICKNESS = 200;
/** Sentinel `obHalfWidth` for a derived corridor: wide enough the corridor's own OB test never fires inside the land; the real boundary is the OB-band fixed regions. */
const OB_SENTINEL = 400;

const HAZARD_WEIGHT: Partial<Record<LieType, number>> = {
  water: 6.0,
  deep: 3.0,
  bunker: 1.0,
  rough: 0.6,
};

function unit(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function perp(u: Vec2): Vec2 {
  return { x: -u.y, y: u.x };
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Worst-of the fixed-region hazards covering `p`, or null if none. Only water/deep/bunker/rough carry a routing cost; trees resolve `deep` via the shape table, so this needs no special case for them. */
function hazardLieAt(fixedRegions: Piece[], p: Vec2): LieType | null {
  let worst: LieType | null = null;
  let worstWeight = -1;
  for (const piece of fixedRegions) {
    const w = HAZARD_WEIGHT[piece.lieType];
    if (w === undefined || w <= worstWeight) continue;
    if (pieceContainsPoint(piece, p)) {
      worst = piece.lieType;
      worstWeight = w;
    }
  }
  return worst;
}

function hazardCost(lie: LieType | null): number {
  return lie ? (HAZARD_WEIGHT[lie] ?? 0) : 0;
}

/**
 * Approximate Euclidean distance (yards) from every grid cell to the nearest
 * `blocked` cell, via a two-pass weighted sweep (orthogonal step = CELL,
 * diagonal = CELL*sqrt2). Cheap and precise enough at 8-yard resolution;
 * computed once per parcel and reused for both routing and station widths.
 */
function distanceField(gw: number, gh: number, blocked: boolean[]): Float64Array {
  const INF = 1e9;
  const dist = new Float64Array(gw * gh).fill(INF);
  for (let i = 0; i < blocked.length; i++) if (blocked[i]) dist[i] = 0;

  const ortho = CELL;
  const diag = CELL * Math.SQRT2;
  const idx = (x: number, y: number): number => y * gw + x;

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let d = dist[idx(x, y)]!;
      if (x > 0) d = Math.min(d, dist[idx(x - 1, y)]! + ortho);
      if (y > 0) d = Math.min(d, dist[idx(x, y - 1)]! + ortho);
      if (x > 0 && y > 0) d = Math.min(d, dist[idx(x - 1, y - 1)]! + diag);
      if (x < gw - 1 && y > 0) d = Math.min(d, dist[idx(x + 1, y - 1)]! + diag);
      dist[idx(x, y)] = d;
    }
  }
  for (let y = gh - 1; y >= 0; y--) {
    for (let x = gw - 1; x >= 0; x--) {
      let d = dist[idx(x, y)]!;
      if (x < gw - 1) d = Math.min(d, dist[idx(x + 1, y)]! + ortho);
      if (y < gh - 1) d = Math.min(d, dist[idx(x, y + 1)]! + ortho);
      if (x < gw - 1 && y < gh - 1) d = Math.min(d, dist[idx(x + 1, y + 1)]! + diag);
      if (x > 0 && y < gh - 1) d = Math.min(d, dist[idx(x - 1, y + 1)]! + diag);
      dist[idx(x, y)] = d;
    }
  }
  return dist;
}

function sampleField(field: Float64Array, gw: number, gh: number, halfWidth: number, p: Vec2): number {
  const gx = clampNum(Math.round(p.x / CELL), 0, gw - 1);
  const gy = clampNum(Math.round((p.y + halfWidth) / CELL), 0, gh - 1);
  return field[gy * gw + gx]!;
}

function cubicBezier(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/**
 * Scores a small family of tee->green cubic Béziers (control points offset
 * laterally from the straight line at 1/3 and 2/3 of the way) against the
 * hazard/clearance/edge-distance cost below, and returns the sampled points
 * of the winner. Water is expensive, not impassable: the per-yard cost means
 * the curve walks around a hazard whenever a detour is cheaper than crossing
 * it, and crosses at the narrowest point when the land leaves no way around
 * — a forced carry falls out of the cost model rather than needing its own
 * branch or threshold.
 */
function deriveCenterline(
  land: LandEnvelope,
  greenCenter: Vec2,
  fixedRegions: Piece[],
  clearanceField: Float64Array,
  gw: number,
  gh: number,
): Vec2[] {
  const p0: Vec2 = { x: 0, y: 0 };
  const p3 = greenCenter;
  const chord = { x: p3.x - p0.x, y: p3.y - p0.y };
  const length = Math.hypot(chord.x, chord.y) || 1;
  const u = unit(chord);
  const n = perp(u);

  // Cap offsets by BOTH the land width and the chord length — a fixed
  // absolute cap (e.g. up to 56 yd either side) is fine on a 470-yard hole
  // but produces a wildly kinked S-curve on a 165-yard one, which reads as
  // a maze rather than a fairway and tanks scoring on short holes (found by
  // grading generated content: a 194-yard par 3 was playing to a 5.7+
  // field average because the derived corridor bent far more sharply than
  // its length could justify).
  const maxOffset = Math.min(Math.max(0, land.halfWidth - 4), length * 0.35);
  const maxDelta = Math.min(64, length * 0.5);
  const offsets = [-72, -56, -40, -24, -8, 0, 8, 24, 40, 56, 72].filter((o) => Math.abs(o) <= maxOffset);
  if (offsets.length === 0) offsets.push(0);

  let best: { cost: number; a: number; b: number; pts: Vec2[] } | null = null;

  for (const a of offsets) {
    for (const b of offsets) {
      if (Math.abs(a - b) > maxDelta) continue;
      // A real dogleg commits to one direction and eases back toward the
      // green — it doesn't snake. Reject opposite-signed control points
      // (an S-curve): even after the length-scaled offset cap above, a hole
      // with hazards on both sides of the straight line could otherwise
      // still win on cost with a wiggly two-bend shape that plays much
      // harder than its geometry looks like it should.
      if (a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b)) continue;
      const p1: Vec2 = { x: p0.x + u.x * 0.33 * length + n.x * a, y: p0.y + u.y * 0.33 * length + n.y * a };
      const p2: Vec2 = { x: p0.x + u.x * 0.66 * length + n.x * b, y: p0.y + u.y * 0.66 * length + n.y * b };

      const stepYd = 4;
      const nSamples = Math.max(2, Math.round(length / stepYd));
      let cost = 0;
      let valid = true;
      const pts: Vec2[] = [];
      for (let i = 0; i <= nSamples; i++) {
        const t = i / nSamples;
        const p = cubicBezier(p0, p1, p2, p3, t);
        if (p.x < -0.01 || p.x > land.length + 0.01 || Math.abs(p.y) > land.halfWidth + 0.01) {
          valid = false;
          break;
        }
        pts.push(p);
        const lie = hazardLieAt(fixedRegions, p);
        const clr = sampleField(clearanceField, gw, gh, land.halfWidth, p);
        const edge = Math.max(0, Math.min(p.x, land.length - p.x, land.halfWidth - Math.abs(p.y)));
        cost +=
          stepYd *
          (1 + hazardCost(lie) + 1.5 * Math.max(0, 1 - clr / 24) + 2.5 * Math.max(0, 1 - edge / 20));
      }
      if (!valid) continue;

      const tiebreak = Math.abs(a) + Math.abs(b);
      if (
        !best ||
        cost < best.cost ||
        (cost === best.cost && tiebreak < Math.abs(best.a) + Math.abs(best.b))
      ) {
        best = { cost, a, b, pts };
      }
    }
  }

  if (best) return best.pts;

  // No candidate stayed inside the land (e.g. the green sits right in a
  // corner) — fall back to a straight tee->green line so deriveFairway
  // always returns something rather than throwing on pathological input.
  const straight: Vec2[] = [];
  const n2 = 12;
  for (let i = 0; i <= n2; i++) {
    const t = i / n2;
    straight.push({ x: p0.x + chord.x * t, y: p0.y + chord.y * t });
  }
  return straight;
}

function buildStations(
  centerline: Vec2[],
  clearanceField: Float64Array,
  gw: number,
  gh: number,
  land: LandEnvelope,
  spec: Required<FairwaySpec>,
): CorridorStation[] {
  const total = polylineLength(centerline);
  const sList: number[] = [-spec.runout, 0];
  let s = spec.stationSpacing;
  while (s < total - 1) {
    sList.push(s);
    s += spec.stationSpacing;
  }
  sList.push(total);
  sList.push(total + spec.runout);

  return sList.map((sAt) => {
    const p = pointAtStation(centerline, sAt);
    let halfWidth: number;
    if (sAt <= 0) {
      halfWidth = spec.teeHalfWidth;
    } else if (Math.abs(sAt - total) < 1e-6) {
      halfWidth = spec.greenRadius + 6;
    } else if (sAt > total) {
      // Past the green: fairway ends, the land continues as rough (still
      // inside the OB frame) so a long miss doesn't resolve OB by accident.
      halfWidth = 0;
    } else {
      const clr = sampleField(clearanceField, gw, gh, land.halfWidth, p);
      halfWidth = clampNum(Math.min(spec.baseHalfWidth, clr - spec.hazardClearance), spec.minHalfWidth, spec.baseHalfWidth);
    }
    return { x: p.x, cy: p.y, halfWidth, obHalfWidth: OB_SENTINEL };
  });
}

/**
 * Two fixed `ob`-lie rectangles running the LATERAL boundary of the
 * authored land rectangle — the actual (fixed, non-bending) land edge. See
 * the module doc for why this replaces `corridor.obHalfWidth` for that job.
 *
 * Only lateral, deliberately: the fore/aft boundary (behind the tee, past
 * the far end) doesn't need a fixed region at all — `lieAt` checks the
 * corridor's own arc-length extent (`proj.beyond`) before anything else, and
 * the derived corridor already extends exactly `runout` yards past both the
 * tee and the green, so that check alone resolves OB correctly there. A
 * longitudinal band was tried and rejected: with its near edge placed at the
 * land boundary (x=0 or x=length), the tee itself sits exactly on the
 * band's boundary and inclusive `<=` containment resolves it OB — the same
 * off-by-a-boundary class of bug the runout was added to prevent in the
 * other direction.
 */
function obBands(land: LandEnvelope, spec: Required<FairwaySpec>): Piece[] {
  const t = OB_BAND_THICKNESS;
  const mk = (x: number, y: number, halfLength: number, halfWidth: number): Piece => ({
    shapeId: "ob-band",
    lieType: "ob",
    x,
    y,
    rot: 0,
    scale: 1,
    footprint: { kind: "rect", halfLength, halfWidth },
    cost: 1,
  });
  const reachAlong = land.length / 2 + spec.runout + t;
  return [
    mk(land.length / 2, land.halfWidth + t / 2, reachAlong, t / 2), // left  (world +y)
    mk(land.length / 2, -land.halfWidth - t / 2, reachAlong, t / 2), // right (world -y)
  ];
}

/**
 * Derives a routed fairway corridor from the tee (sim origin) to
 * `greenCenter`, bending around `parcel.fixedRegions`, and returns a new
 * `Parcel` whose `corridor` is the derived one and whose `fixedRegions`
 * gains the four OB-frame bands (see module doc). Every other field of
 * `parcel` passes through unchanged. Throws if `parcel.landEnvelope` is
 * absent — derivation only makes sense for a land-mode parcel.
 */
export function deriveFairway(parcel: Parcel, greenCenter: Vec2, spec: FairwaySpec = {}): Parcel {
  const land = parcel.landEnvelope;
  if (!land) {
    throw new Error("deriveFairway(): parcel has no landEnvelope to route within");
  }
  const full: Required<FairwaySpec> = { ...DEFAULTS, ...spec };
  const fixedRegions = parcel.fixedRegions ?? [];

  const gw = Math.max(2, Math.round(land.length / CELL) + 1);
  const gh = Math.max(2, Math.round((2 * land.halfWidth) / CELL) + 1);
  const blocked = new Array<boolean>(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const p: Vec2 = { x: gx * CELL, y: -land.halfWidth + gy * CELL };
      const lie = hazardLieAt(fixedRegions, p);
      blocked[gy * gw + gx] = lie === "water" || lie === "deep";
    }
  }
  const clearanceField = distanceField(gw, gh, blocked);

  const centerline = deriveCenterline(land, greenCenter, fixedRegions, clearanceField, gw, gh);
  const corridor = buildStations(centerline, clearanceField, gw, gh, land, full);
  const bands = obBands(land, full);

  return {
    ...parcel,
    corridor,
    fixedRegions: [...fixedRegions, ...bands],
  };
}
