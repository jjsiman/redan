// Balance check for the trait-composed field roster (traits.ts). Not a pass/
// fail gate like the old (now-parked) 16-hole validation harness — a report.
// Run after any change to TRAIT_TABLE, ROSTER, or a shot-model coefficient:
//
//   node scripts/roster-balance.mjs
//
// Runs every golfer in the roster over a small, varied set of hand-built
// parcels (straight, narrow, a dogleg, a short par 3, a reachable par 5) at
// several seeds, and reports each golfer's win share — how often they post
// the single best mean score of the field, across (parcel x seed). Target:
// no golfer above ~35% (roughly 2.4x a flat 1/7 = 14.3% baseline). If one
// golfer dominates, adjust TRAIT_TABLE's numbers and re-run; this replaces
// the parked real-hole validation gate as the day-to-day tuning loop.
import { grade, ROSTER, straightCorridor } from "../dist/index.js";

const SEEDS = [101, 202, 303, 404, 505, 606, 707, 808, 909, 1010];

function greenPiece(x, y, radius) {
  return { shapeId: "green-round", lieType: "green", x, y, rot: 0, scale: 1, footprint: { kind: "circle", radius } };
}

const NO_WIND = { speed: 0, dirDeg: 0 };

const parcels = [
  {
    label: "straight-440",
    parcel: { id: "bal-straight", par: 4, corridor: straightCorridor(440, 25, 45), pieceCap: 3 },
    pieces: [greenPiece(400, 0, 12)],
  },
  {
    label: "narrow-400",
    parcel: { id: "bal-narrow", par: 4, corridor: straightCorridor(400, 11, 16), pieceCap: 3 },
    pieces: [greenPiece(360, 0, 10)],
  },
  {
    label: "short-par3-180",
    parcel: { id: "bal-par3", par: 3, corridor: straightCorridor(180, 20, 25), pieceCap: 2 },
    pieces: [
      greenPiece(150, 0, 10),
      { shapeId: "bunker-pot", lieType: "bunker", x: 135, y: 0, rot: 0, scale: 1, footprint: { kind: "circle", radius: 6 } },
    ],
  },
  {
    label: "reachable-par5-540",
    parcel: {
      id: "bal-par5",
      par: 5,
      corridor: straightCorridor(540, 26, 48),
      pieceCap: 3,
      elevationProfile: [{ x: 0, z: 0 }, { x: 250, z: 15 }, { x: 500, z: 20 }],
    },
    pieces: [greenPiece(500, 0, 18)],
  },
  {
    label: "dogleg-420",
    parcel: {
      id: "bal-dogleg",
      par: 4,
      corridor: [
        { x: 0, cy: 0, halfWidth: 24, obHalfWidth: 50 },
        { x: 100, cy: 0, halfWidth: 24, obHalfWidth: 50 },
        { x: 180, cy: 60, halfWidth: 20, obHalfWidth: 48 },
        { x: 280, cy: 60, halfWidth: 20, obHalfWidth: 48 },
        { x: 340, cy: 0, halfWidth: 22, obHalfWidth: 48 },
        { x: 420, cy: 0, halfWidth: 22, obHalfWidth: 48 },
      ],
      fixedRegions: [
        { shapeId: "trees", lieType: "deep", x: 230, y: 0, rot: 0, scale: 1, footprint: { kind: "rect", halfLength: 55, halfWidth: 15 } },
      ],
      pieceCap: 3,
    },
    pieces: [greenPiece(400, 0, 11)],
  },
  {
    label: "water-carry-380",
    parcel: { id: "bal-water", par: 4, corridor: straightCorridor(380, 22, 42), pieceCap: 3 },
    pieces: [
      greenPiece(360, 0, 11),
      { shapeId: "water-pond", lieType: "water", x: 0, y: 0, rot: 0, scale: 1, footprint: { kind: "circle", radius: 1 } }, // placeholder, replaced below
    ],
  },
];
// Fix the water fixture: a pond spanning the corridor at ~190y, forcing a carry decision.
parcels[5].pieces[1] = {
  shapeId: "water-pond",
  lieType: "water",
  x: 190,
  y: 0,
  rot: 0,
  scale: 1,
  footprint: { kind: "rect", halfLength: 15, halfWidth: 22 },
};

const wins = Object.fromEntries(ROSTER.map((g) => [g.id, 0]));
let total = 0;
const perHole = [];

for (const { label, parcel, pieces } of parcels) {
  for (const seed of SEEDS) {
    const result = grade(parcel, pieces, NO_WIND, seed);
    let bestId = null;
    let bestMean = Infinity;
    for (const g of ROSTER) {
      const m = result.golfers[g.id].mean;
      if (m < bestMean) {
        bestMean = m;
        bestId = g.id;
      }
    }
    wins[bestId] += 1;
    total += 1;
    perHole.push({ label, seed, winner: bestId, field: result.metrics.field, contested: result.metrics.contested });
  }
}

console.log(`Roster balance — ${parcels.length} parcels x ${SEEDS.length} seeds = ${total} trials\n`);

const rows = ROSTER.map((g) => {
  const w = wins[g.id];
  const share = (100 * w) / total;
  return { id: g.id, label: g.label, wins: w, share };
}).sort((a, b) => b.share - a.share);

const idW = Math.max(...rows.map((r) => r.id.length), 8);
console.log(`${"golfer".padEnd(idW)}  wins  share`);
for (const r of rows) {
  const flag = r.share > 35 ? "  <-- over 35%" : "";
  console.log(`${r.id.padEnd(idW)}  ${String(r.wins).padStart(4)}  ${r.share.toFixed(1).padStart(5)}%${flag}`);
}

const worstHole = parcels
  .map((p) => p.label)
  .map((label) => {
    const winnersOnHole = new Set(perHole.filter((r) => r.label === label).map((r) => r.winner));
    return { label, distinctWinners: winnersOnHole.size };
  });
console.log("\nPer-hole winner variety (across seeds):");
for (const h of worstHole) {
  console.log(`  ${h.label}: ${h.distinctWinners} distinct winner(s) across ${SEEDS.length} seeds`);
}

const overThreshold = rows.filter((r) => r.share > 35);
if (overThreshold.length > 0) {
  console.log(`\nWARNING: ${overThreshold.map((r) => r.id).join(", ")} exceed(s) the ~35% win-share target.`);
  process.exitCode = 1;
} else {
  console.log("\nAll golfers within the ~35% win-share target.");
}
