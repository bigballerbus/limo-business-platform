import { describe, expect, it } from 'vitest';
import { toPricingInput } from '@/lib/domain/quote/mapToPricing';
import { QuoteSubmissionSchema } from '@/lib/schemas/quote';

const points = {
  base: { lng: 0.52, lat: 51.27 },
  pickup: { lng: 0.55, lat: 51.28 },
  destination: { lng: 0.52, lat: 51.27 },
};

describe('toPricingInput', () => {
  it('maps a validated submission to the pricing engine input', () => {
    const submission = QuoteSubmissionSchema.parse({
      occasion: 'wedding',
      eventDate: new Date(Date.now() + 90 * 86400000).toISOString(),
      pickupPostcode: 'ME14 1AA',
      destinationType: 'return',
      passengerCount: 4,
      durationHours: 5,
      vehicleTier: 'stretch_limo',
      addons: ['champagne', 'red_carpet'],
      contact: { firstName: 'A', lastName: 'B', email: 'a@b.com', mobile: '07123456789' },
      attribution: { firstTouch: 'organic', lastTouch: 'organic' },
    });

    const input = toPricingInput(submission, points);
    expect(input.serviceType).toBe('wedding');
    expect(input.vehicleTier).toBe('stretch_limo');
    expect(input.durationHours).toBe(5);
    expect(input.passengerCount).toBe(4);
    expect(input.basePoint).toEqual(points.base);
    expect(input.addons).toEqual([{ key: 'champagne' }, { key: 'red_carpet' }]);
  });
});
