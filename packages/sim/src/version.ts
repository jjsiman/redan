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
 */
export const SIM_VERSION = "0.3.0";
