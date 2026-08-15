import type { Design, Parcel } from "@redan/schema";
import { Store, type EditorState } from "./editor/state.js";
import { placeAt, removePieceAt, runGrade, selectParcel } from "./editor/intents.js";
import { computeBounds, drawHole, makeFrame, screenToWorld, snapToGrid, type Frame } from "./render/parcel.js";
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

// JSON import assertions land as `unknown`-ish structural types under
// resolveJsonModule; casting to the schema types here is the one place this
// app trusts packages/content's example JSON matches @redan/schema's shape
// (the same trust `packages/content/test/roundtrip.test.ts` verifies).
const PARCELS: Record<string, { parcel: Parcel; design: Design }> = {
  "01-one-bunker": { parcel: bunkerParcel as Parcel, design: bunkerDesign as Design },
  "02-dogleg-left": { parcel: doglegParcel as Parcel, design: doglegDesign as Design },
  "03-split-par5": { parcel: splitParcel as Parcel, design: splitDesign as Design },
  "04-water-and-hill": { parcel: waterParcel as Parcel, design: waterDesign as Design },
  "05-drivable-four": { parcel: drivableParcel as Parcel, design: drivableDesign as Design },
};

const initialId = "02-dogleg-left";
const initial: EditorState = {
  parcelId: initialId,
  parcel: PARCELS[initialId]!.parcel,
  design: { ...PARCELS[initialId]!.design, pieces: PARCELS[initialId]!.design.pieces.map((p) => ({ ...p })) },
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
const select = document.createElement("select");
select.className = "parcel-select";
for (const id of Object.keys(PARCELS)) {
  const opt = document.createElement("option");
  opt.value = id;
  opt.textContent = id;
  select.appendChild(opt);
}
select.value = initialId;
select.addEventListener("change", () => selectParcel(store, select.value, PARCELS));
header.append(title, select);

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
testBtn.addEventListener("click", () => runGrade(store));
const verdictPanel = document.createElement("div");
verdictPanel.className = "verdict-panel";
sidebar.append(testBtn, verdictPanel);
stage.appendChild(sidebar);

const trayEl = document.createElement("div");
trayEl.className = "tray";

app.append(header, stage, trayEl);

mountVerdict(verdictPanel, store);
mountTray(trayEl, store);

let currentFrame: Frame | null = null;

function render(): void {
  const { parcel, design, armed, result } = store.getState();
  const bounds = computeBounds(parcel, design);
  const frame = makeFrame(bounds);
  currentFrame = frame;
  const dpr = window.devicePixelRatio || 1;
  const surface = new Canvas2DSurface(canvas, frame.width, frame.height, dpr);
  drawHole(surface, frame, parcel, design, {
    ...(result ? { traces: result.traces } : {}),
    armedPreview: armed ? { shapeId: armed.shapeId, at: lastHoverWorld ?? { x: 0, y: 60 }, rot: armed.rot } : null,
  });
}

let lastHoverWorld: { x: number; y: number } | null = null;

canvas.addEventListener("mousemove", (e) => {
  if (!currentFrame || !store.getState().armed) return;
  const rect = canvas.getBoundingClientRect();
  const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  lastHoverWorld = snapToGrid(screenToWorld(currentFrame, px));
  render();
});

canvas.addEventListener("click", (e) => {
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

store.subscribe(render);
render();
