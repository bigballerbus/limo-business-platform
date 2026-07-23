import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROAD_FACTOR,
  deriveZone,
  requiresHumanPricing,
  roadAdjustedMiles,
  type Zone,
} from '@/lib/domain/pricing/zones';

describe('roadAdjustedMiles', () => {
  it('applies the default road factor', () => {
    expect(roadAdjustedMiles(10)).toBeCloseTo(12.8);
    expect(DEFAULT_ROAD_FACTOR).toBe(1.28);
  });

  it('accepts a custom road factor', () => {
    expect(roadAdjustedMiles(10, 1.5)).toBe(15);
  });

  it('rejects negative distance and non-positive factor', () => {
    expect(() => roadAdjustedMiles(-1)).toThrow(RangeError);
    expect(() => roadAdjustedMiles(10, 0)).toThrow(RangeError);
    expect(() => roadAdjustedMiles(10, -2)).toThrow(RangeError);
  });
});

describe('deriveZone', () => {
  it('bands distances at the documented boundaries', () => {
    const cases: Array<[number, Zone]> = [
      [0, 1],
      [10, 1],
      [10.01, 2],
      [20, 2],
      [20.01, 3],
      [35, 3],
      [35.01, 4],
      [50, 4],
      [50.01, 5],
      [200, 5],
    ];
    for (const [miles, zone] of cases) {
      expect(deriveZone(miles)).toBe(zone);
    }
  });

  it('rejects negative distance', () => {
    expect(() => deriveZone(-0.1)).toThrow(RangeError);
  });
});

describe('requiresHumanPricing', () => {
  it('is true only for zone 5', () => {
    expect(requiresHumanPricing(1)).toBe(false);
    expect(requiresHumanPricing(4)).toBe(false);
    expect(requiresHumanPricing(5)).toBe(true);
  });
});
