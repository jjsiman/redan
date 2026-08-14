import { describe, expect, it } from "vitest";
import { grade } from "../src/grade.js";
import { SIM_VERSION } from "../src/version.js";
import { ARCHETYPE_NAMES } from "../src/archetypes.js";
import type { Wind } from "../src/types.js";
import * as straight from "./fixtures/straight.js";
import * as dogleg from "./fixtures/dogleg.js";
import * as shortPar3 from "./fixtures/shortPar3.js";
import * as reachablePar5 from "./fixtures/reachablePar5.js";
import * as narrowCorridor from "./fixtures/narrowCorridor.js";

const NO_WIND: Wind = { speed: 0, dirDeg: 0 };
const SEED = 42;

describe("grade — pipeline sanity", () => {
  it("stamps simVersion and returns finite, plausible scores for every archetype", () => {
    const result = grade(straight.parcel, straight.pieces, NO_WIND, SEED);
    expect(result.simVersion).toBe(SIM_VERSION);
    for (const name of ARCHETYPE_NAMES) {
      const { mean, sd } = result.archetypes[name];
      expect(Number.isFinite(mean)).toBe(true);
      expect(mean).toBeGreaterThan(straight.parcel.par - 1);
      expect(mean).toBeLessThan(straight.parcel.par + 5);
      expect(sd).toBeGreaterThanOrEqual(0);
    }
    expect(result.traces).toHaveLength(ARCHETYPE_NAMES.length);
  });

  it("is deterministic given the same seed", () => {
    const a = grade(straight.parcel, straight.pieces, NO_WIND, SEED);
    const b = grade(straight.parcel, straight.pieces, NO_WIND, SEED);
    expect(a.metrics).toEqual(b.metrics);
    expect(a.archetypes).toEqual(b.archetypes);
  });

  it("throws when the design has no green placed", () => {
    expect(() => grade(straight.parcel, [], NO_WIND, SEED)).toThrow(/green/);
  });

  it("computes used/cap from placed piece cost", () => {
    const result = grade(straight.parcel, straight.pieces, NO_WIND, SEED);
    expect(result.metrics.used).toBe(straight.pieces.length);
    expect(result.metrics.cap).toBe(straight.parcel.pieceCap);
  });
});

describe("grade — route search", () => {
  it("biases the aim line around an obstacle on the dogleg fixture", () => {
    const result = grade(dogleg.parcel, dogleg.pieces, NO_WIND, SEED);
    const biased = ARCHETYPE_NAMES.some((n) => result.archetypes[n].route.aimBias !== 0);
    expect(biased).toBe(true);
  });
});

describe("grade — archetype bias", () => {
  it("keeps STRAIGHT and TOUCH close on a short, power-irrelevant par 3", () => {
    const result = grade(shortPar3.parcel, shortPar3.pieces, NO_WIND, SEED);
    const diff = Math.abs(result.archetypes.STRAIGHT.mean - result.archetypes.TOUCH.mean);
    expect(diff).toBeLessThan(0.5);
  });

  it("favors accuracy over power in a narrow, OB-tight corridor", () => {
    const result = grade(narrowCorridor.parcel, narrowCorridor.pieces, NO_WIND, SEED);
    expect(result.archetypes.STRAIGHT.mean).toBeLessThan(result.archetypes.BOMBER.mean);
  });

  it("makes a reachable-in-two par 5 a real strategic decision, not a wash", () => {
    // Deliberately not asserting which archetype wins: that depends on the
    // real interplay of accuracy vs. distance for THIS fixture, and without
    // a real-hole validation set to check against we'd just be encoding a
    // guess. What we can assert without guessing: BOMBER and STRAIGHT reach
    // genuinely different decisions (their remaining distance after a tee
    // shot sits on opposite sides of the reach-in-two threshold), and the
    // hole produces a real spread rather than grading every build the same.
    const result = grade(reachablePar5.parcel, reachablePar5.pieces, NO_WIND, SEED);
    expect(result.archetypes.BOMBER.route).not.toEqual(result.archetypes.STRAIGHT.route);
    expect(result.metrics.spread).toBeGreaterThan(0.15);
  });
});
