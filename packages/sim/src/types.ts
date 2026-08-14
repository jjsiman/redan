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

/** A point-in-shape test in the sim's local (x=downrange, y=lateral) frame. */
export type RegionShape =
  | { kind: "circle"; radius: number }
  | { kind: "rect"; halfLength: number; halfWidth: number };

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
 * Terrain + tee + par + wind envelope. Does NOT include the green — the
 * player places the green as a piece, same as hazards.
 */
export interface Parcel {
  id: string;
  par: number;
  /** Corridor half-width in yards; fairway/first-cut envelope around y=0. */
  corridorHalfWidth: number;
  /** Beyond this half-width from centerline is out of bounds. */
  obHalfWidth: number;
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

export type ArchetypeName = "BOMBER" | "STRAIGHT" | "SCRAMBLER" | "TOUCH";

export interface ArchetypeStats {
  power: number;
  accuracy: number;
  recovery: number;
  touch: number;
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
  archetype: ArchetypeName;
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
  /** Whether this archetype lays up on approach when it can't comfortably reach. */
  laysUp: boolean;
}

export interface ArchetypeResult {
  mean: number;
  sd: number;
  route: Route;
}

export interface GradeMetrics {
  /** Field average score relative to nothing subtracted — raw mean strokes. */
  field: number;
  /** Spread between the best- and worst-performing archetype's mean score. */
  spread: number;
  /** Pooled noise level: average of each archetype's own score sd. */
  sd: number;
  /** Count of distinct routes among the four archetypes' chosen strategies. */
  routes: number;
  used: number;
  cap: number;
  parOK: boolean;
}

export interface GradeResult {
  archetypes: Record<ArchetypeName, ArchetypeResult>;
  metrics: GradeMetrics;
  traces: ShotPath[];
  simVersion: string;
}
