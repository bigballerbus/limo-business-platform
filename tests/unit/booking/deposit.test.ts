import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_DEPOSIT_POLICY,
  balanceDueDate,
  splitDeposit,
} from '@/lib/domain/booking/deposit';

describe('splitDeposit', () => {
  const policy = PLACEHOLDER_DEPOSIT_POLICY; // 20%, min £50

  it('takes the percentage when it exceeds the minimum', () => {
    expect(splitDeposit(100000, policy)).toEqual({ depositPence: 20000, balancePence: 80000 });
  });

  it('floors the deposit at the minimum on small jobs', () => {
    expect(splitDeposit(10000, policy)).toEqual({ depositPence: 5000, balancePence: 5000 });
  });

  it('caps the deposit at the total when the total is below the minimum', () => {
    expect(splitDeposit(4000, policy)).toEqual({ depositPence: 4000, balancePence: 0 });
  });

  it('rounds the percentage to whole pence', () => {
    // 12345 * 0.2 = 2469, below the £50 minimum, so the minimum wins.
    expect(splitDeposit(12345, { ...policy, minimumPence: 1000 })).toEqual({
      depositPence: 2469,
      balancePence: 9876,
    });
  });

  it('rejects a non-positive total', () => {
    expect(() => splitDeposit(0, policy)).toThrow(RangeError);
  });
});

describe('balanceDueDate', () => {
  it('falls the configured number of days before pickup', () => {
    const due = balanceDueDate(new Date('2030-06-15T10:00:00Z'), 14);
    expect(due.toISOString().slice(0, 10)).toBe('2030-06-01');
  });
});
