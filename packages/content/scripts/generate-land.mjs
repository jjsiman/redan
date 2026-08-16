// Seeded generator for "land mode" parcels (apps/web's green-only editor):
// a fixed rectangle of natural terrain — hills, water, trees — with no
// hand-authored fairway. The fairway is derived live in the app from
// wherever the player drags the green, via @redan/sim's deriveFairway
// (packages/sim/src/fairway.ts). This script only needs to produce
// PLAYABLE land, not a fairway: rejection sampling below runs deriveFairway
// against a few candidate green spots and discards a seed if none work.
//
// Deterministic: same --seed always produces byte-identical JSON. Run with
// `node scripts/generate-land.mjs --seed 1 --count 6` after `pnpm build`
// (imports from ../dist/index.js, same convention as preview.mjs and
// roster-balance.mjs).
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// @redan/sim is a workspace dependency of @redan/content already
// (package.json), so this resolves through the normal pnpm symlink rather
// than reaching into a sibling package's dist by relative path.
import { createRng, deriveFairway } from "@redan/sim";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { seed: 1, count: 6 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--seed") args.seed = Number(argv[++i]);
    if (argv[i] === "--count") args.count = Number(argv[++i]);
  }
  return args;
}

// Length/width bands per doc §11 open question 3 ("short holes are where
// green placement matters most") — varied so land mode gets tested across
// hole types, not just one canonical portrait size.
const PAR_BANDS = {
  3: { lengthMin: 150, lengthMax: 220, halfWidthMin: 70, halfWidthMax: 100 },
  4: { lengthMin: 260, lengthMax: 420, halfWidthMin: 70, halfWidthMax: 110 },
  5: { lengthMin: 460, lengthMax: 560, halfWidthMin: 80, halfWidthMax: 120 },
};

const HAZARD_SHAPES = [
  { shapeId: "water-pond", footprint: { kind: "circle", radius: 15 } },
  { shapeId: "water-creek", footprint: { kind: "rect", halfLength: 60, halfWidth: 4 } },
  { shapeId: "trees", footprint: { kind: "rect", halfLength: 30, halfWidth: 15 } },
  { shapeId: "native-area", footprint: { kind: "rect", halfLength: 25, halfWidth: 25 } },
];

function randRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

function randInt(rng, lo, hi) {
  return Math.floor(randRange(rng, lo, hi + 1));
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Builds one candidate parcel + starting design in the portrait frame
 * directly. `length`/`halfWidth` are frame-invariant (see
 * PortraitLandEnvelope's doc), so no rotation is needed to place them; a
 * hazard's (x, y) is authored directly in portrait (x = lateral, y =
 * distance from tee), which is exactly the land rectangle's own axes.
 */
function buildCandidate(rng, id, par) {
  const band = PAR_BANDS[par];
  const length = Math.round(randRange(rng, band.lengthMin, band.lengthMax));
  const halfWidth = Math.round(randRange(rng, band.halfWidthMin, band.halfWidthMax));

  const hazardCount = randInt(rng, 1, 3);
  const fixedRegions = [];
  for (let i = 0; i < hazardCount; i++) {
    const shape = pick(rng, HAZARD_SHAPES);
    // Keep hazards clear of the tee box and the very back of the land, so
    // there's always room for a tee shot and a green somewhere sane.
    const y = Math.round(randRange(rng, length * 0.2, length * 0.85));
    const x = Math.round(randRange(rng, -halfWidth * 0.75, halfWidth * 0.75));
    const rot = pick(rng, [0, 90]);
    fixedRegions.push({ shapeId: shape.shapeId, x, y, rot, scale: 1 });
  }

  // A gentle ridge or fall along the hole — elevation is a first-pass,
  // uncalibrated feature (see packages/sim/README.md's calibration status);
  // varying it here is about testing whether it reads visually, not about
  // a tuned yards-per-foot claim.
  const ridgeZ = Math.round(randRange(rng, -18, 18));
  const elevationProfile = [
    { y: 0, z: 0 },
    { y: Math.round(length * 0.5), z: ridgeZ },
    { y: length, z: Math.round(ridgeZ * 0.3) },
  ];
  const elevationFeatures = [];
  const featureCount = randInt(rng, 1, 3);
  for (let i = 0; i < featureCount; i++) {
    elevationFeatures.push({
      x: Math.round(randRange(rng, -halfWidth * 0.6, halfWidth * 0.6)),
      y: Math.round(randRange(rng, length * 0.15, length * 0.9)),
      radius: Math.round(randRange(rng, 15, 30)),
      height: Math.round(randRange(rng, -10, 14)),
    });
  }

  const parcel = {
    id,
    schemaVersion: "0.3.0",
    par,
    // All-rough fallback (see fairway.ts's module doc) — deriveFairway
    // ignores this and builds its own corridor from landEnvelope below; this
    // is only what an ungraded/un-derived land parcel would show.
    corridor: [
      { y: 0, cx: 0, halfWidth: 0, obHalfWidth: halfWidth },
      { y: length, cx: 0, halfWidth: 0, obHalfWidth: halfWidth },
    ],
    landEnvelope: { length, halfWidth },
    fixedRegions,
    pieceCap: 0,
    tray: [{ shapeId: "green-large", count: 1 }],
    elevationProfile,
    elevationFeatures,
  };

  // Doc §2: never a blank canvas — start the green somewhere plausible but
  // not optimal (short and roughly centered), so the player's first move is
  // "improve this," not "invent a hole from nothing."
  const design = {
    parcelId: id,
    schemaVersion: "0.3.0",
    pieces: [{ shapeId: "green-large", x: 0, y: Math.round(length * 0.6), rot: 0, scale: 1 }],
  };

  return { parcel, design };
}

/**
 * Converts a portrait land parcel into @redan/sim's frame for the
 * rejection-sampling check below, mirroring @redan/schema's toSim.ts by
 * hand (this script only depends on @redan/sim's dist, not @redan/schema's,
 * to keep the build-order dependency simple — see package.json).
 */
function toSimForCheck(parcel) {
  const toSim = (p) => ({ x: p.y, y: -p.x });
  return {
    id: parcel.id,
    par: parcel.par,
    corridor: parcel.corridor.map((s) => {
      const p = toSim({ x: s.cx, y: s.y });
      return { x: p.x, cy: p.y, halfWidth: s.halfWidth, obHalfWidth: s.obHalfWidth };
    }),
    landEnvelope: parcel.landEnvelope,
    fixedRegions: parcel.fixedRegions.map((f) => {
      const shape = HAZARD_SHAPES.find((h) => h.shapeId === f.shapeId);
      const p = toSim(f);
      return {
        shapeId: f.shapeId,
        lieType: f.shapeId.startsWith("water") ? "water" : f.shapeId === "trees" ? "deep" : "rough",
        x: p.x,
        y: p.y,
        rot: f.rot - 90,
        scale: f.scale,
        footprint: shape.footprint,
      };
    }),
    pieceCap: parcel.pieceCap,
  };
}

/** Rejects a seed if no candidate green position routes cleanly — the generator's only playability gate; see the module doc. */
function isPlayable(parcel) {
  const simParcel = toSimForCheck(parcel);
  const land = simParcel.landEnvelope;
  const candidates = [
    { x: land.length * 0.92, y: 0 },
    { x: land.length * 0.85, y: land.halfWidth * 0.5 },
    { x: land.length * 0.85, y: -land.halfWidth * 0.5 },
  ];
  let sawUsableFairway = false;
  for (const green of candidates) {
    let derived;
    try {
      derived = deriveFairway(simParcel, green);
    } catch {
      continue;
    }
    if (derived.corridor.some((s) => s.halfWidth > 9)) sawUsableFairway = true;
  }
  return sawUsableFairway;
}

function generate(seed, count) {
  const rng = createRng(seed);
  const parcels = [];
  const pars = [3, 4, 5];
  let attempt = 0;
  while (parcels.length < count && attempt < count * 40) {
    attempt++;
    const par = pars[parcels.length % pars.length];
    const id = `land-${String(parcels.length + 1).padStart(2, "0")}`;
    const candidate = buildCandidate(rng, id, par);
    if (isPlayable(candidate.parcel)) {
      parcels.push(candidate);
    }
  }
  if (parcels.length < count) {
    throw new Error(`generate-land: only found ${parcels.length}/${count} playable parcels for seed ${seed} — widen the search or loosen isPlayable.`);
  }
  return parcels;
}

const { seed, count } = parseArgs(process.argv.slice(2));
const outDir = join(__dirname, "..", "land");
mkdirSync(outDir, { recursive: true });

for (const { parcel, design } of generate(seed, count)) {
  const parcelFile = join(outDir, `${parcel.id}.parcel.json`);
  const designFile = join(outDir, `${parcel.id}.design.json`);
  writeFileSync(parcelFile, JSON.stringify(parcel, null, 2) + "\n", "utf-8");
  writeFileSync(designFile, JSON.stringify(design, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${parcel.id} (par ${parcel.par}, ${parcel.landEnvelope.length}x${parcel.landEnvelope.halfWidth * 2}yd)`);
}
