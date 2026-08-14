# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Redan is a puzzle game about designing golf holes: given a parcel of land, a fixed tee, a small tray of shapes, and a required par, the player places a green and hazards, and a field of four simulated golfer archetypes plays the hole hundreds of times. The design doc — `docs/redan-project-doc.md` — is the source of truth for game design, the sim's calibrated formulas, star thresholds, and milestone gates. Read it before making any change to `packages/sim`'s coefficients.

**Context that matters for this repo specifically:** the project's original HTML/Python prototypes and the 8-hole (target 15+) real-course validation set were lost — they existed only in a phone chat, never committed to disk. `docs/redan-project-doc.md` itself is a reconstruction and marks the parts that didn't survive as `[thin]`. Don't assume prototype files, real course geometry, or a finished shape-parameter table exist anywhere in this repo or reachable from it — they don't yet. Anything validated so far is checked against hand-authored synthetic fixtures, not real holes.

## Commands

Package manager is **pnpm** (workspace, not npm/yarn). From the repo root:

```
pnpm install                                  # install + link all workspace packages
pnpm build                                    # tsc -b across every package
pnpm test                                     # vitest run across every package
pnpm lint                                     # eslint across every package
```

Scoped to one package (or `cd` into it and drop `--filter`):

```
pnpm --filter @redan/sim run build
pnpm --filter @redan/sim run test
pnpm --filter @redan/sim run lint
```

Single test file or test name (vitest), from inside the package directory:

```
npx vitest run test/grade.test.ts
npx vitest run -t "favors accuracy over power"
```

Type-check only, from inside a package directory: `npx tsc -b`.

Packages are wired with TS project references (`composite: true` in `tsconfig.base.json`), so `tsc -b` at the root or in a downstream package will rebuild its upstream dependencies as needed.

## Architecture

Monorepo, `packages/*`, dependency order `sim → schema → content`:

- **`packages/sim`** — the zero-runtime-dependency, deterministic simulator. This is the one irreplaceable artifact; everything else is a client of its single entry point, `grade(parcel, pieces, wind, seed) → GradeResult`. Internals: `archetypes.ts` (the four calibrated builds — BOMBER/STRAIGHT/SCRAMBLER/TOUCH), `shotModel.ts` (carry/dispersion/effort-penalty/putting formulas, transcribed directly from the doc), `terrain.ts` (lie resolution + elevation), `route.ts` (per-archetype route search — see below), `grade.ts` (orchestrates the four archetypes into one `GradeResult`).
  - **Portability contract, enforced by `eslint.config.js` not just convention**: no `window`/`document`/`performance`/`navigator`/`localStorage`, no `Math.random`, no `Date.now`. All randomness flows from the `seed` argument through `createRng` (mulberry32). `pnpm lint` will fail if this is violated.
  - **Coordinate frame**: internally, tee is at the origin and green is at +x (`x` = yards downrange, `y` = lateral yards). This is *only* the sim's internal frame — rotation into/out of it happens exclusively at the schema boundary (see below), never inside `packages/sim`.
  - **Route search** (`route.ts`): each archetype searches a small grid of `{aimBias, laysUp, swingEffort}` combinations (cheap trial count), keeps the best-scoring one, then re-evaluates that single choice at a much higher trial count for a stable mean/sd. The `swingEffort` dimension exists because without it every "just advance the ball" shot swings at exactly 100% of full carry by construction — always the worst-case effort penalty. If you're tuning route search, preserve this two-phase search-then-confirm structure.
  - `simVersion` (`version.ts`) must be bumped whenever any coefficient changes anywhere in the shot model, archetype table, terrain factors, or metric formulas — a version bump is what makes old stored scores correctly show as incomparable.

- **`packages/schema`** — parcel/design types in the **portrait** frame (`x` = lateral, `y` = distance from tee — the opposite axis convention from `packages/sim`), the frozen design-serialization wire format (`Design = { parcelId, schemaVersion, pieces: [{ shapeId, x, y, rot, scale }] }`, doc §6.3 — nothing else may be added to this shape), and the shape parameter table (`shapes.ts`, `shapeId → { lieType, footprint, cost }` — a first draft, not calibrated). `toSim.ts` is the *only* place portrait coordinates convert into the sim's frame, via a proper rotation (`simX = portraitY, simY = -portraitX`) chosen specifically so it doesn't mirror the layout — don't replace this with a naive axis swap. `validate.ts` provides non-throwing tray/budget validation for an eventual editor; it is not called by `grade()` itself.

- **`packages/content`** — parcels as JSON (doc §8.3). Currently two hand-authored examples (`01-one-bunker`, `04-water-and-hill`, chosen to match the doc's own teaching-order examples in §3), proving the JSON → schema → sim pipeline round-trips. Not campaign content yet.

- **`apps/web`** — not started.

## Working conventions specific to this repo

- Every package's coefficients/formulas that originate in `docs/redan-project-doc.md` should cite the doc section in a comment when non-obvious (e.g. "doc 4.3", "doc §6.2") — the doc is the calibration source of truth and a future reader needs to know whether a number is load-bearing (transcribed from the doc) or a placeholder (invented here, pending real validation).
- Where something is a genuine placeholder or a first-pass heuristic rather than a validated value (elevation's yards-per-foot coefficient, the shape table's dimensions, the reach-in-two thresholds), say so explicitly in a comment and in the package's README's "known simplifications" section, rather than presenting it as settled.
- Don't force a test assertion to encode a guess about which archetype "should" win on a synthetic fixture. If the calibrated model produces a surprising result on a fixture you wrote, that's more likely a wrong assumption in the test than a bug — the model's coefficients are validated against real holes, not against fixtures invented for test coverage. Assert what's structurally guaranteed (determinism, finite/plausible ranges, real strategic differentiation) rather than a specific outcome you can't independently verify.
