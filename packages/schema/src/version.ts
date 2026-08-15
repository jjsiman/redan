/**
 * Stamped on every Parcel and Design (doc 4.1: "schemaVersion on parcels and
 * designs alongside simVersion"). Bump when the wire shape of either type
 * changes in a way old data can't be read as.
 *
 * 0.2.0: Parcel.corridorHalfWidth/obHalfWidth replaced by
 * Parcel.corridor: PortraitCorridorStation[], plus the new optional
 * Parcel.fixedRegions — old parcel JSON needs migrating (see terrain.ts's
 * straightCorridor for the mechanical one-line equivalent).
 */
export const SCHEMA_VERSION = "0.2.0";
