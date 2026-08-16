# @redan/sim

Zero-runtime-dependency, deterministic golf hole simulator. Per the [project doc](../../docs/redan-project-doc.md), this is the one irreplaceable artifact — everything else (schema, content, the web editor) is a client of `grade()`.

## Status

`simVersion 0.3.0`. The fixed four-archetype field (BOMBER/STRAIGHT/SCRAMBLER/TOUCH) has been replaced by a **trait-composed roster** (`traits.ts`), and parcel geometry is now a **bending corridor** (`Parcel.corridor: CorridorStation[]`) with polygon regions, instead of two flat scalars. A **fairway generator** now exists (`fairway.ts#deriveFairway`) for "land mode" parcels (`Parcel.landEnvelope`) — see "What's implemented" below; the previous status line calling this deferred is now out of date. `grade.ts`'s `used` metric also stopped counting the mandatory green piece (0.2.0 → 0.3.0's version bump) — see the calibration section below.

Why: the old fixed archetypes failed the real-hole validation harness 16-for-16 in favor of STRAIGHT — its accuracy-driven base dispersion coefficient was structurally ~1.5–1.75× smaller than every other archetype's, a dominant free stat no hole geometry could overturn, since every hole in that set was also a straight corridor with no way to reward anything but accuracy. Fixing one without the other wouldn't have worked. See `traits.ts`'s module doc for the fix (a trait's benefit and cost must land on different `ShotContext`s) and `packages/content/validation/README.md` for the parked 16-hole harness and its numbers — **that harness is suspended, not deleted, and is not a gate for this repo right now** (see `docs/redan-project-doc.md` §4.4/§9's amendment).

The new tuning loop is `scripts/roster-balance.mjs`: runs the roster across a small varied parcel set and several seeds, reports each golfer's win share. Target: no golfer above ~35%. Run it after any change to `TRAIT_TABLE`, `ROSTER`, or a shot-model coefficient.

`packages/schema` (frozen design-serialization format + a first-draft shape parameter table) and `packages/content` (example JSON parcels) now exist — see their READMEs. `Piece`/`Parcel` here remain sim-internal; `packages/schema/src/toSim.ts` is the adapter.

## Contract

```ts
grade(parcel: Parcel, pieces: Piece[], wind: Wind, seed: number): GradeResult
```

Pure and deterministic: the same four inputs always produce byte-identical output, in the browser, in Node, or on an edge worker. All randomness is drawn from a PRNG seeded by `seed` (`createRng`, mulberry32) — there is no `Math.random`, `Date.now`, `window`, `document`, or `performance` anywhere in `src/`, enforced by `eslint.config.js` (`pnpm lint`), not just convention.

`GradeResult.simVersion` is stamped from `src/version.ts`. Bump it whenever a coefficient changes anywhere in the shot model, trait table, terrain factors, or metric formulas — the doc is explicit that a coefficient change makes every stored score incomparable.

### Coordinate frame

Tee at the origin, green at +x. `x` = yards down the fairway, `y` = lateral yards off centerline. This is the sim's internal frame only; parcels are authored and rendered portrait, and rotation into this frame happens at the render/schema boundary — `packages/schema`'s `toSimInputs` — never inside the sim.

### What's implemented

- **A bending corridor** (`Parcel.corridor: CorridorStation[]`, `geom.ts`, `terrain.ts`): the fairway/OB envelope is a polyline of stations, each with its own lateral drift and half-widths, replacing the old flat `corridorHalfWidth`/`obHalfWidth` scalars. `geom.ts` is the generic 2D kernel underneath (`pointInPolygon`, `projectToPolyline`'s arc-length + signed offset, `pointAtStation`, `offsetPolyline`) — pure, no sim domain concepts, safe for a renderer to import too. `RegionShape` gained a `polygon` variant alongside circle/rect. `Parcel.fixedRegions` is new: parcel-authored terrain (trees, native area) the player can't remove or place over and that never counts against the piece budget — what makes a dogleg's inside corner an actual decision.
- **Trait-composed golfers** (`traits.ts`, replacing `archetypes.ts`): every field golfer shares one flat `BASE_STATS` sheet; all differentiation comes from exactly two traits (`TRAIT_TABLE`), applied as a multiplier layer in `shotModel.ts` scoped to a `ShotContext` (`drive`/`long`/`short`/`recovery`). The doc-calibrated carry/dispersion/putting formulas themselves are untouched.
- **A corridor-aware route search** (`route.ts`): a fifth search dimension, `aimLine: "corridor" | "green"`, lets an "advance the ball" shot either follow the corridor's bend or cut straight at the green across whatever's in the way. Only searched when the corridor actually bends (`corridorBends`), so a straight hole still costs exactly the old 72 combinations (4 dims × up to 3/2 candidates); a bending one costs double.
- **A three-phase shot pipeline** (`flight.ts` + `route.ts`), not a single statistical draw: (1) *intent* — route search picks an aim offset, spin, power, and (on a bend) aim line; (2) *flight* — `resolveFlight` turns that intent plus wind and elevation into a deterministic curved arc, then execution-noise sigma is applied as random miss around that curved endpoint; (3) *roll* — ground roll scaled by the lie's firmness and local slope, lie re-resolved after roll. Hazards (water/OB) are checked both at the carry landing and again after roll.
- **A real 2D heightmap** (`Parcel.elevationFeatures`, `terrain.ts#elevationAt2D`/`gradientAt`): the centerline profile (`elevationProfile`) expresses the hole's overall uphill/downhill grade; `elevationFeatures` layers localized mounds/hollows on top with a smooth falloff, so a mound can redirect a ball sideways during roll, not just change how far it carries. Deliberately parametric rather than a dense grid — see "explicitly deferred" below.
- **Wind**, wired into `resolveFlight`: headwind/tailwind adjusts effective carry, crosswind adds lateral drift.
- `used`/`cap` from placed-piece cost, **excluding the green** (fixed regions were already excluded) — every design must have exactly one, so counting it taxed every hole by a constant 1 rather than measuring restraint (doc §5's third star, `used < cap`, is specifically about material left over). `parOK` from field average vs. designed par, `spread` as best-vs-worst mean, `contested` (new) as the gap between the best and second-best mean — with 7 golfers instead of 4, `spread` alone widens mechanically, so `contested` is what actually answers "is more than one kind of player rewarded here," `routes` as the count of distinct strategies the field converged on.
- **A fairway generator** (`fairway.ts#deriveFairway`, doc §6.4: "fairway generator plus rough bands as one deterministic terrain-derivation module"): given a fixed rectangular land envelope (`Parcel.landEnvelope`) and a green position, derives a routed `CorridorStation[]` from the tee to the green — a precomputed hazard-clearance field plus cubic-Bézier candidate scoring, not a grid search (grid/Dijkstra was tried and rejected: it hugs hazard edges, is 45°-quantized, and its discrete argmin can flip between similar-cost routes on a one-cell green move, which is disqualifying for a corridor re-derived on every drag). Water is expensive per yard, not impassable, so the router walks around a hazard when a detour is cheaper and crosses at the narrowest point when the land leaves no way around — a forced carry falls out of the cost model rather than needing a special case. Two structural notes worth knowing before touching this: (1) a land parcel's own authored `corridor` must be `halfWidth: 0` (not equal to `obHalfWidth`) — `lieAt`'s fallback is "fairway if inside halfWidth else rough," so equal widths make the whole interior fairway by construction; (2) the derived corridor's `obHalfWidth` is a large sentinel, not a real boundary — see the next bullet for why, and how the boundary is actually expressed.
- **A fixed OB boundary independent of the corridor** (`fairway.ts`'s `obBands`, two fixed `ob`-lie regions per land parcel): `lieAt`'s in-bounds test is symmetric about whichever centerline it's given, so once the centerline bends to route around a hazard there is no per-station `obHalfWidth` that can hold a *fixed* boundary still — matching a fixed band `[-W, W]` at a drifted station algebraically forces the drift to be zero. Provably impossible in the one-polyline corridor model, not just imprecise. So a land parcel's real boundary is expressed as fixed regions instead (only the *lateral* edges need one — the fore/aft boundary is already handled correctly by the corridor's own arc-length `beyond` check, since the derived corridor extends a fixed `runout` past both the tee and the green).

### Calibration status — read before touching coefficients

Three different tiers now, and it matters which one a number is in:

- **Doc-calibrated** (`shotModel.ts`'s carry/dispersion/putting formulas): transcribed from doc §4.3, load-bearing, untouched by the trait rework — traits multiply their outputs, never edit them.
- **New in the trait/geometry rework, measured not validated** (`traits.ts`'s `TRAIT_TABLE`/`BASE_STATS`, `route.ts`'s `aimLine`/aggression objective): tuned against `scripts/roster-balance.mjs`'s win-share report across a small synthetic parcel set, not against real holes — the real-hole harness is parked (see Status above). Expect these numbers to move.
- **`fairway.ts`'s routing constants** (`baseHalfWidth`, `hazardClearance`, the cost weights in `deriveCenterline`, `maxWaterCarry`-equivalent behavior from the per-yard water weight): tuned by eyeballing generated land parcels (`packages/content/scripts/generate-land.mjs`'s output, `packages/content/land/*`) for plausible fairway shapes and by checking that starting-design field averages land near their designed par — not calibrated against anything real. Two known rough edges from that process, left as-is rather than over-fit to a handful of generated examples: on a very short hole, control-point offsets are additionally capped by chord length (else the fairway kinks into a wiggle much sharper than the hole's own length justifies), and control points are constrained to the same sign (a real dogleg commits to one direction rather than snaking).
- **New and uncalibrated, pre-dating this pass** (everything in `flight.ts`, plus `terrain.ts`'s elevation-feature falloff, `gradientAt`, and `ROLL_FACTORS`): curve strength, wind's yards-per-mph coefficients, roll distance per lie, slope-steering strength. None of this survived the doc reconstruction.

### What's explicitly deferred (not in this pass)

- **Renderer surface interface** — out of scope for the sim package by definition, though `geom.ts` is written to be renderer-safe.
- **A dense/authorable heightmap grid** — `elevationFeatures` stays deliberately parametric so terrain remains hand-authorable in JSON without an editor.
- **Branching/split corridors** — the corridor is one polyline; there's no way to express two genuinely alternate routes to the green yet. `deriveFairway` inherits this — it derives one route, not several candidates the player could compare.
- **Tapered/non-rectangular land envelopes** — `LandEnvelope` is a constant-width rectangle; `deriveFairway`'s OB-frame construction (two fixed lateral bands) assumes that shape specifically and would need reworking for a land parcel whose width varies along its length.

### Known simplifications worth revisiting

- The reach-in-two decision (`REACH_THRESHOLD` / `LAYUP_ZONE_LIMIT` in `route.ts`) is a first-pass heuristic, not the doc's dedicated "par-5 reach-in-two branch" deliverable.
- Flight is a closed-form curved arc, not a physics/bounce simulation. Roll is a single closed-form displacement from local slope.
- `resolveFlight`'s elevation adjustment is a one-step approximation, not an iterative solve.
- A shot's `ShotContext` (drive/long/short/recovery — see `route.ts#shotContext`) is inferred from which route-search branch fired and the current lie, not from anything a real golfer would consciously label — a reasonable first pass, not validated against how it feels in practice.
- The branch-selection full carry (`route.ts`'s `provisionalFull`) is computed under a fixed `"long"` context before the real context is known, so a golfer whose `carryMul` varies sharply between contexts (e.g. `long`'s drive-only bonus) can occasionally misjudge the reach/lay-up threshold by a small margin.
- A design must place exactly one `lieType: "green"` piece; `grade()` throws otherwise. Multiple green pieces aren't merged.
- Metric formulas (`field`, `spread`, `sd`, `routes`, `contested`, `parOK`'s tolerance) and the doc §5 star thresholds are a reasonable first guess, not settled — `contested` and the wider `spread` range from a 7-golfer field haven't been re-checked against those thresholds yet.
- A piece placed beyond the corridor's arc-length extent (or its lateral OB width) resolves OB — an authoring constraint parcels must satisfy (the corridor must extend at least as far as the green), the same class of constraint the old scalar model had for the lateral direction.

## Development

```
pnpm install
pnpm --filter @redan/sim run build      # tsc -b
pnpm --filter @redan/sim run typecheck  # tsc over src + test (not part of build — tests aren't shipped)
pnpm --filter @redan/sim run test       # typecheck, then vitest run
pnpm --filter @redan/sim run lint       # eslint (includes the portability checks)
node packages/sim/scripts/roster-balance.mjs   # win-share report across a small parcel set (run after tuning traits)
```
