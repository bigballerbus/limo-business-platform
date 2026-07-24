import { describe, expect, it } from 'vitest';
import { QuoteSubmissionSchema } from '@/lib/schemas/quote';

const MONTH = 30 * 24 * 60 * 60 * 1000;

function base(over: Record<string, unknown> = {}) {
  return {
    occasion: 'wedding',
    eventDate: new Date(Date.now() + 3 * MONTH).toISOString(),
    pickupPostcode: 'me14 1aa',
    destinationType: 'return',
    passengerCount: 2,
    durationHours: 3,
    vehicleTier: 'saloon',
    addons: [],
    contact: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ADA@Example.com',
      mobile: '07123456789',
    },
    attribution: { firstTouch: 'organic', lastTouch: 'organic' },
    ...over,
  };
}

describe('QuoteSubmissionSchema', () => {
  it('accepts a valid submission and normalises postcode/email', () => {
    const parsed = QuoteSubmissionSchema.parse(base());
    expect(parsed.pickupPostcode).toBe('ME14 1AA');
    expect(parsed.contact.email).toBe('ada@example.com');
    expect(parsed.eventDate).toBeInstanceOf(Date);
  });

  it('rejects an invalid postcode', () => {
    expect(
      QuoteSubmissionSchema.safeParse(base({ pickupPostcode: 'not a postcode' })).success,
    ).toBe(false);
  });

  it('rejects a past event date', () => {
    const r = QuoteSubmissionSchema.safeParse(
      base({ eventDate: new Date(Date.now() - 2 * MONTH).toISOString() }),
    );
    expect(r.success).toBe(false);
  });

  it('allows weddings up to 36 months but not other occasions past 24', () => {
    const far = new Date(Date.now() + 30 * MONTH).toISOString();
    expect(
      QuoteSubmissionSchema.safeParse(base({ occasion: 'wedding', eventDate: far })).success,
    ).toBe(true);
    expect(
      QuoteSubmissionSchema.safeParse(base({ occasion: 'corporate', eventDate: far })).success,
    ).toBe(false);
  });

  it('requires a destination postcode when the journey is one-way by postcode', () => {
    expect(QuoteSubmissionSchema.safeParse(base({ destinationType: 'postcode' })).success).toBe(
      false,
    );
    expect(
      QuoteSubmissionSchema.safeParse(
        base({ destinationType: 'postcode', destinationPostcode: 'ct1 2eh' }),
      ).success,
    ).toBe(true);
  });
});
