# @redan/web

The playable prototype: a portrait-canvas parcel editor over `@redan/sim`, per [doc](../../docs/redan-project-doc.md) §8.1/8.2. Vanilla TypeScript + Vite — no framework, no canvas library, so the renderer stays close to a one-file port to `react-native-skia` later (doc §8.2's whole point).

## Status

Two modes, one store/Test-button/verdict-panel scaffolding.

**Tray mode** (the original slice). Loads all 5 `@redan/content` example parcels (imported directly as JSON — this app has no runtime dependency on `@redan/content` itself, since its loaders use `node:fs` and aren't browser-safe), starting each from its pre-built example design (doc §2: "never start from a blank canvas"). Tray-based placement (click a tray shape to arm it, click the canvas to place at the nearest 8-yard grid cell, click a placed piece to remove it, a rotate button while armed), a Test button that runs `grade()` and shows the doc §5 star/coaching verdict plus every golfer's curved route.

**Land mode** (new). Loads 6 seeded-generated natural parcels (`@redan/content/land/*` — hills, water, trees, no hand-authored fairway) and reduces placement to one lever: drag the green. The fairway routes itself live from wherever the green sits (`@redan/sim`'s `deriveFairway`) and renders as chunky 8-yard cells (doc §6.4/§8.2), colored straight from `@redan/sim`'s own `lieAt` so the picture is never out of sync with what `grade()` would actually score. Drag with mouse or touch (`pointerdown`/`pointermove`, `setPointerCapture`) — the doc's primary target is a phone, and this is the one place in the app that isn't mouse-only.

## What's here

- **`src/render/surface.ts`** — the tiny renderer surface (`fillPolygon`/`strokePolyline`/`fillCircle`/`drawText`/`fillCell`/`resize`) doc §8.2 calls for. `src/render/canvas2d.ts` is the *only* file that touches `CanvasRenderingContext2D`; it reuses one backing store across renders (`resize()` early-returns when nothing changed) rather than reconstructing a `Canvas2DSurface` per frame — necessary once a render can fire on every pointermove.
- **`src/render/parcel.ts`** — draws a parcel/design (+ optional graded traces) onto a `Surface`: the corridor ribbon (`@redan/sim`'s `offsetPolyline`, so it actually bends), fixed regions, placed pieces, elevation mounds, tee marker, and each golfer's curved flight path. Also owns the world↔screen coordinate math, 8-yard grid snapping, and `computeLandBounds` (land mode's *fixed* frame, independent of the green's current position — dragging must never resize the canvas mid-drag).
- **`src/render/grid.ts`** — land mode's cell rasterizer (doc §6.4: "8-yard cells... deterministic per-cell dither"). Every cell's color comes from `@redan/sim`'s `lieAt`, queried through the same `compileTerrain` assembly `grade()` uses, plus a deterministic dither and a once-per-parcel-load hillshade layer (`buildHillshade`) so elevation actually reads as terrain instead of a faint ring.
- **`src/editor/state.ts`** / **`src/editor/intents.ts`** — a minimal store plus intent functions (`placeAt`, `removePieceAt`, `armShape`, `rotateArmed`, `selectParcel`, `runGrade`) instead of raw pointer-event handlers, per doc §6.3's `place(shapeId, cell, rot)` framing. Undo/replay/share-a-layout would fall out of recording these, none of which is built yet.
- **`src/editor/land.ts`** — land mode's intents: `selectLandParcel`, `moveGreen` (clamps the drag inside the land, inset by a margin — `@redan/sim`'s round loop has no exit besides reaching the green, so a green dragged onto the OB frame would either never resolve or resolve nonsensically), `runLandGrade` (derives the fairway, then grades).
- **`src/ui/tray.ts`** / **`src/ui/verdict.ts`** — the bottom tray strip (hidden in land mode — there's nothing to arm) and the star/coaching-sentence/golfer-table panel. `verdict.ts` caps land mode at ★★ (`maxStars`) rather than showing an unearned third star, since `grade()` never counts the green against the budget (see `@redan/sim`'s README) and a mode with nothing else to spend has no restraint to demonstrate — the panel says so in a sentence rather than gating silently.

## Known simplifications worth revisiting

- **Grading is synchronous on the main thread.** Doc M1's target is sub-500ms; a `grade()` call over the current 7-golfer roster visibly freezes the tab for a couple of seconds during interaction testing. The doc's own plan is a Web Worker (`src/sim/worker.ts`) — not built in this pass. Land mode makes this more visible, not less: derived corridors bend by construction, which roughly doubles `searchRoute`'s combinations. Don't ship this as-is past a prototype.
- **No dispersion ovals yet** (doc §6.4's "each archetype's landing zone shows as a translucent ellipse"). `grade()` doesn't currently return the sigma values needed to draw one live while dragging a piece — only the realized trace of one trial. Would need a small `GradeResult` extension or a cheap client-side re-derivation.
- **Tray placement is click-to-arm-then-click-to-place, not drag-and-drop** (land mode's green *is* drag-and-drop — this simplification is tray-mode-only now). Doc §6.4 describes actual dragging with live-updating dispersion ovals for the tray flow too.
- **JSON parcels are imported by relative path** (`../../../packages/content/parcels/*.json`, `.../land/*.json`) rather than through a shared package export, since `@redan/content`'s loaders are Node-`fs`-based and not browser-safe. Fine for 5+6 example parcels; won't scale to real campaign content without a proper content-serving story.
- **Land mode's rasterization is only cached one cell deep** (keyed on the green's currently snapped 8-yard cell) — good enough for a slow drag where most pointermove events land in the same cell as the last, not stress-tested against a fast flick across the whole parcel.
- **Land envelopes are constant-width rectangles** (`@redan/sim`'s `LandEnvelope`) — no tapering, no non-rectangular boundaries; `deriveFairway`'s OB-frame construction assumes the rectangle shape specifically.
- No accounts, no progress persistence, no mobile-specific layout tuning beyond a responsive flex layout (doc M1's actual mobile-portrait spec — tray strip under the thumb, verdict as a sliding sheet — isn't implemented).

## Development

```
pnpm install
pnpm --filter @redan/web run dev         # Vite dev server
pnpm --filter @redan/web run typecheck
pnpm --filter @redan/web run lint
pnpm --filter @redan/web run build       # typecheck + vite build
```
