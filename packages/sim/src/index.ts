export { grade } from "./grade.js";
export { createRng, randNormal, randNormalMV } from "./rng.js";
export type { Rng } from "./rng.js";
export { ROSTER, ROSTER_IDS, TRAIT_TABLE, BASE_STATS, FIELD_SKILL, resolveTraits } from "./traits.js";
export { SIM_VERSION } from "./version.js";
export {
  fullCarry,
  shotDispersion,
  effectiveLieFactors,
  effectiveRecovery,
  effectiveTouch,
  layupTarget,
  resolvePutts,
} from "./shotModel.js";
export {
  lieAt,
  lieFactors,
  findGreen,
  compileCorridor,
  compileTerrain,
  pieceContainsPoint,
  straightCorridor,
  corridorBends,
  elevationAt,
  elevationAt2D,
  gradientAt,
  playsLikeDelta,
  ROLL_FACTORS,
  LAND_FRINGE_YARDS,
} from "./terrain.js";
export type { CompiledCorridor, TerrainQuery } from "./terrain.js";
export { deriveFairway } from "./fairway.js";
export type { FairwaySpec } from "./fairway.js";
export { resolveFlight, resolveRoll } from "./flight.js";
export type { FlightResult } from "./flight.js";
export {
  pointInPolygon,
  polygonAabb,
  aabbContains,
  polylineLength,
  projectToPolyline,
  pointAtStation,
  offsetPolyline,
} from "./geom.js";
export type { Aabb, PolylineProjection } from "./geom.js";
export { searchRoute } from "./route.js";
export type { RoundResult, RouteSearchResult } from "./route.js";
export { describeVerdict, describeResultFromGolfers } from "./verdict.js";
export type { Verdict } from "./verdict.js";

export type {
  CorridorStation,
  ElevationFeature,
  ElevationSample,
  Golfer,
  GolferId,
  GolferResult,
  GolferStats,
  GradeMetrics,
  GradeResult,
  LandEnvelope,
  LieType,
  Parcel,
  Piece,
  RegionShape,
  Route,
  Shot,
  ShotContext,
  ShotPath,
  TraitEffects,
  Vec2,
  Wind,
} from "./types.js";
