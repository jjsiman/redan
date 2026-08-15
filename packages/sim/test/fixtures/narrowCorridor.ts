import type { Parcel, Piece } from "../../src/types.js";
import { straightCorridor } from "../../src/terrain.js";

/**
 * Moderate length (360 yards) but a tight corridor with OB close on both
 * sides — dispersion gets punished hard. Accuracy-favoring traits should
 * beat power-favoring ones here.
 */
export const parcel: Parcel = {
  id: "fixture-narrow-corridor",
  par: 4,
  corridor: straightCorridor(400, 11, 16),
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
