import { describe, expect, it } from 'vitest';
import { dueNurtureTouches, nurtureCadence } from '@/lib/domain/nurture/cadence';

const entered = new Date('2030-01-01T00:00:00Z');

describe('nurtureCadence', () => {
  it('gives weddings a longer ladder than transfers', () => {
    expect(nurtureCadence('wedding').length).toBeGreaterThan(nurtureCadence('transfer').length);
  });
});

describe('dueNurtureTouches', () => {
  it('returns nothing before the first offset', () => {
    const now = new Date('2030-01-02T00:00:00Z'); // 1 day — first wedding touch is +3
    expect(dueNurtureTouches('wedding', entered, 0, now)).toEqual([]);
  });

  it('returns touches whose offset has elapsed, skipping already-sent', () => {
    const now = new Date('2030-01-25T00:00:00Z'); // 24 days: +3 and +21 are due
    const due = dueNurtureTouches('wedding', entered, 0, now);
    expect(due.map((t) => t.dayOffset)).toEqual([3, 21]);

    // With one already sent, only the +21 remains.
    const remaining = dueNurtureTouches('wedding', entered, 1, now);
    expect(remaining.map((t) => t.dayOffset)).toEqual([21]);
  });

  it('never returns touches already fully sent', () => {
    const now = new Date('2031-01-01T00:00:00Z'); // far future — all elapsed
    const all = nurtureCadence('wedding').length;
    expect(dueNurtureTouches('wedding', entered, all, now)).toEqual([]);
  });
});
