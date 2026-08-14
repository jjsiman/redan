import type { Design, Parcel } from "./types.js";
import { SHAPE_TABLE } from "./shapes.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * User-facing validation for an editor: does this design respect the
 * parcel's tray (doc 6.2 — "a tray of allowed pieces with counts")? Returns
 * a list of problems rather than throwing, since the caller wants to show
 * all of them at once, not stop at the first.
 */
export function validateDesign(parcel: Parcel, design: Design): ValidationResult {
  const errors: string[] = [];

  if (design.parcelId !== parcel.id) {
    errors.push(`Design targets parcel "${design.parcelId}", not "${parcel.id}"`);
  }

  const trayLimits = new Map(parcel.tray.map((t) => [t.shapeId, t.count]));
  const placedCounts = new Map<string, number>();

  for (const piece of design.pieces) {
    if (!SHAPE_TABLE[piece.shapeId]) {
      errors.push(`Unknown shapeId "${piece.shapeId}"`);
      continue;
    }
    if (!trayLimits.has(piece.shapeId)) {
      errors.push(`Shape "${piece.shapeId}" is not in this parcel's tray`);
      continue;
    }
    placedCounts.set(piece.shapeId, (placedCounts.get(piece.shapeId) ?? 0) + 1);
  }

  for (const [shapeId, limit] of trayLimits) {
    const placed = placedCounts.get(shapeId) ?? 0;
    if (placed > limit) {
      errors.push(`Placed ${placed} of "${shapeId}" but the tray only allows ${limit}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
