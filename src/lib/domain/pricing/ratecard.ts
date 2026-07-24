import type {
  AddonKey,
  DayBand,
  DurationBand,
  PassthroughKey,
  Season,
  ServiceType,
  VehicleTier,
} from './types';
import type { Zone } from './zones';

/**
 * The rate card is the pricing configuration — data, not code. All money is
 * integer pence. Kent Limousines charges no VAT (decision D-002), so vatRatePct
 * is 0; the field exists so a future change is configuration only.
 */
export interface CostModel {
  /** Fuel + maintenance + finance per driven mile (live and dead). */
  perMilePence: number;
  /** Chauffeur cost per engaged hour. */
  perHourPence: number;
  /** Fixed overhead attributed to each job. */
  fixedOverheadPence: number;
}

export interface RateCard {
  /** Base price (pence) per service × vehicle tier, before duration/zone/season/day. */
  serviceBasePence: Record<ServiceType, Record<VehicleTier, number>>;
  durationMultipliers: Record<DurationBand, number>;
  zoneMultipliers: Record<Zone, number>;
  seasonalMultipliers: Record<Season, number>;
  dayMultipliers: Record<DayBand, number>;
  addonPrices: Record<AddonKey, number>;
  passthroughPrices: Record<PassthroughKey, number>;
  cost: CostModel;
  /** Approximation factor from straight-line to driving distance (spec §8.2). */
  roadFactor: number;
  /** BC3 — contribution-margin floor, percent. */
  marginFloorPct: number;
  vatRatePct: number;
}

function tiers(
  saloon: number,
  mpv: number,
  stretch_limo: number,
  wedding_car: number,
  accessible: number,
): Record<VehicleTier, number> {
  return { saloon, mpv, stretch_limo, wedding_car, accessible };
}

/**
 * ⚠️ PLACEHOLDER rate card (decision D-004). The structure is production-shaped;
 * the numbers are illustrative and MUST be replaced with Kent Limousines' real
 * figures (via the fill-in template) before go-live. Swapping them is a data
 * change — no code change.
 */
export const PLACEHOLDER_RATE_CARD: RateCard = {
  serviceBasePence: {
    // saloon,  mpv,   stretch, wedding, accessible
    wedding: tiers(48000, 55000, 78000, 68000, 52000),
    prom: tiers(30000, 34000, 52000, 40000, 33000),
    airport_transfer: tiers(9000, 11000, 20000, 14000, 10000),
    corporate: tiers(12000, 14000, 22000, 16000, 13000),
    celebration: tiers(28000, 32000, 48000, 38000, 30000),
  },
  durationMultipliers: { transfer: 0.6, half_day: 1.0, full_day: 1.8, extended: 2.6 },
  zoneMultipliers: { 1: 1.0, 2: 1.15, 3: 1.35, 4: 1.6, 5: 2.0 },
  seasonalMultipliers: { peak: 1.25, shoulder: 1.05, off: 0.9 },
  dayMultipliers: { weekday: 1.0, weekend: 1.15 },
  addonPrices: {
    red_carpet: 2500,
    champagne: 4000,
    extra_hour: 12000,
    extra_stop: 3000,
    decorations: 6000,
  },
  passthroughPrices: { dartford: 250, ulez: 1250, airport_dropoff: 600, parking: 500 },
  cost: { perMilePence: 90, perHourPence: 1800, fixedOverheadPence: 1500 },
  roadFactor: 1.28,
  marginFloorPct: 35,
  vatRatePct: 0,
};
