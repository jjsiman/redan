// M0's validation harness (doc 9): runs every real hole in validation/
// through @redan/sim across several seeds, checks archetype bias against a
// pre-registered expectation, and reports agreement against the gate
// (15+ holes, 12 agree, every disagreement explained). Not part of the
// package's public build — run with `pnpm run validate`.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { grade, ARCHETYPE_NAMES, SIM_VERSION } from "@redan/sim";
import { toSimInputs, SCHEMA_VERSION } from "@redan/schema";
import { loadValidationHoles, runValidation, everyDisagreementExplained, renderHoleSvg } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Five arbitrary, fixed seeds. Not the same as any package's single-seed
// convention (preview's 20260814, sim's test seed 42) — the point here is a
// spread, not one canonical run, so a hole's bias can be checked for seed
// stability rather than trusted off one draw.
const SEEDS = [1001, 1002, 1003, 1004, 1005];
const DISPLAY_SEED = SEEDS[0];

function describeRoute(route) {
  const aim =
    route.aimOffsetDeg === 0
      ? "straight"
      : `${Math.abs(route.aimOffsetDeg)}° ${route.aimOffsetDeg > 0 ? "right" : "left"}`;
  const curve = route.spin === 0 ? "no curve" : route.spin > 0 ? "fades" : "draws";
  const strategy = route.laysUp ? "lays up when it can't reach" : "always advances";
  return `${aim} aim, ${curve} · ${strategy} · ${Math.round(route.power * 100)}% power`;
}

function fmt(n, digits = 2) {
  return n.toFixed(digits);
}

const holes = loadValidationHoles();
const report = runValidation(holes, SEEDS);
const holesById = new Map(holes.map((h) => [h.id, h]));

// --- terminal report -------------------------------------------------------

const columns = [
  ["Hole", 26],
  ["Par", 3],
  ["Expected", 10],
  ["Observed", 18],
  ["Margin", 7],
  ["Seeds", 6],
  ["Field vs pub", 14],
  ["Agree", 6],
];

function row(cells) {
  return columns.map(([, w], i) => String(cells[i]).padEnd(w)).join(" ");
}

console.log(row(columns.map(([label]) => label)));
console.log(row(columns.map(([, w]) => "-".repeat(w))));

for (const r of report.holes) {
  const expected = r.expectedTie ? `${r.expectedFavors.join("/")} tie` : r.expectedFavors.join("/");
  const observed = r.expectedTie ? `${r.observedBias.join("/")} (Δ${fmt(r.margin)})` : `${r.observedBias.join("/")} (+${fmt(r.margin)})`;
  const fieldVsPub =
    r.scoringAverage === undefined ? "—" : `${fmt(r.fieldAverage)} / ${fmt(r.scoringAverage)}${r.plausible ? "" : " !"}`;
  console.log(
    row([
      `${r.course} ${r.hole}`,
      r.par,
      expected,
      observed,
      fmt(r.margin),
      r.seedStable ? "stable" : "NOISY",
      fieldVsPub,
      r.agree ? "yes" : "no",
    ]),
  );
  if (!r.agree) {
    console.log(`  -> ${r.disagreement ?? "(MISSING EXPLANATION)"}`);
  }
}

console.log("");
console.log(
  `${report.agreementCount} of ${report.holeCount} agree (gate: 15+ holes, 12 agree) — gate ${report.gateMet ? "MET" : "NOT MET"}`,
);
console.log(`simVersion ${report.simVersion} · schemaVersion ${report.schemaVersion} · seeds [${report.seeds.join(", ")}]`);

const explained = everyDisagreementExplained(report);
if (!explained) {
  console.error("\nOne or more disagreeing holes has no written explanation. Fill in `disagreement` in its .hole.json.");
}

// --- HTML report (diagrams at DISPLAY_SEED) --------------------------------

function renderCard(r) {
  const hole = holesById.get(r.id);
  const { parcel: simParcel, pieces } = toSimInputs(hole.parcel, hole.design);
  const result = grade(simParcel, pieces, hole.wind, DISPLAY_SEED);

  const rows = ARCHETYPE_NAMES.map((name) => {
    const a = result.archetypes[name];
    return `<tr>
      <td><span class="swatch swatch-${name.toLowerCase()}"></span>${name}</td>
      <td class="num">${fmt(a.mean)}</td>
      <td class="num">${fmt(a.sd)}</td>
      <td class="route">${describeRoute(a.route)}</td>
    </tr>`;
  }).join("\n");

  const badge = r.agree ? `<span class="badge badge-good">agree</span>` : `<span class="badge badge-warn">disagree</span>`;
  const stability = r.seedStable ? "" : `<p class="note warn">Seed-unstable: the 5-seed winner split, not a single archetype.</p>`;
  const plausibility =
    r.scoringAverage === undefined
      ? ""
      : r.plausible
        ? `<p class="note">Sim field ${fmt(r.fieldAverage)} vs. published ${fmt(r.scoringAverage)} — plausible.</p>`
        : `<p class="note warn">Sim field ${fmt(r.fieldAverage)} vs. published ${fmt(r.scoringAverage)} — geometry suspect (|Δ| > 0.75).</p>`;
  const disagreementNote = r.disagreement ? `<p class="note warn"><strong>Disagreement:</strong> ${r.disagreement}</p>` : "";
  const approximations = hole.approximations.length
    ? `<p class="note"><strong>Approximations:</strong> ${hole.approximations.join("; ")}</p>`
    : "";
  const sources = `<p class="note small">${hole.expected.rationale} — ${hole.expected.sources.join("; ")}</p>`;

  return `<article class="card">
  <header class="card-head">
    <div>
      <p class="eyebrow">${hole.course} — Hole ${hole.hole}</p>
      <h2>Par ${hole.par} · ${hole.yardage} yds</h2>
    </div>
    ${badge}
  </header>

  <div class="card-body">
    <div class="diagram">
      ${renderHoleSvg(hole.parcel, hole.design, result)}
    </div>

    <div class="panel">
      <table class="archetype-table">
        <caption>Archetype results (seed ${DISPLAY_SEED} of ${SEEDS.length})</caption>
        <thead>
          <tr><th scope="col">Archetype</th><th scope="col">Mean</th><th scope="col">SD</th><th scope="col">Route</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <dl class="metrics">
        <div><dt>Expected</dt><dd>${r.expectedFavors.join("/")}${r.expectedTie ? " (tie)" : ""}</dd></div>
        <div><dt>Observed</dt><dd>${r.observedBias.join("/")}</dd></div>
        <div><dt>Margin</dt><dd>${fmt(r.margin)}</dd></div>
      </dl>

      ${stability}
      ${plausibility}
      ${disagreementNote}
      ${approximations}
      ${sources}
    </div>
  </div>
</article>`;
}

const cards = report.holes.map(renderCard).join("\n\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>M0 Validation Set</title>
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
  --good: #0ca30c;
  --warn: #b5432c;
  --arc-bomber: #2a78d6;
  --arc-straight: #eb6834;
  --arc-scrambler: #1baf7a;
  --arc-touch: #eda100;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --ground: #12140f; --surface: #1a1e15; --surface-2: #202417;
    --ink: #f1f2ea; --ink-secondary: #c7cab8; --ink-muted: #8b8f79;
    --border: rgba(241,242,234,0.14); --accent: #4fbd7c;
    --terrain-fairway: #33502c; --terrain-rough: #202b17; --terrain-green: #4a7a3c;
    --terrain-bunker: #6b5a34; --terrain-water: #1f3f52; --terrain-deep: #2c3418;
    --terrain-mound: #d9954f; --terrain-hollow: #6a7ac2;
    --ob-line: #e2725a; --diagram-line: rgba(241,242,234,0.30); --diagram-tee: #f1f2ea;
    --good: #3fc23f; --warn: #e2725a;
    --arc-bomber: #3987e5; --arc-straight: #d95926; --arc-scrambler: #199e70; --arc-touch: #c98500;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --ground: #12140f; --surface: #1a1e15; --surface-2: #202417;
  --ink: #f1f2ea; --ink-secondary: #c7cab8; --ink-muted: #8b8f79;
  --border: rgba(241,242,234,0.14); --accent: #4fbd7c;
  --terrain-fairway: #33502c; --terrain-rough: #202b17; --terrain-green: #4a7a3c;
  --terrain-bunker: #6b5a34; --terrain-water: #1f3f52; --terrain-deep: #2c3418;
  --terrain-mound: #d9954f; --terrain-hollow: #6a7ac2;
  --ob-line: #e2725a; --diagram-line: rgba(241,242,234,0.30); --diagram-tee: #f1f2ea;
  --good: #3fc23f; --warn: #e2725a;
  --arc-bomber: #3987e5; --arc-straight: #d95926; --arc-scrambler: #199e70; --arc-touch: #c98500;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--ground); color: var(--ink); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.5; }
.page { max-width: 1200px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; display: flex; flex-direction: column; gap: 2rem; }
header.top { display: flex; flex-direction: column; gap: 0.5rem; }
.eyebrow-top { font-size: 0.72rem; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-muted); font-weight: 600; }
h1 { font-family: Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif; font-size: 2rem; margin: 0; }
.lede { color: var(--ink-secondary); max-width: 70ch; margin: 0; }
.summary { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.25rem; font-size: 0.92rem; }
.summary .gate-met { color: var(--good); font-weight: 700; }
.summary .gate-not-met { color: var(--warn); font-weight: 700; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 1.5rem; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.card-head h2 { font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif; font-size: 1.2rem; margin: 0.1rem 0 0; }
.eyebrow { font-size: 0.7rem; letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-muted); margin: 0; font-weight: 600; }
.badge { font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 999px; white-space: nowrap; height: fit-content; }
.badge-good { background: color-mix(in srgb, var(--good) 18%, transparent); color: var(--good); }
.badge-warn { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
.card-body { display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: flex-start; }
.diagram { flex: 0 0 auto; max-width: 220px; }
.hole-figure { margin: 0; }
.hole-figure svg { display: block; height: 420px; width: auto; max-width: 100%; border-radius: 6px; border: 1px solid var(--border); }
figcaption { font-size: 0.7rem; color: var(--ink-muted); margin-top: 0.35rem; }
.panel { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.archetype-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.archetype-table caption { text-align: left; font-size: 0.7rem; color: var(--ink-muted); margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.05em; }
.archetype-table th, .archetype-table td { text-align: left; padding: 0.3rem 0.5rem 0.3rem 0; border-bottom: 1px solid var(--border); }
.archetype-table th { color: var(--ink-muted); font-weight: 600; font-size: 0.74rem; }
.archetype-table td.num { font-variant-numeric: tabular-nums; }
.route { color: var(--ink-secondary); font-size: 0.78rem; }
.swatch { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 2px; margin-right: 0.4rem; vertical-align: middle; }
.swatch-bomber { background: var(--arc-bomber); }
.swatch-straight { background: var(--arc-straight); }
.swatch-scrambler { background: var(--arc-scrambler); }
.swatch-touch { background: var(--arc-touch); }
.metrics { display: grid; grid-template-columns: repeat(3, auto); gap: 0.3rem 1rem; margin: 0; background: var(--surface-2); border-radius: 6px; padding: 0.5rem 0.8rem; }
.metrics > div { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.8rem; }
.metrics dt { color: var(--ink-muted); margin: 0; }
.metrics dd { margin: 0; font-weight: 600; }
.note { margin: 0; font-size: 0.82rem; color: var(--ink-secondary); }
.note.warn { color: var(--warn); }
.note.small { font-size: 0.74rem; color: var(--ink-muted); }
footer.notes { border-top: 1px solid var(--border); padding-top: 1.25rem; font-size: 0.78rem; color: var(--ink-muted); }
footer.notes code { font-family: ui-monospace, "Cascadia Code", monospace; background: var(--surface-2); padding: 0.05rem 0.35rem; border-radius: 4px; }
</style>
</head>
<body>
<div class="page">
  <header class="top">
    <p class="eyebrow-top">Redan · M0 validation set</p>
    <h1>${report.agreementCount} of ${report.holeCount} real holes agree with consensus</h1>
    <p class="lede">Each hole is hand-encoded from published geometry, run across ${SEEDS.length} seeds. Diagrams show the ${DISPLAY_SEED} seed's actual routes. Gate: 15+ holes, 12 agree.</p>
  </header>

  <div class="summary">
    Gate <span class="${report.gateMet ? "gate-met" : "gate-not-met"}">${report.gateMet ? "MET" : "NOT MET"}</span>
    — simVersion <code>${SIM_VERSION}</code> · schemaVersion <code>${SCHEMA_VERSION}</code> · seeds [${SEEDS.join(", ")}]
  </div>

  <div class="cards">
    ${cards}
  </div>

  <footer class="notes">
    <p>Regenerate with <code>pnpm --filter @redan/content run validate</code> after any change to a hole file or a sim coefficient.</p>
  </footer>
</div>
</body>
</html>
`;

const outDir = join(__dirname, "..", "out");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "validation.html");
writeFileSync(outFile, html, "utf-8");
console.log(`\nWrote ${outFile}`);

if (!explained || !report.gateMet) {
  process.exitCode = 1;
}
