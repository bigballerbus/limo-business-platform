import { describe, expect, it } from 'vitest';
import {
  isClear,
  isOpenStage,
  minutesOverdue,
  overdueSeverity,
  sortByUrgency,
  type AttentionItem,
} from '@/lib/domain/attention/rules';

describe('open-stage classification', () => {
  it('treats active stages as open and closed stages as not', () => {
    expect(isOpenStage('enquiry')).toBe(true);
    expect(isOpenStage('quoted')).toBe(true);
    expect(isOpenStage('won')).toBe(false);
    expect(isOpenStage('lost')).toBe(false);
  });
});

describe('minutesOverdue + overdueSeverity', () => {
  it('is negative before due and positive after', () => {
    const now = new Date('2030-01-01T12:00:00Z');
    expect(minutesOverdue(new Date('2030-01-01T12:30:00Z'), now)).toBe(-30);
    expect(minutesOverdue(new Date('2030-01-01T11:30:00Z'), now)).toBe(30);
  });

  it('escalates severity with how long it has slipped', () => {
    expect(overdueSeverity(5)).toBe('normal');
    expect(overdueSeverity(90)).toBe('high');
    expect(overdueSeverity(2 * 24 * 60)).toBe('critical');
  });
});

describe('sortByUrgency + isClear', () => {
  it('orders critical before high before normal', () => {
    const items: AttentionItem[] = [
      { kind: 'overdue_next_action', reference: 'a', severity: 'normal', detail: '' },
      { kind: 'dead_letter', reference: 'b', severity: 'critical', detail: '' },
      { kind: 'stalled_deposit', reference: 'c', severity: 'high', detail: '' },
    ];
    expect(sortByUrgency(items).map((i) => i.reference)).toEqual(['b', 'c', 'a']);
  });

  it('reports an empty queue as clear', () => {
    expect(isClear([])).toBe(true);
    expect(
      isClear([{ kind: 'dead_letter', reference: 'x', severity: 'critical', detail: '' }]),
    ).toBe(false);
  });
});
