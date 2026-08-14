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
  /** Optional centerline elevation profile. Flat (all z=0) if omitted. */
  elevationProfile?: ElevationSample[];
}

export interface Wind {
  /** yards/hour-equivalent magnitude; contract placeholder, not yet wired into the shot model. */
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
}

export interface ShotPath {
  archetype: ArchetypeName;
  shots: Shot[];
  totalStrokes: number;
}

/** The aim strategy an archetype settled on after route search. */
export interface Route {
  /** Lateral aim bias as a fraction of corridor half-width, in [-1, 1]. */
  aimBias: number;
  /** Whether this archetype lays up on approach when it can't comfortably reach. */
  laysUp: boolean;
  /** Swing effort as a fraction of full carry, for shots that are neither an attack on the green nor a lay-up. */
  swingEffort: number;
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
