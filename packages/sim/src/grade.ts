import type {
  ArchetypeResult,
  ArchetypeName,
  GradeResult,
  Parcel,
  Piece,
  ShotPath,
  Wind,
} from "./types.js";
import type { Rng } from "./rng.js";
import { createRng } from "./rng.js";
import { ARCHETYPE_NAMES, ARCHETYPES } from "./archetypes.js";
import { findGreen } from "./terrain.js";
import { searchRoute } from "./route.js";
import { SIM_VERSION } from "./version.js";

/** Star-1 gate tolerance: field average must land within this many strokes of designed par. */
const PAR_TOLERANCE = 0.3;

/**
 * Pure, deterministic, seeded. No host APIs (see eslint config) — the same
 * (parcel, pieces, wind, seed) triple must grade identically in the
 * browser, Node, and an edge worker.
 *
 * `wind` is accepted for contract compatibility (doc 4.1) but not yet wired
 * into the shot model — no wind coefficients survived the doc reconstruction,
 * and inventing them isn't something we can calibrate against real holes.
 */
export function grade(parcel: Parcel, pieces: Piece[], _wind: Wind, seed: number): GradeResult {
  const green = findGreen(pieces);
  if (!green) {
    throw new Error("grade(): design has no green piece placed");
  }
  const greenCenter = { x: green.x, y: green.y };
  const terrain = {
    corridorHalfWidth: parcel.corridorHalfWidth,
    obHalfWidth: parcel.obHalfWidth,
    pieces,
  };

  const rng: Rng = createRng(seed);

  const archetypes = {} as Record<ArchetypeName, ArchetypeResult>;
  const traces: ShotPath[] = [];

  for (const name of ARCHETYPE_NAMES) {
    const stats = ARCHETYPES[name];
    const result = searchRoute(parcel, terrain, greenCenter, stats, rng);
    archetypes[name] = { mean: result.mean, sd: result.sd, route: result.route };
    const totalStrokes = result.trace.reduce((sum, s) => sum + 1 + s.penaltyStrokes, 0);
    traces.push({ archetype: name, shots: result.trace, totalStrokes });
  }

  const means = ARCHETYPE_NAMES.map((n) => archetypes[n].mean);
  const sds = ARCHETYPE_NAMES.map((n) => archetypes[n].sd);
  const field = mean(means);
  const spread = Math.max(...means) - Math.min(...means);
  const sd = mean(sds);
  const routeSignatures = new Set(
    ARCHETYPE_NAMES.map((n) => {
      const r = archetypes[n].route;
      return `${r.aimBias}:${r.laysUp}:${r.swingEffort}`;
    }),
  );
  const used = pieces.reduce((sum, p) => sum + (p.cost ?? 1), 0);
  const cap = parcel.pieceCap;
  const parOK = Math.abs(field - parcel.par) <= PAR_TOLERANCE;

  return {
    archetypes,
    metrics: { field, spread, sd, routes: routeSignatures.size, used, cap, parOK },
    traces,
    simVersion: SIM_VERSION,
  };
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
