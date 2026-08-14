# @redan/content

Parcels as JSON (doc 8.3).

## Status

Two hand-authored example parcels, chosen to match the doc's own teaching-order examples (doc 3): `01-one-bunker` ("learn that a single bunker creates a decision") and `04-water-and-hill` ("learn to use the hill"). These exist to prove the full pipeline — JSON parcel → `@redan/schema` → `@redan/sim` — round-trips correctly (see `test/roundtrip.test.ts`). They are **not** campaign content: no fairway generator, no real shape-table calibration, and no "deliberately flawed starting hole" per parcel (doc 2) yet.

`04-water-and-hill` also carries an `elevationFeatures` mound guarding the front-left of the green, demonstrating `@redan/sim`'s 2D terrain (a mound that can actually redirect a rolling ball sideways, not just a centerline slope).

`src/render.ts` is a dev-only diagnostic visualizer (not the doc's renderer surface interface): `renderHoleSvg` draws a parcel/design/result as an inline SVG hole diagram — each archetype's *actual curved flight path* (not a straight line), plus shaded rings for any elevation features — and `describeResult` produces doc-§5-style star rating and coaching sentences. `scripts/preview.mjs` (`pnpm run preview`) renders both example parcels into a single static HTML page.

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
