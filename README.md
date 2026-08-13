# Redan

**A cozy, pixelated golf course architecture game.**

You're given a parcel of land, a fixed tee, a small tray of shapes, and a required par. Place a green and a few hazards. A field of simulated golfers plays your hole hundreds of times. You're graded on whether you built *good architecture* — not whether you built something hard.

The third star requires restraint. The land should do the work.

---

## Status

Early development — M0 (Trustworthy Sim) in progress.

See [`docs/redan-project-doc.md`](docs/redan-project-doc.md) for the full design document, sim contract, calibration status, and milestone gates.

## Repo shape

```
packages/sim       — zero-dependency TS simulator (the only irreplaceable artifact)
packages/schema    — parcel + design types, versioned
packages/content   — parcels as JSON
apps/web           — the web editor
docs/              — design documents
```

## Milestones

| Milestone | What | Gate |
|-----------|------|------|
| M0 | Trustworthy sim | 12/15 real holes match expert archetype consensus |
| M1 | Playable slice | 5 strangers finish all 9 parcels unprompted |
| M2 | Public alpha | 40% finish parcel 1→9; 20% return within a week |
| M3 | Accounts + leaderboards | Fake scores rejected; leaderboards survive sim version bump |
| M4 | Play mode | Same parcel plays differently as bomber vs straight hitter |
| M5 | Freeform + authoring | Author 3 campaign parcels in Freeform faster than by hand |
| M6 | Real land | Shinnecock 7 as a parcel; Flynn's green grades well |
