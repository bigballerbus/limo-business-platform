import type { Point } from '../pricing/geo';
import type { PricingInput } from '../pricing/types';
import type { QuoteSubmission } from '@/lib/schemas/quote';

/**
 * Pure mapping from a validated quote submission plus resolved geocoded points
 * to the pricing engine's input. Kept pure (type-only import of the schema) so
 * the domain boundary holds and it is unit-testable.
 */
export interface ResolvedPoints {
  base: Point;
  pickup: Point;
  destination: Point;
}

export function toPricingInput(submission: QuoteSubmission, points: ResolvedPoints): PricingInput {
  return {
    serviceType: submission.occasion,
    vehicleTier: submission.vehicleTier,
    durationHours: submission.durationHours,
    eventDate: submission.eventDate,
    pickupPoint: points.pickup,
    destinationPoint: points.destination,
    basePoint: points.base,
    passengerCount: submission.passengerCount,
    addons: submission.addons.map((key) => ({ key })),
  };
}
