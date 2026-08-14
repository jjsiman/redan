import type { Parcel, Route, Vec2, Wind, LieType } from "./types.js";
import { gradientAt, playsLikeDelta, ROLL_FACTORS } from "./terrain.js";

/**
 * The new, physically-motivated (not doc-calibrated) half of the shot
 * model: a closed-form curved flight arc plus ground roll. Deliberately
 * kept in its own module, separate from shotModel.ts's doc-transcribed
 * statistical formulas (carry, execution-noise sigma, putting) — the file
 * boundary makes calibration status visible: everything in here is a
 * first-pass, uncalibrated approximation, invented for this pass, with
 * nothing in `docs/redan-project-doc.md` to check it against.
 *
 * Deliberately NOT a tick-by-tick physics/bounce simulation — flight is a
 * closed-form formula (heading + a curve that grows with distance + a wind
 * decomposition), and roll is a single closed-form displacement from local
 * slope. This keeps the sim fast, pure, and deterministic.
 */

function unit(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function perp(u: Vec2): Vec2 {
  return { x: -u.y, y: u.x };
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Yards of effective carry gained/lost per mph of pure head/tail wind component. */
const WIND_CARRY_YARDS_PER_MPH = 0.5;
/** Yards of lateral drift per mph of pure crosswind component, at a 200-yard reference shot. */
const WIND_CROSS_YARDS_PER_MPH = 0.3;
/** Total curve (yards) at the endpoint of a 100-yard shot at max spin (|spin| = 1). */
const CURVE_YARDS_PER_100 = 6;

export interface FlightResult {
  /** Intended landing point, before execution noise. */
  endpoint: Vec2;
  /** A few sampled points from the start position to `endpoint`, for rendering the curve. */
  path: Vec2[];
  /** Distance actually carried along the heading, after the wind's along-heading component. */
  effectiveDistance: number;
}

/**
 * Resolves the deterministic curved flight for one shot: `headingTarget`
 * defines the un-offset heading (the direct line to wherever the target
 * point is), `route.aimOffsetDeg` rotates it, `route.spin` bows the path
 * into a curve that grows with distance traveled (more curve later in
 * flight, the way a decelerating ball actually behaves), and `wind` shifts
 * both the effective carry (along-heading component) and the lateral
 * position (cross-heading component, scaled toward shots that spend more
 * time in the air). Elevation's "plays like" adjustment (terrain.ts) is
 * folded in here too, since it's the same kind of flight effect as wind —
 * evaluated at the wind/curve-only provisional endpoint, since the exact
 * final point isn't known until the along-heading distance is itself
 * adjusted for elevation (a one-step approximation, not an iterative solve).
 */
export function resolveFlight(
  parcel: Parcel,
  from: Vec2,
  headingTarget: Vec2,
  targetDist: number,
  route: Pick<Route, "aimOffsetDeg" | "spin">,
  wind: Wind,
): FlightResult {
  const baseAngle = Math.atan2(headingTarget.y - from.y, headingTarget.x - from.x);
  const angle = baseAngle + (route.aimOffsetDeg * Math.PI) / 180;
  const u = { x: Math.cos(angle), y: Math.sin(angle) };
  const p = perp(u);

  const windDirRad = (wind.dirDeg * Math.PI) / 180;
  const windVec = { x: Math.cos(windDirRad) * wind.speed, y: Math.sin(windDirRad) * wind.speed };
  const alongWind = dot(windVec, u);
  const crossWind = dot(windVec, p);

  const windCarryDelta = alongWind * WIND_CARRY_YARDS_PER_MPH;
  const windCrossDelta = crossWind * WIND_CROSS_YARDS_PER_MPH * (targetDist / 200);
  const curveTotal = route.spin * (CURVE_YARDS_PER_100 / 100) * targetDist;
  const lateralTotal = curveTotal + windCrossDelta;

  const provisionalDist = targetDist + windCarryDelta;
  const provisionalEndpoint: Vec2 = {
    x: from.x + u.x * provisionalDist + p.x * lateralTotal,
    y: from.y + u.y * provisionalDist + p.y * lateralTotal,
  };
  const elevDelta = playsLikeDelta(parcel, from, provisionalEndpoint);
  const effectiveDistance = provisionalDist - elevDelta;

  const endpoint: Vec2 = {
    x: from.x + u.x * effectiveDistance + p.x * lateralTotal,
    y: from.y + u.y * effectiveDistance + p.y * lateralTotal,
  };

  const path: Vec2[] = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const distAlong = effectiveDistance * t;
    const lateralAt = curveTotal * t * t + windCrossDelta * t;
    return { x: from.x + u.x * distAlong + p.x * lateralAt, y: from.y + u.y * distAlong + p.y * lateralAt };
  });

  return { endpoint, path, effectiveDistance };
}

/** Uphill (along direction of travel) shortens roll; downhill lengthens it. Clamped to sane bounds. */
const ALONG_SLOPE_ROLL_K = 0.15;
/** Fraction of roll distance redirected sideways per unit of cross-slope (feet/yard). */
const LATERAL_STEER_K = 0.5;

/**
 * Resolves ground roll from a carry landing point: extra travel scaled by
 * the lie's firmness (`ROLL_FACTORS`) and the local slope along the shot's
 * travel direction, plus a sideways component from cross-slope — a mound's
 * shoulder steers the ball toward its downhill side. Returns the landing
 * point unchanged if the lie doesn't roll (hazards, the green).
 */
export function resolveRoll(
  parcel: Parcel,
  landingPoint: Vec2,
  travelDirection: Vec2,
  lie: LieType,
): Vec2 {
  const base = ROLL_FACTORS[lie];
  if (base <= 0) return landingPoint;

  const u = unit(travelDirection);
  const p = perp(u);
  const grad = gradientAt(parcel, landingPoint.x, landingPoint.y);

  const alongSlope = dot(grad, u);
  const crossSlope = dot(grad, p);

  const rollDist = base * clamp(1 - ALONG_SLOPE_ROLL_K * alongSlope, 0.2, 3.0);
  const lateralKick = -crossSlope * LATERAL_STEER_K * rollDist;

  return {
    x: landingPoint.x + u.x * rollDist + p.x * lateralKick,
    y: landingPoint.y + u.y * rollDist + p.y * lateralKick,
  };
}
