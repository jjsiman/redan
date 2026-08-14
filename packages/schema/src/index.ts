export { SCHEMA_VERSION } from "./version.js";
export { SHAPE_TABLE, resolveShape } from "./shapes.js";
export type { ShapeDef } from "./shapes.js";
export { toSimInputs, toSimPoint, toSimRot } from "./toSim.js";
export type { SimInputs } from "./toSim.js";
export { validateDesign } from "./validate.js";
export type { ValidationResult } from "./validate.js";
export type {
  Design,
  ElevationFeature,
  Parcel,
  PlacedShape,
  PortraitVec2,
  RegionShape,
  TrayEntry,
} from "./types.js";
