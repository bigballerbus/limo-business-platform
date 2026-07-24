import type { Point } from '@/lib/domain/pricing/geo';

/**
 * Geocoding boundary. The real implementation (Google Maps Platform, cached in
 * Redis — spec §12.9) is added in the integrations sprint; the pricing flow
 * depends only on this interface. If geocoding is unavailable the quote degrades
 * to manual town selection and never blocks (spec §8.4).
 */
export interface Geocoder {
  geocode(postcode: string): Promise<Point | null>;
}

/** Deterministic placeholder mapping UK postcode areas to approximate points. */
const AREA_POINTS: Record<string, Point> = {
  ME: { lng: 0.52, lat: 51.27 }, // Maidstone
  CT: { lng: 1.08, lat: 51.28 }, // Canterbury
  DA: { lng: 0.22, lat: 51.44 }, // Dartford
  TN: { lng: 0.27, lat: 51.13 }, // Tunbridge Wells
  RH: { lng: -0.19, lat: 51.15 }, // Gatwick
  BR: { lng: 0.02, lat: 51.4 }, // Bromley
  SE: { lng: 0.02, lat: 51.46 }, // South East London
};

export const stubGeocoder: Geocoder = {
  async geocode(postcode: string): Promise<Point | null> {
    const letters = postcode.replace(/[^A-Za-z]/g, '').toUpperCase();
    const area = letters.slice(0, 2);
    return AREA_POINTS[area] ?? AREA_POINTS[letters.slice(0, 1)] ?? { lng: 0.52, lat: 51.27 };
  },
};
