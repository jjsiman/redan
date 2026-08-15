import { describe, expect, it } from "vitest";
import {
  compileCorridor,
  corridorBends,
  elevationAt,
  elevationAt2D,
  gradientAt,
  lieAt,
  playsLikeDelta,
  ROLL_FACTORS,
  straightCorridor,
} from "../src/terrain.js";
import type { CorridorStation, Parcel, Piece } from "../src/types.js";

function makeParcel(overrides: Partial<Parcel> = {}): Parcel {
  return {
    id: "test",
    par: 4,
    corridor: straightCorridor(200, 20, 40),
    pieceCap: 2,
    ...overrides,
  };
}

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

describe("elevationAt2D", () => {
  it("matches the centerline profile uniformly across width when there are no features", () => {
    const parcel = makeParcel({ elevationProfile: [{ x: 0, z: 0 }, { x: 100, z: 20 }] });
    expect(elevationAt2D(parcel, 50, 0)).toBeCloseTo(10, 6);
    expect(elevationAt2D(parcel, 50, 15)).toBeCloseTo(10, 6);
  });

  it("adds a mound's contribution near its center, decaying to zero at its radius", () => {
    const parcel = makeParcel({ elevationFeatures: [{ x: 100, y: 0, radius: 20, height: 10 }] });
    expect(elevationAt2D(parcel, 100, 0)).toBeCloseTo(10, 6);
    expect(elevationAt2D(parcel, 100, 20)).toBeCloseTo(0, 6);
    expect(elevationAt2D(parcel, 120, 0)).toBeCloseTo(0, 6);
    expect(elevationAt2D(parcel, 500, 500)).toBeCloseTo(0, 6);
  });

  it("supports a negative-height hollow", () => {
    const parcel = makeParcel({ elevationFeatures: [{ x: 0, y: 0, radius: 10, height: -5 }] });
    expect(elevationAt2D(parcel, 0, 0)).toBeCloseTo(-5, 6);
  });
});

describe("gradientAt", () => {
  it("points toward a mound's peak from its shoulder", () => {
    const parcel = makeParcel({ elevationFeatures: [{ x: 100, y: 0, radius: 30, height: 15 }] });
    const grad = gradientAt(parcel, 80, 0);
    expect(grad.x).toBeGreaterThan(0);
  });

  it("is zero far from any feature on flat ground", () => {
    const parcel = makeParcel();
    const grad = gradientAt(parcel, 500, 500);
    expect(grad.x).toBeCloseTo(0, 6);
    expect(grad.y).toBeCloseTo(0, 6);
  });
});

describe("playsLikeDelta", () => {
  it("is positive climbing uphill and negative descending", () => {
    const parcel = makeParcel({ elevationProfile: [{ x: 0, z: 0 }, { x: 100, z: 30 }] });
    expect(playsLikeDelta(parcel, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeGreaterThan(0);
    expect(playsLikeDelta(parcel, { x: 100, y: 0 }, { x: 0, y: 0 })).toBeLessThan(0);
  });
});

describe("ROLL_FACTORS", () => {
  it("gives hazards and the green zero roll, and firmer lies more than soft ones", () => {
    expect(ROLL_FACTORS.water).toBe(0);
    expect(ROLL_FACTORS.ob).toBe(0);
    expect(ROLL_FACTORS.green).toBe(0);
    expect(ROLL_FACTORS.fairway).toBeGreaterThan(ROLL_FACTORS.rough);
    expect(ROLL_FACTORS.rough).toBeGreaterThan(ROLL_FACTORS.bunker);
  });
});

describe("corridorBends", () => {
  it("is false for a straight corridor and true once any station drifts more than 5 yards", () => {
    expect(corridorBends(straightCorridor(300, 20, 40))).toBe(false);
    const bent: CorridorStation[] = [
      { x: 0, cy: 0, halfWidth: 20, obHalfWidth: 40 },
      { x: 300, cy: 30, halfWidth: 20, obHalfWidth: 40 },
    ];
    expect(corridorBends(bent)).toBe(true);
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
  const terrain = { corridor: compileCorridor(straightCorridor(200, 20, 40)), pieces };

  it("resolves OB beyond the OB half-width regardless of pieces", () => {
    expect(lieAt(terrain, { x: 50, y: 45 })).toBe("ob");
  });

  it("resolves a piece footprint before falling back to fairway/rough", () => {
    expect(lieAt(terrain, { x: 100, y: 0 })).toBe("bunker");
    expect(lieAt(terrain, { x: 50, y: 5 })).toBe("fairway");
    expect(lieAt(terrain, { x: 50, y: 30 })).toBe("rough");
  });

  it("resolves OB past the back of the corridor's arc-length extent", () => {
    // The old scalar-corridor model had no back boundary at all (only a
    // lateral |y| test) — a ball 900 yards past the green still resolved
    // "fairway". The bending-corridor model fixes that: past the last
    // authored station is OB.
    expect(lieAt(terrain, { x: 500, y: 0 })).toBe("ob");
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
    const rectTerrain = { corridor: compileCorridor(straightCorridor(200, 20, 40)), pieces: rectPieces };
    // Unrotated, unscaled this rect is long along x — rotated 90deg it's long along y.
    expect(lieAt(rectTerrain, { x: 0, y: 15 })).toBe("deep");
    expect(lieAt(rectTerrain, { x: 15, y: 0 })).toBe("fairway");
  });

  it("resolves a polygon footprint (a concave notch, not just its convex hull)", () => {
    // A "C" shape opening toward +x: a point in the notch (inside the hull
    // but outside the actual polygon) must NOT register as inside.
    const notch: Piece[] = [
      {
        shapeId: "waste-area",
        lieType: "bunker",
        x: 50,
        y: 0,
        rot: 0,
        scale: 1,
        footprint: {
          kind: "polygon",
          points: [
            { x: -10, y: -10 },
            { x: 10, y: -10 },
            { x: 10, y: -4 },
            { x: 0, y: -4 },
            { x: 0, y: 4 },
            { x: 10, y: 4 },
            { x: 10, y: 10 },
            { x: -10, y: 10 },
          ],
        },
      },
    ];
    const polyTerrain = { corridor: compileCorridor(straightCorridor(200, 20, 40)), pieces: notch };
    expect(lieAt(polyTerrain, { x: 45, y: 0 })).toBe("bunker"); // inside the solid left bar
    expect(lieAt(polyTerrain, { x: 55, y: 0 })).toBe("fairway"); // inside the notch, not the polygon
  });

  it("bends the fairway envelope with the corridor centerline", () => {
    const bentCorridor: CorridorStation[] = [
      { x: 0, cy: 0, halfWidth: 15, obHalfWidth: 40 },
      { x: 100, cy: 40, halfWidth: 15, obHalfWidth: 40 },
    ];
    const bentTerrain = { corridor: compileCorridor(bentCorridor), pieces: [] };
    // Halfway along the bend, the centerline itself has drifted to cy=20 —
    // a point at the OLD y=0 straight line is well off the fairway now.
    expect(lieAt(bentTerrain, { x: 50, y: 0 })).toBe("rough");
    expect(lieAt(bentTerrain, { x: 50, y: 20 })).toBe("fairway");
  });
});
