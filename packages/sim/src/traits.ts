import type { Golfer, GolferId, GolferStats, TraitEffects } from "./types.js";

/**
 * Replaces the old fixed four-archetype table (BOMBER/STRAIGHT/SCRAMBLER/
 * TOUCH — see git history for archetypes.ts). Those four failed the real-
 * hole validation set 16-for-16 in favor of STRAIGHT: its base lateral-
 * dispersion coefficient (`0.105 - accuracy·0.062` at accuracy 0.95) was
 * ~1.74x smaller than every other archetype's, a structurally dominant free
 * stat that no hole geometry could overturn (packages/content/validation's
 * README has the full numbers; that harness is now parked, not deleted).
 *
 * The fix isn't a coefficient nudge — it's moving differentiation off a
 * single free "accuracy" stat and onto TRAITS, each of which pays its own
 * way. Every golfer below shares one flat `BASE_STATS` sheet; all
 * differentiation comes from exactly two traits.
 *
 * The one rule that makes this work: a trait's benefit and its cost must
 * land on DIFFERENT ShotContexts (drive/long/short/recovery — see
 * types.ts). That's what moves "who wins this hole" off the stat sheet and
 * onto the hole's actual geometry — a hole with a tight tee shot and a wide
 * open approach rewards a different trait than one shaped the other way, a
 * distinction a single scalar "accuracy" stat could never express. When
 * pairing two traits onto one golfer, avoid combinations whose costs and
 * benefits are exact mirror images of each other (e.g. a trait that costs
 * short precision paired with one that costs long precision but fixes
 * short) — that's a free lunch, not a build.
 *
 * Doc 4.3's shot-model formulas are untouched; every effect below is a
 * multiplier layer applied in shotModel.ts on top of them. Balance here is
 * measured, not hand-asserted — see scripts/roster-balance.mjs, and don't
 * trust these numbers until that script says no golfer's win share is
 * badly out of line across the parcel set.
 */

/** Play-mode (M4) player-level scalar on top of the base stat sheet, fixed at 1.0 for the field. */
export const FIELD_SKILL = 1.0;

/**
 * The flat stat sheet every field golfer shares — a rough average of the
 * old four archetypes' stats, so absolute carry/dispersion numbers stay in
 * a similar ballpark. Deliberately NOT varied per golfer; see the module
 * doc above for why.
 */
export const BASE_STATS: GolferStats = { power: 0.6, accuracy: 0.55, recovery: 0.5, touch: 0.55 };

/**
 * Ten traits, each a multiplier layer (see shotModel.ts). Every trait's
 * `Mul` fields under 1.0 (a benefit) sit on a different ShotContext than any
 * of its fields over 1.0 (a cost) — the design rule from the module doc
 * above, enforced here by inspection since there's no type-level way to
 * check it.
 */
export const TRAIT_TABLE: Record<string, TraitEffects> = {
  /** Swings hard off the tee: more carry, wilder off the fairway lie's line. */
  long: { carryMul: { drive: 1.12 }, lateralMul: { drive: 1.3 } },
  /** A tight, repeatable swing on full shots — traded for carry everywhere. */
  metronome: {
    lateralMul: { drive: 0.8, long: 0.8 },
    carryMul: { drive: 0.85, long: 0.85, short: 0.85, recovery: 0.85 },
  },
  /** Flushes long irons; that same flat swing gets steery from wedge distance. */
  flusher: { lateralMul: { long: 0.78, short: 1.25 } },
  /** Precise from wedge range; that touch doesn't carry back to full shots. */
  wedge: { lateralMul: { short: 0.65, long: 1.15 } },
  /** Gets it up and down from trouble; the full swing that got there is shaky. */
  scrapper: { recoveryBonus: 0.45, lateralMul: { drive: 1.12 } },
  /** A great putting stroke; the approach shots that set up those putts are a touch loose. */
  putter: { puttBonus: 0.35, lateralMul: { short: 1.1 } },
  /** A stock draw, free — fighting it the other way costs control. */
  drawer: { shapeBias: -1, shapeAgainstPenalty: 1.3 },
  /** A stock fade, free — fighting it the other way costs control. */
  fader: { shapeBias: 1, shapeAgainstPenalty: 1.3 },
  /** Plays for the lower mean even at the cost of more variance; a bit wild off the tee doing it. */
  gambler: { aggression: 0.5, lateralMul: { drive: 1.08 } },
  /** Tidy escaping trouble; that grinding swing doesn't have much off the tee. */
  grinder: { lateralMul: { recovery: 0.88 }, carryMul: { drive: 0.95 } },
};

/**
 * Seven golfers, each two traits whose costs compound (both bite the same
 * context) rather than cancel (one trait's cost undoing the other's). See
 * the module doc above for that rule and scripts/roster-balance.mjs for
 * whether it's actually working.
 */
export const ROSTER: Golfer[] = [
  { id: "basher", label: "The Basher", traits: ["long", "gambler"] },
  { id: "plodder", label: "The Plodder", traits: ["metronome", "putter"] },
  { id: "wedge-artist", label: "The Wedge Artist", traits: ["wedge", "scrapper"] },
  { id: "houdini", label: "Houdini", traits: ["grinder", "scrapper"] },
  { id: "drawer", label: "The Drawer", traits: ["drawer", "long"] },
  { id: "fader", label: "The Fader", traits: ["fader", "gambler"] },
  { id: "iron-man", label: "Iron Man", traits: ["flusher", "putter"] },
];

export const ROSTER_IDS: GolferId[] = ROSTER.map((g) => g.id);

/** Looks up a golfer's two TraitEffects from TRAIT_TABLE. Throws on an unknown trait id — a roster typo, not a runtime data problem. */
export function resolveTraits(golfer: Golfer): TraitEffects[] {
  return golfer.traits.map((id) => {
    const effects = TRAIT_TABLE[id];
    if (!effects) throw new Error(`traits.ts: unknown trait id "${id}" on golfer "${golfer.id}"`);
    return effects;
  });
}
