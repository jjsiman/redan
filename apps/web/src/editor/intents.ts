import type { Vec2 } from "@redan/sim";
import { grade, describeResultFromGolfers } from "@redan/sim";
import { resolveShape, toSimInputs, SHAPE_TABLE } from "@redan/schema";
import type { Parcel } from "@redan/schema";
import { cloneDesign, placedCount, trayRemaining, type Store } from "./state.js";

/**
 * Every editor action goes through one of these — captured as an intent
 * (doc §6.3: "Capture input as intents — place(shapeId, cell, rot) — rather
 * than pointer events") rather than reaching into the DOM/canvas directly.
 * Undo/replay/share-a-layout fall out of this for free later; none of that
 * is built yet, but the seam is here.
 */

const GRADE_SEED = 20260815;
const NO_WIND = { speed: 0, dirDeg: 0 };

export function selectParcel(store: Store, parcelId: string, parcels: Record<string, { parcel: Parcel; design: import("@redan/schema").Design }>): void {
  const entry = parcels[parcelId];
  if (!entry) return;
  // Doc §2: never start from a blank canvas — each parcel opens with its
  // pre-built starting design, matching what's shipped in packages/content.
  store.setState({
    parcelId,
    parcel: entry.parcel,
    design: cloneDesign(entry.design),
    armed: null,
    result: null,
    verdict: null,
    message: null,
  });
}

export function armShape(store: Store, shapeId: string): void {
  const { parcel, design } = store.getState();
  if (trayRemaining(parcel, design, shapeId) <= 0) {
    store.setState({ message: `No "${shapeId}" left in the tray.` });
    return;
  }
  store.setState({ armed: { shapeId, rot: 0 }, message: null });
}

export function disarm(store: Store): void {
  store.setState({ armed: null });
}

export function rotateArmed(store: Store): void {
  const { armed } = store.getState();
  if (!armed) return;
  store.setState({ armed: { ...armed, rot: (armed.rot + 90) % 360 } });
}

/** Places the currently-armed shape at a (already grid-snapped) world point. */
export function placeAt(store: Store, at: Vec2): void {
  const { armed, parcel, design } = store.getState();
  if (!armed) return;

  if (trayRemaining(parcel, design, armed.shapeId) <= 0) {
    store.setState({ armed: null, message: `No "${armed.shapeId}" left in the tray.` });
    return;
  }
  const cost = resolveShape(armed.shapeId).cost;
  const used = design.pieces.reduce((sum, p) => sum + resolveShape(p.shapeId).cost, 0);
  if (used + cost > parcel.pieceCap) {
    store.setState({ message: `Placing this would exceed the piece budget (${used + cost}/${parcel.pieceCap}).` });
    return;
  }

  const next = cloneDesign(design);
  next.pieces.push({ shapeId: armed.shapeId, x: at.x, y: at.y, rot: armed.rot, scale: 1 });
  store.setState({ design: next, armed: null, result: null, verdict: null, message: null });
}

/** Removes the placed piece whose footprint contains the given world point, if any (nearest first). */
export function removePieceAt(store: Store, at: Vec2): boolean {
  const { design } = store.getState();
  let bestIdx = -1;
  let bestDist = Infinity;
  design.pieces.forEach((p, i) => {
    const def = SHAPE_TABLE[p.shapeId];
    const radius = def
      ? def.footprint.kind === "circle"
        ? def.footprint.radius * p.scale
        : def.footprint.kind === "rect"
          ? Math.max(def.footprint.halfLength, def.footprint.halfWidth) * p.scale
          : 15
      : 10;
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d <= radius && d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  });
  if (bestIdx === -1) return false;

  const next = cloneDesign(design);
  next.pieces.splice(bestIdx, 1);
  store.setState({ design: next, result: null, verdict: null, message: null });
  return true;
}

export function runGrade(store: Store): void {
  const { parcel, design } = store.getState();
  if (!design.pieces.some((p) => SHAPE_TABLE[p.shapeId]?.lieType === "green")) {
    store.setState({ message: "Place a green before testing." });
    return;
  }
  store.setState({ grading: true, message: null });
  // Synchronous on the main thread — a known limitation for this prototype
  // (see apps/web's README perf note), not the worker the eventual game
  // needs; deferred rather than built speculatively in this pass.
  try {
    const { parcel: simParcel, pieces } = toSimInputs(parcel, design);
    const result = grade(simParcel, pieces, NO_WIND, GRADE_SEED);
    const verdict = describeResultFromGolfers(parcel.par, result.metrics, result.golfers);
    store.setState({ result, verdict, grading: false });
  } catch (err) {
    store.setState({ grading: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export function placedShapeCount(store: Store, shapeId: string): number {
  return placedCount(store.getState().design, shapeId);
}
