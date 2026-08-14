import type { Parcel, Piece } from "../../src/types.js";

/**
 * Green is offset well off the tee-to-origin line, and a deep-rough patch
 * sits on the direct line to it — the only way to a good score is aiming
 * around the obstacle. Exercises the lateral aim-bias route search.
 */
export const parcel: Parcel = {
  id: "fixture-dogleg",
  par: 4,
  corridorHalfWidth: 22,
  obHalfWidth: 50,
  pieceCap: 3,
};

export const pieces: Piece[] = [
  {
    shapeId: "green-round",
    lieType: "green",
    x: 360,
    y: 50,
    rot: 0,
    scale: 1,
    footprint: { kind: "circle", radius: 11 },
  },
  {
    shapeId: "deep-patch",
    lieType: "deep",
    x: 190,
    y: 15,
    rot: 0,
    scale: 1,
    footprint: { kind: "rect", halfLength: 40, halfWidth: 20 },
  },
];
