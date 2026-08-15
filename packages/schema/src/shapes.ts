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
  // Added for the M0 validation harness (real-hole doglegs), not yet
  // calibrated. `rough-patch` above is `deep` (0.52/2.60) — too punishing to
  // stand in for a first cut, which is the piece a dogleg's inside corner
  // actually needs.
  "rough-band": {
    lieType: "rough",
    footprint: { kind: "rect", halfLength: 40, halfWidth: 12 },
    cost: 1,
    label: "Rough band",
  },
  "water-creek": {
    lieType: "water",
    footprint: { kind: "rect", halfLength: 60, halfWidth: 4 },
    cost: 1,
    label: "Creek",
  },
  // Added for the corridor/geometry rework's dogleg content. Unvalidated,
  // same as the rest of the table.
  "bunker-kidney": {
    lieType: "bunker",
    // A crescent, concave enough that a ball landing in the notch is
    // fairway, not sand — exercises RegionShape's polygon variant. Points
    // are local-frame, rot=0/scale=1, implicitly closed.
    footprint: {
      kind: "polygon",
      points: [
        { x: -14, y: -6 },
        { x: 6, y: -10 },
        { x: 14, y: -4 },
        { x: 6, y: 0 },
        { x: 14, y: 4 },
        { x: 6, y: 10 },
        { x: -14, y: 6 },
        { x: -6, y: 0 },
      ],
    },
    cost: 1,
    label: "Kidney bunker",
  },
  "trees": {
    lieType: "deep",
    footprint: { kind: "rect", halfLength: 30, halfWidth: 15 },
    cost: 1,
    label: "Trees (fixed region)",
  },
  "native-area": {
    lieType: "rough",
    footprint: { kind: "rect", halfLength: 25, halfWidth: 25 },
    cost: 1,
    label: "Native area (fixed region)",
  },
};

export function resolveShape(shapeId: string): ShapeDef {
  const def = SHAPE_TABLE[shapeId];
  if (!def) {
    throw new Error(`Unknown shapeId "${shapeId}" — not in the shape table`);
  }
  return def;
}
