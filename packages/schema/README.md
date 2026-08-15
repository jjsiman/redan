# @redan/schema

Parcel + design types, versioned (doc 8.3). Owns the frozen wire format and the one place portrait-frame coordinates cross into `@redan/sim`'s internal frame.

## Status

`schemaVersion 0.2.0`. `Parcel.corridorHalfWidth`/`obHalfWidth` (two flat scalars) are replaced by `Parcel.corridor: PortraitCorridorStation[]` — a polyline of stations, each with its own lateral drift and half-widths, mirroring `@redan/sim`'s `CorridorStation` — plus a new optional `Parcel.fixedRegions` for parcel-authored, un-removable terrain (trees, native area). Old parcel JSON needs migrating; `@redan/sim`'s `straightCorridor(length, halfWidth, obHalfWidth)` is the mechanical one-line equivalent of the old two scalars.

The design-serialization format itself is untouched (`Design = { parcelId, schemaVersion, pieces: [{ shapeId, x, y, rot, scale }] }`, doc 6.3) — `fixedRegions` reuses that same `PlacedShape` shape on the `Parcel` instead of adding a new wire format.

The shape parameter table (`src/shapes.ts`) remains a first pass at the doc's `[thin]` deliverable — plausible real-world-ish yardages, not validated or playtested. `bunker-kidney` (a concave polygon shape) and `trees`/`native-area` (for `fixedRegions`) were added for the corridor rework's dogleg content — also unvalidated, same as the rest of the table.

## What's here

- **`types.ts`** — `Parcel` (portrait frame: a bending corridor + optional fixed regions + tee + par + tray, no green — the player places the green too) and `Design` (the frozen wire format).
- **`shapes.ts`** — `SHAPE_TABLE`: `shapeId -> { lieType, footprint, cost }`. A `Design` never stores `lieType` or footprint dimensions directly, so retuning a shape's size doesn't invalidate every saved design that references it. `footprint` now includes a `polygon` variant alongside circle/rect.
- **`toSim.ts`** — `toSimInputs(parcel, design)`: resolves each placed shape via the shape table and converts portrait coordinates (`x` = lateral, `y` = distance from tee) into the sim's frame (`x` = distance from tee, `y` = lateral) via a proper rotation, not a mirror — `toSimPoint`/`toSimRot` are the only place this happens, matching the sim's portability rule that rotation never happens inside the sim itself. Corridor stations and `fixedRegions` cross the same boundary through the same rotation.
- **`validate.ts`** — `validateDesign(parcel, design)`: user-facing (non-throwing) check that a design stays within its parcel's tray counts — for an eventual editor, not called by `grade()` itself. Does not (yet) check that a design's pieces stay within the corridor's arc-length/lateral extent.

## Development

```
pnpm install
pnpm --filter @redan/schema run build
pnpm --filter @redan/schema run test
pnpm --filter @redan/schema run lint
```
