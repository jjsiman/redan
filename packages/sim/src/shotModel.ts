import type { GolferStats, LieType, ShotContext, TraitEffects } from "./types.js";
import { lieFactors } from "./terrain.js";
import { FIELD_SKILL } from "./traits.js";

/**
 * Calibrated shot model (doc 4.3) — the formulas themselves are unchanged
 * and still load-bearing. What's new in the trait rework is the multiplier
 * layer applied on top: `traits` (a golfer's two resolved TraitEffects,
 * traits.ts) and `context` (which kind of shot this is, ShotContext) let a
 * trait's bonus/penalty apply only where it's supposed to, without touching
 * the doc-transcribed formulas underneath. See traits.ts's module doc for
 * why this replaced the old fixed four-archetype stat sheet.
 */

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function traitMul(
  traits: TraitEffects[],
  field: "carryMul" | "lateralMul" | "distanceMul",
  context: ShotContext,
): number {
  let m = 1;
  for (const t of traits) {
    const perContext = t[field]?.[context];
    if (perContext != null) m *= perContext;
  }
  return m;
}

function traitSum(traits: TraitEffects[], field: "recoveryBonus" | "puttBonus"): number {
  return traits.reduce((sum, t) => sum + (t[field] ?? 0), 0);
}

/** Base recovery stat plus any trait recoveryBonus (e.g. `scrapper`, `grinder`), clamped to a valid stat range. */
export function effectiveRecovery(stats: GolferStats, traits: TraitEffects[]): number {
  return clamp01(stats.recovery + traitSum(traits, "recoveryBonus"));
}

/** Base touch stat plus any trait puttBonus (e.g. `putter`) — feeds resolvePutts only, not shot dispersion. */
export function effectiveTouch(stats: GolferStats, traits: TraitEffects[]): number {
  return clamp01(stats.touch + traitSum(traits, "puttBonus"));
}

/** Recovery pulls the current lie's factors partway back toward the 1.0 baseline. */
export function effectiveLieFactors(lie: LieType, recovery: number) {
  const { distanceFactor, dispersionFactor } = lieFactors(lie);
  return {
    distanceFactor: distanceFactor + recovery * (1 - distanceFactor) * 0.5,
    dispersionFactor: dispersionFactor - recovery * (dispersionFactor - 1) * 0.45,
  };
}

/** Full carry potential (yards) for this golfer off the given lie, for the given kind of shot. */
export function fullCarry(
  stats: GolferStats,
  lie: LieType,
  traits: TraitEffects[],
  context: ShotContext,
): number {
  const { distanceFactor } = effectiveLieFactors(lie, effectiveRecovery(stats, traits));
  const base = (185 + stats.power * 105) * FIELD_SKILL * distanceFactor;
  return base * traitMul(traits, "carryMul", context);
}

export interface ShotDispersion {
  full: number;
  effort: number;
  lateralSigma: number;
  distanceSigma: number;
}

/**
 * Lateral/distance sigma (yards) for a swing of `dist` yards off the given
 * lie. `curvedAgainstShape` is whether the chosen spin curves opposite a
 * `drawer`/`fader` trait's preferred direction — see traits.ts's
 * `shapeAgainstPenalty`.
 */
export function shotDispersion(
  stats: GolferStats,
  lie: LieType,
  dist: number,
  traits: TraitEffects[],
  context: ShotContext,
  curvedAgainstShape: boolean,
): ShotDispersion {
  const recovery = effectiveRecovery(stats, traits);
  const { dispersionFactor } = effectiveLieFactors(lie, recovery);
  const full = fullCarry(stats, lie, traits, context);

  let lateralSigma = dist * (0.105 - stats.accuracy * 0.062) * dispersionFactor;
  let distanceSigma = dist * (0.055 - stats.accuracy * 0.02);

  const effort = full > 0 ? dist / full : Infinity;
  if (effort > 0.72) {
    const k = 1 + 2.4 * Math.pow(effort - 0.72, 1.15);
    lateralSigma *= k;
    distanceSigma *= k;
  }

  if (dist < 110) lateralSigma *= 0.7;
  if (dist < 145) lateralSigma *= 1 - 0.3 * stats.touch;

  lateralSigma *= traitMul(traits, "lateralMul", context);
  distanceSigma *= traitMul(traits, "distanceMul", context);

  if (curvedAgainstShape) {
    for (const t of traits) {
      if (t.shapeAgainstPenalty) lateralSigma *= t.shapeAgainstPenalty;
    }
  }

  return { full, effort, lateralSigma, distanceSigma };
}

/** Layup target distance (yards) when a golfer can't comfortably reach in regulation. */
export function layupTarget(remaining: number, full: number): number {
  return remaining - full * 0.42;
}

export interface PuttOutcome {
  putts: 1 | 2 | 3;
}

/**
 * Resolves putting from `distanceFeet` to the hole. P(1) and P(3) partition
 * the outcome space; 2-putt is whatever probability remains. `touch` here
 * should be effectiveTouch's output — puttBonus applies only here, not to
 * approach-shot dispersion.
 */
export function resolvePutts(distanceFeet: number, touch: number, roll: number): PuttOutcome {
  const p1 = clamp01(0.88 - 0.07 * distanceFeet + touch * 0.3);
  const p3Raw = clamp01((distanceFeet - 7) * 0.032 - touch * 0.1);
  const p3 = Math.min(p3Raw, 1 - p1);

  if (roll < p1) return { putts: 1 };
  if (roll < p1 + p3) return { putts: 3 };
  return { putts: 2 };
}
