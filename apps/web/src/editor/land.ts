import type { Design, Parcel, PortraitVec2 } from "@redan/schema";
import { toSimInputs } from "@redan/schema";
import { describeResultFromGolfers, deriveFairway, grade } from "@redan/sim";
import { snapToGrid } from "../render/parcel.js";
import { cloneDesign, type Store } from "./state.js";

/**
 * Land-mode intents (doc §6.3: "capture input as intents... rather than
 * pointer events") — the same framing as `editor/intents.ts`'s tray
 * placement, but for the green-only editor. A land parcel's `design.pieces`
 * is always exactly one green (the content generator only ever emits that,
 * and `moveGreen` only ever edits it in place — nothing here inserts a
 * second piece), so unlike the tray editor there is no arm/place/remove
 * flow to capture, just "where is the green."
 */

const GRADE_SEED = 20260815;
const NO_WIND = { speed: 0, dirDeg: 0 };
/** Yards kept between the green and the land boundary — see moveGreen's doc. */
const GREEN_MARGIN = 20;

export function selectLandParcel(
  store: Store,
  parcelId: string,
  parcels: Record<string, { parcel: Parcel; design: Design }>,
): void {
  const entry = parcels[parcelId];
  if (!entry) return;
  store.setState({
    mode: "land",
    parcelId,
    parcel: entry.parcel,
    design: cloneDesign(entry.design),
    armed: null,
    result: null,
    verdict: null,
    message: null,
  });
}

/**
 * Keeps a drag target inside the land, inset by `margin` on every side.
 * Deliberately done here (in the intent), not left to the renderer:
 * `@redan/sim`'s `route.ts#playRound` loops until the ball reaches the
 * green with no other exit, and `grade()` appends the OB-frame fixed
 * regions after player pieces — a green dragged onto or past that frame
 * would either never resolve or resolve nonsensically. Clamping here means
 * the drag handler, the renderer, and the grader all agree on where the
 * green can be, by construction, rather than each independently guessing.
 */
function clampToLand(parcel: Parcel, at: PortraitVec2, margin: number): PortraitVec2 {
  const land = parcel.landEnvelope;
  if (!land) return at;
  return {
    x: Math.min(land.halfWidth - margin, Math.max(-land.halfWidth + margin, at.x)),
    y: Math.min(land.length - margin, Math.max(margin, at.y)),
  };
}

/** Moves the green to `at` (already-hovered world point; snapped and clamped here). */
export function moveGreen(store: Store, at: PortraitVec2): void {
  const { parcel, design } = store.getState();
  const target = clampToLand(parcel, snapToGrid(at), GREEN_MARGIN);
  const green = design.pieces[0];
  if (!green) return;
  if (green.x === target.x && green.y === target.y) return; // no-op: skip a redundant render/derive
  const next = cloneDesign(design);
  next.pieces[0] = { ...next.pieces[0]!, x: target.x, y: target.y };
  store.setState({ design: next, result: null, verdict: null, message: null });
}

export function runLandGrade(store: Store): void {
  const { parcel, design } = store.getState();
  store.setState({ grading: true, message: null });
  try {
    const { parcel: simParcel, pieces } = toSimInputs(parcel, design);
    const green = pieces.find((p) => p.lieType === "green");
    if (!green) throw new Error("This parcel has no green — regenerate it.");
    const derived = deriveFairway(simParcel, { x: green.x, y: green.y });
    const result = grade(derived, pieces, NO_WIND, GRADE_SEED);
    const verdict = describeResultFromGolfers(parcel.par, result.metrics, result.golfers);
    store.setState({ result, verdict, grading: false });
  } catch (err) {
    store.setState({ grading: false, message: err instanceof Error ? err.message : String(err) });
  }
}
