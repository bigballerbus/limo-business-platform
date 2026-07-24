/** Public API of the pricing domain. */
export { calculateQuote, durationBand, seasonOf, dayBandOf } from './engine';
export { BelowMarginFloorError } from './errors';
export { PLACEHOLDER_RATE_CARD, type RateCard, type CostModel } from './ratecard';
export { estimateCost, type CostInput } from './cost';
export { haversineMiles, type Point } from './geo';
export { deriveZone, roadAdjustedMiles, requiresHumanPricing, type Zone } from './zones';
export { contributionMarginPct, formatGBP, vatBreakdownFromGross, type Pence } from './money';
export type {
  Addon,
  AddonKey,
  DayBand,
  DurationBand,
  LineItem,
  PassthroughKey,
  PricingInput,
  PricingResult,
  Season,
  ServiceType,
  VehicleTier,
} from './types';
