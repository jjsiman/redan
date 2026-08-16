import type { GolferId, GolferResult, GradeResult, Parcel, Piece, ShotPath, Wind } from "./types.js";
import type { Rng } from "./rng.js";
import { createRng } from "./rng.js";
import { ROSTER, resolveTraits, BASE_STATS } from "./traits.js";
import { compileTerrain, findGreen } from "./terrain.js";
import { searchRoute } from "./route.js";
import { SIM_VERSION } from "./version.js";

/** Star-1 gate tolerance: field average must land within this many strokes of designed par. */
const PAR_TOLERANCE = 0.3;

/**
 * Pure, deterministic, seeded. No host APIs (see eslint config) — the same
 * (parcel, pieces, wind, seed) triple must grade identically in the
 * browser, Node, and an edge worker.
 *
 * `wind` is wired into the shot model (flight.ts#resolveFlight) — the
 * yards-per-mph coefficients there are first-pass and uncalibrated, since no
 * wind coefficients survived the doc reconstruction.
 */
export function grade(parcel: Parcel, pieces: Piece[], wind: Wind, seed: number): GradeResult {
  const green = findGreen(pieces);
  if (!green) {
    throw new Error("grade(): design has no green piece placed");
  }
  const greenCenter = { x: green.x, y: green.y };
  const terrain = compileTerrain(parcel, pieces);

  const rng: Rng = createRng(seed);

  const golfers = {} as Record<GolferId, GolferResult>;
  const traces: ShotPath[] = [];

  for (const golfer of ROSTER) {
    const traits = resolveTraits(golfer);
    const result = searchRoute(parcel, terrain, greenCenter, BASE_STATS, traits, wind, rng);
    golfers[golfer.id] = { mean: result.mean, sd: result.sd, route: result.route };
    const totalStrokes = result.trace.reduce((sum, s) => sum + 1 + s.penaltyStrokes, 0);
    traces.push({ golfer: golfer.id, shots: result.trace, totalStrokes });
  }

  const means = ROSTER.map((g) => golfers[g.id]!.mean);
  const sds = ROSTER.map((g) => golfers[g.id]!.sd);
  const field = mean(means);
  const sortedMeans = [...means].sort((a, b) => a - b);
  const spread = Math.max(...means) - Math.min(...means);
  const contested = (sortedMeans[1] ?? sortedMeans[0]!) - sortedMeans[0]!;
  const sd = mean(sds);
  const routeSignatures = new Set(
    ROSTER.map((g) => {
      const r = golfers[g.id]!.route;
      return `${r.aimLine}:${r.aimOffsetDeg}:${r.spin}:${r.power}:${r.laysUp}`;
    }),
  );
  // The green is mandatory (grade() throws without one), so counting it here
  // would tax every hole by a constant 1 regardless of restraint — `used`
  // measures only what the player chose to spend on hazards. doc 5's third
  // star ("material left over — the land did the work") is about that
  // choice, not about paying for the one piece every design must have.
  const used = pieces.reduce((sum, p) => sum + (p.lieType === "green" ? 0 : (p.cost ?? 1)), 0);
  const cap = parcel.pieceCap;
  const parOK = Math.abs(field - parcel.par) <= PAR_TOLERANCE;

  return {
    golfers,
    metrics: { field, spread, sd, routes: routeSignatures.size, contested, used, cap, parOK },
    traces,
    simVersion: SIM_VERSION,
  };
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
