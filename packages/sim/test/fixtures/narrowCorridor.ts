import type { Parcel, Piece } from "../../src/types.js";

/**
 * Moderate length (360 yards) but a tight corridor with OB close on both
 * sides — dispersion gets punished hard. Accuracy should beat power here.
 */
export const parcel: Parcel = {
  id: "fixture-narrow-corridor",
  par: 4,
  corridorHalfWidth: 11,
  obHalfWidth: 16,
  pieceCap: 3,
};

export const pieces: Piece[] = [
  {
    shapeId: "green-round",
    lieType: "green",
    x: 360,
    y: 0,
    rot: 0,
    scale: 1,
    footprint: { kind: "circle", radius: 10 },
  },
];
