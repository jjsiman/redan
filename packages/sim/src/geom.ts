import type { Vec2 } from "./types.js";

/**
 * Pure 2D geometry primitives — no sim domain concepts (no LieType, no
 * Piece), so this file is safe for a renderer package to import too. Same
 * portability contract as the rest of packages/sim (no host APIs, no
 * Math.random) even though nothing here needs it; keeping it obviously pure
 * is what makes it reusable.
 */

export interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function polygonAabb(pts: Vec2[]): Aabb {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function aabbContains(box: Aabb, p: Vec2): boolean {
  return p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
}

/** Ray-casting point-in-polygon. `pts` is implicitly closed (last point connects to first). */
export function pointInPolygon(pts: Vec2[], p: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i]!;
    const pj = pts[j]!;
    const crosses = pi.y > p.y !== pj.y > p.y;
    if (crosses) {
      const xIntersect = ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x;
      if (p.x < xIntersect) inside = !inside;
    }
  }
  return inside;
}

/** 90-degree left rotation of a unit vector — the lateral direction for a heading `u`. Matches flight.ts's perp(). */
function perp(u: Vec2): Vec2 {
  return { x: -u.y, y: u.x };
}

function unit(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

export function polylineLength(pts: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y);
  }
  return total;
}

export interface PolylineProjection {
  /** Arc-length distance along the polyline to the projected point. */
  s: number;
  /** Signed lateral distance from the polyline, positive in the perp(heading) direction (doc: "positive = right"). */
  offset: number;
  /** Index of the segment [segIndex, segIndex+1] the projection falls on. */
  segIndex: number;
  /** Fraction along that segment, 0..1 when the projection lands on the polyline; <0 or >1 only past its ends. */
  t: number;
  /** Set when the closest point is an extrapolation past the polyline's first or last point. */
  beyond: "before" | "after" | null;
}

/**
 * Projects `p` onto a polyline, returning both an arc-length station (`s`)
 * and a signed lateral offset from the nearest segment. This is the
 * generalization of the old flat `Math.abs(p.y)` corridor test to a
 * centerline that can bend — every "is this point in the fairway/OB" check
 * in terrain.ts goes through here now.
 */
export function projectToPolyline(pts: Vec2[], p: Vec2): PolylineProjection {
  if (pts.length < 2) {
    const origin = pts[0] ?? { x: 0, y: 0 };
    return { s: 0, offset: Math.hypot(p.x - origin.x, p.y - origin.y), segIndex: 0, t: 0, beyond: null };
  }

  let best: PolylineProjection | null = null;
  let bestDistSq = Infinity;
  let cumulative = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const segX = b.x - a.x;
    const segY = b.y - a.y;
    const segLenSq = segX * segX + segY * segY;
    const segLen = Math.sqrt(segLenSq);

    const relX = p.x - a.x;
    const relY = p.y - a.y;
    const t = segLenSq > 0 ? (relX * segX + relY * segY) / segLenSq : 0;
    const tClamped = Math.max(0, Math.min(1, t));
    const closestX = a.x + segX * tClamped;
    const closestY = a.y + segY * tClamped;
    const dx = p.x - closestX;
    const dy = p.y - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      const u = segLen > 0 ? { x: segX / segLen, y: segY / segLen } : { x: 1, y: 0 };
      const pr = perp(u);
      const offset = relX * pr.x + relY * pr.y;

      let beyond: "before" | "after" | null = null;
      if (i === 0 && t < 0) beyond = "before";
      if (i === pts.length - 2 && t > 1) beyond = "after";

      best = { s: cumulative + tClamped * segLen, offset, segIndex: i, t, beyond };
    }

    cumulative += segLen;
  }

  return best!;
}

/**
 * Walks the polyline to arc-length `s`, extrapolating along the first/last
 * segment's direction if `s` falls outside `[0, polylineLength(pts)]` —
 * used to aim "further along the bend" past the last authored station.
 */
export function pointAtStation(pts: Vec2[], s: number): Vec2 {
  if (pts.length === 1) return pts[0]!;
  if (pts.length === 0) return { x: 0, y: 0 };

  if (s <= 0) {
    const a = pts[0]!;
    const b = pts[1]!;
    const u = unit({ x: b.x - a.x, y: b.y - a.y });
    return { x: a.x + u.x * s, y: a.y + u.y * s };
  }

  let cumulative = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (s <= cumulative + segLen || i === pts.length - 2) {
      const remaining = s - cumulative;
      const u = unit({ x: b.x - a.x, y: b.y - a.y });
      return { x: a.x + u.x * remaining, y: a.y + u.y * remaining };
    }
    cumulative += segLen;
  }
  return pts[pts.length - 1]!;
}

/**
 * Builds the two side-rails of a corridor ribbon (for rendering), offsetting
 * the centerline by a per-station half-width. Interior stations use the
 * averaged direction of their two adjacent segments so the rail doesn't kink
 * at a bend. Returns `{ left, right }`, both running tee-to-green — join
 * `[...left, ...right.slice().reverse()]` for a closed outline polygon.
 */
export function offsetPolyline(pts: Vec2[], halfWidths: number[]): { left: Vec2[]; right: Vec2[] } {
  const left: Vec2[] = [];
  const right: Vec2[] = [];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const hw = halfWidths[i] ?? halfWidths[halfWidths.length - 1] ?? 0;

    const prev = pts[i - 1];
    const next = pts[i + 1];
    const dirs: Vec2[] = [];
    if (prev) dirs.push(unit({ x: p.x - prev.x, y: p.y - prev.y }));
    if (next) dirs.push(unit({ x: next.x - p.x, y: next.y - p.y }));
    const avg = dirs.reduce((acc, d) => ({ x: acc.x + d.x, y: acc.y + d.y }), { x: 0, y: 0 });
    const u = unit(avg);
    const pr = perp(u);

    left.push({ x: p.x + pr.x * hw, y: p.y + pr.y * hw });
    right.push({ x: p.x - pr.x * hw, y: p.y - pr.y * hw });
  }

  return { left, right };
}
