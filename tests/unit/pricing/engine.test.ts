import { describe, expect, it } from 'vitest';
import { calculateQuote, dayBandOf, durationBand, seasonOf } from '@/lib/domain/pricing/engine';
import { PLACEHOLDER_RATE_CARD, type RateCard } from '@/lib/domain/pricing/ratecard';
import { BelowMarginFloorError } from '@/lib/domain/pricing/errors';
import type { PricingInput } from '@/lib/domain/pricing/types';

const BASE = { lng: 0.5227, lat: 51.2704 }; // Maidstone
const NEAR = { lng: 0.55, lat: 51.28 }; // ~2 miles → zone 1
const FAR = { lng: 2.7, lat: 51.6 }; // > 50 road miles → zone 5
const GATWICK = { lng: -0.1903, lat: 51.1537 };

/** A weekday in February (off-season) to keep multipliers predictable. */
const OFF_WEEKDAY = new Date('2030-02-05T10:00:00Z'); // Tuesday

function input(over: Partial<PricingInput> = {}): PricingInput {
  return {
    serviceType: 'wedding',
    vehicleTier: 'saloon',
    durationHours: 3,
    eventDate: OFF_WEEKDAY,
    pickupPoint: NEAR,
    destinationPoint: NEAR,
    basePoint: BASE,
    passengerCount: 2,
    addons: [],
    ...over,
  };
}

describe('durationBand', () => {
  it('bands hours', () => {
    expect(durationBand(1)).toBe('transfer');
    expect(durationBand(3)).toBe('half_day');
    expect(durationBand(6)).toBe('full_day');
    expect(durationBand(10)).toBe('extended');
  });
  it('rejects non-positive hours', () => {
    expect(() => durationBand(0)).toThrow(RangeError);
  });
});

describe('seasonOf', () => {
  it('maps months to seasons', () => {
    expect(seasonOf(new Date('2030-06-01T00:00:00Z'))).toBe('peak');
    expect(seasonOf(new Date('2030-12-01T00:00:00Z'))).toBe('peak');
    expect(seasonOf(new Date('2030-04-01T00:00:00Z'))).toBe('shoulder');
    expect(seasonOf(new Date('2030-08-01T00:00:00Z'))).toBe('shoulder');
    expect(seasonOf(new Date('2030-01-01T00:00:00Z'))).toBe('off');
  });
});

describe('dayBandOf', () => {
  it('classifies weekends and weekdays', () => {
    expect(dayBandOf(new Date('2030-06-01T00:00:00Z'))).toBe('weekend'); // Saturday
    expect(dayBandOf(new Date('2030-06-05T00:00:00Z'))).toBe('weekday'); // Wednesday
  });
});

describe('calculateQuote', () => {
  it('produces an exact zone-1 quote with a healthy margin (BC3 satisfied)', () => {
    const q = calculateQuote(input(), PLACEHOLDER_RATE_CARD);
    expect(q.zone).toBe(1);
    expect(q.confidence).toBe('exact');
    expect(q.distanceMultiplier).toBe(1.0);
    expect(q.seasonalMultiplier).toBe(0.9);
    expect(q.totalPence).toBeGreaterThan(0);
    expect(q.contributionMarginPct).toBeGreaterThanOrEqual(35);
    expect(q.rangeLowPence).toBeUndefined();
    expect(q.breakdown[0]?.label).toBe('Base fare');
  });

  it('applies no VAT (D-002): net equals total, VAT is zero', () => {
    const q = calculateQuote(input(), PLACEHOLDER_RATE_CARD);
    expect(q.vatPence).toBe(0);
    expect(q.netPence).toBe(q.totalPence);
  });

  it('adds add-ons (with quantity) and pass-throughs, and lists them', () => {
    const q = calculateQuote(
      input({
        addons: [{ key: 'champagne' }, { key: 'extra_hour', quantity: 2 }],
        passthroughs: ['dartford', 'ulez'],
      }),
      PLACEHOLDER_RATE_CARD,
    );
    expect(q.addonsPence).toBe(4000 + 12000 * 2);
    expect(q.passthroughPence).toBe(250 + 1250);
    expect(q.breakdown.some((l) => l.label === 'Add-ons')).toBe(true);
    expect(q.breakdown.some((l) => l.label.startsWith('Charges'))).toBe(true);
  });

  it('returns a range (not exact) for a zone-5 journey', () => {
    const q = calculateQuote(
      input({ pickupPoint: FAR, destinationPoint: FAR }),
      PLACEHOLDER_RATE_CARD,
    );
    expect(q.zone).toBe(5);
    expect(q.confidence).toBe('range');
    expect(q.rangeLowPence).toBe(Math.round(q.totalPence * 0.88));
    expect(q.rangeHighPence).toBe(Math.round(q.totalPence * 1.15));
  });

  it('returns a range when a complex add-on is present, even in zone 1', () => {
    const q = calculateQuote(
      input({ addons: [{ key: 'extra_stop', complex: true }] }),
      PLACEHOLDER_RATE_CARD,
    );
    expect(q.zone).toBe(1);
    expect(q.confidence).toBe('range');
  });

  it('throws BelowMarginFloorError when the margin is below 35% (BC3)', () => {
    // Cheap airport base but long live + dead mileage → unprofitable.
    expect(() =>
      calculateQuote(
        input({
          serviceType: 'airport_transfer',
          durationHours: 1,
          pickupPoint: NEAR,
          destinationPoint: GATWICK,
        }),
        PLACEHOLDER_RATE_CARD,
      ),
    ).toThrow(BelowMarginFloorError);
  });

  it('fails closed when the rate card has no base price for the combination', () => {
    const brokenCard: RateCard = {
      ...PLACEHOLDER_RATE_CARD,
      serviceBasePence: {
        ...PLACEHOLDER_RATE_CARD.serviceBasePence,
        wedding: {} as never,
      },
    };
    expect(() => calculateQuote(input(), brokenCard)).toThrow(/no base price/i);
  });

  it('omits the adjustment line when zone, season and day are all neutral', () => {
    const neutralCard: RateCard = {
      ...PLACEHOLDER_RATE_CARD,
      zoneMultipliers: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
      seasonalMultipliers: { peak: 1, shoulder: 1, off: 1 },
      dayMultipliers: { weekday: 1, weekend: 1 },
    };
    const q = calculateQuote(input(), neutralCard);
    expect(q.breakdown.some((l) => l.label === 'Distance, season & timing')).toBe(false);
  });
});
