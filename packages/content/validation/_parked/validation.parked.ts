import { describe, expect, it } from "vitest";
import type { ArchetypeName, Wind } from "@redan/sim";
import {
  decideAgreement,
  everyDisagreementExplained,
  loadValidationHoles,
  runValidation,
  TIE_EPSILON,
  PARCEL_IDS,
  loadDesign,
  loadParcel,
} from "../src/index.js";
import type { ValidationHole } from "../src/index.js";

const NO_WIND: Wind = { speed: 0, dirDeg: 0 };

/** Wraps one of the example parcels (not real-hole geometry) as a ValidationHole, for exercising the harness's own logic rather than sim calibration. */
function wrap(id: (typeof PARCEL_IDS)[number], favors: ArchetypeName[], tie = false): ValidationHole {
  const parcel = loadParcel(id);
  const design = loadDesign(id);
  return {
    id,
    course: "Test",
    hole: 1,
    par: parcel.par,
    yardage: 400,
    wind: NO_WIND,
    expected: { favors, tie, rationale: "harness test fixture", sources: [] },
    approximations: [],
    disagreement: null,
    parcel,
    design,
  };
}

describe("runValidation — wired against real content parcels", () => {
  it("grades every hole and never claims the gate met below 15 holes", () => {
    const holes = [wrap("01-one-bunker", ["BOMBER"]), wrap("04-water-and-hill", ["BOMBER"])];
    const report = runValidation(holes, [7]);

    expect(report.holeCount).toBe(2);
    expect(report.gateMet).toBe(false); // gate requires 15+ holes regardless of agreement count
    for (const r of report.holes) {
      expect(Number.isFinite(r.margin)).toBe(true);
      expect(r.margin).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.fieldAverage)).toBe(true);
      expect(r.observedBias.length).toBe(1);
    }
  });

  it("agrees when `expected.favors` names the sim's actual winner (single seed, so trivially seed-stable)", () => {
    const probe = runValidation([wrap("01-one-bunker", ["BOMBER"])], [7]);
    const actualWinner = probe.holes[0]!.observedBias[0]!;

    const report = runValidation([wrap("01-one-bunker", [actualWinner])], [7]);
    const r = report.holes[0]!;
    expect(r.trusted).toBe(true);
    expect(r.agree).toBe(true);
    expect(report.agreementCount).toBe(1);
  });

  it("disagrees when `expected.favors` names an archetype the sim did not pick, and requires a written explanation", () => {
    const probe = runValidation([wrap("01-one-bunker", ["BOMBER"])], [7]);
    const actualWinner = probe.holes[0]!.observedBias[0]!;
    const wrongPick = (["BOMBER", "STRAIGHT", "SCRAMBLER", "TOUCH"] as ArchetypeName[]).find((n) => n !== actualWinner)!;

    const holeMissingExplanation = wrap("01-one-bunker", [wrongPick]);
    const unexplained = runValidation([holeMissingExplanation], [7]);
    expect(unexplained.holes[0]!.agree).toBe(false);
    expect(everyDisagreementExplained(unexplained)).toBe(false);

    const holeExplained: ValidationHole = { ...holeMissingExplanation, disagreement: "expected to test the disagreement path" };
    const explained = runValidation([holeExplained], [7]);
    expect(explained.holes[0]!.agree).toBe(false);
    expect(everyDisagreementExplained(explained)).toBe(true);
  });

  it("is deterministic: identical holes and seeds produce a deep-equal report", () => {
    const holes = [wrap("01-one-bunker", ["BOMBER"]), wrap("04-water-and-hill", ["STRAIGHT"])];
    const a = runValidation(holes, [7, 8]);
    const b = runValidation(holes, [7, 8]);
    expect(a).toEqual(b);
  });
});

describe("decideAgreement — pure rule, no sim involved", () => {
  it("non-tie: agrees iff the winner is in favors and the reading is trusted", () => {
    expect(decideAgreement({ tie: false, favors: ["BOMBER"], winner: "BOMBER", runnerUp: "STRAIGHT", margin: 0.4, trusted: true })).toBe(true);
    expect(decideAgreement({ tie: false, favors: ["STRAIGHT"], winner: "BOMBER", runnerUp: "STRAIGHT", margin: 0.4, trusted: true })).toBe(false);
    expect(decideAgreement({ tie: false, favors: ["BOMBER"], winner: "BOMBER", runnerUp: "STRAIGHT", margin: 0.4, trusted: false })).toBe(false);
  });

  it("tie: agrees iff favors names exactly the winner/runner-up pair, the margin is within TIE_EPSILON, and it's trusted", () => {
    const base = { tie: true as const, favors: ["STRAIGHT", "TOUCH"] as ArchetypeName[], winner: "STRAIGHT" as ArchetypeName, runnerUp: "TOUCH" as ArchetypeName, trusted: true };
    expect(decideAgreement({ ...base, margin: TIE_EPSILON })).toBe(true);
    expect(decideAgreement({ ...base, margin: TIE_EPSILON + 0.01 })).toBe(false);
    expect(decideAgreement({ ...base, margin: 0, favors: ["BOMBER", "TOUCH"] })).toBe(false);
    expect(decideAgreement({ ...base, margin: 0, trusted: false })).toBe(false);
  });
});

describe("loadValidationHoles", () => {
  it("returns an array sorted by id", () => {
    const holes = loadValidationHoles();
    expect(Array.isArray(holes)).toBe(true);
    const ids = holes.map((h) => h.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });
});
