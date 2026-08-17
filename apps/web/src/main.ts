import type { Design, Parcel } from "@redan/schema";
import { toSimInputs } from "@redan/schema";
import { Store, type EditorState } from "./editor/state.js";
import { placeAt, removePieceAt, runGrade, selectParcel } from "./editor/intents.js";
import { moveGreen, runLandGrade, selectLandParcel } from "./editor/land.js";
import {
  computeBounds,
  computeLandBounds,
  drawHole,
  drawLandOverlay,
  makeFrame,
  screenToWorld,
  snapToGrid,
  type Frame,
} from "./render/parcel.js";
import { buildHillshade, paintRaster, rasterizeLand, type HillshadeLayer, type LandRaster } from "./render/grid.js";
import { Canvas2DSurface } from "./render/canvas2d.js";
import { mountTray } from "./ui/tray.js";
import { mountVerdict } from "./ui/verdict.js";

import bunkerParcel from "../../../packages/content/parcels/01-one-bunker.parcel.json";
import bunkerDesign from "../../../packages/content/parcels/01-one-bunker.design.json";
import doglegParcel from "../../../packages/content/parcels/02-dogleg-left.parcel.json";
import doglegDesign from "../../../packages/content/parcels/02-dogleg-left.design.json";
import splitParcel from "../../../packages/content/parcels/03-split-par5.parcel.json";
import splitDesign from "../../../packages/content/parcels/03-split-par5.design.json";
import waterParcel from "../../../packages/content/parcels/04-water-and-hill.parcel.json";
import waterDesign from "../../../packages/content/parcels/04-water-and-hill.design.json";
import drivableParcel from "../../../packages/content/parcels/05-drivable-four.parcel.json";
import drivableDesign from "../../../packages/content/parcels/05-drivable-four.design.json";

import land01Parcel from "../../../packages/content/land/land-01.parcel.json";
import land01Design from "../../../packages/content/land/land-01.design.json";
import land02Parcel from "../../../packages/content/land/land-02.parcel.json";
import land02Design from "../../../packages/content/land/land-02.design.json";
import land03Parcel from "../../../packages/content/land/land-03.parcel.json";
import land03Design from "../../../packages/content/land/land-03.design.json";
import land04Parcel from "../../../packages/content/land/land-04.parcel.json";
import land04Design from "../../../packages/content/land/land-04.design.json";
import land05Parcel from "../../../packages/content/land/land-05.parcel.json";
import land05Design from "../../../packages/content/land/land-05.design.json";
import land06Parcel from "../../../packages/content/land/land-06.parcel.json";
import land06Design from "../../../packages/content/land/land-06.design.json";

// JSON import assertions land as `unknown`-ish structural types under
// resolveJsonModule; casting to the schema types here is the one place this
// app trusts packages/content's example JSON matches @redan/schema's shape
// (the same trust `packages/content/test/roundtrip.test.ts` verifies).
const TRAY_PARCELS: Record<string, { parcel: Parcel; design: Design }> = {
  "01-one-bunker": { parcel: bunkerParcel as Parcel, design: bunkerDesign as Design },
  "02-dogleg-left": { parcel: doglegParcel as Parcel, design: doglegDesign as Design },
  "03-split-par5": { parcel: splitParcel as Parcel, design: splitDesign as Design },
  "04-water-and-hill": { parcel: waterParcel as Parcel, design: waterDesign as Design },
  "05-drivable-four": { parcel: drivableParcel as Parcel, design: drivableDesign as Design },
};

const LAND_PARCELS: Record<string, { parcel: Parcel; design: Design }> = {
  "land-01": { parcel: land01Parcel as Parcel, design: land01Design as Design },
  "land-02": { parcel: land02Parcel as Parcel, design: land02Design as Design },
  "land-03": { parcel: land03Parcel as Parcel, design: land03Design as Design },
  "land-04": { parcel: land04Parcel as Parcel, design: land04Design as Design },
  "land-05": { parcel: land05Parcel as Parcel, design: land05Design as Design },
  "land-06": { parcel: land06Parcel as Parcel, design: land06Design as Design },
};

const initialId = "02-dogleg-left";
const initial: EditorState = {
  mode: "tray",
  parcelId: initialId,
  parcel: TRAY_PARCELS[initialId]!.parcel,
  design: {
    ...TRAY_PARCELS[initialId]!.design,
    pieces: TRAY_PARCELS[initialId]!.design.pieces.map((p) => ({ ...p })),
  },
  armed: null,
  result: null,
  verdict: null,
  grading: false,
  message: null,
};
const store = new Store(initial);

const app = document.querySelector<HTMLDivElement>("#app")!;
app.replaceChildren();

const header = document.createElement("header");
header.className = "app-header";
const title = document.createElement("h1");
title.textContent = "Redan";

const modeToggle = document.createElement("div");
modeToggle.className = "mode-toggle";
const trayModeBtn = document.createElement("button");
trayModeBtn.textContent = "Tray";
const landModeBtn = document.createElement("button");
landModeBtn.textContent = "Land";
modeToggle.append(trayModeBtn, landModeBtn);

const select = document.createElement("select");
select.className = "parcel-select";

function refreshParcelOptions(mode: EditorState["mode"]): void {
  const source = mode === "land" ? LAND_PARCELS : TRAY_PARCELS;
  select.replaceChildren();
  for (const id of Object.keys(source)) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id;
    select.appendChild(opt);
  }
}
refreshParcelOptions("tray");
select.value = initialId;

select.addEventListener("change", () => {
  const mode = store.getState().mode;
  if (mode === "land") selectLandParcel(store, select.value, LAND_PARCELS);
  else selectParcel(store, select.value, TRAY_PARCELS);
});

function updateModeButtons(): void {
  const mode = store.getState().mode;
  trayModeBtn.classList.toggle("active", mode === "tray");
  landModeBtn.classList.toggle("active", mode === "land");
  canvas.classList.toggle("pixelated", mode === "land");
}

trayModeBtn.addEventListener("click", () => {
  if (store.getState().mode === "tray") return;
  refreshParcelOptions("tray");
  const id = Object.keys(TRAY_PARCELS)[0]!;
  select.value = id;
  selectParcel(store, id, TRAY_PARCELS);
  store.setState({ mode: "tray" });
});

landModeBtn.addEventListener("click", () => {
  if (store.getState().mode === "land") return;
  refreshParcelOptions("land");
  const id = Object.keys(LAND_PARCELS)[0]!;
  select.value = id;
  selectLandParcel(store, id, LAND_PARCELS);
});

header.append(title, modeToggle, select);

const stage = document.createElement("div");
stage.className = "stage";
const canvas = document.createElement("canvas");
canvas.className = "hole-canvas";
stage.appendChild(canvas);

const sidebar = document.createElement("div");
sidebar.className = "sidebar";
const testBtn = document.createElement("button");
testBtn.className = "test-button";
testBtn.textContent = "Test";
testBtn.addEventListener("click", () => {
  if (store.getState().mode === "land") runLandGrade(store);
  else runGrade(store);
});
const verdictPanel = document.createElement("div");
verdictPanel.className = "verdict-panel";
sidebar.append(testBtn, verdictPanel);
stage.appendChild(sidebar);

const trayEl = document.createElement("div");
trayEl.className = "tray";

app.append(header, stage, trayEl);

mountVerdict(verdictPanel, store);
mountTray(trayEl, store);

// --- Rendering -------------------------------------------------------
//
// One Canvas2DSurface, reused across renders via resize() rather than
// reconstructed per frame — a fresh Canvas2DSurface reallocates the canvas
// backing store on every call, which alone can blow a 60fps budget on a
// dragged pointermove. Frame is memoized per mode+parcel: land mode's frame
// comes from computeLandBounds (fixed, independent of the green's current
// position), so dragging never resizes the canvas under the cursor —
// tray mode keeps computeBounds(design) since its pieces can extend the
// scene as they're placed, matching its existing behavior.

let currentFrame: Frame | null = null;
let surface: Canvas2DSurface | null = null;

let landHillshadeKey: string | null = null;
let landHillshade: HillshadeLayer = { sample: () => 1 };

let rasterKey: string | null = null;
let landRaster: LandRaster | null = null;

function renderNow(): void {
  const { mode, parcel, design, armed, result } = store.getState();
  updateModeButtons();
  const dpr = window.devicePixelRatio || 1;

  if (mode === "land") {
    const bounds = computeLandBounds(parcel);
    const frame = makeFrame(bounds);
    currentFrame = frame;
    if (!surface) surface = new Canvas2DSurface(canvas, frame.width, frame.height, dpr);
    else surface.resize(frame.width, frame.height, dpr);

    if (landHillshadeKey !== store.getState().parcelId) {
      const { parcel: simParcel } = toSimInputs(parcel, design);
      landHillshade = buildHillshade(simParcel);
      landHillshadeKey = store.getState().parcelId;
    }

    const green = design.pieces[0];
    const snapped = green ? snapToGrid(green) : { x: 0, y: 0 };
    const key = `${store.getState().parcelId}:${snapped.x},${snapped.y}`;
    if (key !== rasterKey) {
      landRaster = rasterizeLand(parcel, design, bounds, landHillshade);
      rasterKey = key;
    }

    surface.clear("#87a06e");
    if (landRaster) paintRaster(surface, frame, landRaster);
    drawLandOverlay(surface, frame, design, result ? result.traces : undefined);
    return;
  }

  const bounds = computeBounds(parcel, design);
  const frame = makeFrame(bounds);
  currentFrame = frame;
  if (!surface) surface = new Canvas2DSurface(canvas, frame.width, frame.height, dpr);
  else surface.resize(frame.width, frame.height, dpr);
  drawHole(surface, frame, parcel, design, {
    ...(result ? { traces: result.traces } : {}),
    armedPreview: armed ? { shapeId: armed.shapeId, at: lastHoverWorld ?? { x: 0, y: 60 }, rot: armed.rot } : null,
  });
}

let renderScheduled = false;
function render(): void {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderNow();
  });
}

let lastHoverWorld: { x: number; y: number } | null = null;

// --- Tray mode: click-to-arm-then-click-to-place (unchanged) ---------

canvas.addEventListener("mousemove", (e) => {
  if (store.getState().mode !== "tray") return;
  if (!currentFrame || !store.getState().armed) return;
  const rect = canvas.getBoundingClientRect();
  const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  lastHoverWorld = snapToGrid(screenToWorld(currentFrame, px));
  render();
});

canvas.addEventListener("click", (e) => {
  if (store.getState().mode !== "tray") return;
  if (!currentFrame) return;
  const rect = canvas.getBoundingClientRect();
  const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const world = screenToWorld(currentFrame, px);

  if (store.getState().armed) {
    placeAt(store, snapToGrid(world));
  } else {
    removePieceAt(store, world);
  }
});

// --- Land mode: drag the green -----------------------------------------
//
// Pointer events (not mouse-only) so dragging works on touch as well as
// desktop — the doc's primary target is a phone, and the tray editor's
// mouse-only listeners above are one of the concrete gaps this mode fixes.

let dragging = false;

canvas.addEventListener("pointerdown", (e) => {
  if (store.getState().mode !== "land" || !currentFrame) return;
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  const rect = canvas.getBoundingClientRect();
  const world = screenToWorld(currentFrame, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  moveGreen(store, world);
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging || store.getState().mode !== "land" || !currentFrame) return;
  const rect = canvas.getBoundingClientRect();
  const world = screenToWorld(currentFrame, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  moveGreen(store, world);
});

function endDrag(e: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

store.subscribe(render);
renderNow();
