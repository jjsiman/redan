import type { ArchetypeName, ArchetypeStats } from "./types.js";

/**
 * Four builds, equal total budget (2.40), differing allocation. These are
 * also the player's own stat sheet in Play mode (M4). Values are calibrated,
 * not tunable per-parcel.
 */
export const ARCHETYPES: Record<ArchetypeName, ArchetypeStats> = {
  BOMBER: { power: 0.95, accuracy: 0.4, recovery: 0.5, touch: 0.55 },
  STRAIGHT: { power: 0.5, accuracy: 0.95, recovery: 0.45, touch: 0.5 },
  SCRAMBLER: { power: 0.58, accuracy: 0.55, recovery: 0.92, touch: 0.35 },
  TOUCH: { power: 0.55, accuracy: 0.5, recovery: 0.4, touch: 0.95 },
};

export const ARCHETYPE_NAMES: ArchetypeName[] = [
  "BOMBER",
  "STRAIGHT",
  "SCRAMBLER",
  "TOUCH",
];

/**
 * Play-mode (M4) player-level scalar on top of the archetype stat sheet,
 * fixed at 1.0 for the four field archetypes used to grade a hole in M0.
 */
export const FIELD_SKILL = 1.0;
