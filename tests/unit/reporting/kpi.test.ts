import { describe, expect, it } from 'vitest';
import {
  conversionRate,
  funnelRates,
  revenueMetrics,
  slaCompliance,
} from '@/lib/domain/reporting/kpi';

describe('conversionRate', () => {
  it('is a one-decimal percentage', () => {
    expect(conversionRate(1, 4)).toBe(25);
    expect(conversionRate(1, 3)).toBe(33.3);
  });
  it('is 0 on a zero denominator (never NaN)', () => {
    expect(conversionRate(5, 0)).toBe(0);
  });
});

describe('funnelRates', () => {
  it('computes each stage-to-stage rate and the end-to-end rate', () => {
    const rates = funnelRates({ enquiries: 100, quoted: 80, booked: 20, completed: 18 });
    expect(rates.quoteRate).toBe(80);
    expect(rates.bookingRate).toBe(25);
    expect(rates.completionRate).toBe(90);
    expect(rates.enquiryToCompletion).toBe(18);
  });
});

describe('revenueMetrics', () => {
  it('averages booking value and handles no bookings', () => {
    expect(
      revenueMetrics({ bookedValuePence: 300000, completedValuePence: 200000, bookingCount: 3 }),
    ).toEqual({
      bookedValuePence: 300000,
      completedValuePence: 200000,
      averageBookingValuePence: 100000,
    });
    expect(
      revenueMetrics({ bookedValuePence: 0, completedValuePence: 0, bookingCount: 0 })
        .averageBookingValuePence,
    ).toBe(0);
  });
});

describe('slaCompliance', () => {
  it('is the share within SLA', () => {
    expect(slaCompliance(9, 10)).toBe(90);
  });
});
