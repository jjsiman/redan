import type { Parcel, Piece } from "../../src/types.js";
import { straightCorridor } from "../../src/terrain.js";

/**
 * 150 yards, tight OB, a bunker guarding the front. Every golfer's full
 * carry clears 150 comfortably, so this is a one-shot-then-putt hole —
 * accuracy-driven traits and power-driven ones should land close together
 * here, since power buys nothing.
 */
export const parcel: Parcel = {
  id: "fixture-short-par3",
  par: 3,
  corridor: straightCorridor(180, 20, 25),
  pieceCap: 2,
};

export const pieces: Piece[] = [
  {
    shapeId: "green-round",
    lieType: "green",
    x: 150,
    y: 0,
    rot: 0,
    scale: 1,
    footprint: { kind: "circle", radius: 10 },
  },
  {
    shapeId: "bunker-pot",
    lieType: "bunker",
    x: 135,
    y: 0,
    rot: 0,
    scale: 1,
    footprint: { kind: "circle", radius: 6 },
  },
];
