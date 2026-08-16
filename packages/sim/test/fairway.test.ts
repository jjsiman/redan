import { describe, expect, it } from "vitest";
import { deriveFairway } from "../src/fairway.js";
import { compileTerrain, lieAt } from "../src/terrain.js";
import type { Parcel, Piece } from "../src/types.js";

/**
 * Per CLAUDE.md's testing convention: these assert what deriveFairway
 * structurally guarantees (determinism, staying in bounds, actually bending
 * around a hazard), not a specific hand-guessed route.
 */

function landParcel(overrides: Partial<Parcel> = {}): Parcel {
  return {
    id: "fixture-land",
    par: 4,
    // Deliberately halfWidth: 0 (see fairway.ts's module doc) — an
    // ungraded/un-derived land parcel is honestly all-rough, not all-fairway.
    corridor: [
      { x: 0, cy: 0, halfWidth: 0, obHalfWidth: 60 },
      { x: 400, cy: 0, halfWidth: 0, obHalfWidth: 60 },
    ],
    landEnvelope: { length: 400, halfWidth: 60 },
    pieceCap: 0,
    ...overrides,
  };
}

const pond = (x: number, y: number, radius: number): Piece => ({
  shapeId: "water-pond",
  lieType: "water",
  x,
  y,
  rot: 0,
  scale: 1,
  footprint: { kind: "circle", radius },
});

describe("deriveFairway", () => {
  it("is deterministic — same parcel + green produces an identical corridor twice", () => {
    const parcel = landParcel();
    const green = { x: 380, y: 0 };
    const a = deriveFairway(parcel, green);
    const b = deriveFairway(parcel, green);
    expect(a.corridor).toEqual(b.corridor);
    expect(a.fixedRegions).toEqual(b.fixedRegions);
  });

  it("resolves the tee and the green to a playable lie under the derived corridor + OB frame", () => {
    const parcel = landParcel();
    const green = { x: 380, y: 0 };
    const derived = deriveFairway(parcel, green);
    const terrain = compileTerrain(derived, []);
    expect(lieAt(terrain, { x: 0, y: 0 })).not.toBe("ob");
    expect(lieAt(terrain, green)).not.toBe("ob");
  });

  it("does not resolve OB a few yards past the green along the fairway's run-out", () => {
    // Regression test for the "corridor ends at the green" bug: lieAt checks
    // arc-length-beyond before anything else, so a corridor that stopped
    // exactly at the green would resolve harmless roll-out as OB.
    const parcel = landParcel();
    const green = { x: 380, y: 0 };
    const derived = deriveFairway(parcel, green);
    const terrain = compileTerrain(derived, []);
    expect(lieAt(terrain, { x: 385, y: 0 })).not.toBe("ob");
  });

  it("bends away from a pond sitting on the straight tee-to-green line", () => {
    const withPond = landParcel({ fixedRegions: [pond(190, 0, 22)] });
    const withoutPond = landParcel();
    const green = { x: 380, y: 0 };

    const bent = deriveFairway(withPond, green);
    const straight = deriveFairway(withoutPond, green);

    const maxDriftBent = Math.max(...bent.corridor.map((s) => Math.abs(s.cy)));
    const maxDriftStraight = Math.max(...straight.corridor.map((s) => Math.abs(s.cy)));
    expect(maxDriftBent).toBeGreaterThan(maxDriftStraight + 5);

    const terrain = compileTerrain(bent, []);
    for (const s of bent.corridor) {
      expect(lieAt(terrain, { x: s.x, y: s.cy })).not.toBe("water");
    }
  });

  it("still returns a usable corridor when water spans the full width (a forced carry)", () => {
    // A pond wide enough that no detour fits inside the land — the router
    // must not throw, and the green must still resolve playable.
    const parcel = landParcel({ fixedRegions: [pond(190, 0, 58)] });
    const green = { x: 380, y: 0 };
    const derived = deriveFairway(parcel, green);
    expect(derived.corridor.length).toBeGreaterThan(0);
    for (const s of derived.corridor) {
      expect(Number.isFinite(s.x)).toBe(true);
      expect(Number.isFinite(s.cy)).toBe(true);
    }
    const terrain = compileTerrain(derived, []);
    expect(lieAt(terrain, green)).not.toBe("ob");
  });

  it("keeps every station's fairway half-width within [0, obHalfWidth], and at least minHalfWidth where positive", () => {
    const parcel = landParcel({ fixedRegions: [pond(190, 10, 20)] });
    const green = { x: 380, y: -5 };
    const derived = deriveFairway(parcel, green);
    for (const s of derived.corridor) {
      expect(s.halfWidth).toBeGreaterThanOrEqual(0);
      expect(s.halfWidth).toBeLessThanOrEqual(s.obHalfWidth);
      if (s.halfWidth > 0) expect(s.halfWidth).toBeGreaterThanOrEqual(9);
    }
  });

  it("throws when the parcel has no landEnvelope", () => {
    const parcel = landParcel();
    delete parcel.landEnvelope;
    expect(() => deriveFairway(parcel, { x: 380, y: 0 })).toThrow(/landEnvelope/);
  });
});
