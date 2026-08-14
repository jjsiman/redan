# @redan/sim

Zero-runtime-dependency, deterministic golf hole simulator. Per the [project doc](../../docs/redan-project-doc.md), this is the one irreplaceable artifact — everything else (schema, content, the web editor) is a client of `grade()`.

## Status

First-pass implementation of M0's core sim contract. **Not yet validated against real holes** — the original 8-hole (and target 15+) traced-course validation set was lost along with the HTML/Python prototypes (they lived only in a phone chat, not on disk). This package is currently checked against hand-authored synthetic fixtures only (`test/fixtures/`), which prove the pipeline runs and behaves sensibly, not that it's calibrated correctly. M0 is not gated-closed until real holes are re-traced and run through a CLI validation harness (not yet built) against expert consensus.

## Contract

```ts
grade(parcel: Parcel, pieces: Piece[], wind: Wind, seed: number): GradeResult
```

Pure and deterministic: the same four inputs always produce byte-identical output, in the browser, in Node, or on an edge worker. All randomness is drawn from a PRNG seeded by `seed` (`createRng`, mulberry32) — there is no `Math.random`, `Date.now`, `window`, `document`, or `performance` anywhere in `src/`, enforced by `eslint.config.js` (`pnpm lint`), not just convention.

`GradeResult.simVersion` is stamped from `src/version.ts`. Bump it whenever a coefficient changes anywhere in the shot model, archetype table, terrain factors, or metric formulas — the doc is explicit that a coefficient change makes every stored score incomparable.

### Coordinate frame

Tee at the origin, green at +x. `x` = yards down the fairway, `y` = lateral yards off centerline. This is the sim's internal frame only; parcels are authored and rendered portrait, and rotation into this frame happens at the render/schema boundary (not built yet), never inside the sim.

### What's implemented

- Four calibrated archetypes (BOMBER/STRAIGHT/SCRAMBLER/TOUCH) and the full shot model from doc §4.3: full carry, lateral/distance sigma, the effort-penalty kink above 72% of full carry, lie distance/dispersion factors, recovery, putting (1/2/3-putt partition), and the layup formula.
- A basic elevation term: a piecewise-linear centerline profile (`Parcel.elevationProfile`) feeds a "plays like" distance adjustment on each shot. The `1/3` yards-per-foot coefficient is a placeholder — elevation "re-opens every coefficient" per the doc, and this hasn't been checked against a real hole.
- Route search per archetype over three dimensions: lateral aim bias, whether to lay up when a shot can't comfortably reach, and swing effort (fraction of full carry) on advancing shots. The swing-effort dimension exists because without it every long shot swings at exactly 100% effort by construction, which is the exact failure mode the doc's Erin Hills 18 example describes fixing.
- Water (1-stroke penalty, drop short of the hazard) and OB (stroke and distance) handling.
- `used`/`cap` from placed-piece cost, `parOK` from field average vs. designed par, `spread` as the gap between the best- and worst-performing archetype's mean, `routes` as the count of distinct strategies the four archetypes converged on.

### What's explicitly deferred (not in this pass)

- **packages/schema** — the frozen `{ parcelId, pieces: [{ shapeId, x, y, rot, scale }] }` design-serialization format. `Piece`/`Parcel` here are sim-internal and minimal, not that frozen contract.
- **packages/content** — no JSON parcel authoring pipeline; fixtures are hand-written TS objects for tests only.
- **Fairway generator + rough bands** — terrain here is explicit regions (a fixed corridor + placed-piece footprints), not auto-derived from a fairway shape.
- **Shape parameter table** — pot vs. coffin bunker dimensions etc. are undefined; fixtures use plain circles/rects.
- **CLI validation harness + real-hole geometry** — no traced courses, no report format, no gate check yet.
- **Wind** — `grade()` accepts a `wind` parameter for contract compatibility, but it's inert. No wind coefficients survived the doc reconstruction, and inventing them isn't something that can be calibrated against anything real right now.
- **Renderer surface interface** — out of scope for the sim package by definition.

### Known simplifications worth revisiting

- The reach-in-two decision (`REACH_THRESHOLD` / `LAYUP_ZONE_LIMIT` in `route.ts`) is a first-pass heuristic, not the doc's dedicated "par-5 reach-in-two branch" deliverable.
- Elevation only affects the centerline profile (no cross-slope), and only adjusts along-line distance, not dispersion.
- A design must place exactly one `lieType: "green"` piece; `grade()` throws otherwise. Multiple green pieces aren't merged.
- Metric formulas (`field`, `spread`, `sd`, `routes`, `parOK`'s tolerance) are reconstructed from doc §5's prose and example sentences, not from the lost full per-hole validation table — treat them as a reasonable first guess, not settled.

## Development

```
pnpm install
pnpm --filter @redan/sim run build   # tsc -b
pnpm --filter @redan/sim run test    # vitest run
pnpm --filter @redan/sim run lint    # eslint (includes the portability checks)
```
