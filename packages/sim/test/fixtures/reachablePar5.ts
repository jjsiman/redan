import type { Parcel, Piece } from "../../src/types.js";

/**
 * 500 yards, wide and forgiving, gently uphill. BOMBER's tee shot leaves a
 * remaining distance inside its own reach threshold (goes for it in two);
 * STRAIGHT's does not, landing it in the lay-up/go-for-it decision zone.
 * Exercises both the reach-in-two heuristic and the elevation term. Which
 * archetype ends up scoring better is an emergent, not asserted, property —
 * see grade.test.ts.
 */
export const parcel: Parcel = {
  id: "fixture-reachable-par5",
  par: 5,
  corridorHalfWidth: 26,
  obHalfWidth: 48,
  pieceCap: 3,
  elevationProfile: [
    { x: 0, z: 0 },
    { x: 250, z: 15 },
    { x: 500, z: 20 },
  ],
};

export const pieces: Piece[] = [
  {
    shapeId: "green-round",
    lieType: "green",
    x: 500,
    y: 0,
    rot: 0,
    scale: 1,
    footprint: { kind: "circle", radius: 18 },
  },
];
