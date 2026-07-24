import { describe, expect, it } from 'vitest';
import { slaStatus } from '@/lib/domain/sla/sla';

describe('slaStatus', () => {
  it('escalates the enquiry stage through its thresholds', () => {
    expect(slaStatus('enquiry', 3).level).toBe(0);
    expect(slaStatus('enquiry', 6).level).toBe(1); // > 5 min first response
    expect(slaStatus('enquiry', 16).level).toBe(2); // > 15 min
    const terminal = slaStatus('enquiry', 31); // > 30 min
    expect(terminal.level).toBe(3);
    expect(terminal.action).toBe('reassign');
  });

  it('halves every threshold for high-value leads (> £1,000)', () => {
    expect(slaStatus('enquiry', 3, { quotedValuePence: 200_000 }).level).toBe(1); // 5 → 2.5
    expect(slaStatus('enquiry', 16, { quotedValuePence: 200_000 }).level).toBe(3); // 30 → 15
  });

  it('uses a fraction of the variant dwell for the quoted stage', () => {
    expect(slaStatus('quoted', 40, { dwellMinutes: 100 }).level).toBe(0); // < 50
    expect(slaStatus('quoted', 60, { dwellMinutes: 100 }).level).toBe(2); // ≥ 50
    const terminal = slaStatus('quoted', 85, { dwellMinutes: 100 }); // ≥ 80
    expect(terminal.level).toBe(3);
    expect(terminal.action).toBe('force_exit');
  });

  it('is inert for an unknown stage', () => {
    expect(slaStatus('completed', 9999)).toEqual({ level: 0, breached: false, action: null });
  });
});
