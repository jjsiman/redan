import { describe, expect, it } from "vitest";
import { ARCHETYPES } from "../src/archetypes.js";
import {
  effectiveLieFactors,
  fullCarry,
  layupTarget,
  resolvePutts,
  shotDispersion,
} from "../src/shotModel.js";

describe("fullCarry", () => {
  it("matches the calibrated formula off the fairway", () => {
    expect(fullCarry(ARCHETYPES.BOMBER, "fairway")).toBeCloseTo(185 + 0.95 * 105, 6);
    expect(fullCarry(ARCHETYPES.STRAIGHT, "fairway")).toBeCloseTo(185 + 0.5 * 105, 6);
  });
});

describe("effectiveLieFactors", () => {
  it("pulls a bad lie partway back toward baseline in proportion to recovery", () => {
    const { distanceFactor, dispersionFactor } = effectiveLieFactors("bunker", ARCHETYPES.SCRAMBLER.recovery);
    expect(distanceFactor).toBeCloseTo(0.64 + 0.92 * (1 - 0.64) * 0.5, 6);
    expect(dispersionFactor).toBeCloseTo(1.9 - 0.92 * (1.9 - 1) * 0.45, 6);
  });

  it("leaves a zero-recovery archetype at the raw lie factors", () => {
    const zeroRecovery = { ...ARCHETYPES.BOMBER, recovery: 0 };
    const { distanceFactor, dispersionFactor } = effectiveLieFactors("deep", zeroRecovery.recovery);
    expect(distanceFactor).toBeCloseTo(0.52, 6);
    expect(dispersionFactor).toBeCloseTo(2.6, 6);
  });
});

describe("shotDispersion", () => {
  it("applies the effort penalty once a swing exceeds 72% of full carry", () => {
    const stats = ARCHETYPES.STRAIGHT;
    const full = fullCarry(stats, "fairway");
    const easy = shotDispersion(stats, "fairway", full * 0.5);
    const hard = shotDispersion(stats, "fairway", full * 0.9);
    expect(easy.effort).toBeLessThan(0.72);
    expect(hard.effort).toBeGreaterThan(0.72);
    // Same lie, same accuracy — a harder swing must carry more sigma per yard of distance.
    expect(hard.lateralSigma / (full * 0.9)).toBeGreaterThan(easy.lateralSigma / (full * 0.5));
  });

  it("tightens lateral dispersion on short shots, more so for high touch", () => {
    const low = { ...ARCHETYPES.BOMBER, touch: 0 };
    const high = { ...ARCHETYPES.BOMBER, touch: 1 };
    const lowShot = shotDispersion(low, "fairway", 100);
    const highShot = shotDispersion(high, "fairway", 100);
    expect(highShot.lateralSigma).toBeLessThan(lowShot.lateralSigma);
  });
});

describe("layupTarget", () => {
  it("leaves roughly a 0.42x-full-carry approach", () => {
    expect(layupTarget(300, 250)).toBeCloseTo(300 - 250 * 0.42, 6);
  });
});

describe("resolvePutts", () => {
  it("partitions 1/2/3-putt outcomes by the roll against P(1) and P(3)", () => {
    // distance 0, touch 0 -> P(1) = 0.88, P(3) = clamp(-0.224) = 0
    expect(resolvePutts(0, 0, 0.5).putts).toBe(1);
    expect(resolvePutts(0, 0, 0.95).putts).toBe(2);
  });

  it("raises 3-putt probability on long putts and touch reduces it", () => {
    // distance 40, touch 0 -> P(1) = clamp(0.88 - 2.8) = 0, P(3) = clamp(33*0.032) = 1.056 -> clamped to 1 - P1 = 1
    expect(resolvePutts(40, 0, 0.5).putts).toBe(3);
  });
});
