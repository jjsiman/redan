import type {
  ArchetypeStats,
  LieType,
  Parcel,
  Route,
  Shot,
  Vec2,
} from "./types.js";
import type { Rng } from "./rng.js";
import { randNormalMV } from "./rng.js";
import { lieAt, playsLikeDelta, type TerrainQuery } from "./terrain.js";
import { fullCarry, layupTarget, resolvePutts, shotDispersion } from "./shotModel.js";

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Lateral aim biases searched, as a fraction of corridor half-width, plus
 * whether to lay up short of the green when it isn't comfortably reachable,
 * plus how hard to swing (as a fraction of full carry) on a shot that's
 * neither a green attack nor a lay-up. This last dimension matters: the doc
 * notes the effort penalty makes swinging flat-out on every shot wrong — the
 * original calibration run found the bomber voluntarily throttling to 239
 * yards on Erin Hills 18 rather than swinging its full ~285, because the
 * effort penalty above 72% of full carry costs more control than the extra
 * yardage is worth. Without this dimension every "just advance the ball"
 * shot swings at exactly 100% effort (maximum penalty) by construction.
 *
 * This is the archetype's "route space" (doc 4.2): route choice and
 * archetype are the same axis, so each archetype searches this space
 * independently and keeps whichever candidate scores best.
 */
const AIM_BIAS_CANDIDATES = [-0.7, -0.35, 0, 0.35, 0.7];
const LAYUP_CANDIDATES = [true, false];
const SWING_EFFORT_CANDIDATES = [1.0, 0.9, 0.82, 0.72];

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

function playRound(
  parcel: Parcel,
  terrain: TerrainQuery,
  greenCenter: Vec2,
  stats: ArchetypeStats,
  route: Route,
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
      targetDist = Math.min(remaining, full * route.swingEffort);
    }

    const goingForGreen = targetDist === remaining;
    const dirX = greenCenter.x - pos.x;
    const dirY = greenCenter.y - pos.y;
    const dirLen = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / dirLen;
    const uy = dirY / dirLen;
    const px = -uy;
    const py = ux;
    const lateralOffset = goingForGreen ? 0 : route.aimBias * parcel.corridorHalfWidth;

    const aim: Vec2 = {
      x: pos.x + ux * targetDist + px * lateralOffset,
      y: pos.y + uy * targetDist + py * lateralOffset,
    };

    const aimDirX = aim.x - pos.x;
    const aimDirY = aim.y - pos.y;
    const aimLen = Math.hypot(aimDirX, aimDirY) || 1;
    const aux = aimDirX / aimLen;
    const auy = aimDirY / aimLen;
    const apx = -auy;
    const apy = aux;

    const { lateralSigma, distanceSigma } = shotDispersion(stats, lie, targetDist);
    const distanceError = randNormalMV(rng, 0, distanceSigma);
    const lateralError = randNormalMV(rng, 0, lateralSigma);
    const elevDelta = playsLikeDelta(parcel.elevationProfile, pos.x, aim.x);
    const actualDist = targetDist + distanceError - elevDelta;

    const landing: Vec2 = {
      x: pos.x + aux * actualDist + apx * lateralError,
      y: pos.y + auy * actualDist + apy * lateralError,
    };

    let penalty = 0;
    let finalPos = landing;
    let finalLie = lieAt(terrain, landing);

    if (finalLie === "water") {
      penalty = 1;
      let guard = 0;
      finalPos = landing;
      finalLie = "water";
      while (finalLie === "water" || finalLie === "ob") {
        finalPos = { x: finalPos.x - aux * WATER_DROP_BUFFER, y: finalPos.y - auy * WATER_DROP_BUFFER };
        finalLie = lieAt(terrain, finalPos);
        guard++;
        if (guard > 10) break;
      }
    } else if (finalLie === "ob") {
      penalty = 1;
      finalPos = pos;
      finalLie = lie;
    }

    shots.push({ from: pos, to: finalPos, lieAfter: finalLie, penaltyStrokes: penalty });
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
  rng: Rng,
): RouteSearchResult {
  let best: { route: Route; mean: number; sd: number } | null = null;

  for (const aimBias of AIM_BIAS_CANDIDATES) {
    for (const laysUp of LAYUP_CANDIDATES) {
      for (const swingEffort of SWING_EFFORT_CANDIDATES) {
        const route: Route = { aimBias, laysUp, swingEffort };
        const scores: number[] = [];
        for (let i = 0; i < ROUTE_SEARCH_TRIALS; i++) {
          scores.push(playRound(parcel, terrain, greenCenter, stats, route, rng).strokes);
        }
        const m = mean(scores);
        const sd = stddev(scores, m);
        if (!best || m < best.mean || (m === best.mean && sd < best.sd)) {
          best = { route, mean: m, sd };
        }
      }
    }
  }

  const chosen = best!.route;
  const scores: number[] = [];
  let trace: Shot[] = [];
  for (let i = 0; i < FINAL_TRIALS; i++) {
    const result = playRound(parcel, terrain, greenCenter, stats, chosen, rng);
    scores.push(result.strokes);
    if (i === 0) trace = result.shots;
  }
  const m = mean(scores);
  const sd = stddev(scores, m);

  return { route: chosen, mean: m, sd, scores, trace };
}

export const ROUTE_SEARCH_TUNABLES = {
  AIM_BIAS_CANDIDATES,
  LAYUP_CANDIDATES,
  SWING_EFFORT_CANDIDATES,
  ROUTE_SEARCH_TRIALS,
  FINAL_TRIALS,
  MAX_SHOTS_PER_ROUND,
};
