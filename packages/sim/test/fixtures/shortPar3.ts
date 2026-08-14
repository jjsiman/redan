import type { Parcel, Piece } from "../../src/types.js";

/**
 * 150 yards, tight OB, a bunker guarding the front. Every archetype's full
 * carry clears 150 comfortably, so this is a one-shot-then-putt hole — the
 * doc's validation set found STRAIGHT and TOUCH within 0.01 of each other
 * on holes like this, since power is worthless.
 */
export const parcel: Parcel = {
  id: "fixture-short-par3",
  par: 3,
  corridorHalfWidth: 20,
  obHalfWidth: 25,
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
