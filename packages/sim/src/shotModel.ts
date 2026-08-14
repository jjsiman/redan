import type { ArchetypeStats, LieType } from "./types.js";
import { lieFactors } from "./terrain.js";
import { FIELD_SKILL } from "./archetypes.js";

/**
 * Calibrated shot model (doc 4.3). Six of eight validation holes matched
 * expert consensus at these coefficients; treat them as load-bearing, not
 * placeholders — any change here re-opens the whole validation set.
 */

/** Recovery pulls the current lie's factors partway back toward the 1.0 baseline. */
export function effectiveLieFactors(lie: LieType, recovery: number) {
  const { distanceFactor, dispersionFactor } = lieFactors(lie);
  return {
    distanceFactor: distanceFactor + recovery * (1 - distanceFactor) * 0.5,
    dispersionFactor: dispersionFactor - recovery * (dispersionFactor - 1) * 0.45,
  };
}

/** Full carry potential (yards) for this archetype off the given lie. */
export function fullCarry(stats: ArchetypeStats, lie: LieType): number {
  const { distanceFactor } = effectiveLieFactors(lie, stats.recovery);
  return (185 + stats.power * 105) * FIELD_SKILL * distanceFactor;
}

export interface ShotDispersion {
  full: number;
  effort: number;
  lateralSigma: number;
  distanceSigma: number;
}

/** Lateral/distance sigma (yards) for a swing of `dist` yards off the given lie. */
export function shotDispersion(stats: ArchetypeStats, lie: LieType, dist: number): ShotDispersion {
  const { dispersionFactor } = effectiveLieFactors(lie, stats.recovery);
  const full = fullCarry(stats, lie);

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

  return { full, effort, lateralSigma, distanceSigma };
}

/** Layup target distance (yards) when an archetype can't comfortably reach in regulation. */
export function layupTarget(remaining: number, full: number): number {
  return remaining - full * 0.42;
}

export interface PuttOutcome {
  putts: 1 | 2 | 3;
}

/**
 * Resolves putting from `distanceFeet` to the hole. P(1) and P(3) partition
 * the outcome space; 2-putt is whatever probability remains.
 */
export function resolvePutts(distanceFeet: number, touch: number, roll: number): PuttOutcome {
  const p1 = clamp01(0.88 - 0.07 * distanceFeet + touch * 0.3);
  const p3Raw = clamp01((distanceFeet - 7) * 0.032 - touch * 0.1);
  const p3 = Math.min(p3Raw, 1 - p1);

  if (roll < p1) return { putts: 1 };
  if (roll < p1 + p3) return { putts: 3 };
  return { putts: 2 };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
