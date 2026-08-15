import type { Parcel, Piece } from "../../src/types.js";

/**
 * A real dogleg: the corridor centerline bends out to y=60 between x=100 and
 * x=280 and back to y=0 by x=340, while the green sits back on centerline
 * at (400, 0). A fixed stand of trees (deep rough, un-removable — parcels
 * gain the ability to author these in the corridor/geometry rework) covers
 * x=[175,285] x=[-15,15], which the *straight* tee-to-green line (y=0 the
 * whole way) runs straight through, but the bent corridor clears entirely.
 *
 * This is the fixture route.ts's aimLine dimension exists for: "green"
 * (cut the corner, risk the trees, save the ~65 yards the corridor's bend
 * costs) vs. "corridor" (follow the bend, guaranteed clear, longer walk).
 * Deliberately not asserting which golfers pick which — see grade.test.ts's
 * comment on why archetype/route bias isn't hand-asserted in this repo.
 */
export const parcel: Parcel = {
  id: "fixture-dogleg",
  par: 4,
  corridor: [
    { x: 0, cy: 0, halfWidth: 24, obHalfWidth: 50 },
    { x: 100, cy: 0, halfWidth: 24, obHalfWidth: 50 },
    { x: 180, cy: 60, halfWidth: 20, obHalfWidth: 48 },
    { x: 280, cy: 60, halfWidth: 20, obHalfWidth: 48 },
    { x: 340, cy: 0, halfWidth: 22, obHalfWidth: 48 },
    { x: 420, cy: 0, halfWidth: 22, obHalfWidth: 48 },
  ],
  fixedRegions: [
    {
      shapeId: "trees",
      lieType: "deep",
      x: 230,
      y: 0,
      rot: 0,
      scale: 1,
      footprint: { kind: "rect", halfLength: 55, halfWidth: 15 },
    },
  ],
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
    footprint: { kind: "circle", radius: 11 },
  },
];
