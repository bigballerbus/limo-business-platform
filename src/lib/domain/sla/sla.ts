/**
 * SLA thresholds and escalation (spec §10.1) — pure logic. The scheduled
 * enforcement job (Inngest) queries open enquiries and calls slaStatus to decide
 * whether and how to escalate; keeping the decision pure makes it unit-testable.
 */
export type SlaAction = 'reassign' | 'force_exit' | 'release';

export interface SlaRule {
  /** Minutes to first response; null for stages driven by variant dwell. */
  firstResponseMinutes: number | null;
  /** Escalation-1 and escalation-2 thresholds (minutes, or a fraction of dwell). */
  l1: number;
  l2: number;
  /** Terminal action at escalation 3. */
  l3: SlaAction;
  /** When true, l1/l2 are fractions of the journey-variant dwell time. */
  fractional?: boolean;
}

export const SLA_RULES: Record<string, SlaRule> = {
  enquiry: { firstResponseMinutes: 5, l1: 15, l2: 30, l3: 'reassign' },
  contacted: { firstResponseMinutes: 30, l1: 120, l2: 240, l3: 'reassign' },
  quoted: { firstResponseMinutes: null, l1: 0.5, l2: 0.8, l3: 'force_exit', fractional: true },
  follow_up: { firstResponseMinutes: null, l1: 0.5, l2: 0.8, l3: 'force_exit', fractional: true },
  won: { firstResponseMinutes: 1440, l1: 1440, l2: 2880, l3: 'release' },
};

/** High-value leads (> £1,000) escalate at 50% of every threshold. */
export const HIGH_VALUE_PENCE = 100_000;

export interface SlaStatus {
  level: 0 | 1 | 2 | 3;
  breached: boolean;
  action: SlaAction | null;
}

export interface SlaOptions {
  quotedValuePence?: number;
  /** Journey-variant dwell in minutes (required for fractional stages). */
  dwellMinutes?: number;
}

export function slaStatus(stage: string, minutesInStage: number, opts: SlaOptions = {}): SlaStatus {
  const rule = SLA_RULES[stage];
  if (!rule) return { level: 0, breached: false, action: null };

  const factor = (opts.quotedValuePence ?? 0) > HIGH_VALUE_PENCE ? 0.5 : 1;
  const dwell = rule.fractional ? (opts.dwellMinutes ?? 0) : 1;
  const t1 = rule.l1 * dwell * factor;
  const t2 = rule.l2 * dwell * factor;

  if (minutesInStage >= t2) return { level: 3, breached: true, action: rule.l3 };
  if (minutesInStage >= t1) return { level: 2, breached: true, action: null };
  if (rule.firstResponseMinutes !== null && minutesInStage >= rule.firstResponseMinutes * factor) {
    return { level: 1, breached: true, action: null };
  }
  return { level: 0, breached: false, action: null };
}
