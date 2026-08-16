import type { Design, Parcel, PlacedShape } from "@redan/schema";
import type { GradeResult, Verdict } from "@redan/sim";

export interface ArmedPiece {
  shapeId: string;
  rot: number;
}

/**
 * "tray" is the existing shape-placement editor (place a green and hazards
 * from a tray onto a hand-authored corridor). "land" is the green-only
 * editor over generated natural parcels (`@redan/content`'s `land/*`): the
 * fairway is derived live from wherever the green sits (`@redan/sim`'s
 * `deriveFairway`, via `render/grid.ts`), so there is no tray beyond the
 * green itself. The two share this store/Test-button/verdict-panel
 * scaffolding but use different intents (`editor/intents.ts` vs.
 * `editor/land.ts`) and renderers (`render/parcel.ts#drawHole` vs.
 * `render/grid.ts`).
 */
export type EditorMode = "tray" | "land";

export interface EditorState {
  mode: EditorMode;
  parcelId: string;
  parcel: Parcel;
  design: Design;
  armed: ArmedPiece | null;
  result: GradeResult | null;
  verdict: Verdict | null;
  grading: boolean;
  message: string | null;
}

type Listener = () => void;

/** Minimal pub/sub store — no framework, per this app's own no-framework constraint (see package.json). */
export class Store {
  private state: EditorState;
  private listeners: Listener[] = [];

  constructor(initial: EditorState) {
    this.state = initial;
  }

  getState(): EditorState {
    return this.state;
  }

  setState(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
}

export function cloneDesign(design: Design): Design {
  return { ...design, pieces: design.pieces.map((p) => ({ ...p })) };
}

export function placedCount(design: Design, shapeId: string): number {
  return design.pieces.filter((p) => p.shapeId === shapeId).length;
}

export function trayRemaining(parcel: Parcel, design: Design, shapeId: string): number {
  const entry = parcel.tray.find((t) => t.shapeId === shapeId);
  if (!entry) return 0;
  return entry.count - placedCount(design, shapeId);
}

/**
 * Sums placed-piece cost against the budget, excluding the green — mirrors
 * @redan/sim's grade.ts#grade: every design must have exactly one green, so
 * counting it would tax every hole by a constant 1 rather than measuring
 * restraint. `resolve` is `@redan/schema`'s `resolveShape` at call sites;
 * threaded through as a param so this file doesn't need a schema import.
 */
export function usedCost(
  design: Design,
  resolve: (shapeId: string) => { cost: number; lieType: string },
): number {
  return design.pieces.reduce((sum, p) => {
    const def = resolve(p.shapeId);
    return def.lieType === "green" ? sum : sum + def.cost;
  }, 0);
}

export type { PlacedShape };
