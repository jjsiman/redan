import type { RegionShape } from "@redan/sim";

/**
 * Portrait coordinate convention (doc 6.1): parcels are authored and
 * rendered portrait, tee at the bottom, green near the top. Here that's
 * `x` = lateral yards from centerline (either sign), `y` = yards from the
 * tee toward the green (0 at the tee). This is a DIFFERENT frame from
 * @redan/sim's internal one (tee-at-origin, green at +x) — see toSim.ts for
 * the boundary crossing. Rotation between the two happens only there, per
 * the sim's portability contract ("rotation happens at the render/schema
 * boundary, never inside the sim").
 */
export interface PortraitVec2 {
  x: number;
  y: number;
}

export interface TrayEntry {
  shapeId: string;
  count: number;
}

/**
 * A localized mound (height > 0) or hollow (height < 0), in the portrait
 * frame — see @redan/sim's `ElevationFeature`. Radius and height are
 * frame-invariant (a distance and a height, not a direction), so only the
 * center point crosses the portrait/sim rotation in `toSim.ts`.
 */
export interface ElevationFeature {
  x: number;
  y: number;
  radius: number;
  height: number;
}

/**
 * One station along the corridor centerline, in the portrait frame: how far
 * from the tee (`y`), how far the centerline has drifted laterally there
 * (`cx` — 0 everywhere means a straight hole), and the fairway/OB envelope
 * width. See @redan/sim's `CorridorStation` — this is its portrait-frame
 * mirror (lateral drift is `cx` here, `cy` there, matching each frame's own
 * x/y convention), converted 1:1 through `toSim.ts`'s rotation.
 */
export interface PortraitCorridorStation {
  y: number;
  cx: number;
  halfWidth: number;
  obHalfWidth: number;
}

/**
 * Terrain + tee + par + tray envelope, in the portrait frame. Does not
 * include the green — per doc 1, the player places the green too, same as
 * hazards, as one of the tray pieces.
 */
export interface Parcel {
  id: string;
  schemaVersion: string;
  par: number;
  /**
   * The fairway/OB envelope as a sequence of stations along the hole,
   * tee-first (>=2 stations). Must extend, in arc-length, at least as far as
   * every placed piece including the green — see @redan/sim's `terrain.ts`.
   */
  corridor: PortraitCorridorStation[];
  /**
   * Parcel-authored terrain (trees, native area) the player cannot remove or
   * place over and that never counts against `pieceCap` — placed the same
   * way as a design piece (shapeId + x/y/rot/scale), just not part of the
   * tray. What makes a dogleg's inside corner a real decision.
   */
  fixedRegions?: PlacedShape[];
  /** Total piece-cost budget available (`cap` in the star-3 "used < cap" gate). */
  pieceCap: number;
  /** Allowed shapes and counts — the tray (doc 6.2). */
  tray: TrayEntry[];
  /**
   * Optional centerline elevation profile, sampled by distance from the tee
   * (`y` in the portrait frame). No cross-slope — matches @redan/sim's
   * current elevation model exactly. Flat if omitted.
   */
  elevationProfile?: { y: number; z: number }[];
  /** Optional localized mounds/hollows layered on top of the centerline profile. Fixed, parcel-authored — never a tray piece. */
  elevationFeatures?: ElevationFeature[];
}

/**
 * One placed piece. This is the frozen wire format (doc 6.3): a design
 * serializes to exactly `{ parcelId, pieces: [{ shapeId, x, y, rot, scale }] }`
 * and nothing else. `lieType` and footprint dimensions are NOT stored here —
 * they're resolved from `shapeId` via the shape table (shapes.ts) at
 * grade-time, so the shape table can be retuned without invalidating every
 * saved design.
 */
export interface PlacedShape {
  shapeId: string;
  x: number;
  y: number;
  rot: number;
  scale: number;
}

export interface Design {
  parcelId: string;
  schemaVersion: string;
  pieces: PlacedShape[];
}

export type { RegionShape };
