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
  // `trees`/`native-area` used to be axis-aligned rects (60x30 and 50x50).
  // A perfect rectangle punched a hard-edged square hole out of a derived
  // land-mode fairway wherever one sat near the corridor (the "large square
  // artifacts" bug report, distinct from the renderer's own square-artifact
  // bug fixed in apps/web's texture.ts/grid.ts). Replaced with 12-vertex
  // polygons — local frame, rot=0/scale=1, implicitly closed, same
  // authoring convention as `bunker-kidney` below — inscribed in
  // approximately the old bounding box so existing placements don't need
  // repositioning. `-b`/`-c` variants exist so two instances on one
  // generated parcel (land mode places 1-3 hazards per hole) don't read as
  // identical stamps; picked by generate-land.mjs. Uncalibrated like the
  // rest of this table — sizes are the same eyeballed numbers as before,
  // just no longer literally rectangular.
  "trees": {
    lieType: "deep",
    footprint: {
      kind: "polygon",
      points: [
        { x: 30, y: 0 }, { x: 25, y: 8 }, { x: 13, y: 12 }, { x: 0, y: 12 },
        { x: -14, y: 13 }, { x: -23, y: 6 }, { x: -28, y: 0 }, { x: -25, y: -7 },
        { x: -14, y: -12 }, { x: 0, y: -14 }, { x: 14, y: -12 }, { x: 26, y: -7 },
      ],
    },
    cost: 1,
    label: "Trees (fixed region)",
  },
  "trees-b": {
    lieType: "deep",
    footprint: {
      kind: "polygon",
      points: [
        { x: 28, y: -2 }, { x: 22, y: 9 }, { x: 10, y: 13 }, { x: -3, y: 11 },
        { x: -16, y: 14 }, { x: -25, y: 4 }, { x: -27, y: -5 }, { x: -22, y: -11 },
        { x: -9, y: -13 }, { x: 4, y: -12 }, { x: 16, y: -13 }, { x: 27, y: -6 },
      ],
    },
    cost: 1,
    label: "Trees (fixed region)",
  },
  "trees-c": {
    lieType: "deep",
    footprint: {
      kind: "polygon",
      points: [
        { x: 25, y: 6 }, { x: 27, y: -3 }, { x: 18, y: -11 }, { x: 5, y: -14 },
        { x: -8, y: -13 }, { x: -20, y: -9 }, { x: -28, y: -1 }, { x: -24, y: 8 },
        { x: -13, y: 13 }, { x: 0, y: 14 }, { x: 12, y: 13 }, { x: 22, y: 10 },
      ],
    },
    cost: 1,
    label: "Trees (fixed region)",
  },
  "native-area": {
    lieType: "rough",
    footprint: {
      kind: "polygon",
      points: [
        { x: 25, y: 0 }, { x: 18, y: 11 }, { x: 12, y: 21 }, { x: 0, y: 18 },
        { x: -11, y: 19 }, { x: -22, y: 13 }, { x: -20, y: 0 }, { x: -20, y: -12 },
        { x: -10, y: -17 }, { x: 0, y: -24 }, { x: 11, y: -18 }, { x: 19, y: -11 },
      ],
    },
    cost: 1,
    label: "Native area (fixed region)",
  },
  "native-area-b": {
    lieType: "rough",
    footprint: {
      kind: "polygon",
      points: [
        { x: 22, y: -4 }, { x: 21, y: 9 }, { x: 10, y: 20 }, { x: -2, y: 17 },
        { x: -14, y: 22 }, { x: -20, y: 10 }, { x: -24, y: -2 }, { x: -18, y: -13 },
        { x: -8, y: -20 }, { x: 4, y: -18 }, { x: 16, y: -19 }, { x: 20, y: -10 },
      ],
    },
    cost: 1,
    label: "Native area (fixed region)",
  },
  "native-area-c": {
    lieType: "rough",
    footprint: {
      kind: "polygon",
      points: [
        { x: 19, y: 10 }, { x: 24, y: -1 }, { x: 19, y: -13 }, { x: 9, y: -20 },
        { x: -3, y: -19 }, { x: -15, y: -21 }, { x: -22, y: -9 }, { x: -19, y: 4 },
        { x: -21, y: 16 }, { x: -9, y: 22 }, { x: 3, y: 19 }, { x: 14, y: 20 },
      ],
    },
    cost: 1,
    label: "Native area (fixed region)",
  },
  // Land mode's fixed boundary fringe (fairway.ts#deriveFairway's
  // `fringeBands`) — never player-placed, always parcel-authored via
  // fixedRegions. `deep`, not `ob`: the ring just inside the land envelope
  // is playable-but-punishing natural terrain (rocks/scrub/treeline), and
  // the actual OB boundary is enforced by `lieAt` directly against
  // `landEnvelope`, past the renderer's visible frame — see terrain.ts's
  // `LAND_FRINGE_YARDS` doc. Not sized meaningfully here: deriveFairway
  // constructs these pieces directly with its own halfLength/halfWidth per
  // placement, so this table entry exists only so the shapeId resolves
  // (e.g. for the dev SVG preview's color lookup by lieType) rather than as
  // an authoring default.
  "natural-fringe": {
    lieType: "deep",
    footprint: { kind: "rect", halfLength: 260, halfWidth: 14 },
    cost: 1,
    label: "Natural fringe (fixed region)",
  },
  // Land mode's tee box (fairway.ts#deriveFairway) — same "table entry only
  // so the shapeId resolves" rationale as `natural-fringe` above; the actual
  // placement/size is constructed directly by deriveFairway. `tee` and
  // `fairway` share identical lie factors (terrain.ts's LIE_FACTORS), so
  // this is a visual distinction (the previously-unreachable `tee` palette
  // entry) with no scoring effect.
  "tee-box": {
    lieType: "tee",
    footprint: { kind: "rect", halfLength: 4, halfWidth: 9 },
    cost: 1,
    label: "Tee box (fixed region)",
  },
};

export function resolveShape(shapeId: string): ShapeDef {
  const def = SHAPE_TABLE[shapeId];
  if (!def) {
    throw new Error(`Unknown shapeId "${shapeId}" — not in the shape table`);
  }
  return def;
}
