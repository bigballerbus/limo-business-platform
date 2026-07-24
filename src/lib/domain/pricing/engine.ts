import {
  applyMultiplier,
  contributionMarginPct as computeMargin,
  sumPence,
  vatBreakdownFromGross,
} from './money';
import { haversineMiles } from './geo';
import { deriveZone, requiresHumanPricing, roadAdjustedMiles } from './zones';
import { estimateCost } from './cost';
import { BelowMarginFloorError } from './errors';
import type { RateCard } from './ratecard';
import type { DayBand, DurationBand, LineItem, PricingInput, PricingResult, Season } from './types';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Duration band from engaged hours. */
export function durationBand(hours: number): DurationBand {
  if (hours <= 0) throw new RangeError('durationHours must be positive');
  if (hours <= 1.5) return 'transfer';
  if (hours <= 4) return 'half_day';
  if (hours <= 8) return 'full_day';
  return 'extended';
}

/** Season from the event month (UK peak: May–Jul and December). */
export function seasonOf(date: Date): Season {
  const month = date.getUTCMonth(); // 0 = Jan
  if (month === 4 || month === 5 || month === 6 || month === 11) return 'peak';
  if (month === 3 || month === 7 || month === 8) return 'shoulder';
  return 'off';
}

/** Day band from the event weekday. */
export function dayBandOf(date: Date): DayBand {
  const day = date.getUTCDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

function buildBreakdown(
  basePence: number,
  multipliedPence: number,
  addonsPence: number,
  passthroughPence: number,
): LineItem[] {
  const items: LineItem[] = [{ label: 'Base fare', amountPence: basePence }];
  const adjustment = multipliedPence - basePence;
  if (adjustment !== 0) items.push({ label: 'Distance, season & timing', amountPence: adjustment });
  if (addonsPence > 0) items.push({ label: 'Add-ons', amountPence: addonsPence });
  if (passthroughPence > 0) {
    items.push({ label: 'Charges (Dartford, ULEZ, parking)', amountPence: passthroughPence });
  }
  return items;
}

/**
 * The pricing engine (spec §8.2). Pure and fully unit-tested: no I/O, no
 * database, no network. Prices are multiplied by zone (derived from driving
 * distance — D2), season and day; the cost model is applied; and BC3 rejects any
 * quote below the margin floor by throwing BelowMarginFloorError.
 */
export function calculateQuote(input: PricingInput, cfg: RateCard): PricingResult {
  const band = durationBand(input.durationHours);
  const season = seasonOf(input.eventDate);
  const dayBand = dayBandOf(input.eventDate);

  const baseRaw = cfg.serviceBasePence[input.serviceType]?.[input.vehicleTier];
  if (baseRaw === undefined) {
    // Fail closed to human routing — never guess a price (spec §8.4).
    throw new Error(`Rate card has no base price for ${input.serviceType}/${input.vehicleTier}.`);
  }
  const basePence = applyMultiplier(baseRaw, cfg.durationMultipliers[band]);

  // Pricing zone from driving distance base → pickup (D2).
  const zone = deriveZone(
    roadAdjustedMiles(haversineMiles(input.basePoint, input.pickupPoint), cfg.roadFactor),
  );

  const distanceMultiplier = cfg.zoneMultipliers[zone];
  const seasonalMultiplier = cfg.seasonalMultipliers[season];
  const dayTimeMultiplier = cfg.dayMultipliers[dayBand];

  const addonsPence = sumPence(input.addons.map((a) => cfg.addonPrices[a.key] * (a.quantity ?? 1)));
  const passthroughPence = sumPence(
    (input.passthroughs ?? []).map((k) => cfg.passthroughPrices[k]),
  );

  const multipliedPence = applyMultiplier(
    basePence,
    distanceMultiplier * seasonalMultiplier * dayTimeMultiplier,
  );
  const totalPence = multipliedPence + addonsPence + passthroughPence;

  // Cost model (road-adjusted live and dead miles).
  const liveMiles = roadAdjustedMiles(
    haversineMiles(input.pickupPoint, input.destinationPoint),
    cfg.roadFactor,
  );
  const deadMiles = roadAdjustedMiles(
    haversineMiles(input.basePoint, input.pickupPoint) +
      haversineMiles(input.destinationPoint, input.basePoint),
    cfg.roadFactor,
  );
  const estimatedCostPence = estimateCost({
    liveMiles,
    deadMiles,
    hours: input.durationHours,
    cost: cfg.cost,
  });

  const marginPct = computeMargin(totalPence, estimatedCostPence);
  if (marginPct < cfg.marginFloorPct) {
    throw new BelowMarginFloorError({ totalPence, costPence: estimatedCostPence, marginPct, zone });
  }

  const isComplex = input.addons.some((a) => a.complex === true);
  const confidence: 'exact' | 'range' = requiresHumanPricing(zone) || isComplex ? 'range' : 'exact';

  const vat = vatBreakdownFromGross(totalPence, cfg.vatRatePct);

  const result: PricingResult = {
    basePence,
    distanceMultiplier,
    seasonalMultiplier,
    dayTimeMultiplier,
    addonsPence,
    passthroughPence,
    totalPence,
    vatRatePct: cfg.vatRatePct,
    vatPence: vat.vatPence,
    netPence: vat.netPence,
    estimatedCostPence,
    contributionMarginPct: round2(marginPct),
    zone,
    confidence,
    breakdown: buildBreakdown(basePence, multipliedPence, addonsPence, passthroughPence),
  };

  if (confidence === 'range') {
    result.rangeLowPence = Math.round(totalPence * 0.88);
    result.rangeHighPence = Math.round(totalPence * 1.15);
  }

  return result;
}
