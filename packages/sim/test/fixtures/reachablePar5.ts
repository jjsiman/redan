import type { Parcel, Piece } from "../../src/types.js";
import { straightCorridor } from "../../src/terrain.js";

/**
 * 500 yards, wide and forgiving, gently uphill. Exercises both the
 * reach-in-two heuristic and the elevation term. Which golfer ends up
 * scoring better is an emergent, not asserted, property — see grade.test.ts.
 */
export const parcel: Parcel = {
  id: "fixture-reachable-par5",
  par: 5,
  corridor: straightCorridor(540, 26, 48),
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
