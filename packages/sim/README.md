# @redan/sim

Zero-runtime-dependency, deterministic golf hole simulator. Per the [project doc](../../docs/redan-project-doc.md), this is the one irreplaceable artifact — everything else (schema, content, the web editor) is a client of `grade()`.

## Status

First-pass implementation of M0's core sim contract. **Not yet validated against real holes** — the original 8-hole (and target 15+) traced-course validation set was lost along with the HTML/Python prototypes (they lived only in a phone chat, not on disk). This package is currently checked against hand-authored synthetic fixtures only (`test/fixtures/`), which prove the pipeline runs and behaves sensibly, not that it's calibrated correctly. M0 is not gated-closed until real holes are re-traced and run through a CLI validation harness (not yet built) against expert consensus.

`packages/schema` (frozen design-serialization format + a first-draft shape parameter table) and `packages/content` (example JSON parcels) now exist — see their READMEs. `Piece`/`Parcel` here remain sim-internal; `packages/schema/src/toSim.ts` is the adapter.

## Contract

```ts
grade(parcel: Parcel, pieces: Piece[], wind: Wind, seed: number): GradeResult
```

Pure and deterministic: the same four inputs always produce byte-identical output, in the browser, in Node, or on an edge worker. All randomness is drawn from a PRNG seeded by `seed` (`createRng`, mulberry32) — there is no `Math.random`, `Date.now`, `window`, `document`, or `performance` anywhere in `src/`, enforced by `eslint.config.js` (`pnpm lint`), not just convention.

`GradeResult.simVersion` is stamped from `src/version.ts`. Bump it whenever a coefficient changes anywhere in the shot model, archetype table, terrain factors, or metric formulas — the doc is explicit that a coefficient change makes every stored score incomparable.

### Coordinate frame

Tee at the origin, green at +x. `x` = yards down the fairway, `y` = lateral yards off centerline. This is the sim's internal frame only; parcels are authored and rendered portrait, and rotation into this frame happens at the render/schema boundary — `packages/schema`'s `toSimInputs` — never inside the sim.

### What's implemented

- Four calibrated archetypes (BOMBER/STRAIGHT/SCRAMBLER/TOUCH) and the full shot model from doc §4.3: full carry, lateral/distance sigma, the effort-penalty kink above 72% of full carry, lie distance/dispersion factors, recovery, putting (1/2/3-putt partition), and the layup formula.
- **A three-phase shot pipeline** (`src/flight.ts` + `src/route.ts`), not a single statistical draw: (1) *intent* — each archetype's route search picks an aim offset, spin, and power; (2) *flight* — `resolveFlight` turns that intent plus wind and elevation into a deterministic curved arc (a closed-form formula, not a tick-by-tick physics simulation), then the doc-calibrated execution-noise sigma is applied as random miss around that curved endpoint; (3) *roll* — once the carry lands, `resolveRoll` adds ground roll scaled by the lie's firmness and the local slope, and the final lie is re-resolved after roll (a ball can roll from the fairway into a bunker, or off a false front, that it never flew over). Hazards (water/OB) are checked both at the carry landing and again after roll.
- **A real 2D heightmap** (`Parcel.elevationFeatures`, `terrain.ts#elevationAt2D`/`gradientAt`): the centerline profile (`elevationProfile`) still expresses the hole's overall uphill/downhill grade, uniform across width; `elevationFeatures` layers localized mounds (positive height) or hollows (negative) on top, each with a smooth falloff to zero at its own radius. This is what lets a mound actually redirect a ball sideways during roll, not just change how far it carries. Parcel-authored and fixed — never a player-placed tray piece.
- **Wind**, wired into `resolveFlight`: a headwind/tailwind component adjusts effective carry, a crosswind component adds lateral drift (scaled toward shots that spend more time in the air).
- Route search per archetype over four dimensions: aim offset, spin, power (fraction of full carry), and whether to lay up when a shot can't comfortably reach. The power dimension exists because without it every "just advance the ball" shot would swing at exactly 100% effort by construction, which is the exact failure mode the doc's Erin Hills 18 example describes fixing.
- `used`/`cap` from placed-piece cost, `parOK` from field average vs. designed par, `spread` as the gap between the best- and worst-performing archetype's mean, `routes` as the count of distinct strategies the four archetypes converged on.

### Calibration status — read before touching coefficients

Two different tiers, and it matters which one a number is in:

- **Doc-calibrated** (`archetypes.ts`, `shotModel.ts`'s carry/dispersion/putting formulas): transcribed from doc §4.2/4.3, load-bearing, matched expert consensus on 6/8 real holes in the original calibration run. Don't change without re-running a validation set.
- **New and uncalibrated** (everything in `flight.ts`, plus `terrain.ts`'s elevation-feature falloff, `gradientAt`, and `ROLL_FACTORS`): curve strength, wind's yards-per-mph coefficients, roll distance per lie, slope-steering strength. None of this survived the doc reconstruction — it's invented for this pass, each flagged inline as first-pass. There is currently no real validation set to check any of it against (see Status above), so "uncalibrated" is the honest, current state of the whole project, not just this addition.

### What's explicitly deferred (not in this pass)

- **Fairway generator + rough bands** — terrain here is explicit regions (a fixed corridor + placed-piece footprints), not auto-derived from a fairway shape.
- **CLI validation harness + real-hole geometry** — no traced courses, no report format, no gate check yet.
- **Renderer surface interface** — out of scope for the sim package by definition.
- **A dense/authorable heightmap grid** — `elevationFeatures` is deliberately parametric (a short list of mounds/hollows), not a per-cell grid, so it stays hand-authorable in JSON without an editor. A future terrain-generation tool could still emit a grid; the sim doesn't need one to support 2D terrain.

### Known simplifications worth revisiting

- The reach-in-two decision (`REACH_THRESHOLD` / `LAYUP_ZONE_LIMIT` in `route.ts`) is a first-pass heuristic, not the doc's dedicated "par-5 reach-in-two branch" deliverable.
- Flight is a closed-form curved arc, not a physics/bounce simulation — no launch angle, no apex, no Magnus-effect spin curve. Roll is a single closed-form displacement from local slope, not a rolling/decelerating simulation.
- `resolveFlight`'s elevation adjustment is a one-step approximation (evaluated at the wind/curve-only provisional endpoint, not solved iteratively against the final elevation-adjusted point).
- Route search is a 4-dimensional grid (aim × spin × power × lay-up), trimmed to ~3 candidates on aim/spin to keep it tractable (72 combinations vs. the previous 40) — untested against the sub-500ms M1 performance target at production trial counts.
- A design must place exactly one `lieType: "green"` piece; `grade()` throws otherwise. Multiple green pieces aren't merged.
- Metric formulas (`field`, `spread`, `sd`, `routes`, `parOK`'s tolerance) are reconstructed from doc §5's prose and example sentences, not from the lost full per-hole validation table — treat them as a reasonable first guess, not settled.

## Development

```
pnpm install
pnpm --filter @redan/sim run build      # tsc -b
pnpm --filter @redan/sim run typecheck  # tsc over src + test (not part of build — tests aren't shipped)
pnpm --filter @redan/sim run test       # typecheck, then vitest run
pnpm --filter @redan/sim run lint       # eslint (includes the portability checks)
```
