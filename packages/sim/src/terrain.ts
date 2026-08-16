import type {
  CorridorStation,
  ElevationFeature,
  ElevationSample,
  LieType,
  Parcel,
  Piece,
  RegionShape,
  Vec2,
} from "./types.js";
import { pointInPolygon, projectToPolyline, polylineLength, type PolylineProjection } from "./geom.js";

export interface LieFactors {
  distanceFactor: number;
  dispersionFactor: number;
}

/**
 * Calibrated lie factors (doc 4.3). `tee` and `fairway` behave identically —
 * both are the 1.00/1.00 baseline the other lies are penalized against.
 */
const LIE_FACTORS: Record<LieType, LieFactors> = {
  tee: { distanceFactor: 1.0, dispersionFactor: 1.0 },
  fairway: { distanceFactor: 1.0, dispersionFactor: 1.0 },
  green: { distanceFactor: 1.0, dispersionFactor: 1.0 },
  rough: { distanceFactor: 0.8, dispersionFactor: 1.52 },
  bunker: { distanceFactor: 0.64, dispersionFactor: 1.9 },
  deep: { distanceFactor: 0.52, dispersionFactor: 2.6 },
  water: { distanceFactor: 1.0, dispersionFactor: 1.0 },
  ob: { distanceFactor: 1.0, dispersionFactor: 1.0 },
};

export function lieFactors(lie: LieType): LieFactors {
  return LIE_FACTORS[lie];
}

/**
 * Point-in-shape test, applying the piece's rot (degrees) and scale about
 * (x, y). Exported (not just `lieAt`-internal) because fairway.ts needs the
 * same containment test to cost hazards *before* a corridor/TerrainQuery
 * exists to query lieAt against — one implementation, not two.
 */
export function pieceContainsPoint(piece: Piece, p: Vec2): boolean {
  const rad = (-piece.rot * Math.PI) / 180;
  const dx = p.x - piece.x;
  const dy = p.y - piece.y;
  const lx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / piece.scale;
  const ly = (dx * Math.sin(rad) + dy * Math.cos(rad)) / piece.scale;
  const shape: RegionShape = piece.footprint;
  if (shape.kind === "circle") {
    return lx * lx + ly * ly <= shape.radius * shape.radius;
  }
  if (shape.kind === "rect") {
    return Math.abs(lx) <= shape.halfLength && Math.abs(ly) <= shape.halfWidth;
  }
  return pointInPolygon(shape.points, { x: lx, y: ly });
}

/**
 * The corridor centerline compiled to a polyline plus per-station widths,
 * once per `grade()` call rather than once per lie query — lie queries run
 * tens of thousands of times per hole.
 */
export interface CompiledCorridor {
  points: Vec2[];
  halfWidths: number[];
  obHalfWidths: number[];
  length: number;
}

export function compileCorridor(corridor: CorridorStation[]): CompiledCorridor {
  const points = corridor.map((s) => ({ x: s.x, y: s.cy }));
  return {
    points,
    halfWidths: corridor.map((s) => s.halfWidth),
    obHalfWidths: corridor.map((s) => s.obHalfWidth),
    length: polylineLength(points),
  };
}

/** Migration/authoring helper: a straight, unbending corridor of the given length. */
export function straightCorridor(length: number, halfWidth: number, obHalfWidth: number): CorridorStation[] {
  return [
    { x: 0, cy: 0, halfWidth, obHalfWidth },
    { x: length, cy: 0, halfWidth, obHalfWidth },
  ];
}

/** True if any station drifts more than 5 yards off centerline — the gate for searching route.ts's aimLine dimension. */
export function corridorBends(corridor: CorridorStation[]): boolean {
  return corridor.some((s) => Math.abs(s.cy) > 5);
}

function widthAt(widths: number[], segIndex: number, t: number): number {
  const a = widths[segIndex] ?? 0;
  const b = widths[Math.min(segIndex + 1, widths.length - 1)] ?? a;
  const tc = Math.max(0, Math.min(1, t));
  return a + (b - a) * tc;
}

export interface TerrainQuery {
  corridor: CompiledCorridor;
  pieces: Piece[];
}

/**
 * Builds the exact `TerrainQuery` a graded round is played against: the
 * compiled corridor, plus the player's own pieces with `parcel.fixedRegions`
 * appended *after* them so fixed (parcel-authored) terrain always wins an
 * overlap — a player cannot pave over the trees in a dogleg's corner just by
 * placing something on top. `grade()` and any renderer that wants "what you
 * see is what's simulated" (rasterizing via `lieAt`) must both go through
 * this function rather than each assembling the pieces array by hand — two
 * independent assemblies are two chances to drift out of sync on ordering.
 */
export function compileTerrain(parcel: Parcel, pieces: Piece[]): TerrainQuery {
  return {
    corridor: compileCorridor(parcel.corridor),
    pieces: [...pieces, ...(parcel.fixedRegions ?? [])],
  };
}

/**
 * Resolves the lie at a point: past the corridor's arc-length extent is OB
 * first (this also fixes a bug the old scalar-corridor model had — a ball
 * far downrange of the green used to still resolve "fairway" since only
 * `|y|` was ever checked), then lateral OB, then pieces in placement order
 * (later pieces override earlier ones), then the fairway corridor, then
 * rough.
 */
export function lieAt(terrain: TerrainQuery, p: Vec2): LieType {
  const proj: PolylineProjection = projectToPolyline(terrain.corridor.points, p);
  if (proj.beyond) return "ob";

  const obHalf = widthAt(terrain.corridor.obHalfWidths, proj.segIndex, proj.t);
  if (Math.abs(proj.offset) > obHalf) return "ob";

  let resolved: LieType | null = null;
  for (const piece of terrain.pieces) {
    if (pieceContainsPoint(piece, p)) resolved = piece.lieType;
  }
  if (resolved) return resolved;

  const fairwayHalf = widthAt(terrain.corridor.halfWidths, proj.segIndex, proj.t);
  return Math.abs(proj.offset) <= fairwayHalf ? "fairway" : "rough";
}

/** Finds the green piece a design must include. Returns the first if several were placed. */
export function findGreen(pieces: Piece[]): Piece | undefined {
  return pieces.find((p) => p.lieType === "green");
}

/** Piecewise-linear interpolation of the centerline elevation profile. Flat (0) if none given. */
export function elevationAt(profile: ElevationSample[] | undefined, x: number): number {
  if (!profile || profile.length === 0) return 0;
  if (profile.length === 1) return profile[0]!.z;

  const sorted = profile;
  if (x <= sorted[0]!.x) return sorted[0]!.z;
  const last = sorted[sorted.length - 1]!;
  if (x >= last.x) return last.z;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (x >= a.x && x <= b.x) {
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.z + t * (b.z - a.z);
    }
  }
  return last.z;
}

/**
 * Smooth falloff (cosine ease, 1 at the feature's own center down to 0 at
 * its radius) so a mound has no seam where its influence ends. Uncalibrated
 * — see the module doc comment above.
 */
function featureHeightAt(feature: ElevationFeature, x: number, y: number): number {
  const d = Math.hypot(x - feature.x, y - feature.y);
  if (d >= feature.radius) return 0;
  const t = d / feature.radius;
  const shape = (1 + Math.cos(Math.PI * t)) / 2;
  return feature.height * shape;
}

/**
 * Full 2D elevation (feet) at a point: the centerline profile (the hole's
 * overall grade, uniform across width) plus every localized mound/hollow
 * feature summed on top. This is the terrain's actual height function —
 * `elevationAt` above is only its 1D slice along y=0.
 */
export function elevationAt2D(parcel: Parcel, x: number, y: number): number {
  let z = elevationAt(parcel.elevationProfile, x);
  if (parcel.elevationFeatures) {
    for (const feature of parcel.elevationFeatures) {
      z += featureHeightAt(feature, x, y);
    }
  }
  return z;
}

const GRADIENT_EPSILON = 1;

/**
 * Numeric gradient (feet per yard) of `elevationAt2D` at (x, y), via central
 * differences. Points uphill — toward higher ground. Cheap: a handful of
 * feature evaluations, not a stored grid.
 */
export function gradientAt(parcel: Parcel, x: number, y: number): Vec2 {
  const e = GRADIENT_EPSILON;
  const dzdx =
    (elevationAt2D(parcel, x + e, y) - elevationAt2D(parcel, x - e, y)) / (2 * e);
  const dzdy =
    (elevationAt2D(parcel, x, y + e) - elevationAt2D(parcel, x, y - e)) / (2 * e);
  return { x: dzdx, y: dzdy };
}

/**
 * "Plays like" distance adjustment (yards) for a shot climbing/descending
 * from `from` to `to`. Uphill costs extra effective carry, downhill gives
 * some back — the classic ~1 yard of "plays like" per 3 feet of rise/fall
 * rule of thumb. This coefficient is a placeholder: elevation "re-opens
 * every coefficient" per the project doc, and hasn't been checked against a
 * real validation hole yet.
 */
const ELEVATION_YARDS_PER_FOOT = 1 / 3;

export function playsLikeDelta(parcel: Parcel, from: Vec2, to: Vec2): number {
  const rise = elevationAt2D(parcel, to.x, to.y) - elevationAt2D(parcel, from.x, from.y);
  return rise * ELEVATION_YARDS_PER_FOOT;
}

/**
 * Base roll (yards) once a shot's carry lands, before slope adjusts it —
 * `flight.ts#resolveRoll` scales this by the local slope along/across the
 * shot's travel direction. Firm, mown lies (tee/fairway) roll the most;
 * hazards and the green (absorbed into the putting model) don't roll at
 * all. Uncalibrated — no real-hole check yet, same as every other new
 * coefficient in this pass.
 */
export const ROLL_FACTORS: Record<LieType, number> = {
  tee: 8,
  fairway: 8,
  rough: 3,
  deep: 1,
  bunker: 0,
  green: 0,
  water: 0,
  ob: 0,
};
