/**
 * Sim-facing types only. These are NOT the frozen design-serialization format
 * (that's a separate M0 deliverable owned by packages/schema, not yet built).
 * Shape here is deliberately minimal — just enough for grade() to run.
 *
 * Coordinate convention (decided, M0): tee at origin, green at +x. x = yards
 * down the fairway, y = lateral yards off centerline. Parcels are authored
 * and rendered portrait, bottom-to-top; rotation into this frame happens at
 * the render/schema boundary, never inside the sim.
 */

export type LieType =
  | "tee"
  | "fairway"
  | "green"
  | "rough"
  | "bunker"
  | "deep"
  | "water"
  | "ob";

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * A point-in-shape test in the sim's local (x=downrange, y=lateral) frame.
 * `polygon` points are authored at rot=0/scale=1 like the other two kinds,
 * implicitly closed (no repeated last point), in the winding order the
 * author wrote them — pointInPolygon (geom.ts) doesn't care about winding.
 */
export type RegionShape =
  | { kind: "circle"; radius: number }
  | { kind: "rect"; halfLength: number; halfWidth: number }
  | { kind: "polygon"; points: Vec2[] };

/**
 * One placed piece from the tray. `footprint` is the shape at rot=0/scale=1;
 * rot (degrees) and scale are applied about (x, y) when testing containment.
 * `cost` defaults to 1 and feeds the `used` budget metric.
 */
export interface Piece {
  shapeId: string;
  lieType: LieType;
  x: number;
  y: number;
  rot: number;
  scale: number;
  footprint: RegionShape;
  cost?: number;
}

/** Piecewise-linear elevation sample along the centerline. z is feet, +uphill. */
export interface ElevationSample {
  x: number;
  z: number;
}

/**
 * A localized bump (mound, height > 0) or dip (hollow/swale, height < 0)
 * layered on top of the centerline profile. Influence decays smoothly to
 * zero at `radius` yards from (x, y) — see `terrain.ts#elevationAt2D`. This
 * is what makes terrain genuinely 2D: the centerline profile alone can only
 * express "the hole climbs a hill," uniform across the whole corridor width;
 * features are how a mound near the green or a bump in the fairway can
 * actually redirect a ball sideways. Parcel-authored and fixed — never a
 * player-placed tray piece.
 */
export interface ElevationFeature {
  x: number;
  y: number;
  radius: number;
  height: number;
}

/**
 * One station along the corridor centerline: how far downrange (`x`), how
 * far the centerline itself has drifted laterally at that point (`cy` — 0
 * everywhere means a straight hole), and how wide the fairway/OB envelope
 * is there. Stations are linearly interpolated between, same convention as
 * `ElevationSample`. This is what makes a dogleg expressible: the centerline
 * itself bends, rather than staying pinned to y=0 for the whole hole.
 */
export interface CorridorStation {
  x: number;
  cy: number;
  halfWidth: number;
  obHalfWidth: number;
}

/**
 * A rectangular land envelope for a hole meant to be routed by
 * fairway.ts#deriveFairway rather than hand-authored: tee at the sim origin,
 * extending `length` yards downrange and `halfWidth` yards to each side.
 * Constant width — tapering is deferred (see fairway.ts's module doc).
 * `length`/`halfWidth` are frame-invariant magnitudes (not directions), same
 * as ElevationFeature's radius, so no rotation is needed crossing the
 * portrait/sim boundary in @redan/schema's toSim.ts.
 */
export interface LandEnvelope {
  length: number;
  halfWidth: number;
}

/**
 * Terrain + tee + par + wind envelope. Does NOT include the green — the
 * player places the green as a piece, same as hazards.
 */
export interface Parcel {
  id: string;
  par: number;
  /**
   * Present only on parcels meant to be routed by fairway.ts#deriveFairway
   * (land mode) rather than graded with a hand-authored `corridor` directly.
   * When present, `corridor` should still be a valid (if minimal) fallback —
   * see fairway.ts's module doc for why a land parcel's authored corridor is
   * deliberately all-rough, not all-fairway.
   */
  landEnvelope?: LandEnvelope;
  /**
   * The fairway/OB envelope as a sequence of stations along the hole,
   * tee-first. Must have >=2 stations and must extend (in arc-length) at
   * least as far as any placed piece, including the green — a piece beyond
   * the last station's arc-length resolves OB (see terrain.ts#lieAt), the
   * same authoring constraint the old scalar obHalfWidth implicitly had for
   * the lateral direction.
   */
  corridor: CorridorStation[];
  /**
   * Parcel-authored terrain (trees, native area, a stream) the player
   * cannot remove or place over — never a tray piece, never counted against
   * `pieceCap`. This is what makes a dogleg's inside corner a real decision
   * rather than decoration: without something fixed in the corner, a player
   * can just clear a lane straight through it.
   */
  fixedRegions?: Piece[];
  /** Total piece-cost budget available (`cap` in the star-3 "used < cap" gate). */
  pieceCap: number;
  /** Optional centerline elevation profile (the hole's overall grade). Flat (all z=0) if omitted. */
  elevationProfile?: ElevationSample[];
  /** Optional localized mounds/hollows layered on top of the centerline profile. */
  elevationFeatures?: ElevationFeature[];
}

export interface Wind {
  /** mph. Wired into flight.ts#resolveFlight; the yards-per-mph coefficients there are first-pass, uncalibrated. */
  speed: number;
  /** degrees, 0 = blowing from tee toward green (helping). */
  dirDeg: number;
}

/**
 * A golfer's id in the field roster (traits.ts). No longer a closed union of
 * four names — see traits.ts's module doc for why the fixed-archetype model
 * was replaced.
 */
export type GolferId = string;

/**
 * The flat base stat sheet every golfer in the field shares. All
 * differentiation between golfers comes from their two traits (traits.ts),
 * not from varying these — see traits.ts for why.
 */
export interface GolferStats {
  power: number;
  accuracy: number;
  recovery: number;
  touch: number;
}

/**
 * Which kind of shot a trait's multiplier applies to — the axis a trait's
 * cost and benefit must land on opposite sides of (traits.ts). `drive` = a
 * full-power tee shot or advance; `long` = a shot inside going-for-it range
 * but still a real swing; `short` = a green-attack or layup-precision shot;
 * `recovery` = any shot played from a non-fairway/tee lie.
 */
export type ShotContext = "drive" | "long" | "short" | "recovery";

/**
 * One trait's numeric effects, applied as a multiplier layer on top of
 * shotModel.ts's doc-calibrated formulas (never by editing those formulas
 * or the base GolferStats). See traits.ts's module doc for the design rule
 * this type exists to enforce: a trait's `Mul` fields close over 1.0 must
 * not all sit on the same ShotContext as its `Mul` fields under 1.0.
 */
export interface TraitEffects {
  /** Multiplies fullCarry's output, per shot context. */
  carryMul?: Partial<Record<ShotContext, number>>;
  /** Multiplies shotDispersion's lateralSigma, per shot context. */
  lateralMul?: Partial<Record<ShotContext, number>>;
  /** Multiplies shotDispersion's distanceSigma, per shot context. */
  distanceMul?: Partial<Record<ShotContext, number>>;
  /** Added directly into the recovery stat used by effectiveLieFactors — a trait-only recovery boost. */
  recoveryBonus?: number;
  /** Added directly into the touch value resolvePutts sees — a trait-only putting boost. */
  puttBonus?: number;
  /** Preferred curve direction this trait plays for free: -1 draws, 1 fades, 0 neither. */
  shapeBias?: -1 | 0 | 1;
  /** Lateral sigma multiplier (drive/long) applied when a route curves against shapeBias instead of with it. */
  shapeAgainstPenalty?: number;
  /** Tilts route search's objective off pure lowest-mean, toward accepting more variance for a lower floor/ceiling. Positive = more aggressive. */
  aggression?: number;
}

/** One entry in the field roster: an id, a display label, and exactly two traits (traits.ts). */
export interface Golfer {
  id: GolferId;
  label: string;
  traits: [string, string];
}

/** One shot in a played-out round, for the trace/visualization layer. */
export interface Shot {
  from: Vec2;
  to: Vec2;
  lieAfter: LieType;
  penaltyStrokes: number;
  /** A few sampled points along the curved flight path, tee-to-landing, for rendering the actual curve. */
  path?: Vec2[];
}

export interface ShotPath {
  golfer: GolferId;
  shots: Shot[];
  totalStrokes: number;
}

/**
 * The shot-shaping policy an archetype settled on after route search — its
 * aim, power, and spin, plus the higher-level go-for-it/lay-up strategy.
 * `laysUp` still picks the *target point* (unchanged reach/layup logic in
 * route.ts); `aimOffsetDeg`/`power`/`spin` are how the archetype tries to
 * execute toward that target, resolved into an actual curved flight by
 * `flight.ts#resolveFlight`.
 */
export interface Route {
  /** Aim angle (degrees) off the direct line to the target, positive = right. */
  aimOffsetDeg: number;
  /** Signed curve strength/direction: negative draws left, positive fades right. */
  spin: number;
  /** Swing power as a fraction of full carry, for shots that are neither an attack on the green nor a lay-up. */
  power: number;
  /** Whether this golfer lays up on approach when it can't comfortably reach. */
  laysUp: boolean;
  /**
   * On a bending corridor, whether an "advance the ball" shot (neither a
   * green attack nor a lay-up) follows the centerline's bend or cuts
   * straight at the green across whatever is in the way. Only searched when
   * the corridor actually bends (route.ts#corridorBends) — on a straight
   * hole the two are identical, so this costs nothing there.
   */
  aimLine: "corridor" | "green";
}

export interface GolferResult {
  mean: number;
  sd: number;
  route: Route;
}

export interface GradeMetrics {
  /** Field average score relative to nothing subtracted — raw mean strokes. */
  field: number;
  /** Spread between the best- and worst-performing golfer's mean score. */
  spread: number;
  /** Pooled noise level: average of each golfer's own score sd. */
  sd: number;
  /** Count of distinct routes among the field's chosen strategies. */
  routes: number;
  /**
   * How close the field's second-best mean is to its best — small means
   * several golfers are genuinely in contention, not just one winner and a
   * pack of also-rans. New in the trait rework (traits.ts's module doc):
   * with `spread` mechanically widening once the field grew past four
   * golfers, `contested` is what actually answers "is more than one kind of
   * player rewarded here."
   */
  contested: number;
  used: number;
  cap: number;
  parOK: boolean;
}

export interface GradeResult {
  golfers: Record<GolferId, GolferResult>;
  metrics: GradeMetrics;
  traces: ShotPath[];
  simVersion: string;
}
