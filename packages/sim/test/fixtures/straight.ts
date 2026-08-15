import type { Parcel, Piece } from "../../src/types.js";
import { straightCorridor } from "../../src/terrain.js";

/** Flat, wide-open, no hazards. Baseline sanity check: does the pipeline run at all. */
export const parcel: Parcel = {
  id: "fixture-straight",
  par: 4,
  corridor: straightCorridor(440, 25, 45),
  pieceCap: 3,
};

export const pieces: Piece[] = [
  {
    shapeId: "green-round",
    lieType: "green",
    x: 400,
    y: 0,
    rot: 0,
    scale: 1,
    footprint: { kind: "circle", radius: 12 },
  },
];
