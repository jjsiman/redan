import { describe, expect, it } from "vitest";
import { pointAtStation, pointInPolygon, polylineLength, projectToPolyline } from "../src/geom.js";

describe("pointInPolygon", () => {
  it("resolves a simple convex square", () => {
    const square = [
      { x: -5, y: -5 },
      { x: 5, y: -5 },
      { x: 5, y: 5 },
      { x: -5, y: 5 },
    ];
    expect(pointInPolygon(square, { x: 0, y: 0 })).toBe(true);
    expect(pointInPolygon(square, { x: 10, y: 0 })).toBe(false);
    expect(pointInPolygon(square, { x: 4.9, y: 4.9 })).toBe(true);
  });

  it("resolves a concave 'C' shape — a notch inside the convex hull is still outside", () => {
    const cShape = [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: -4 },
      { x: 0, y: -4 },
      { x: 0, y: 4 },
      { x: 10, y: 4 },
      { x: 10, y: 10 },
      { x: -10, y: 10 },
    ];
    expect(pointInPolygon(cShape, { x: -5, y: 0 })).toBe(true); // the solid left bar
    expect(pointInPolygon(cShape, { x: 5, y: 0 })).toBe(false); // inside the notch
    expect(pointInPolygon(cShape, { x: 5, y: -7 })).toBe(true); // the bottom arm
  });
});

describe("polylineLength", () => {
  it("sums segment lengths, including a 3-4-5 bend", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 }, // degenerate zero-length segment shouldn't break anything
      { x: 130, y: 40 }, // +30,+40 = 50
    ];
    expect(polylineLength(pts)).toBeCloseTo(150, 6);
  });
});

describe("projectToPolyline", () => {
  const bent = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it("gives arc-length station and zero offset for a point on the path", () => {
    const proj = projectToPolyline(bent, { x: 50, y: 0 });
    expect(proj.s).toBeCloseTo(50, 6);
    expect(proj.offset).toBeCloseTo(0, 6);
    expect(proj.beyond).toBeNull();
  });

  it("continues arc-length across a bend and signs the offset by heading", () => {
    const proj = projectToPolyline(bent, { x: 100, y: 50 });
    expect(proj.s).toBeCloseTo(150, 6); // 100 along the first leg + 50 along the second
    expect(proj.offset).toBeCloseTo(0, 6);
  });

  it("flags projections past the first or last point as beyond", () => {
    const before = projectToPolyline(bent, { x: -20, y: 0 });
    expect(before.beyond).toBe("before");
    const after = projectToPolyline(bent, { x: 100, y: 150 });
    expect(after.beyond).toBe("after");
  });

  it("signs the offset oppositely on either side of a straight segment", () => {
    const straight = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const left = projectToPolyline(straight, { x: 50, y: 10 });
    const right = projectToPolyline(straight, { x: 50, y: -10 });
    expect(Math.sign(left.offset)).not.toBe(Math.sign(right.offset));
    expect(Math.abs(left.offset)).toBeCloseTo(Math.abs(right.offset), 6);
  });
});

describe("pointAtStation", () => {
  const bent = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it("walks the polyline to the requested arc-length", () => {
    expect(pointAtStation(bent, 50)).toEqual({ x: 50, y: 0 });
    expect(pointAtStation(bent, 150)).toEqual({ x: 100, y: 50 });
  });

  it("extrapolates along the final segment's direction past the polyline's end", () => {
    const p = pointAtStation(bent, 220);
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(120, 6);
  });
});
