/**
 * Stamped on every GradeResult. Bump whenever a coefficient in the shot
 * model, trait table, terrain factors, or metric formulas changes — the
 * moment any of those change, every stored score becomes incomparable.
 *
 * 0.2.0: corridor geometry (bending centerline + polygon regions, replacing
 * the flat corridorHalfWidth/obHalfWidth scalars) and the fixed four-
 * archetype table replaced by trait-composed golfers (traits.ts). See
 * traits.ts's module doc and docs/redan-project-doc.md's amended 4.2/6.1/6.2.
 */
export const SIM_VERSION = "0.2.0";
