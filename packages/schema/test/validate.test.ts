import { describe, expect, it } from "vitest";
import { validateDesign } from "../src/validate.js";
import { SCHEMA_VERSION } from "../src/version.js";
import type { Design, Parcel } from "../src/types.js";

const parcel: Parcel = {
  id: "p1",
  schemaVersion: SCHEMA_VERSION,
  par: 4,
  corridorHalfWidth: 22,
  obHalfWidth: 40,
  pieceCap: 2,
  tray: [
    { shapeId: "green-large", count: 1 },
    { shapeId: "bunker-pot", count: 1 },
  ],
};

describe("validateDesign", () => {
  it("passes a design within the tray's limits", () => {
    const design: Design = {
      parcelId: "p1",
      schemaVersion: SCHEMA_VERSION,
      pieces: [
        { shapeId: "green-large", x: 0, y: 400, rot: 0, scale: 1 },
        { shapeId: "bunker-pot", x: 10, y: 100, rot: 0, scale: 1 },
      ],
    };
    expect(validateDesign(parcel, design)).toEqual({ valid: true, errors: [] });
  });

  it("flags a shape placed more times than the tray allows", () => {
    const design: Design = {
      parcelId: "p1",
      schemaVersion: SCHEMA_VERSION,
      pieces: [
        { shapeId: "green-large", x: 0, y: 400, rot: 0, scale: 1 },
        { shapeId: "bunker-pot", x: 10, y: 100, rot: 0, scale: 1 },
        { shapeId: "bunker-pot", x: -10, y: 120, rot: 0, scale: 1 },
      ],
    };
    const result = validateDesign(parcel, design);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/bunker-pot/);
  });

  it("flags a shape that isn't in the tray at all", () => {
    const design: Design = {
      parcelId: "p1",
      schemaVersion: SCHEMA_VERSION,
      pieces: [{ shapeId: "water-pond", x: 0, y: 200, rot: 0, scale: 1 }],
    };
    const result = validateDesign(parcel, design);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/tray/);
  });

  it("flags a parcelId mismatch", () => {
    const design: Design = { parcelId: "other", schemaVersion: SCHEMA_VERSION, pieces: [] };
    const result = validateDesign(parcel, design);
    expect(result.valid).toBe(false);
  });
});
