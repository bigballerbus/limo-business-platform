/**
 * Great-circle distance (pure). PostGIS `ST_Distance` is authoritative in the
 * data layer; the pricing engine needs a framework-free distance for its pure,
 * fully-testable calculation, so it uses the haversine formula and applies the
 * same road factor (see zones.ts) to approximate driving distance.
 */
export interface Point {
  /** Longitude in decimal degrees. */
  lng: number;
  /** Latitude in decimal degrees. */
  lat: number;
}

const EARTH_RADIUS_MILES = 3958.7613;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points, in miles. */
export function haversineMiles(a: Point, b: Point): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}
