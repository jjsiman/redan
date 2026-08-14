import type { LieType, RegionShape } from "@redan/sim";

/**
 * The shape parameter table (doc 6.2, marked [thin] — "never finalised,
 * ... an M0 deliverable"). This is a first draft: plausible yardages for a
 * pot bunker vs. a coffin bunker vs. a green vs. a pond, picked to be
 * roughly real-world-sized, NOT validated against real holes or playtested.
 * Expect every dimension here to move once M0's validation harness exists.
 *
 * `footprint` is the shape at rot=0/scale=1 in the piece's own local frame —
 * unaffected by which world frame (portrait or sim) it's ultimately placed
 * in, since only position/rotation/scale vary per placement.
 */
export interface ShapeDef {
  lieType: LieType;
  footprint: RegionShape;
  /** Piece-cost this shape draws from the parcel's budget. Defaults to 1 if omitted. */
  cost: number;
  label: string;
}

export const SHAPE_TABLE: Record<string, ShapeDef> = {
  "green-small": {
    lieType: "green",
    footprint: { kind: "circle", radius: 9 },
    cost: 1,
    label: "Small green",
  },
  "green-large": {
    lieType: "green",
    footprint: { kind: "circle", radius: 15 },
    cost: 1,
    label: "Large green",
  },
  "bunker-pot": {
    lieType: "bunker",
    footprint: { kind: "circle", radius: 6 },
    cost: 1,
    label: "Pot bunker",
  },
  "bunker-coffin": {
    lieType: "bunker",
    footprint: { kind: "rect", halfLength: 14, halfWidth: 4 },
    cost: 1,
    label: "Coffin bunker",
  },
  "water-pond": {
    lieType: "water",
    footprint: { kind: "circle", radius: 15 },
    cost: 1,
    label: "Pond",
  },
  "rough-patch": {
    lieType: "deep",
    footprint: { kind: "rect", halfLength: 20, halfWidth: 10 },
    cost: 1,
    label: "Deep rough patch",
  },
};

export function resolveShape(shapeId: string): ShapeDef {
  const def = SHAPE_TABLE[shapeId];
  if (!def) {
    throw new Error(`Unknown shapeId "${shapeId}" — not in the shape table`);
  }
  return def;
}
