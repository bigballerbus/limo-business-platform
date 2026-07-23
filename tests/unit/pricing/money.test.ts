import { describe, expect, it } from 'vitest';
import {
  applyMultiplier,
  contributionMarginPct,
  formatGBP,
  sumPence,
  vatBreakdownFromGross,
} from '@/lib/domain/pricing/money';

describe('applyMultiplier', () => {
  it('multiplies and rounds to whole pence', () => {
    expect(applyMultiplier(45000, 1.15)).toBe(51750);
    expect(applyMultiplier(45000, 1.153)).toBe(51885);
    expect(applyMultiplier(101, 1.005)).toBe(102); // rounds 101.505 → 102
  });

  it('rejects non-integer input', () => {
    expect(() => applyMultiplier(100.5, 1)).toThrow(TypeError);
  });
});

describe('sumPence', () => {
  it('sums a list', () => {
    expect(sumPence([100, 200, 300])).toBe(600);
    expect(sumPence([])).toBe(0);
  });

  it('rejects a non-integer member', () => {
    expect(() => sumPence([100, 0.5])).toThrow(TypeError);
  });
});

describe('contributionMarginPct', () => {
  it('computes margin on revenue', () => {
    expect(contributionMarginPct(1000, 650)).toBeCloseTo(35);
    expect(contributionMarginPct(1000, 500)).toBeCloseTo(50);
  });

  it('rejects non-positive revenue', () => {
    expect(() => contributionMarginPct(0, 10)).toThrow(RangeError);
    expect(() => contributionMarginPct(-100, 10)).toThrow(RangeError);
  });

  it('rejects non-integer inputs', () => {
    expect(() => contributionMarginPct(1000.5, 10)).toThrow(TypeError);
    expect(() => contributionMarginPct(1000, 10.5)).toThrow(TypeError);
  });
});

describe('vatBreakdownFromGross', () => {
  it('treats 0% VAT (Kent Limousines default) as net === gross', () => {
    expect(vatBreakdownFromGross(74400)).toEqual({
      netPence: 74400,
      vatPence: 0,
      grossPence: 74400,
      vatRatePct: 0,
    });
  });

  it('splits a standard-rated amount when a rate is supplied', () => {
    const b = vatBreakdownFromGross(12000, 20);
    expect(b.netPence).toBe(10000);
    expect(b.vatPence).toBe(2000);
    expect(b.grossPence).toBe(12000);
  });

  it('rejects negative rate and non-integer gross', () => {
    expect(() => vatBreakdownFromGross(1000, -1)).toThrow(RangeError);
    expect(() => vatBreakdownFromGross(1000.5)).toThrow(TypeError);
  });
});

describe('formatGBP', () => {
  it('formats pence as a GBP string', () => {
    expect(formatGBP(74400)).toBe('£744.00');
    expect(formatGBP(0)).toBe('£0.00');
  });

  it('rejects non-integer input', () => {
    expect(() => formatGBP(10.5)).toThrow(TypeError);
  });
});
