import type { Design, Parcel, PortraitVec2 } from "@redan/schema";
import { resolveShape, toSimInputs } from "@redan/schema";
import { describeResultFromGolfers, deriveFairway, grade } from "@redan/sim";
import { footprintExtent, snapToGrid } from "../render/parcel.js";
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
/** Extra standoff kept between the green's edge and a fixed hazard's edge — see pushOutOfHazards's doc. */
const GREEN_HAZARD_CLEARANCE = 4;

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

/**
 * Pushes `at` directly away from any `parcel.fixedRegions` hazard it would
 * overlap, using each hazard's own bounding-circle radius (`footprintExtent`)
 * as a conservative overlap test against the green's own radius. Needed
 * because `compileTerrain`/`lieAt` (`@redan/sim`) resolve fixed regions
 * AFTER player pieces and let the last match win — an immovable hazard the
 * player drags the green onto or near therefore always wins the tie and
 * eats a bite out of the green's own footprint. That's a real scoring bug
 * (part of the green stops being `"green"`), not just a visual one — it
 * just became far more visually obvious once `SHAPE_TABLE`'s natural
 * regions (`native-area`, `trees`) turned from axis-aligned rects into
 * organic polygons, so the bite reads as a jagged, oddly-angled cut instead
 * of a clean square corner (the "pentagon blocking the green" bug report).
 * `footprintExtent` over-approximates a non-circular hazard as its bounding
 * circle, so this can push the green a little further than strictly
 * necessary — never wrong, only occasionally more cautious than required.
 * Iterates a handful of times: a push away from one hazard can land inside
 * another, or back outside the land bounds `clampToLand` already enforced.
 */
function pushOutOfHazards(parcel: Parcel, at: PortraitVec2, greenRadius: number): PortraitVec2 {
  const regions = parcel.fixedRegions ?? [];
  if (regions.length === 0) return at;
  let p = at;
  for (let iter = 0; iter < 6; iter++) {
    let moved = false;
    for (const region of regions) {
      const extent = footprintExtent(resolveShape(region.shapeId).footprint, region.scale);
      const minDist = extent + greenRadius + GREEN_HAZARD_CLEARANCE;
      const dx = p.x - region.x;
      const dy = p.y - region.y;
      const dist = Math.hypot(dx, dy);
      if (dist < minDist) {
        const ux = dist > 1e-6 ? dx / dist : 1;
        const uy = dist > 1e-6 ? dy / dist : 0;
        p = { x: region.x + ux * minDist, y: region.y + uy * minDist };
        moved = true;
      }
    }
    if (!moved) return p;
    p = clampToLand(parcel, p, GREEN_MARGIN);
  }
  return p;
}

/** Moves the green to `at` (already-hovered world point; snapped and clamped here). */
export function moveGreen(store: Store, at: PortraitVec2): void {
  const { parcel, design } = store.getState();
  const green = design.pieces[0];
  if (!green) return;
  const greenRadius = footprintExtent(resolveShape(green.shapeId).footprint, green.scale);
  let target = clampToLand(parcel, snapToGrid(at), GREEN_MARGIN);
  target = pushOutOfHazards(parcel, target, greenRadius);
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
