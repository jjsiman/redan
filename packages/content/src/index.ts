import { readFileSync } from "node:fs";
import type { Design, Parcel } from "@redan/schema";

const PARCELS_DIR = new URL("../parcels/", import.meta.url);
const LAND_DIR = new URL("../land/", import.meta.url);

/**
 * Every "NN-slug" pair under parcels/ with both a .parcel.json and a
 * .design.json. This is hand-authored example content proving the schema
 * round-trips into @redan/sim — not the campaign's nine-parcels-per-world
 * content set (doc 7's "[thin]" regional content sets), which needs its own
 * authoring pass once a real editor exists.
 */
export const PARCEL_IDS = [
  "01-one-bunker",
  "02-dogleg-left",
  "03-split-par5",
  "04-water-and-hill",
  "05-drivable-four",
] as const;
export type ParcelId = (typeof PARCEL_IDS)[number];

/**
 * Seeded-generated land-mode parcels under land/ (`scripts/generate-land.mjs
 * --seed 1 --count 6`) — natural terrain (hills, water, trees) with no
 * hand-authored fairway; `@redan/sim`'s `deriveFairway` routes one live from
 * wherever a design's green sits. See `land/README` note below and
 * `apps/web`'s land mode, the actual consumer.
 */
export const LAND_PARCEL_IDS = ["land-01", "land-02", "land-03", "land-04", "land-05", "land-06"] as const;
export type LandParcelId = (typeof LAND_PARCEL_IDS)[number];

function readJson<T>(filename: string, dir: URL): T {
  return JSON.parse(readFileSync(new URL(filename, dir), "utf-8")) as T;
}

export function loadParcel(id: ParcelId): Parcel {
  return readJson<Parcel>(`${id}.parcel.json`, PARCELS_DIR);
}

export function loadDesign(id: ParcelId): Design {
  return readJson<Design>(`${id}.design.json`, PARCELS_DIR);
}

export function loadLandParcel(id: LandParcelId): Parcel {
  return readJson<Parcel>(`${id}.parcel.json`, LAND_DIR);
}

export function loadLandDesign(id: LandParcelId): Design {
  return readJson<Design>(`${id}.design.json`, LAND_DIR);
}

export { renderHoleSvg, renderElevationSvg, describeResult } from "./render.js";
export type { Verdict } from "./render.js";

// The real-hole validation harness (loadValidationHoles/runValidation/etc.)
// is parked, not exported here — see validation/_parked/validation.ts's
// header comment and docs/redan-project-doc.md §4.4/§9.
