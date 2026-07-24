import type { Point } from './geo';
import type { Zone } from './zones';

export type ServiceType = 'wedding' | 'prom' | 'airport_transfer' | 'corporate' | 'celebration';
export type VehicleTier = 'saloon' | 'mpv' | 'stretch_limo' | 'wedding_car' | 'accessible';
export type DurationBand = 'transfer' | 'half_day' | 'full_day' | 'extended';
export type Season = 'peak' | 'shoulder' | 'off';
export type DayBand = 'weekday' | 'weekend';
export type AddonKey = 'red_carpet' | 'champagne' | 'extra_hour' | 'extra_stop' | 'decorations';
export type PassthroughKey = 'dartford' | 'ulez' | 'airport_dropoff' | 'parking';

export interface Addon {
  key: AddonKey;
  quantity?: number;
  /** Complex add-ons force a range quote and human follow-up (spec §8.2). */
  complex?: boolean;
}

export interface PricingInput {
  serviceType: ServiceType;
  vehicleTier: VehicleTier;
  durationHours: number;
  eventDate: Date;
  pickupPoint: Point;
  destinationPoint: Point;
  basePoint: Point;
  passengerCount: number;
  addons: Addon[];
  passthroughs?: PassthroughKey[];
}

export interface LineItem {
  label: string;
  amountPence: number;
}

export interface PricingResult {
  basePence: number;
  distanceMultiplier: number;
  seasonalMultiplier: number;
  dayTimeMultiplier: number;
  addonsPence: number;
  passthroughPence: number;
  totalPence: number;
  vatRatePct: number;
  vatPence: number;
  netPence: number;
  estimatedCostPence: number;
  contributionMarginPct: number;
  zone: Zone;
  confidence: 'exact' | 'range';
  rangeLowPence?: number;
  rangeHighPence?: number;
  breakdown: LineItem[];
}
