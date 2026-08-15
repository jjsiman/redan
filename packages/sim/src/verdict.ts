import type { GolferId, GradeMetrics } from "./types.js";

export interface Verdict {
  stars: 0 | 1 | 2 | 3;
  sentences: string[];
}

/**
 * Doc 5's star gates and coaching-sentence idea, applied to a GradeResult's
 * metrics. The four bracketed examples in the doc are reproduced closely;
 * everything else here (the "good" cases, the exact wording) is composed in
 * the same voice, not verbatim from the doc — a first pass, not settled.
 *
 * Shared between `packages/content`'s SVG diagnostic renderer and
 * `apps/web`'s editor so the two never drift apart on what a star means.
 * `best`/`worst` are golfer ids, already resolved by the caller (grade.ts
 * doesn't order golfers, and callers differ in whether they have labels to
 * show instead of raw ids).
 */
export function describeVerdict(
  par: number,
  metrics: GradeMetrics,
  best: GolferId,
  worst: GolferId,
): Verdict {
  const { field, spread, sd, routes, used, cap, parOK, contested } = metrics;
  const sentences: string[] = [];

  sentences.push(`Plays as a par ${par} — field average ${field.toFixed(2)}.`);

  let stars: 0 | 1 | 2 | 3 = 0;
  if (parOK && spread < 0.85) {
    stars = 1;
    if (routes > 1 && sd > 0.62 && sd < 1.75) {
      stars = 2;
      if (used < cap) stars = 3;
    }
  }

  if (spread >= 0.85) {
    sentences.push(`${best} beat ${worst} by ${spread.toFixed(2)}. One kind of player is being handed the hole.`);
  } else if (routes <= 1) {
    sentences.push("Every golfer played the identical line. There is no decision here.");
  } else if (contested < 0.1) {
    sentences.push(`Tight at the top (${contested.toFixed(2)} between 1st and 2nd) — several builds are really in it.`);
  }

  if (sd < 0.62) {
    sentences.push(`Scores barely varied (σ ${sd.toFixed(2)}). Nothing is at stake.`);
  } else if (sd > 1.75) {
    sentences.push(`Scores were everywhere (σ ${sd.toFixed(2)}). It's a lottery, not a test.`);
  } else {
    sentences.push(`Real spread (σ ${sd.toFixed(2)}) — skill is rewarded.`);
  }

  if (stars === 3) {
    const unspent = cap - used;
    sentences.push(`${unspent} piece${unspent === 1 ? "" : "s"} unspent — the land did the work.`);
  }

  return { stars, sentences };
}

/** Convenience: resolves best/worst from a GradeResult.golfers record, then calls describeVerdict. */
export function describeResultFromGolfers(
  par: number,
  metrics: GradeMetrics,
  golfers: Record<GolferId, { mean: number }>,
): Verdict {
  const entries = Object.entries(golfers) as [GolferId, { mean: number }][];
  const best = entries.reduce((a, b) => (b[1].mean < a[1].mean ? b : a))[0];
  const worst = entries.reduce((a, b) => (b[1].mean > a[1].mean ? b : a))[0];
  return describeVerdict(par, metrics, best, worst);
}
