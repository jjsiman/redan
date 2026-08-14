import { describe, expect, it } from "vitest";
import { grade } from "@redan/sim";
import { toSimInputs, validateDesign } from "@redan/schema";
import { PARCEL_IDS, loadDesign, loadParcel } from "../src/index.js";

describe("content -> schema -> sim round trip", () => {
  for (const id of PARCEL_IDS) {
    it(`${id}: loads, validates against its tray, and grades to a plausible result`, () => {
      const parcel = loadParcel(id);
      const design = loadDesign(id);

      const validation = validateDesign(parcel, design);
      expect(validation.errors).toEqual([]);
      expect(validation.valid).toBe(true);

      const { parcel: simParcel, pieces } = toSimInputs(parcel, design);
      const result = grade(simParcel, pieces, { speed: 0, dirDeg: 0 }, 7);

      expect(result.simVersion).toBeTruthy();
      for (const archetype of Object.values(result.archetypes)) {
        expect(Number.isFinite(archetype.mean)).toBe(true);
        expect(archetype.mean).toBeGreaterThan(parcel.par - 1);
        expect(archetype.mean).toBeLessThan(parcel.par + 5);
      }
    });
  }
});
