/**
 * Needs-Attention classification (spec §13, BC9) — pure logic.
 *
 * The never-forgotten-lead guarantee has a visible backstop: a dashboard of
 * everything requiring human action that must be empty by 18:00 each day. This
 * module decides what counts as needing attention and how urgent it is, so the
 * sweep query and the dashboard agree on the rules and they are unit-tested in
 * one place.
 */

export type AttentionKind =
  | 'overdue_next_action' // an open lead whose dated next action has passed (BC9)
  | 'missing_next_action' // an open lead with no next action at all (BC9 gap)
  | 'stalled_deposit' // a booking stuck at pending_deposit past the grace window
  | 'dead_letter'; // an async failure parked for a human

export type Severity = 'critical' | 'high' | 'normal';

/** Open enquiry stages — closed stages never need chasing. */
export const OPEN_STAGES = ['enquiry', 'contacted', 'quoted', 'follow_up', 'nurture'] as const;

/** A pending deposit older than this (minutes) is stalled and needs a nudge. */
export const DEPOSIT_GRACE_MINUTES = 60;

export function isOpenStage(stage: string): boolean {
  return (OPEN_STAGES as readonly string[]).includes(stage);
}

/**
 * How overdue a dated action is, in minutes (negative = still in the future).
 * The sweep uses this both to filter and to rank.
 */
export function minutesOverdue(dueAt: Date, now: Date): number {
  return (now.getTime() - dueAt.getTime()) / 60_000;
}

/** Severity for an overdue next action — the longer it has slipped, the worse. */
export function overdueSeverity(minutes: number): Severity {
  if (minutes >= 24 * 60) return 'critical';
  if (minutes >= 60) return 'high';
  return 'normal';
}

/** Rank so the dashboard shows the most urgent first: critical > high > normal. */
export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, normal: 2 };

export interface AttentionItem {
  kind: AttentionKind;
  reference: string;
  severity: Severity;
  detail: string;
}

export function sortByUrgency(items: readonly AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/** The dashboard's headline: is the queue clear (the 18:00 target)? */
export function isClear(items: readonly AttentionItem[]): boolean {
  return items.length === 0;
}
