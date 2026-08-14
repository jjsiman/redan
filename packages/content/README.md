# @redan/content

Parcels as JSON (doc 8.3).

## Status

Two hand-authored example parcels, chosen to match the doc's own teaching-order examples (doc 3): `01-one-bunker` ("learn that a single bunker creates a decision") and `04-water-and-hill` ("learn to use the hill"). These exist to prove the full pipeline — JSON parcel → `@redan/schema` → `@redan/sim` — round-trips correctly (see `test/roundtrip.test.ts`). They are **not** campaign content: no fairway generator, no real shape-table calibration, and no "deliberately flawed starting hole" per parcel (doc 2) yet.

## Layout

```
parcels/
  01-one-bunker.parcel.json
  01-one-bunker.design.json
  04-water-and-hill.parcel.json
  04-water-and-hill.design.json
```

`loadParcel(id)` / `loadDesign(id)` (`src/index.ts`) read these by `ParcelId`.

## Development

```
pnpm install
pnpm --filter @redan/content run build
pnpm --filter @redan/content run test
pnpm --filter @redan/content run lint
```
