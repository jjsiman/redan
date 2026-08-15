import { describe, expect, it } from "vitest";
import {
  effectiveLieFactors,
  effectiveRecovery,
  effectiveTouch,
  fullCarry,
  layupTarget,
  resolvePutts,
  shotDispersion,
} from "../src/shotModel.js";
import type { GolferStats, TraitEffects } from "../src/types.js";

const NO_TRAITS: TraitEffects[] = [];

const bomberLike: GolferStats = { power: 0.95, accuracy: 0.4, recovery: 0.5, touch: 0.55 };
const straightLike: GolferStats = { power: 0.5, accuracy: 0.95, recovery: 0.45, touch: 0.5 };
const scramblerLike: GolferStats = { power: 0.58, accuracy: 0.55, recovery: 0.92, touch: 0.35 };

describe("fullCarry", () => {
  it("matches the calibrated formula off the fairway with no traits", () => {
    expect(fullCarry(bomberLike, "fairway", NO_TRAITS, "drive")).toBeCloseTo(185 + 0.95 * 105, 6);
    expect(fullCarry(straightLike, "fairway", NO_TRAITS, "drive")).toBeCloseTo(185 + 0.5 * 105, 6);
  });

  it("applies a trait's carryMul only in the context it's scoped to", () => {
    const boosted: TraitEffects = { carryMul: { drive: 1.2 } };
    const base = fullCarry(bomberLike, "fairway", NO_TRAITS, "drive");
    expect(fullCarry(bomberLike, "fairway", [boosted], "drive")).toBeCloseTo(base * 1.2, 6);
    expect(fullCarry(bomberLike, "fairway", [boosted], "long")).toBeCloseTo(base, 6);
  });
});

describe("effectiveLieFactors", () => {
  it("pulls a bad lie partway back toward baseline in proportion to recovery", () => {
    const { distanceFactor, dispersionFactor } = effectiveLieFactors("bunker", scramblerLike.recovery);
    expect(distanceFactor).toBeCloseTo(0.64 + 0.92 * (1 - 0.64) * 0.5, 6);
    expect(dispersionFactor).toBeCloseTo(1.9 - 0.92 * (1.9 - 1) * 0.45, 6);
  });

  it("leaves a zero-recovery golfer at the raw lie factors", () => {
    const { distanceFactor, dispersionFactor } = effectiveLieFactors("deep", 0);
    expect(distanceFactor).toBeCloseTo(0.52, 6);
    expect(dispersionFactor).toBeCloseTo(2.6, 6);
  });
});

describe("effectiveRecovery / effectiveTouch", () => {
  it("adds a trait's recoveryBonus/puttBonus on top of the base stat", () => {
    const scrapper: TraitEffects = { recoveryBonus: 0.45 };
    expect(effectiveRecovery(straightLike, [scrapper])).toBeCloseTo(straightLike.recovery + 0.45, 6);
  });

  it("clamps to [0, 1]", () => {
    const putter: TraitEffects = { puttBonus: 0.9 };
    expect(effectiveTouch(straightLike, [putter])).toBe(1);
  });
});

describe("shotDispersion", () => {
  it("applies the effort penalty once a swing exceeds 72% of full carry", () => {
    const full = fullCarry(straightLike, "fairway", NO_TRAITS, "long");
    const easy = shotDispersion(straightLike, "fairway", full * 0.5, NO_TRAITS, "long", false);
    const hard = shotDispersion(straightLike, "fairway", full * 0.9, NO_TRAITS, "long", false);
    expect(easy.effort).toBeLessThan(0.72);
    expect(hard.effort).toBeGreaterThan(0.72);
    // Same lie, same accuracy — a harder swing must carry more sigma per yard of distance.
    expect(hard.lateralSigma / (full * 0.9)).toBeGreaterThan(easy.lateralSigma / (full * 0.5));
  });

  it("tightens lateral dispersion on short shots, more so for high touch", () => {
    const low = { ...bomberLike, touch: 0 };
    const high = { ...bomberLike, touch: 1 };
    const lowShot = shotDispersion(low, "fairway", 100, NO_TRAITS, "short", false);
    const highShot = shotDispersion(high, "fairway", 100, NO_TRAITS, "short", false);
    expect(highShot.lateralSigma).toBeLessThan(lowShot.lateralSigma);
  });

  it("applies a trait's lateralMul only in the context it's scoped to", () => {
    const tight: TraitEffects = { lateralMul: { drive: 0.5 } };
    const baseDrive = shotDispersion(straightLike, "fairway", 200, NO_TRAITS, "drive", false).lateralSigma;
    const withTrait = shotDispersion(straightLike, "fairway", 200, [tight], "drive", false).lateralSigma;
    expect(withTrait).toBeCloseTo(baseDrive * 0.5, 5);

    const baseLong = shotDispersion(straightLike, "fairway", 200, NO_TRAITS, "long", false).lateralSigma;
    const otherContext = shotDispersion(straightLike, "fairway", 200, [tight], "long", false).lateralSigma;
    expect(otherContext).toBeCloseTo(baseLong, 5);
  });

  it("applies shapeAgainstPenalty only when the shot actually curves against the bias", () => {
    const drawer: TraitEffects = { shapeBias: -1, shapeAgainstPenalty: 1.5 };
    const withShape = shotDispersion(straightLike, "fairway", 200, [drawer], "drive", false).lateralSigma;
    const against = shotDispersion(straightLike, "fairway", 200, [drawer], "drive", true).lateralSigma;
    expect(against).toBeCloseTo(withShape * 1.5, 5);
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
