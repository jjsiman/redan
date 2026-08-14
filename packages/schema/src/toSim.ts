import type { Parcel as SimParcel, Piece as SimPiece } from "@redan/sim";
import type { Design, Parcel, PlacedShape, PortraitVec2 } from "./types.js";
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

export interface SimInputs {
  parcel: SimParcel;
  pieces: SimPiece[];
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

  return {
    parcel: {
      id: parcel.id,
      par: parcel.par,
      corridorHalfWidth: parcel.corridorHalfWidth,
      obHalfWidth: parcel.obHalfWidth,
      pieceCap: parcel.pieceCap,
      // exactOptionalPropertyTypes: only set the key when there's a value —
      // an explicit `elevationProfile: undefined` is a type error, not a no-op.
      ...(elevationProfile ? { elevationProfile } : {}),
      ...(elevationFeatures ? { elevationFeatures } : {}),
    },
    pieces: design.pieces.map(placedShapeToSimPiece),
  };
}
