// Dev-only: generates a static HTML preview of the example content parcels.
// Not part of the package's public build — run directly with `pnpm run preview`.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deriveFairway, findGreen, grade, ROSTER, SIM_VERSION } from "@redan/sim";
import { toPortraitCorridorStation, toSimInputs, validateDesign, SCHEMA_VERSION } from "@redan/schema";
import {
  PARCEL_IDS,
  LAND_PARCEL_IDS,
  loadParcel,
  loadDesign,
  loadLandParcel,
  loadLandDesign,
  renderHoleSvg,
  renderElevationSvg,
  describeResult,
} from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = 20260814;

function describeRoute(route) {
  const aim =
    route.aimOffsetDeg === 0
      ? "straight"
      : `${Math.abs(route.aimOffsetDeg)}° ${route.aimOffsetDeg > 0 ? "right" : "left"}`;
  const curve = route.spin === 0 ? "no curve" : route.spin > 0 ? "fades" : "draws";
  const strategy = route.laysUp ? "lays up when it can't reach" : "always advances";
  const line = route.aimLine === "corridor" ? " · follows the bend" : "";
  return `${aim} aim, ${curve} · ${strategy} · ${Math.round(route.power * 100)}% power${line}`;
}

function starRow(stars) {
  const filled = "★".repeat(stars);
  const empty = "☆".repeat(3 - stars);
  return `<span class="stars" aria-label="${stars} of 3 stars"><span class="stars-filled">${filled}</span><span class="stars-empty">${empty}</span></span>`;
}

function renderCard(id, parcel, design) {
  const validation = validateDesign(parcel, design);
  const { parcel: simParcel, pieces } = toSimInputs(parcel, design);
  // Land parcels carry no hand-authored fairway (Parcel.landEnvelope
  // present, corridor deliberately all-rough) — route one live from the
  // design's green before grading, same as apps/web's land mode does.
  const green = findGreen(pieces);
  const routedParcel = simParcel.landEnvelope && green ? deriveFairway(simParcel, { x: green.x, y: green.y }) : simParcel;
  const result = grade(routedParcel, pieces, { speed: 0, dirDeg: 0 }, SEED);
  const verdict = describeResult(parcel, result);
  const elevationSvg = renderElevationSvg(parcel);
  // renderHoleSvg draws parcel.corridor as authored, which for a land
  // parcel is deliberately all-rough — swap in the derived (portrait) one
  // just for display, so the preview actually shows the routed fairway
  // rather than nothing. obHalfWidth is overridden back to the real land
  // half-width rather than kept at deriveFairway's 400yd sentinel — the
  // sim no longer uses the corridor's own obHalfWidth as the land boundary
  // (see fairway.ts's module doc), but the preview's OB ribbon still reads
  // one directly, so left at the sentinel it would blow the SVG's bounds
  // out to an absurd size.
  const displayParcel = simParcel.landEnvelope
    ? {
        ...parcel,
        corridor: routedParcel.corridor.map((s) => ({
          ...toPortraitCorridorStation(s),
          obHalfWidth: simParcel.landEnvelope.halfWidth,
        })),
      }
    : parcel;

  const rows = ROSTER.map((golfer) => {
    const g = result.golfers[golfer.id];
    return `<tr>
      <td><span class="swatch swatch-${golfer.id}"></span>${golfer.label}</td>
      <td class="num">${g.mean.toFixed(2)}</td>
      <td class="num">${g.sd.toFixed(2)}</td>
      <td class="route">${describeRoute(g.route)}</td>
    </tr>`;
  }).join("\n");

  const m = result.metrics;
  const sentences = verdict.sentences.map((s) => `<li>${s}</li>`).join("\n");

  return `<article class="card">
  <header class="card-head">
    <div>
      <p class="eyebrow">${id}</p>
      <h2>Par ${parcel.par}</h2>
    </div>
    ${starRow(verdict.stars)}
  </header>

  <div class="card-body">
    <div class="diagram">
      ${renderHoleSvg(displayParcel, design, result)}
      ${elevationSvg ?? ""}
    </div>

    <div class="panel">
      <table class="archetype-table">
        <caption>Golfer results (seed ${SEED})</caption>
        <thead>
          <tr><th scope="col">Golfer</th><th scope="col">Mean</th><th scope="col">SD</th><th scope="col">Route</th></tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <dl class="metrics">
        <div><dt>Field</dt><dd>${m.field.toFixed(2)}</dd></div>
        <div><dt>Spread</dt><dd>${m.spread.toFixed(2)}</dd></div>
        <div><dt>Contested</dt><dd>${m.contested.toFixed(2)}</dd></div>
        <div><dt>σ</dt><dd>${m.sd.toFixed(2)}</dd></div>
        <div><dt>Routes</dt><dd>${m.routes}</dd></div>
        <div><dt>Used / Cap</dt><dd>${m.used} / ${m.cap}</dd></div>
        <div><dt>Par OK</dt><dd class="${m.parOK ? "status-good" : "status-warn"}">${m.parOK ? "yes" : "no"}</dd></div>
      </dl>

      <ul class="coaching">
        ${sentences}
      </ul>

      ${validation.valid ? "" : `<p class="status-warn small">Tray validation: ${validation.errors.join("; ")}</p>`}
    </div>
  </div>
</article>`;
}

const cards = PARCEL_IDS.map((id) => renderCard(id, loadParcel(id), loadDesign(id))).join("\n\n");
const landCards = LAND_PARCEL_IDS.map((id) => renderCard(id, loadLandParcel(id), loadLandDesign(id))).join("\n\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Redan Parcel Preview</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
:root {
  color-scheme: light;
  --ground: #f0f2e8;
  --surface: #fbfbf5;
  --surface-2: #f3f5e9;
  --ink: #171a12;
  --ink-secondary: #4d5142;
  --ink-muted: #82866f;
  --border: rgba(23,26,18,0.12);
  --accent: #1f6b3a;
  --accent-ink: #f5f8f0;
  --terrain-fairway: #bcd9a0;
  --terrain-rough: #93ab77;
  --terrain-green: #dcefc0;
  --terrain-bunker: #e8d9a8;
  --terrain-water: #a9cfe0;
  --terrain-deep: #6b7d43;
  --terrain-mound: #c9843f;
  --terrain-hollow: #4f5fa8;
  --ob-line: #b5432c;
  --diagram-line: rgba(23,26,18,0.35);
  --diagram-tee: #171a12;
  --status-good-c: #0ca30c;
  --status-warn-c: #b5432c;
  --arc-basher: #2a78d6;
  --arc-plodder: #eb6834;
  --arc-wedge-artist: #1baf7a;
  --arc-houdini: #eda100;
  --arc-drawer: #9b59d0;
  --arc-fader: #d63384;
  --arc-iron-man: #8a5a2b;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --ground: #12140f;
    --surface: #1a1e15;
    --surface-2: #202417;
    --ink: #f1f2ea;
    --ink-secondary: #c7cab8;
    --ink-muted: #8b8f79;
    --border: rgba(241,242,234,0.14);
    --accent: #4fbd7c;
    --accent-ink: #0d130d;
    --terrain-fairway: #33502c;
    --terrain-rough: #202b17;
    --terrain-green: #4a7a3c;
    --terrain-bunker: #6b5a34;
    --terrain-water: #1f3f52;
    --terrain-deep: #2c3418;
    --terrain-mound: #d9954f;
    --terrain-hollow: #6a7ac2;
    --ob-line: #e2725a;
    --diagram-line: rgba(241,242,234,0.30);
    --diagram-tee: #f1f2ea;
    --status-good-c: #0ca30c;
    --status-warn-c: #e2725a;
    --arc-basher: #3987e5;
    --arc-plodder: #d95926;
    --arc-wedge-artist: #199e70;
    --arc-houdini: #c98500;
    --arc-drawer: #b478e0;
    --arc-fader: #ea5c9e;
    --arc-iron-man: #b17c42;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --ground: #12140f;
  --surface: #1a1e15;
  --surface-2: #202417;
  --ink: #f1f2ea;
  --ink-secondary: #c7cab8;
  --ink-muted: #8b8f79;
  --border: rgba(241,242,234,0.14);
  --accent: #4fbd7c;
  --accent-ink: #0d130d;
  --terrain-fairway: #33502c;
  --terrain-rough: #202b17;
  --terrain-green: #4a7a3c;
  --terrain-bunker: #6b5a34;
  --terrain-water: #1f3f52;
  --terrain-deep: #2c3418;
  --terrain-mound: #d9954f;
  --terrain-hollow: #6a7ac2;
  --ob-line: #e2725a;
  --diagram-line: rgba(241,242,234,0.30);
  --diagram-tee: #f1f2ea;
  --status-good-c: #0ca30c;
  --status-warn-c: #e2725a;
  --arc-basher: #3987e5;
  --arc-plodder: #d95926;
  --arc-wedge-artist: #199e70;
  --arc-houdini: #c98500;
  --arc-drawer: #b478e0;
  --arc-fader: #ea5c9e;
  --arc-iron-man: #b17c42;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.5;
}
.page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 2.25rem;
}
header.top { display: flex; flex-direction: column; gap: 0.5rem; }
.eyebrow-top {
  font-size: 0.72rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-muted);
  font-weight: 600;
}
h1 {
  font-family: Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif;
  font-size: 2rem;
  margin: 0;
  text-wrap: balance;
  color: var(--ink);
}
.lede { color: var(--ink-secondary); max-width: 62ch; margin: 0; }
.lede .warn { color: var(--status-warn-c); }

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 1.5rem;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.25rem 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}
.card-head h2 {
  font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
  font-size: 1.3rem;
  margin: 0.1rem 0 0;
}
.eyebrow {
  font-size: 0.7rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin: 0;
  font-weight: 600;
}
.stars { font-size: 1.2rem; letter-spacing: 0.05em; white-space: nowrap; }
.stars-filled { color: var(--accent); }
.stars-empty { color: var(--border); }

.card-body {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  align-items: flex-start;
}
.diagram {
  flex: 0 0 auto;
  max-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.hole-figure, .elevation-figure { margin: 0; }
.hole-figure svg {
  display: block;
  height: 440px;
  width: auto;
  max-width: 100%;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.elevation-figure svg { width: 100%; height: auto; }
figcaption {
  font-size: 0.72rem;
  color: var(--ink-muted);
  margin-top: 0.35rem;
}

.panel {
  flex: 1 1 320px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.archetype-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.archetype-table caption {
  text-align: left;
  font-size: 0.72rem;
  color: var(--ink-muted);
  margin-bottom: 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.archetype-table th, .archetype-table td {
  text-align: left;
  padding: 0.35rem 0.5rem 0.35rem 0;
  border-bottom: 1px solid var(--border);
}
.archetype-table th { color: var(--ink-muted); font-weight: 600; font-size: 0.76rem; }
.archetype-table td.num, .metrics dd { font-variant-numeric: tabular-nums; }
.route { color: var(--ink-secondary); font-size: 0.8rem; }

.swatch {
  display: inline-block;
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 2px;
  margin-right: 0.4rem;
  vertical-align: middle;
}
.swatch-basher { background: var(--arc-basher); }
.swatch-plodder { background: var(--arc-plodder); }
.swatch-wedge-artist { background: var(--arc-wedge-artist); }
.swatch-houdini { background: var(--arc-houdini); }
.swatch-drawer { background: var(--arc-drawer); }
.swatch-fader { background: var(--arc-fader); }
.swatch-iron-man { background: var(--arc-iron-man); }

.metrics {
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 0.4rem 1.25rem;
  margin: 0;
  background: var(--surface-2);
  border-radius: 6px;
  padding: 0.6rem 0.9rem;
}
.metrics > div { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.82rem; }
.metrics dt { color: var(--ink-muted); margin: 0; }
.metrics dd { margin: 0; font-weight: 600; }

.coaching {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.86rem;
  color: var(--ink-secondary);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.status-good { color: var(--status-good-c); font-weight: 600; }
.status-warn { color: var(--status-warn-c); font-weight: 600; }
.small { font-size: 0.78rem; }

footer.notes {
  border-top: 1px solid var(--border);
  padding-top: 1.25rem;
  font-size: 0.78rem;
  color: var(--ink-muted);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
footer.notes code {
  font-family: ui-monospace, "Cascadia Code", monospace;
  background: var(--surface-2);
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
}
</style>
</head>
<body>
<div class="page">
  <header class="top">
    <p class="eyebrow-top">Redan · M0 development preview</p>
    <h1>Every parcel, seven golfers, one seed</h1>
    <p class="lede">Every number below comes from <code>@redan/sim</code>'s <code>grade()</code>, run against the example parcels in <code>@redan/content</code>. <span class="warn">Not validated against real holes</span> — the real-hole harness is parked (see <code>validation/README.md</code>); this checks that the pipeline works and the trait roster produces real variety, via <code>packages/sim/scripts/roster-balance.mjs</code>, not that it's calibrated against real courses yet.</p>
  </header>

  <div class="cards">
    ${cards}
  </div>

  <header class="top">
    <p class="eyebrow-top">Land mode</p>
    <h1>Generated land, routed live</h1>
    <p class="lede">Seeded natural parcels (<code>scripts/generate-land.mjs</code>) with no hand-authored fairway — each graded here with <code>@redan/sim</code>'s <code>deriveFairway</code> routing a corridor from the tee to the design's starting green, the same step <code>apps/web</code>'s land mode runs on every drag.</p>
  </header>

  <div class="cards">
    ${landCards}
  </div>

  <footer class="notes">
    <p>simVersion <code>${SIM_VERSION}</code> · schemaVersion <code>${SCHEMA_VERSION}</code> · seed <code>${SEED}</code></p>
    <p>Regenerate with <code>pnpm --filter @redan/content run preview</code> after any change to a fixture, coefficient, or example parcel.</p>
  </footer>
</div>
</body>
</html>
`;

const outDir = join(__dirname, "..", "out");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "preview.html");
writeFileSync(outFile, html, "utf-8");
console.log(`Wrote ${outFile}`);
