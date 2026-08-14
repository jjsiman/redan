import { describe, expect, it } from "vitest";
import { resolveFlight, resolveRoll } from "../src/flight.js";
import type { Parcel } from "../src/types.js";

function makeParcel(overrides: Partial<Parcel> = {}): Parcel {
  return {
    id: "test",
    par: 4,
    corridorHalfWidth: 20,
    obHalfWidth: 40,
    pieceCap: 2,
    ...overrides,
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

const NO_WIND = { speed: 0, dirDeg: 0 };
const FROM = { x: 0, y: 0 };
const TARGET = { x: 200, y: 0 };

describe("resolveFlight", () => {
  it("curves opposite directions for opposite spin, and not at all for zero spin", () => {
    const noSpin = resolveFlight(makeParcel(), FROM, TARGET, 150, { aimOffsetDeg: 0, spin: 0 }, NO_WIND);
    const posSpin = resolveFlight(makeParcel(), FROM, TARGET, 150, { aimOffsetDeg: 0, spin: 1 }, NO_WIND);
    const negSpin = resolveFlight(makeParcel(), FROM, TARGET, 150, { aimOffsetDeg: 0, spin: -1 }, NO_WIND);

    expect(noSpin.endpoint.y).toBeCloseTo(0, 6);
    expect(posSpin.endpoint.y).toBeGreaterThan(0);
    expect(negSpin.endpoint.y).toBeLessThan(0);
    expect(posSpin.endpoint.y).toBeCloseTo(-negSpin.endpoint.y, 6);
  });

  it("a headwind shortens effective carry and a tailwind lengthens it", () => {
    const noWindFlight = resolveFlight(makeParcel(), FROM, TARGET, 150, { aimOffsetDeg: 0, spin: 0 }, NO_WIND);
    const headwindFlight = resolveFlight(
      makeParcel(),
      FROM,
      TARGET,
      150,
      { aimOffsetDeg: 0, spin: 0 },
      { speed: 10, dirDeg: 180 },
    );
    const tailwindFlight = resolveFlight(
      makeParcel(),
      FROM,
      TARGET,
      150,
      { aimOffsetDeg: 0, spin: 0 },
      { speed: 10, dirDeg: 0 },
    );

    expect(headwindFlight.effectiveDistance).toBeLessThan(noWindFlight.effectiveDistance);
    expect(tailwindFlight.effectiveDistance).toBeGreaterThan(noWindFlight.effectiveDistance);
  });

  it("returns a sampled path from the start position to the endpoint", () => {
    const flight = resolveFlight(makeParcel(), FROM, TARGET, 150, { aimOffsetDeg: 0, spin: 0.5 }, NO_WIND);
    expect(flight.path.length).toBeGreaterThanOrEqual(2);
    expect(flight.path[0]).toEqual(FROM);
  });
});

describe("resolveRoll", () => {
  it("rolls further on a lie descending in the direction of travel than on flat ground", () => {
    const flatParcel = makeParcel();
    const downhillParcel = makeParcel({ elevationProfile: [{ x: 0, z: 20 }, { x: 100, z: 0 }] });
    const landing = { x: 50, y: 0 };
    const travelDir = { x: 1, y: 0 };

    const flatRest = resolveRoll(flatParcel, landing, travelDir, "fairway");
    const downhillRest = resolveRoll(downhillParcel, landing, travelDir, "fairway");

    expect(dist(landing, downhillRest)).toBeGreaterThan(dist(landing, flatRest));
  });

  it("does not roll on lies with zero roll factor (hazards, green)", () => {
    const parcel = makeParcel({ elevationProfile: [{ x: 0, z: 20 }, { x: 100, z: 0 }] });
    const landing = { x: 50, y: 0 };
    const travelDir = { x: 1, y: 0 };

    expect(resolveRoll(parcel, landing, travelDir, "green")).toEqual(landing);
    expect(resolveRoll(parcel, landing, travelDir, "bunker")).toEqual(landing);
    expect(resolveRoll(parcel, landing, travelDir, "water")).toEqual(landing);
  });

  it("a mound's cross-slope steers a rolling ball toward its downhill side", () => {
    const parcel = makeParcel({ elevationFeatures: [{ x: 50, y: 15, radius: 25, height: 10 }] });
    const landing = { x: 50, y: 0 };
    const travelDir = { x: 1, y: 0 };

    const rolled = resolveRoll(parcel, landing, travelDir, "fairway");
    // The mound sits toward +y; the ball should be steered toward -y, away from it.
    expect(rolled.y).toBeLessThan(landing.y);
  });
});
