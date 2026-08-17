import { describe, expect, it } from "vitest";
import { deriveFairway, type FairwaySpec } from "../src/fairway.js";
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

  it("keeps every station's fairway half-width within [0, obHalfWidth]", () => {
    const parcel = landParcel({ fixedRegions: [pond(190, 10, 20)] });
    const green = { x: 380, y: -5 };
    const derived = deriveFairway(parcel, green);
    for (const s of derived.corridor) {
      expect(s.halfWidth).toBeGreaterThanOrEqual(0);
      expect(s.halfWidth).toBeLessThanOrEqual(s.obHalfWidth);
    }
  });

  it("never pinches the fairway below minHalfWidth between the leading edge and the green — only the tee/green caps taper through it on their way to 0", () => {
    // Explicit spec so this test doesn't depend on FairwaySpec's own
    // defaults staying at any particular number.
    const spec: FairwaySpec = { teeGapLong: 30, teeHalfWidth: 16, minHalfWidth: 9 };
    const parcel = landParcel({ par: 4, fixedRegions: [pond(190, 10, 20)] });
    const green = { x: 380, y: -5 };
    const derived = deriveFairway(parcel, green, spec);
    const leadEnd = spec.teeGapLong! + spec.teeHalfWidth!;
    for (const s of derived.corridor) {
      // s.x is the world x-coordinate of a (possibly curved) centerline
      // point, not its arc-length — close enough to arc-length here since
      // this fixture's corridor barely bends (a single small pond).
      if (s.x > leadEnd + 5 && s.x < green.x - 5) {
        expect(s.halfWidth).toBeGreaterThanOrEqual(spec.minHalfWidth!);
      }
    }
  });

  it("wraps the green in a rounded apron instead of tapering to a point behind it", () => {
    const spec: FairwaySpec = { greenRadius: 15, greenApron: 8 };
    const parcel = landParcel();
    const green = { x: 380, y: 0 };
    const derived = deriveFairway(parcel, green, spec);
    const capR = spec.greenRadius! + spec.greenApron!;

    const terrain = compileTerrain(derived, []);
    expect(lieAt(terrain, { x: 385, y: 0 })).toBe("fairway");
    // The corridor used to extend `runout` (40yd) past the green, tapering
    // linearly to a single zero-width point; it now stops at capR (23yd).
    expect(lieAt(terrain, { x: green.x + capR + 20, y: 0 })).not.toBe("fairway");

    // Anti-spike assertion: every tile the corridor still classifies as
    // fairway past the green sits within the apron's own radius of the
    // green center — never further out in a narrow trailing wedge.
    for (let x = green.x + 1; x <= green.x + capR + 15; x += 2) {
      for (let y = -30; y <= 30; y += 2) {
        if (lieAt(terrain, { x, y }) === "fairway") {
          expect(Math.hypot(x - green.x, y)).toBeLessThanOrEqual(capR + 1);
        }
      }
    }

    const last = derived.corridor[derived.corridor.length - 1]!;
    expect(last.halfWidth).toBe(0);
  });

  it("leaves the ground in front of the tee unmown before the fairway's leading edge, on a par 4/5", () => {
    const spec: FairwaySpec = { teeGapLong: 30, teeHalfWidth: 16 };
    const parcel = landParcel({ par: 4 });
    const green = { x: 380, y: 0 };
    const derived = deriveFairway(parcel, green, spec);
    const terrain = compileTerrain(derived, []);
    expect(lieAt(terrain, { x: 0, y: 0 })).toBe("tee");
    expect(lieAt(terrain, { x: 15, y: 0 })).not.toBe("fairway");
    expect(lieAt(terrain, { x: spec.teeGapLong! + spec.teeHalfWidth! + 10, y: 0 })).toBe("fairway");
  });

  it("sizes the tee gap backward from the green on a par 3, not forward from the tee", () => {
    const spec: FairwaySpec = { teeGapPar3: 50 };
    const parcel = landParcel({ par: 3, landEnvelope: { length: 220, halfWidth: 60 } });
    const green = { x: 200, y: 0 };
    const derived = deriveFairway(parcel, green, spec);
    const terrain = compileTerrain(derived, []);
    // Well short of "green.x - teeGapPar3" — should still be unmown.
    expect(lieAt(terrain, { x: 100, y: 0 })).not.toBe("fairway");
    // Within the apron approaching the green — should be mown.
    expect(lieAt(terrain, { x: 175, y: 0 })).toBe("fairway");
  });

  it("emits strictly increasing stations even when the green is close to the tee (short-hole clamp path)", () => {
    const parcel = landParcel({ landEnvelope: { length: 100, halfWidth: 60 } });
    const green = { x: 40, y: 0 };
    const derived = deriveFairway(parcel, green);
    for (let i = 1; i < derived.corridor.length; i++) {
      const a = derived.corridor[i - 1]!;
      const b = derived.corridor[i]!;
      expect(Math.hypot(b.x - a.x, b.cy - a.cy)).toBeGreaterThan(0);
    }
    for (const s of derived.corridor) {
      expect(Number.isFinite(s.x)).toBe(true);
      expect(Number.isFinite(s.cy)).toBe(true);
    }
  });

  it("throws when the parcel has no landEnvelope", () => {
    const parcel = landParcel();
    delete parcel.landEnvelope;
    expect(() => deriveFairway(parcel, { x: 380, y: 0 })).toThrow(/landEnvelope/);
  });
});
