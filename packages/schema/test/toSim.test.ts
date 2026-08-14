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
    corridorHalfWidth: 22,
    obHalfWidth: 40,
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
