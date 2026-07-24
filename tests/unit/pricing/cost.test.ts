import { describe, expect, it } from 'vitest';
import { estimateCost } from '@/lib/domain/pricing/cost';

const cost = { perMilePence: 90, perHourPence: 1800, fixedOverheadPence: 1500 };

describe('estimateCost', () => {
  it('sums mileage, time and overhead', () => {
    // (10 + 20) miles × 90 + 3h × 1800 + 1500 = 2700 + 5400 + 1500
    expect(estimateCost({ liveMiles: 10, deadMiles: 20, hours: 3, cost })).toBe(9600);
  });

  it('rejects negative inputs', () => {
    expect(() => estimateCost({ liveMiles: -1, deadMiles: 0, hours: 1, cost })).toThrow(RangeError);
    expect(() => estimateCost({ liveMiles: 0, deadMiles: -1, hours: 1, cost })).toThrow(RangeError);
    expect(() => estimateCost({ liveMiles: 0, deadMiles: 0, hours: -1, cost })).toThrow(RangeError);
  });
});
