/**
 * Pricing-zone derivation (decision D2 — geospatial, not a lookup table).
 *
 * The *distance* is computed by PostGIS (`ST_Distance`) in the data layer; the
 * *banding* of that distance into a zone is pure arithmetic and lives here so
 * it is unit-testable without a database. Zone thresholds mirror the
 * `derive_pricing_zone` SQL function in spec §8.2.
 */

export type Zone = 1 | 2 | 3 | 4 | 5;

/** Default road-winding factor applied to straight-line distance (spec §8.2). */
export const DEFAULT_ROAD_FACTOR = 1.28;

/** Upper bound (inclusive, in road-adjusted miles) for each zone below 5. */
const ZONE_UPPER_BOUNDS_MILES: ReadonlyArray<{ zone: Zone; maxMiles: number }> = [
  { zone: 1, maxMiles: 10 },
  { zone: 2, maxMiles: 20 },
  { zone: 3, maxMiles: 35 },
  { zone: 4, maxMiles: 50 },
];

/**
 * Convert a straight-line (great-circle) distance to an estimated driving
 * distance by applying the calibrated road factor.
 */
export function roadAdjustedMiles(
  greatCircleMiles: number,
  roadFactor = DEFAULT_ROAD_FACTOR,
): number {
  if (greatCircleMiles < 0) throw new RangeError('Distance cannot be negative');
  if (roadFactor <= 0) throw new RangeError('Road factor must be positive');
  return greatCircleMiles * roadFactor;
}

/**
 * Band a road-adjusted distance (in miles) into a pricing zone.
 * Zone 5 is the open-ended top band, which the engine never auto-quotes exact
 * (spec §8.2) — it returns a range and routes to a human.
 */
export function deriveZone(roadMiles: number): Zone {
  if (roadMiles < 0) throw new RangeError('Distance cannot be negative');
  for (const band of ZONE_UPPER_BOUNDS_MILES) {
    if (roadMiles <= band.maxMiles) return band.zone;
  }
  return 5;
}

/** True when a zone must be quoted as a range with human follow-up, not an exact price. */
export function requiresHumanPricing(zone: Zone): boolean {
  return zone >= 5;
}
