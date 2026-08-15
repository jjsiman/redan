import type {
  ArchetypeStats,
  LieType,
  Parcel,
  Route,
  Shot,
  Vec2,
  Wind,
} from "./types.js";
import type { Rng } from "./rng.js";
import { randNormalMV } from "./rng.js";
import { lieAt, type TerrainQuery } from "./terrain.js";
import { fullCarry, layupTarget, resolvePutts, shotDispersion } from "./shotModel.js";
import { resolveFlight, resolveRoll } from "./flight.js";

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * The archetype's "route space" (doc 4.2): route choice and archetype are
 * the same axis, so each archetype independently searches this space and
 * keeps whichever candidate scores best. Four dimensions:
 *  - aim offset (degrees off the direct line to the target)
 *  - spin (signed curve strength — see flight.ts)
 *  - power (fraction of full carry, for shots that are neither a green
 *    attack nor a lay-up — without this dimension every "just advance the
 *    ball" shot would swing at exactly 100% effort by construction, the
 *    failure mode the doc's Erin Hills 18 example describes fixing)
 *  - lay-up (whether to lay up short of the green when it isn't comfortably
 *    reachable, vs. always advancing at full power)
 * Trimmed to ~3 candidates on aim/spin (72 combos total) to keep the grid
 * search tractable now that it's 4-dimensional instead of 2.
 */
const AIM_OFFSET_CANDIDATES = [-6, 0, 6];
const SPIN_CANDIDATES = [-1, 0, 1];
const POWER_CANDIDATES = [1.0, 0.9, 0.82, 0.72];
const LAYUP_CANDIDATES = [true, false];

const ROUTE_SEARCH_TRIALS = 20;
const FINAL_TRIALS = 150;
const MAX_SHOTS_PER_ROUND = 20;

/**
 * "Go for it" threshold: within 5% of full carry is a green in regulation
 * attempt. Between that and 1.8x full carry is the lay-up/go-for-it decision
 * zone (the par-5-in-two case). Beyond 1.8x, always swing away — this is a
 * first-pass heuristic for the doc's "par-5 reach-in-two branch," not yet
 * checked against a real hole.
 */
const REACH_THRESHOLD = 1.05;
const LAYUP_ZONE_LIMIT = 1.8;
const WATER_DROP_BUFFER = 8;

export interface RoundResult {
  strokes: number;
  shots: Shot[];
}

interface HazardDrop {
  pos: Vec2;
  lie: LieType;
  penalty: number;
}

/** Water = 1 penalty stroke, drop back along the flight line until clear. OB = stroke and distance. */
function resolveHazardDrop(
  terrain: TerrainQuery,
  point: Vec2,
  hazardLie: "water" | "ob",
  aux: number,
  auy: number,
  prevPos: Vec2,
  prevLie: LieType,
): HazardDrop {
  if (hazardLie === "ob") {
    return { pos: prevPos, lie: prevLie, penalty: 1 };
  }
  let pos = point;
  let lie: LieType = "water";
  let guard = 0;
  while ((lie === "water" || lie === "ob") && guard < 10) {
    pos = { x: pos.x - aux * WATER_DROP_BUFFER, y: pos.y - auy * WATER_DROP_BUFFER };
    lie = lieAt(terrain, pos);
    guard++;
  }
  return { pos, lie, penalty: 1 };
}

function playRound(
  parcel: Parcel,
  terrain: TerrainQuery,
  greenCenter: Vec2,
  stats: ArchetypeStats,
  route: Route,
  wind: Wind,
  rng: Rng,
): RoundResult {
  let pos: Vec2 = { x: 0, y: 0 };
  let lie: LieType = "tee";
  let strokes = 0;
  const shots: Shot[] = [];

  for (let i = 0; i < MAX_SHOTS_PER_ROUND && lie !== "green"; i++) {
    const full = fullCarry(stats, lie);
    const remaining = dist(pos, greenCenter);

    let targetDist: number;
    if (remaining <= full * REACH_THRESHOLD) {
      targetDist = remaining;
    } else if (route.laysUp && remaining <= full * LAYUP_ZONE_LIMIT) {
      targetDist = Math.min(full, Math.max(20, layupTarget(remaining, full)));
    } else {
      targetDist = Math.min(remaining, full * route.power);
    }

    // Phase 1: intended flight — a deterministic curved arc from aim/spin/wind/elevation.
    const flight = resolveFlight(parcel, pos, greenCenter, targetDist, route, wind);

    const flightDirX = flight.endpoint.x - pos.x;
    const flightDirY = flight.endpoint.y - pos.y;
    const flightLen = Math.hypot(flightDirX, flightDirY) || 1;
    const aux = flightDirX / flightLen;
    const auy = flightDirY / flightLen;
    const apx = -auy;
    const apy = aux;

    // Phase 2: execution noise — the doc-calibrated sigma formulas, applied
    // around the curved intended endpoint rather than a straight-line one.
    const { lateralSigma, distanceSigma } = shotDispersion(stats, lie, targetDist);
    const distanceError = randNormalMV(rng, 0, distanceSigma);
    const lateralError = randNormalMV(rng, 0, lateralSigma);
    const carryLanding: Vec2 = {
      x: flight.endpoint.x + aux * distanceError + apx * lateralError,
      y: flight.endpoint.y + auy * distanceError + apy * lateralError,
    };
    // flight.path samples the deterministic (noiseless) curve, ending at
    // flight.endpoint; the actual carry lands at carryLanding = endpoint +
    // execution noise. Blending the noise in with the same t^2 growth the
    // curve itself uses (rather than tacking carryLanding on as an extra
    // point) keeps the rendered flight one smooth arc ending at the real
    // landing spot, instead of a smooth curve with a sudden kink at the end.
    const noiseX = carryLanding.x - flight.endpoint.x;
    const noiseY = carryLanding.y - flight.endpoint.y;
    const lastIdx = flight.path.length - 1;
    const path = flight.path.map((p, idx) => {
      const t = idx / lastIdx;
      const t2 = t * t;
      return { x: p.x + noiseX * t2, y: p.y + noiseY * t2 };
    });

    // Roll and hazard-drop direction: the ball travels toward where it
    // actually landed (carryLanding), not the pre-noise aim line (aux/auy,
    // which is only the right frame for decomposing dispersion error above).
    // Using the aim line here would roll the ball off at an angle the drawn
    // curve didn't actually arrive from.
    const travelDirX = carryLanding.x - pos.x;
    const travelDirY = carryLanding.y - pos.y;
    const travelLen = Math.hypot(travelDirX, travelDirY) || 1;
    const tux = travelDirX / travelLen;
    const tuy = travelDirY / travelLen;

    // Phase 3: hazard check on the fly, then ground roll, then a second
    // hazard check — a ball can roll from the fairway into a bunker, off a
    // false front, or into a pond it never flew over.
    const carryLie = lieAt(terrain, carryLanding);
    let finalPos: Vec2;
    let finalLie: LieType;
    let penalty: number;

    if (carryLie === "water" || carryLie === "ob") {
      const hazard = resolveHazardDrop(terrain, carryLanding, carryLie, tux, tuy, pos, lie);
      finalPos = hazard.pos;
      finalLie = hazard.lie;
      penalty = hazard.penalty;
    } else {
      const rolled = resolveRoll(parcel, carryLanding, { x: tux, y: tuy }, carryLie);
      const rolledLie = lieAt(terrain, rolled);
      if (rolledLie === "water" || rolledLie === "ob") {
        const hazard = resolveHazardDrop(terrain, rolled, rolledLie, tux, tuy, pos, lie);
        finalPos = hazard.pos;
        finalLie = hazard.lie;
        penalty = hazard.penalty;
      } else {
        finalPos = rolled;
        finalLie = rolledLie;
        penalty = 0;
      }
    }

    shots.push({ from: pos, to: finalPos, lieAfter: finalLie, penaltyStrokes: penalty, path });
    strokes += 1 + penalty;
    pos = finalPos;
    lie = finalLie;
  }

  const distFeet = dist(pos, greenCenter) * 3;
  const { putts } = resolvePutts(distFeet, stats.touch, rng());
  strokes += putts;
  shots.push({ from: pos, to: greenCenter, lieAfter: "green", penaltyStrokes: 0 });

  return { strokes, shots };
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[], m: number): number {
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export interface RouteSearchResult {
  route: Route;
  mean: number;
  sd: number;
  scores: number[];
  trace: Shot[];
}

/**
 * Searches the route space for one archetype and returns the best candidate
 * (lowest mean score, ties broken by lower sd), re-evaluated over
 * FINAL_TRIALS rounds for a stable mean/sd.
 */
export function searchRoute(
  parcel: Parcel,
  terrain: TerrainQuery,
  greenCenter: Vec2,
  stats: ArchetypeStats,
  wind: Wind,
  rng: Rng,
): RouteSearchResult {
  let best: { route: Route; mean: number; sd: number } | null = null;

  for (const aimOffsetDeg of AIM_OFFSET_CANDIDATES) {
    for (const spin of SPIN_CANDIDATES) {
      for (const laysUp of LAYUP_CANDIDATES) {
        for (const power of POWER_CANDIDATES) {
          const route: Route = { aimOffsetDeg, spin, power, laysUp };
          const scores: number[] = [];
          for (let i = 0; i < ROUTE_SEARCH_TRIALS; i++) {
            scores.push(playRound(parcel, terrain, greenCenter, stats, route, wind, rng).strokes);
          }
          const m = mean(scores);
          const sd = stddev(scores, m);
          if (!best || m < best.mean || (m === best.mean && sd < best.sd)) {
            best = { route, mean: m, sd };
          }
        }
      }
    }
  }

  const chosen = best!.route;
  const scores: number[] = [];
  let trace: Shot[] = [];
  for (let i = 0; i < FINAL_TRIALS; i++) {
    const result = playRound(parcel, terrain, greenCenter, stats, chosen, wind, rng);
    scores.push(result.strokes);
    if (i === 0) trace = result.shots;
  }
  const m = mean(scores);
  const sd = stddev(scores, m);

  return { route: chosen, mean: m, sd, scores, trace };
}

export const ROUTE_SEARCH_TUNABLES = {
  AIM_OFFSET_CANDIDATES,
  SPIN_CANDIDATES,
  POWER_CANDIDATES,
  LAYUP_CANDIDATES,
  ROUTE_SEARCH_TRIALS,
  FINAL_TRIALS,
  MAX_SHOTS_PER_ROUND,
};
