'use server';

import { QuoteSubmissionSchema } from '@/lib/schemas/quote';
import { calculateQuote } from '@/lib/domain/pricing/engine';
import { PLACEHOLDER_RATE_CARD } from '@/lib/domain/pricing/ratecard';
import { BelowMarginFloorError } from '@/lib/domain/pricing/errors';
import { toPricingInput } from '@/lib/domain/quote/mapToPricing';
import { captureQuoteLead } from '@/lib/crm/leadCapture';
import { getDefaultTenant } from '@/lib/tenant/resolve';
import { stubGeocoder } from '@/lib/geo/geocoder';
import type { QuoteActionResult } from './types';

/**
 * The enquiry critical path (spec §2.4 / §8.5). Server-side re-validation, then:
 * BC1 capacity branch, geocode (degrade gracefully), price (BC3 routes to human
 * on a sub-floor margin), and the atomic CRM write. The response returns as soon
 * as the transaction commits — messaging is dispatched asynchronously.
 */
export async function submitQuote(raw: unknown): Promise<QuoteActionResult> {
  const parsed = QuoteSubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
      if (messages) fieldErrors[key] = messages;
    }
    return { status: 'error', fieldErrors };
  }
  const data = parsed.data;

  // BC1 — 9+ passengers is a different regulatory class; route to a human
  // (the full multi-vehicle branch lands in the safeguarding/capacity sprint).
  if (data.passengerCount > 8) return { status: 'human', reason: 'multi_vehicle' };

  const tenant = await getDefaultTenant();
  const pickup = await stubGeocoder.geocode(data.pickupPostcode);
  const destination =
    data.destinationType === 'return'
      ? tenant.base
      : data.destinationType === 'postcode' && data.destinationPostcode
        ? await stubGeocoder.geocode(data.destinationPostcode)
        : tenant.base; // venue-point resolution lands with the venues collection
  if (!pickup || !destination) return { status: 'human', reason: 'geocode_unavailable' };

  let pricing;
  try {
    pricing = calculateQuote(
      toPricingInput(data, { base: tenant.base, pickup, destination }),
      PLACEHOLDER_RATE_CARD,
    );
  } catch (error) {
    if (error instanceof BelowMarginFloorError) return { status: 'human', reason: 'below_floor' };
    throw error;
  }

  const lead = await captureQuoteLead(tenant.id, { submission: data, pricing });

  return {
    status: 'ok',
    reference: lead.reference,
    totalPence: pricing.totalPence,
    confidence: pricing.confidence,
    rangeLowPence: pricing.rangeLowPence,
    rangeHighPence: pricing.rangeHighPence,
    breakdown: pricing.breakdown,
  };
}
