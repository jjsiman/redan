// PARKED — moved out of src/ (2026-08-15) so it's excluded from the package
// build and no longer required to compile. The corridor/trait rework
// (docs/redan-project-doc.md's amended 4.2/6.1/6.2) replaced ArchetypeName
// with an open GolferId roster and Parcel.corridorHalfWidth/obHalfWidth with
// Parcel.corridor — both of which this file (and every validation/*.hole.json
// fixture's `expected.favors: ArchetypeName[]`) is written against the old
// shape of. That's a semantic migration (which trait-composed golfer, if
// any, corresponds to "commentary says this hole favors BOMBER"?), not a
// mechanical one, so it's quarantined here rather than half-migrated. See
// docs/redan-project-doc.md §4.4/§9 for the gate's suspension and
// packages/sim/README.md's Status section for why. Revisit once the new
// roster has enough of its own track record to re-register expectations
// against it, or drop this in favor of scripts/roster-balance.mjs's simpler
// win-share approach.
import { readdirSync, readFileSync } from "node:fs";
import { grade, ARCHETYPE_NAMES, SIM_VERSION } from "@redan/sim";
import type { ArchetypeName, Wind } from "@redan/sim";
import { toSimInputs, SCHEMA_VERSION } from "@redan/schema";
import type { Design, Parcel } from "@redan/schema";

const VALIDATION_DIR = new URL("../validation/", import.meta.url);

/**
 * M0's validation-set gate (doc 9): "15+ real holes; model agrees with
 * consensus on archetype bias for 12; every disagreement has a written
 * explanation." A hole's expectation is pre-registered — researched and
 * cited before the sim is ever run against it — so agreement is a real
 * check, not curve-fitting after the fact.
 */
export interface ExpectedBias {
  /**
   * The archetype(s) expected to post the lowest mean score. Length 1 for an
   * ordinary bias call. Length 2 with `tie: true` for a hole where two
   * archetypes are expected to be statistically indistinguishable (doc 4.4's
   * short par 3s, STRAIGHT/TOUCH within 0.01).
   */
  favors: ArchetypeName[];
  tie?: boolean;
  rationale: string;
  sources: string[];
}

export interface ValidationHole {
  id: string;
  course: string;
  hole: number;
  par: number;
  yardage: number;
  /** Published field scoring average, where available — the plausibility check's independent signal. */
  scoringAverage?: number;
  wind: Wind;
  expected: ExpectedBias;
  /** Fidelity compromises made encoding this hole (dogleg carved from a wide rectangle, a hazard simplified to a shape-table primitive, etc). Printed in the report, never silent. */
  approximations: string[];
  /** Required non-null whenever the hole doesn't agree — noise-dominated, geometry-suspect, or a genuine model miss. */
  disagreement: string | null;
  parcel: Parcel;
  design: Design;
}

/** Every `<id>.hole.json` under validation/, sorted for a stable report order. Not a hardcoded id list — 16+ holes makes that unmanageable (contrast @redan/content's `PARCEL_IDS`). */
export function loadValidationHoles(): ValidationHole[] {
  const files = readdirSync(VALIDATION_DIR).filter((f) => f.endsWith(".hole.json"));
  return files
    .map((f) => JSON.parse(readFileSync(new URL(f, VALIDATION_DIR), "utf-8")) as ValidationHole)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Two archetypes within this many strokes count as a tie, matching doc 4.4's "within 0.01" par-3 example with headroom for a different seed/geometry. */
export const TIE_EPSILON = 0.05;

/** |sim field average - published scoring average| beyond this marks the hole's geometry, not its archetype bias, as the thing to fix first. */
export const PLAUSIBILITY_THRESHOLD = 0.75;

export interface AgreementInput {
  tie: boolean;
  favors: ArchetypeName[];
  winner: ArchetypeName;
  runnerUp: ArchetypeName;
  margin: number;
  trusted: boolean;
}

/**
 * The pure agreement rule, factored out of `gradeHole` so it's testable
 * without running the sim: a non-tie hole agrees iff the observed winner is
 * one of the expected archetypes and the reading is trusted; a tie hole
 * additionally requires the winner/runner-up margin to fall inside
 * TIE_EPSILON and `favors` to name exactly that pair.
 */
export function decideAgreement(input: AgreementInput): boolean {
  const favorsSet = new Set(input.favors);
  if (input.tie) {
    return (
      input.trusted &&
      input.margin <= TIE_EPSILON &&
      favorsSet.size === 2 &&
      favorsSet.has(input.winner) &&
      favorsSet.has(input.runnerUp)
    );
  }
  return input.trusted && favorsSet.has(input.winner);
}

interface SeedResult {
  means: Record<ArchetypeName, number>;
  field: number;
  winner: ArchetypeName;
}

function runSeed(hole: ValidationHole, seed: number): SeedResult {
  const { parcel, pieces } = toSimInputs(hole.parcel, hole.design);
  const result = grade(parcel, pieces, hole.wind, seed);
  const means = {} as Record<ArchetypeName, number>;
  for (const name of ARCHETYPE_NAMES) means[name] = result.archetypes[name].mean;
  const winner = ARCHETYPE_NAMES.reduce((a, b) => (means[b] < means[a] ? b : a));
  return { means, field: result.metrics.field, winner };
}

export interface HoleReport {
  id: string;
  course: string;
  hole: number;
  par: number;
  yardage: number;
  expectedFavors: ArchetypeName[];
  expectedTie: boolean;
  /** Lowest-mean archetype(s) averaged across seeds — the pair, for a tie hole. */
  observedBias: ArchetypeName[];
  /** Gap between the winner and the runner-up in the averaged means. */
  margin: number;
  /** True only if every seed's own winner is identical (non-tie) or the tie pair holds at every seed (tie). */
  seedStable: boolean;
  fieldAverage: number;
  scoringAverage?: number;
  /** False if a published scoring average exists and the sim misses it by more than PLAUSIBILITY_THRESHOLD. */
  plausible: boolean;
  /** seedStable && plausible — only a trusted reading counts toward the gate. */
  trusted: boolean;
  agree: boolean;
  disagreement: string | null;
  approximations: string[];
}

export interface ValidationReport {
  holes: HoleReport[];
  agreementCount: number;
  holeCount: number;
  /** doc 9's gate: 15+ holes, 12 agree. */
  gateMet: boolean;
  simVersion: string;
  schemaVersion: string;
  seeds: number[];
}

function gradeHole(hole: ValidationHole, seeds: number[]): HoleReport {
  const seedResults = seeds.map((seed) => runSeed(hole, seed));

  const avgMeans = {} as Record<ArchetypeName, number>;
  for (const name of ARCHETYPE_NAMES) {
    avgMeans[name] = seedResults.reduce((sum, r) => sum + r.means[name], 0) / seedResults.length;
  }
  const sortedByMean = [...ARCHETYPE_NAMES].sort((a, b) => avgMeans[a] - avgMeans[b]);
  const winner = sortedByMean[0]!;
  const runnerUp = sortedByMean[1]!;
  const margin = avgMeans[runnerUp] - avgMeans[winner];
  const fieldAverage = seedResults.reduce((sum, r) => sum + r.field, 0) / seedResults.length;

  const tie = hole.expected.tie === true;
  const observedBias: ArchetypeName[] = tie ? [winner, runnerUp] : [winner];

  // Non-tie: every seed must pick the same single winner. Tie: every seed's
  // own lowest-two must be exactly {winner, runnerUp} (order may swap
  // between the two seed-to-seed — that IS the tie), not a fixed archetype.
  const seedStable = tie
    ? seedResults.every((r) => {
        const seedSorted = [...ARCHETYPE_NAMES].sort((a, b) => r.means[a] - r.means[b]);
        const seedLowestTwo = new Set([seedSorted[0], seedSorted[1]]);
        return seedLowestTwo.has(winner) && seedLowestTwo.has(runnerUp);
      })
    : seedResults.every((r) => r.winner === winner);

  const plausible = hole.scoringAverage === undefined || Math.abs(fieldAverage - hole.scoringAverage) <= PLAUSIBILITY_THRESHOLD;
  const trusted = seedStable && plausible;

  const agree = decideAgreement({ tie, favors: hole.expected.favors, winner, runnerUp, margin, trusted });

  return {
    id: hole.id,
    course: hole.course,
    hole: hole.hole,
    par: hole.par,
    yardage: hole.yardage,
    expectedFavors: hole.expected.favors,
    expectedTie: tie,
    observedBias,
    margin,
    seedStable,
    fieldAverage,
    ...(hole.scoringAverage === undefined ? {} : { scoringAverage: hole.scoringAverage }),
    plausible,
    trusted,
    agree,
    disagreement: hole.disagreement,
    approximations: hole.approximations,
  };
}

export function runValidation(holes: ValidationHole[], seeds: number[]): ValidationReport {
  const reports = holes.map((h) => gradeHole(h, seeds));
  const agreementCount = reports.filter((r) => r.agree).length;
  return {
    holes: reports,
    agreementCount,
    holeCount: reports.length,
    gateMet: reports.length >= 15 && agreementCount >= 12,
    simVersion: SIM_VERSION,
    schemaVersion: SCHEMA_VERSION,
    seeds,
  };
}

/** True iff every hole that doesn't agree carries a non-empty explanation — the gate's "every disagreement has a written explanation" clause, enforced mechanically. */
export function everyDisagreementExplained(report: ValidationReport): boolean {
  return report.holes.every((r) => r.agree || (r.disagreement !== null && r.disagreement.trim().length > 0));
}
