/**
 * Stamped on every GradeResult. Bump whenever a coefficient in the shot
 * model, trait table, terrain factors, or metric formulas changes — the
 * moment any of those change, every stored score becomes incomparable.
 *
 * 0.2.0: corridor geometry (bending centerline + polygon regions, replacing
 * the flat corridorHalfWidth/obHalfWidth scalars) and the fixed four-
 * archetype table replaced by trait-composed golfers (traits.ts). See
 * traits.ts's module doc and docs/redan-project-doc.md's amended 4.2/6.1/6.2.
 *
 * 0.3.0: `used` (grade.ts) no longer counts the mandatory green piece — it
 * measures only hazard spend, since every design has exactly one green by
 * construction and taxing it made doc 5's restraint-based third star
 * (`used < cap`) a constant off-by-one rather than a measure of choice.
 * Existing parcels' `pieceCap` was reduced by 1 to compensate, so authored
 * star outcomes are unchanged — but `used` itself reads differently on any
 * externally stored GradeResult from before this bump.
 *
 * 0.4.0: land mode's OB semantics changed (terrain.ts#lieAt's land-mode
 * branch, fairway.ts#fringeBands). Near-boundary terrain that used to
 * resolve `ob` (stroke and distance) now resolves `deep` (playable rough/
 * scrub) or plain `rough`; true OB only starts `LAND_FRINGE_YARDS` past the
 * authored land envelope. Every land-mode score's stroke count near the
 * boundary can differ from a pre-0.4.0 GradeResult for the same parcel/
 * design. Tray-mode (hand-authored corridor) parcels are unaffected —
 * `lieAt` only takes the new branch when `landEnvelope` is present.
 *
 * 0.5.0: land mode's derived corridor profile changed (fairway.ts#
 * buildStations). The mown fairway now starts short of the tee behind a
 * rounded leading edge — `teeGapLong` (~100yd) in front of the tee on a par
 * 4/5, or `teeGapPar3` (~50yd) short of the GREEN on a par 3 — instead of
 * covering the tee and 40 yards behind it; it also ends in a
 * `greenRadius + greenApron` semicircle wrapping the green instead of
 * tapering linearly to a point 40 yards past it. `deriveFairway` also
 * appends a `tee`-lie tee-box region at the corridor origin (visual only —
 * `tee` and `fairway` share identical lie/roll factors). Fixed alongside
 * this: terrain.ts#lieAt's land-mode branch used to resolve a point sitting
 * exactly on the centerline as `"fairway"` even where the corridor's own
 * width was deliberately zero (the `<=` comparison against a width of 0 is
 * still true at zero offset) — harmless when every station had a positive
 * width, but load-bearing now that the tee gap and the far side of the
 * green cap are genuinely zero-width. Every land-mode score is incomparable
 * across this bump; tray-mode parcels are unaffected (same landEnvelope
 * gate as 0.4.0). `SHAPE_TABLE`'s `trees`/`native-area` footprints also
 * changed (schema, not sim) from rects to organic polygons of similar
 * extent but somewhat less area, which moves scores on tray parcels that
 * place `trees` (02-dogleg-left, 03-split-par5, 05-drivable-four) — tracked
 * here since it's the same content-affecting release, not a schema-wire
 * change (SCHEMA_VERSION is unchanged).
 */
export const SIM_VERSION = "0.5.0";
