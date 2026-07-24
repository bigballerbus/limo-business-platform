import { describe, expect, it } from 'vitest';
import { haversineMiles } from '@/lib/domain/pricing/geo';

describe('haversineMiles', () => {
  it('is zero for identical points', () => {
    expect(haversineMiles({ lng: 0.5, lat: 51.2 }, { lng: 0.5, lat: 51.2 })).toBe(0);
  });

  it('approximates one degree of latitude as ~69 miles', () => {
    expect(haversineMiles({ lng: 0, lat: 51 }, { lng: 0, lat: 52 })).toBeCloseTo(69, 0);
  });

  it('measures a known short hop', () => {
    // Maidstone → Leeds Castle ≈ 5 miles as the crow flies.
    const d = haversineMiles({ lng: 0.5227, lat: 51.2704 }, { lng: 0.6316, lat: 51.2486 });
    expect(d).toBeGreaterThan(4);
    expect(d).toBeLessThan(6);
  });
});
