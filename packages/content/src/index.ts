import { readFileSync } from "node:fs";
import type { Design, Parcel } from "@redan/schema";

const PARCELS_DIR = new URL("../parcels/", import.meta.url);

/**
 * Every "NN-slug" pair under parcels/ with both a .parcel.json and a
 * .design.json. This is hand-authored example content proving the schema
 * round-trips into @redan/sim — not the campaign's nine-parcels-per-world
 * content set (doc 7's "[thin]" regional content sets), which needs its own
 * authoring pass once the fairway generator and a real editor exist.
 */
export const PARCEL_IDS = ["01-one-bunker", "04-water-and-hill"] as const;
export type ParcelId = (typeof PARCEL_IDS)[number];

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(new URL(filename, PARCELS_DIR), "utf-8")) as T;
}

export function loadParcel(id: ParcelId): Parcel {
  return readJson<Parcel>(`${id}.parcel.json`);
}

export function loadDesign(id: ParcelId): Design {
  return readJson<Design>(`${id}.design.json`);
}
