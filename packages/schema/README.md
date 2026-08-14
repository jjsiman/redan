# @redan/schema

Parcel + design types, versioned (doc 8.3). Owns the frozen wire format and the one place portrait-frame coordinates cross into `@redan/sim`'s internal frame.

## Status

First draft. The design-serialization format (`Design = { parcelId, schemaVersion, pieces: [{ shapeId, x, y, rot, scale }] }`) matches doc 6.3 exactly. The shape parameter table (`src/shapes.ts`) is a first pass at the doc's `[thin]` deliverable — plausible real-world-ish yardages for a pot bunker, coffin bunker, green, pond, and rough patch, not validated or playtested.

## What's here

- **`types.ts`** — `Parcel` (portrait frame: terrain + tee + par + tray, no green — the player places the green too) and `Design` (the frozen wire format).
- **`shapes.ts`** — `SHAPE_TABLE`: `shapeId -> { lieType, footprint, cost }`. A `Design` never stores `lieType` or footprint dimensions directly, so retuning a shape's size doesn't invalidate every saved design that references it.
- **`toSim.ts`** — `toSimInputs(parcel, design)`: resolves each placed shape via the shape table and converts portrait coordinates (`x` = lateral, `y` = distance from tee) into the sim's frame (`x` = distance from tee, `y` = lateral) via a proper rotation, not a mirror — `toSimPoint`/`toSimRot` are the only place this happens, matching the sim's portability rule that rotation never happens inside the sim itself.
- **`validate.ts`** — `validateDesign(parcel, design)`: user-facing (non-throwing) check that a design stays within its parcel's tray counts — for an eventual editor, not called by `grade()` itself.

## Development

```
pnpm install
pnpm --filter @redan/schema run build
pnpm --filter @redan/schema run test
pnpm --filter @redan/schema run lint
```
