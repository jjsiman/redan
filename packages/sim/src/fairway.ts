import type { CorridorStation, LandEnvelope, LieType, Parcel, Piece, Vec2 } from "./types.js";
import { LAND_FRINGE_YARDS, pieceContainsPoint } from "./terrain.js";
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
 * - The derived corridor's `obHalfWidth` is a large sentinel and, for a
 *   land-mode parcel, inert: `lieAt`'s land-mode branch (`terrain.ts`)
 *   doesn't consult per-station `obHalfWidth` at all — a fixed band
 *   `[-W, W]` can't hold still once the centerline itself bends to route
 *   around a hazard (matching it forces the drift to be zero). Instead the
 *   land boundary is a fixed, envelope-relative rectangle test in `lieAt`
 *   itself, invariant under whatever centerline the router produces. The
 *   boundary ring just inside it is filled with fixed `deep`-lie fringe
 *   regions (`fringeBands`) — playable rough/scrub/treeline, not a hard
 *   wall — and true unplayable OB only starts `LAND_FRINGE_YARDS` past the
 *   authored rectangle, outside the renderer's visible frame (`apps/web`'s
 *   matching `MARGIN_YARDS`). See terrain.ts#lieAt's land-mode doc for the
 *   concrete reason this moved out of a `fixedRegions` piece: an `ob`-lie
 *   piece can only ever ADD area, but the old design's real bug was that
 *   `lieAt`'s arc-length "beyond" check resolved a bent corridor's own
 *   endpoint direction as OB well inside the rectangle near a corner-placed
 *   green — no piece placement could have fixed that; it needed `lieAt`'s
 *   OB test to stop depending on the corridor's own (bendable) direction.
 * - The corridor extends `runout` yards behind the tee, but only as a
 *   zero-width stub — its sole job is to anchor `route.ts`'s
 *   `projectToPolyline` arc-length origin the same place it's always been,
 *   not to be mown. The green end is deliberately NOT `runout` past the
 *   green: it used to taper linearly from the green's width to 0 over 40
 *   yards, which reads as a triangular spike, not an apron (a past bug
 *   report). It now ends in a semicircular cap (`CAP_PROFILE`) reaching
 *   `greenRadius + greenApron` past the green. Either way, land mode's
 *   `lieAt` branch resolves anything past the corridor's own arc-length
 *   extent as plain `rough` (not OB) as long as it's still on the authored
 *   land — so a corridor ending exactly at the cap resolves a few yards of
 *   harmless roll-out as rough, never OB. `pointAtStation` (geom.ts)
 *   extrapolates rather than clamps past a polyline's last segment, so
 *   `route.ts`'s corridor-aim `pointAtStation(points, proj.s + targetDist)`
 *   still resolves a sane heading for an advance shot that overshoots the
 *   cap.
 * - The corridor also leaves un-mown ground in front of the tee before a
 *   rounded leading edge brings the fairway up to full width — mirroring
 *   the green end's cap. How much ground depends on hole type
 *   (`FairwaySpec`'s `teeGapLong`/`teeGapPar3` docs): a par 4/5 measures the
 *   gap forward from the tee (a real drive crosses a stretch of native
 *   ground before reaching fairway); a par 3 measures it backward from the
 *   green instead (a short hole is typically carried almost entirely over
 *   rough straight at the green, with just a mown apron in front of it, not
 *   a full-length strip). `deriveFairway` additionally appends a small
 *   `tee`-lie piece at the origin so the tee box itself renders distinctly;
 *   `tee` and `fairway` share identical lie factors (terrain.ts's
 *   `LIE_FACTORS`), so this has no scoring effect — `route.ts` already
 *   hardcodes the first shot's lie as `"tee"` and never queries `lieAt` at
 *   the origin.
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
  /** Radius (yards) of the fairway's rounded leading edge, at the tee end — see `teeGap`. Default 16. */
  teeHalfWidth?: number;
  /** Yards of standoff a fairway edge tries to keep from a hazard boundary. Default 6. */
  hazardClearance?: number;
  /** Yards between emitted interior stations. Default 40. */
  stationSpacing?: number;
  /** Yards the corridor's zero-width stub extends behind the tee, purely to anchor route.ts's arc-length origin. Default 40. */
  runout?: number;
  /** Assumed green radius (yards) for sizing the rounded cap past the green. Default 15. */
  greenRadius?: number;
  /**
   * Yards in front of the tee the fairway's leading edge starts, on a par 4
   * or 5 — a real tee shot on a longer hole crosses a stretch of native
   * ground before it reaches mown fairway; a fixed small gap (an earlier
   * version of this used 30) read as wall-to-wall fairway on anything but
   * the shortest holes. Eyeballed for visual plausibility, not calibrated
   * against a real hole. Default 100.
   */
  teeGapLong?: number;
  /**
   * Yards SHORT OF THE GREEN (not of the tee) the fairway's leading edge
   * sits, on a par 3. A short hole is typically played almost entirely
   * over rough/native ground straight at the green — there's rarely a
   * full-length fairway strip, just a mown apron near the green itself —
   * so par 3s size their gap backward from the green rather than forward
   * from the tee (see `buildStations`). Eyeballed. Default 50.
   */
  teeGapPar3?: number;
  /** Yards past `greenRadius` the rounded end-of-fairway cap reaches. Default 8. */
  greenApron?: number;
}

const DEFAULTS: Required<FairwaySpec> = {
  baseHalfWidth: 22,
  minHalfWidth: 9,
  teeHalfWidth: 16,
  hazardClearance: 6,
  stationSpacing: 40,
  runout: 40,
  greenRadius: 15,
  teeGapLong: 100,
  teeGapPar3: 50,
  greenApron: 8,
};

/**
 * Half-circle profile as (distance/R, halfWidth/R), used to round off both
 * ends of the fairway instead of tapering linearly to a point. 6 stations is
 * smooth enough at the renderer's 2-yard tiles, and `widthAt`'s linear
 * interpolation between them never reintroduces a straight-line taper to a
 * point the way a single zero-width station at the far end used to (the
 * "fairway comes to a point behind the green" bug report this fixes).
 */
const CAP_PROFILE: [number, number][] = [
  [0, 1],
  [0.35, 0.937],
  [0.6, 0.8],
  [0.8, 0.6],
  [0.92, 0.392],
  [1, 0],
];

/** Grid resolution for the clearance field — matches the doc's 8-yard rendering cell. */
const CELL = 8;
/** Sentinel `obHalfWidth` for a derived corridor: land mode's `lieAt` branch ignores it entirely, but `CorridorStation` still requires a value. */
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

/**
 * Builds (arc-length, half-width) pairs for one rounded cap, anchored at
 * `anchor` — the point of FULL width `radius` — and tapering to 0 width at
 * `anchor + dir * radius`. `dir = +1` tapers going forward in arc-length
 * (the green end: full `capR` AT the green, narrowing past it); `dir = -1`
 * tapers going backward (the tee end: full `lead` at the leading edge,
 * narrowing back toward the tee gap). Always returns pairs sorted by
 * increasing arc-length, regardless of `dir`, so callers can push them
 * straight into a station list without re-sorting.
 */
function capStations(anchor: number, radius: number, dir: 1 | -1): [number, number][] {
  const pairs: [number, number][] = CAP_PROFILE.map(([f, w]) => [anchor + dir * radius * f, radius * w]);
  return dir === 1 ? pairs : pairs.reverse();
}

function buildStations(
  centerline: Vec2[],
  clearanceField: Float64Array,
  gw: number,
  gh: number,
  land: LandEnvelope,
  par: number,
  spec: Required<FairwaySpec>,
): CorridorStation[] {
  const total = polylineLength(centerline);
  const capR = spec.greenRadius + spec.greenApron;

  // Where the fairway's leading edge starts is measured differently by hole
  // type (see FairwaySpec's `teeGapLong`/`teeGapPar3` docs): forward from
  // the tee on a par 4/5, backward from the green on a par 3. Either way,
  // clamp the result to the hole's own length so a short hole (or a green
  // dragged close to the tee) can't produce a gap that overruns the green's
  // own cap — see fairway.ts's module doc for why this matters (a 194-yard
  // hole bending too sharply was a past real bug from an unclamped absolute
  // offset).
  const rawGap = par === 3 ? total - spec.teeGapPar3 : spec.teeGapLong;
  const gap = clampNum(rawGap, 15, Math.max(15, total - capR - 10));
  const lead = Math.min(spec.teeHalfWidth, Math.max(4, (total - gap - capR) * 0.5));

  // (arc-length, halfWidth) pairs, built in increasing-s order:
  //  - a zero-width stub at -runout, purely to anchor route.ts's
  //    projectToPolyline arc-length origin at the same point it always was;
  //  - the tee-side cap: 0 at `gap` (the leading edge), full width `lead`
  //    at `gap + lead`;
  //  - interior stations on the clearance field, exactly as before;
  //  - the green-side cap: full width `capR` AT the green (total),
  //    narrowing to 0 by `total + capR` — a semicircular apron instead of
  //    the old linear taper to a point 40 yards downrange.
  const pairs: [number, number][] = [];
  pairs.push([-spec.runout, 0]);
  for (const [s, w] of capStations(gap + lead, lead, -1)) pairs.push([s, w]);

  let s = gap + lead + spec.stationSpacing;
  while (s < total - spec.stationSpacing * 0.5) {
    const p = pointAtStation(centerline, s);
    const clr = sampleField(clearanceField, gw, gh, land.halfWidth, p);
    const halfWidth = clampNum(
      Math.min(spec.baseHalfWidth, clr - spec.hazardClearance),
      spec.minHalfWidth,
      spec.baseHalfWidth,
    );
    pairs.push([s, halfWidth]);
    s += spec.stationSpacing;
  }

  for (const [sAt, w] of capStations(total, capR, 1)) pairs.push([sAt, w]);

  // Degenerate-input guard: on a very short hole the tee cap and green cap
  // can overlap in theory even after the clamps above (e.g. a green dragged
  // to the minimum GREEN_MARGIN from the tee). Keep the list strictly
  // increasing in arc-length — widthAt/polylineLength/pointAtStation all
  // assume that — by dropping any pair that doesn't advance past the last
  // one kept.
  const kept: [number, number][] = [];
  for (const pair of pairs) {
    const prev = kept[kept.length - 1];
    if (!prev || pair[0] > prev[0] + 1e-6) kept.push(pair);
  }

  return kept.map(([sAt, halfWidth]) => {
    const p = pointAtStation(centerline, sAt);
    return { x: p.x, cy: p.y, halfWidth, obHalfWidth: OB_SENTINEL };
  });
}

/**
 * Two fixed `deep`-lie rectangles running the LATERAL boundary of the
 * authored land rectangle — a natural rough/scrub/treeline fringe, not a
 * wall. `lieAt`'s land-mode rectangle test (terrain.ts) is what actually
 * enforces the OB boundary now (at `LAND_FRINGE_YARDS` past the land
 * envelope); this band exists purely so the ring just inside that boundary
 * reads and plays as rough natural terrain instead of falling through to
 * plain rough by default. See the module doc for why this replaced the old
 * `ob`-lie band entirely.
 *
 * Only lateral, deliberately — same reasoning the old `ob`-lie version
 * documented: a longitudinal band whose near edge sits at the land boundary
 * (x=0 or x=length) would have its footprint's inclusive `<=` containment
 * touch the tee itself. That mattered when this band was `ob`-lie (it would
 * have resolved the tee OB); it's lower-stakes now (worst case, the tee
 * reads as `deep` instead of falling through to `fairway`), but there's no
 * reason to risk it when the fore/aft boundary doesn't need a fringe piece
 * to be safe: `lieAt`'s rectangle test enforces real OB there directly, and
 * anything short of that resolves harmless `rough`.
 */
function fringeBands(land: LandEnvelope, spec: Required<FairwaySpec>): Piece[] {
  const t = LAND_FRINGE_YARDS;
  const mk = (x: number, y: number, halfLength: number, halfWidth: number): Piece => ({
    shapeId: "natural-fringe",
    lieType: "deep",
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
 * A small fixed `tee`-lie rectangle at the sim origin, purely so the tee box
 * renders as distinct mown ground rather than the natural terrain that now
 * sits in front of it (see module doc's `teeGap`). Sim frame: `halfLength`
 * runs along the hole (x), `halfWidth` across it (y) — 8 x 18 yards, small
 * enough that a green dragged to `editor/land.ts`'s minimum `GREEN_MARGIN`
 * (20 yd from the land boundary, not the tee) can't meaningfully reach it.
 * Has no effect on grading: `route.ts` hardcodes the first shot's lie as
 * `"tee"` rather than querying `lieAt` at the origin, and `tee`/`fairway`
 * share identical lie factors (terrain.ts's `LIE_FACTORS`).
 */
function teeBoxPiece(): Piece {
  return {
    shapeId: "tee-box",
    lieType: "tee",
    x: 0,
    y: 0,
    rot: 0,
    scale: 1,
    footprint: { kind: "rect", halfLength: 4, halfWidth: 9 },
    cost: 1,
  };
}

/**
 * Derives a routed fairway corridor from the tee (sim origin) to
 * `greenCenter`, bending around `parcel.fixedRegions`, and returns a new
 * `Parcel` whose `corridor` is the derived one and whose `fixedRegions`
 * gains the two lateral fringe bands plus a tee box (see module doc) — the
 * actual OB boundary is enforced by `lieAt` itself against
 * `parcel.landEnvelope` (which passes through unchanged here), not by a
 * fixed region. Every other field of `parcel` passes through unchanged.
 * Throws if `parcel.landEnvelope` is absent — derivation only makes sense
 * for a land-mode parcel.
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
  const corridor = buildStations(centerline, clearanceField, gw, gh, land, parcel.par, full);
  const bands = fringeBands(land, full);

  return {
    ...parcel,
    corridor,
    fixedRegions: [...fixedRegions, ...bands, teeBoxPiece()],
  };
}
