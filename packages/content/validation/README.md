# Validation set — PARKED

**This harness is suspended, not deleted or a gate for this repo right now.**
See `docs/redan-project-doc.md` §4.4/§9 for why: at the old fixed four-
archetype table, STRAIGHT won or tied all 16 holes here (margins as thin as
0.004 strokes on several), which was a structural property of that archetype
table, not real hole-by-hole signal — see `packages/sim/README.md`'s Status
section. The fix (trait-composed golfers, `packages/sim/src/traits.ts`) also
replaced the vocabulary these 16 files are written against: each
`expected.favors` here names an old archetype (`BOMBER`/`STRAIGHT`/
`SCRAMBLER`/`TOUCH`), and there's no principled mapping from "commentary says
this hole favors power" to one of the new trait-composed golfers. The harness
code itself (`loadValidationHoles`/`runValidation`/etc.) has moved to
`_parked/` and is excluded from the package build — see its header comment.

The 16 `<id>.hole.json` files below are kept as-is (geometry + citations +
the original archetype-vocabulary expectations) as a diagnostic corpus, in
case they're useful again once the new roster has enough of its own track
record to re-register expectations against. The day-to-day tuning loop for
now is `packages/sim/scripts/roster-balance.mjs`'s win-share report, which
doesn't depend on real-hole consensus at all.

---

Real holes, one `<id>.hole.json` per file, previously loaded by
`loadValidationHoles()` (now `_parked/validation.ts`) and scored by
`runValidation()` against the M0 gate (doc 9): 15+ real holes, model agrees
with consensus on archetype bias for 12, every disagreement has a written
explanation.

Each file bundles geometry, a pre-registered expectation with citations, and
any fidelity compromises in one artifact, so they can't drift apart:

```jsonc
{
  "id": "augusta-13", "course": "Augusta National", "hole": 13,
  "par": 5, "yardage": 510, "scoringAverage": 4.79,
  "wind": { "speed": 0, "dirDeg": 0 },
  "expected": {
    "favors": ["BOMBER"],
    "rationale": "...",
    "sources": ["..."]
  },
  "approximations": ["..."],
  "disagreement": null,
  "parcel": { /* @redan/schema Parcel, portrait frame */ },
  "design": { /* @redan/schema Design */ }
}
```

The old runner was `pnpm --filter @redan/content run validate`; that script
has been removed from `package.json` since `_parked/validate.mjs` no longer
compiles against the current `@redan/sim`/`@redan/schema` exports.
