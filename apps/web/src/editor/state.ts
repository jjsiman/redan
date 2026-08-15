import type { Design, Parcel, PlacedShape } from "@redan/schema";
import type { GradeResult, Verdict } from "@redan/sim";

export interface ArmedPiece {
  shapeId: string;
  rot: number;
}

export interface EditorState {
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

export function usedCost(parcel: Parcel, design: Design, costOf: (shapeId: string) => number): number {
  return design.pieces.reduce((sum, p) => sum + costOf(p.shapeId), 0);
}

export type { PlacedShape };
