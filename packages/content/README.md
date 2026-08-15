# @redan/content

Parcels as JSON (doc 8.3).

## Status

Five hand-authored example parcels. `01-one-bunker` and `04-water-and-hill` match the doc's own teaching-order examples (doc 3: "learn that a single bunker creates a decision" / "learn to use the hill") and are straight corridors. `02-dogleg-left`, `03-split-par5`, and `05-drivable-four` are new, exercising the bending-corridor geometry (`@redan/schema`'s `Parcel.corridor`, replacing the old flat `corridorHalfWidth`/`obHalfWidth` scalars) and `fixedRegions` (a parcel-authored, un-removable stand of trees in each dogleg's inside corner — without it, cutting the corner is free, not a decision). These prove the full pipeline — JSON parcel → `@redan/schema` → `@redan/sim` — round-trips correctly (see `test/roundtrip.test.ts`). They are **not** campaign content: no fairway generator, no real shape-table calibration, and no "deliberately flawed starting hole" per parcel (doc 2) yet.

`04-water-and-hill` also carries an `elevationFeatures` mound guarding the front-left of the green, demonstrating `@redan/sim`'s 2D terrain (a mound that can actually redirect a rolling ball sideways, not just a centerline slope).

`src/render.ts` is a dev-only diagnostic visualizer (not the doc's renderer surface interface): `renderHoleSvg` draws a parcel/design/result as an inline SVG hole diagram — the fairway as a proper ribbon following the corridor's bend (`@redan/sim`'s `offsetPolyline`), each golfer's *actual curved flight path* (not a straight line), fixed regions with a dashed outline to read as different in kind from player-placed pieces, plus shaded rings for any elevation features — and `describeResult` produces doc-§5-style star rating and coaching sentences. `scripts/preview.mjs` (`pnpm run preview`) renders all five example parcels into a single static HTML page.

### Real-hole validation harness — parked

The old M0 real-hole validation harness (16 famous holes, hand-encoded with pre-registered expected archetype bias) is **suspended, not deleted or gated** — see `validation/README.md` and `docs/redan-project-doc.md` §4.4/§9 for why: the old fixed four-archetype table made STRAIGHT win or tie all 16 holes structurally, and the trait rework that fixed that also retired the archetype vocabulary those 16 files' expectations are written in. The harness code moved to `validation/_parked/` and is excluded from this package's build (not part of `src/`, `test/`, or `package.json`'s scripts). The day-to-day tuning check now is `packages/sim/scripts/roster-balance.mjs`.

## Layout

```
parcels/
  01-one-bunker.parcel.json      01-one-bunker.design.json
  02-dogleg-left.parcel.json     02-dogleg-left.design.json
  03-split-par5.parcel.json      03-split-par5.design.json
  04-water-and-hill.parcel.json  04-water-and-hill.design.json
  05-drivable-four.parcel.json   05-drivable-four.design.json

validation/
  augusta-13.hole.json
  ... (16 real holes, one file each — geometry + expectation + citations bundled)
  _parked/   (the old harness code — see validation/README.md)
```

`loadParcel(id)` / `loadDesign(id)` (`src/index.ts`) read the example parcels by `ParcelId`.

## Development

```
pnpm install
pnpm --filter @redan/content run build
pnpm --filter @redan/content run test
pnpm --filter @redan/content run lint
pnpm --filter @redan/content run preview   # renders all 5 example parcels to out/preview.html
```
