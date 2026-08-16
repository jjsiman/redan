import type { CorridorStation as SimCorridorStation, Parcel as SimParcel, Piece as SimPiece } from "@redan/sim";
import type { Design, Parcel, PlacedShape, PortraitCorridorStation, PortraitVec2 } from "./types.js";
import { resolveShape } from "./shapes.js";

/**
 * The only place portrait <-> sim rotation happens (doc 4.1's portability
 * rule: "never inside the sim"). Portrait: x = lateral, y = distance from
 * tee. Sim: x = distance from tee, y = lateral. That's a 90-degree axis
 * swap, and it's deliberately implemented as a proper rotation (determinant
 * +1) rather than a reflection, so it doesn't mirror the layout:
 *
 *   simX =  portraitY
 *   simY = -portraitX
 *
 * Piece rotation follows the same turn: rot is measured against each
 * frame's own x-axis, so crossing frames subtracts the same 90 degrees.
 */
export function toSimPoint(p: PortraitVec2): PortraitVec2 {
  return { x: p.y, y: -p.x };
}

export function toSimRot(portraitRotDeg: number): number {
  return portraitRotDeg - 90;
}

/**
 * Inverse of `toSimPoint` — brings a sim-frame point (e.g. a derived
 * fairway's corridor station, or a shot path point) back to portrait for
 * rendering. This had been reimplemented ad hoc in two render call sites
 * (`apps/web`'s and `packages/content`'s drawing code); giving it one home
 * here, next to `toSimPoint`, is what "the only place portrait <-> sim
 * rotation happens" is supposed to mean.
 */
export function toPortraitPoint(p: PortraitVec2): PortraitVec2 {
  return { x: -p.y, y: p.x };
}

export function toPortraitRot(simRotDeg: number): number {
  return simRotDeg + 90;
}

/** Inverse of `toSimCorridorStation` below — see its doc for the frame mapping this mirrors. */
export function toPortraitCorridorStation(s: SimCorridorStation): PortraitCorridorStation {
  const p = toPortraitPoint({ x: s.x, y: s.cy });
  return { y: p.y, cx: p.x, halfWidth: s.halfWidth, obHalfWidth: s.obHalfWidth };
}

export interface SimInputs {
  parcel: SimParcel;
  pieces: SimPiece[];
}

/**
 * Rotates a corridor station's lateral drift the same way toSimPoint does —
 * treating (cx, y) as a portrait point and reading back sim x/cy from it —
 * so the corridor bends consistently with everything else that crosses this
 * boundary. Half-widths are frame-invariant (distances, not directions).
 */
function toSimCorridorStation(s: PortraitCorridorStation): SimCorridorStation {
  const p = toSimPoint({ x: s.cx, y: s.y });
  return { x: p.x, cy: p.y, halfWidth: s.halfWidth, obHalfWidth: s.obHalfWidth };
}

function placedShapeToSimPiece(placed: PlacedShape): SimPiece {
  const def = resolveShape(placed.shapeId);
  const { x, y } = toSimPoint(placed);
  return {
    shapeId: placed.shapeId,
    lieType: def.lieType,
    x,
    y,
    rot: toSimRot(placed.rot),
    scale: placed.scale,
    footprint: def.footprint,
    cost: def.cost,
  };
}

/**
 * Converts a portrait-frame Parcel + Design into @redan/sim's grade() inputs.
 * Throws on a parcelId mismatch or an unrecognized shapeId — both are
 * programming/data-integrity errors, not something a caller should have to
 * branch on at grade-time. For user-facing validation before that point
 * (e.g. an editor checking tray limits), see validateDesign in validate.ts.
 */
export function toSimInputs(parcel: Parcel, design: Design): SimInputs {
  if (design.parcelId !== parcel.id) {
    throw new Error(
      `Design targets parcel "${design.parcelId}" but was passed parcel "${parcel.id}"`,
    );
  }

  const elevationProfile = parcel.elevationProfile?.map((s) => ({ x: s.y, z: s.z }));
  // radius/height are frame-invariant (a distance and a height, not a
  // direction) — only the center point crosses the portrait/sim rotation.
  const elevationFeatures = parcel.elevationFeatures?.map((f) => ({
    ...toSimPoint(f),
    radius: f.radius,
    height: f.height,
  }));

  const fixedRegions = parcel.fixedRegions?.map(placedShapeToSimPiece);
  // length/halfWidth are frame-invariant magnitudes, same as elevation
  // features' radius above — passed through unrotated.
  const landEnvelope = parcel.landEnvelope
    ? { length: parcel.landEnvelope.length, halfWidth: parcel.landEnvelope.halfWidth }
    : undefined;

  return {
    parcel: {
      id: parcel.id,
      par: parcel.par,
      corridor: parcel.corridor.map(toSimCorridorStation),
      pieceCap: parcel.pieceCap,
      // exactOptionalPropertyTypes: only set the key when there's a value —
      // an explicit `elevationProfile: undefined` is a type error, not a no-op.
      ...(fixedRegions ? { fixedRegions } : {}),
      ...(elevationProfile ? { elevationProfile } : {}),
      ...(elevationFeatures ? { elevationFeatures } : {}),
      ...(landEnvelope ? { landEnvelope } : {}),
    },
    pieces: design.pieces.map(placedShapeToSimPiece),
  };
}
