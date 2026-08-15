import { describe, expect, it } from "vitest";
import { toSimInputs, toSimPoint, toSimRot } from "../src/toSim.js";
import { SCHEMA_VERSION } from "../src/version.js";
import type { Design, Parcel } from "../src/types.js";

describe("toSimPoint", () => {
  it("maps portrait distance-from-tee to sim +x", () => {
    const p = toSimPoint({ x: 0, y: 150 });
    expect(p.x).toBeCloseTo(150, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it("is a proper rotation, not a mirror (right angles preserved, no reflection)", () => {
    // Two portrait points at right angles from the tee must stay at right
    // angles after the transform, and the transform's implied 2x2 matrix
    // must have determinant +1 (rotation) rather than -1 (reflection).
    const a = toSimPoint({ x: 1, y: 0 });
    const b = toSimPoint({ x: 0, y: 1 });
    const det = a.x * b.y - a.y * b.x;
    expect(det).toBeCloseTo(1, 6);
  });
});

describe("toSimRot", () => {
  it("subtracts 90 degrees crossing the portrait/sim boundary", () => {
    expect(toSimRot(90)).toBe(0);
    expect(toSimRot(0)).toBe(-90);
  });
});

describe("toSimInputs", () => {
  const parcel: Parcel = {
    id: "p1",
    schemaVersion: SCHEMA_VERSION,
    par: 4,
    corridor: [
      { y: 0, cx: 0, halfWidth: 22, obHalfWidth: 40 },
      { y: 440, cx: 0, halfWidth: 22, obHalfWidth: 40 },
    ],
    pieceCap: 3,
    tray: [
      { shapeId: "green-large", count: 1 },
      { shapeId: "bunker-pot", count: 2 },
    ],
    elevationProfile: [
      { y: 0, z: 0 },
      { y: 400, z: 10 },
    ],
  };

  const design: Design = {
    parcelId: "p1",
    schemaVersion: SCHEMA_VERSION,
    pieces: [
      { shapeId: "green-large", x: 0, y: 400, rot: 90, scale: 1 },
      { shapeId: "bunker-pot", x: 15, y: 150, rot: 0, scale: 1 },
    ],
  };

  it("resolves shapeId into lieType/footprint and carries elevation across the frame boundary", () => {
    const { parcel: simParcel, pieces } = toSimInputs(parcel, design);

    expect(simParcel.elevationProfile).toEqual([
      { x: 0, z: 0 },
      { x: 400, z: 10 },
    ]);

    const green = pieces.find((p) => p.shapeId === "green-large")!;
    expect(green.lieType).toBe("green");
    expect(green.x).toBeCloseTo(400, 6);
    expect(green.y).toBeCloseTo(0, 6);

    const bunker = pieces.find((p) => p.shapeId === "bunker-pot")!;
    expect(bunker.lieType).toBe("bunker");
    expect(bunker.x).toBeCloseTo(150, 6);
    expect(bunker.y).toBeCloseTo(-15, 6);
  });

  it("maps elevation feature centers through the frame rotation, leaving radius/height untouched", () => {
    const parcelWithMound: Parcel = {
      ...parcel,
      elevationFeatures: [{ x: 10, y: 300, radius: 25, height: 8 }],
    };
    const { parcel: simParcel } = toSimInputs(parcelWithMound, design);
    expect(simParcel.elevationFeatures).toHaveLength(1);
    const feature = simParcel.elevationFeatures![0]!;
    expect(feature.x).toBeCloseTo(300, 6);
    expect(feature.y).toBeCloseTo(-10, 6);
    expect(feature.radius).toBe(25);
    expect(feature.height).toBe(8);
  });

  it("maps corridor stations through the frame rotation, preserving half-widths", () => {
    const bent: Parcel = {
      ...parcel,
      corridor: [
        { y: 0, cx: 0, halfWidth: 22, obHalfWidth: 40 },
        { y: 200, cx: 15, halfWidth: 18, obHalfWidth: 36 },
      ],
    };
    const { parcel: simParcel } = toSimInputs(bent, design);
    expect(simParcel.corridor).toHaveLength(2);
    expect(simParcel.corridor[0]).toMatchObject({ halfWidth: 22, obHalfWidth: 40 });
    expect(simParcel.corridor[0]!.x).toBeCloseTo(0, 6);
    expect(simParcel.corridor[0]!.cy).toBeCloseTo(0, 6);
    expect(simParcel.corridor[1]).toMatchObject({ x: 200, halfWidth: 18, obHalfWidth: 36 });
    expect(simParcel.corridor[1]!.cy).toBeCloseTo(-15, 6);
  });

  it("converts fixedRegions the same way as design pieces, resolving shapeId to lieType/footprint", () => {
    const withTrees: Parcel = {
      ...parcel,
      fixedRegions: [{ shapeId: "trees", x: 10, y: 150, rot: 0, scale: 1 }],
    };
    const { parcel: simParcel } = toSimInputs(withTrees, design);
    expect(simParcel.fixedRegions).toHaveLength(1);
    const trees = simParcel.fixedRegions![0]!;
    expect(trees.lieType).toBe("deep");
    expect(trees.x).toBeCloseTo(150, 6);
    expect(trees.y).toBeCloseTo(-10, 6);
  });

  it("throws on a parcelId mismatch", () => {
    const wrongDesign: Design = { ...design, parcelId: "other" };
    expect(() => toSimInputs(parcel, wrongDesign)).toThrow(/parcel/);
  });

  it("throws on an unknown shapeId", () => {
    const badDesign: Design = {
      ...design,
      pieces: [{ shapeId: "nope", x: 0, y: 0, rot: 0, scale: 1 }],
    };
    expect(() => toSimInputs(parcel, badDesign)).toThrow(/Unknown shapeId/);
  });

  it("round-trips through JSON with the frozen wire shape unchanged", () => {
    const json = JSON.parse(JSON.stringify(design));
    expect(Object.keys(json.pieces[0]).sort()).toEqual(["rot", "scale", "shapeId", "x", "y"]);
    expect(json).toEqual(design);
  });
});
