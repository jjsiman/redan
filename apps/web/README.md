# @redan/web

The playable prototype: a portrait-canvas parcel editor over `@redan/sim`, per [doc](../../docs/redan-project-doc.md) §8.1/8.2. Vanilla TypeScript + Vite — no framework, no canvas library, so the renderer stays close to a one-file port to `react-native-skia` later (doc §8.2's whole point).

## Status

First playable slice. Loads all 5 `@redan/content` example parcels (imported directly as JSON — this app has no runtime dependency on `@redan/content` itself, since its loaders use `node:fs` and aren't browser-safe), starting each from its pre-built example design (doc §2: "never start from a blank canvas"). Tray-based placement (click a tray shape to arm it, click the canvas to place at the nearest 8-yard grid cell, click a placed piece to remove it, a rotate button while armed), a Test button that runs `grade()` and shows the doc §5 star/coaching verdict plus every golfer's curved route.

## What's here

- **`src/render/surface.ts`** — the tiny renderer surface (`fillPolygon`/`strokePolyline`/`fillCircle`/`drawText`) doc §8.2 calls for. `src/render/canvas2d.ts` is the *only* file that touches `CanvasRenderingContext2D`.
- **`src/render/parcel.ts`** — draws a parcel/design (+ optional graded traces) onto a `Surface`: the corridor ribbon (`@redan/sim`'s `offsetPolyline`, so it actually bends), fixed regions, placed pieces, elevation mounds, tee marker, and each golfer's curved flight path. Also owns the world↔screen coordinate math and 8-yard grid snapping.
- **`src/editor/state.ts`** / **`src/editor/intents.ts`** — a minimal store plus intent functions (`placeAt`, `removePieceAt`, `armShape`, `rotateArmed`, `selectParcel`, `runGrade`) instead of raw pointer-event handlers, per doc §6.3's `place(shapeId, cell, rot)` framing. Undo/replay/share-a-layout would fall out of recording these, none of which is built yet.
- **`src/ui/tray.ts`** / **`src/ui/verdict.ts`** — the bottom tray strip and the star/coaching-sentence/golfer-table panel.

## Known simplifications worth revisiting

- **Grading is synchronous on the main thread.** Doc M1's target is sub-500ms; a `grade()` call over the current 7-golfer roster visibly freezes the tab for a couple of seconds during interaction testing. The doc's own plan is a Web Worker (`src/sim/worker.ts` in the original plan) — not built in this pass. Don't ship this as-is past a prototype.
- **Not a per-cell dithered grid renderer.** Doc §6.4 describes 8-yard cells with deterministic per-cell turf dither; this draws real shapes (polygons/circles) instead, closer to `packages/content/src/render.ts`'s SVG diagnostic. The `Surface` interface is small enough that a `fillCell` method could be added later without touching call sites, but the texture itself isn't here.
- **No dispersion ovals yet** (doc §6.4's "each archetype's landing zone shows as a translucent ellipse"). `grade()` doesn't currently return the sigma values needed to draw one live while dragging a piece — only the realized trace of one trial. Would need a small `GradeResult` extension or a cheap client-side re-derivation.
- **Placement is click-to-arm-then-click-to-place, not drag-and-drop.** Simpler to build correctly in the time available; doc §6.4 describes actual dragging with live-updating dispersion ovals.
- **JSON parcels are imported by relative path** (`../../../packages/content/parcels/*.json`) rather than through a shared package export, since `@redan/content`'s loaders are Node-`fs`-based and not browser-safe. Fine for 5 example parcels; won't scale to real campaign content without a proper content-serving story.
- No accounts, no progress persistence, no mobile-specific layout tuning beyond a responsive flex layout (doc M1's actual mobile-portrait spec — tray strip under the thumb, verdict as a sliding sheet — isn't implemented).

## Development

```
pnpm install
pnpm --filter @redan/web run dev         # Vite dev server
pnpm --filter @redan/web run typecheck
pnpm --filter @redan/web run lint
pnpm --filter @redan/web run build       # typecheck + vite build
```
