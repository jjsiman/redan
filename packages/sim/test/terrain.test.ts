import { describe, expect, it } from "vitest";
import { elevationAt, lieAt, playsLikeDelta } from "../src/terrain.js";
import type { Piece } from "../src/types.js";

describe("elevationAt", () => {
  it("interpolates piecewise-linearly and clamps outside the profile", () => {
    const profile = [
      { x: 0, z: 0 },
      { x: 100, z: 10 },
      { x: 200, z: 5 },
    ];
    expect(elevationAt(profile, 50)).toBeCloseTo(5, 6);
    expect(elevationAt(profile, 150)).toBeCloseTo(7.5, 6);
    expect(elevationAt(profile, -10)).toBe(0);
    expect(elevationAt(profile, 500)).toBe(5);
  });

  it("is flat when no profile is given", () => {
    expect(elevationAt(undefined, 250)).toBe(0);
  });
});

describe("playsLikeDelta", () => {
  it("is positive climbing uphill and negative descending", () => {
    const profile = [
      { x: 0, z: 0 },
      { x: 100, z: 30 },
    ];
    expect(playsLikeDelta(profile, 0, 100)).toBeGreaterThan(0);
    expect(playsLikeDelta(profile, 100, 0)).toBeLessThan(0);
  });
});

describe("lieAt", () => {
  const pieces: Piece[] = [
    {
      shapeId: "bunker-pot",
      lieType: "bunker",
      x: 100,
      y: 0,
      rot: 0,
      scale: 1,
      footprint: { kind: "circle", radius: 10 },
    },
  ];
  const terrain = { corridorHalfWidth: 20, obHalfWidth: 40, pieces };

  it("resolves OB beyond the OB half-width regardless of pieces", () => {
    expect(lieAt(terrain, { x: 50, y: 45 })).toBe("ob");
  });

  it("resolves a piece footprint before falling back to fairway/rough", () => {
    expect(lieAt(terrain, { x: 100, y: 0 })).toBe("bunker");
    expect(lieAt(terrain, { x: 50, y: 5 })).toBe("fairway");
    expect(lieAt(terrain, { x: 50, y: 30 })).toBe("rough");
  });

  it("respects rotation and scale on a rect footprint", () => {
    const rectPieces: Piece[] = [
      {
        shapeId: "deep-patch",
        lieType: "deep",
        x: 0,
        y: 0,
        rot: 90,
        scale: 2,
        footprint: { kind: "rect", halfLength: 10, halfWidth: 2 },
      },
    ];
    const rectTerrain = { corridorHalfWidth: 20, obHalfWidth: 40, pieces: rectPieces };
    // Unrotated, unscaled this rect is long along x — rotated 90deg it's long along y.
    expect(lieAt(rectTerrain, { x: 0, y: 15 })).toBe("deep");
    expect(lieAt(rectTerrain, { x: 15, y: 0 })).toBe("fairway");
  });
});
