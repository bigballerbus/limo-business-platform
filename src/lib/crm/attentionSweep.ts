import type { PoolClient } from 'pg';
import { withTenant } from '@/lib/db/client';
import { recordEvent } from '@/lib/events/publish';
import {
  DEPOSIT_GRACE_MINUTES,
  OPEN_STAGES,
  overdueSeverity,
  sortByUrgency,
  type AttentionItem,
} from '@/lib/domain/attention/rules';

/**
 * Needs-Attention sweep and dead-letter queue (spec §13, BC9).
 *
 *  findNeedsAttention — the dashboard query: overdue open leads, stalled
 *  deposits, and open dead-letters, ranked most-urgent first. The target is an
 *  empty list by 18:00 each day.
 *
 *  sweepOrphans — the never-forgotten-lead backstop: any open lead whose dated
 *  next action has slipped past due is re-driven (a fresh action window + an
 *  audit activity) so it re-enters the active queue rather than going quiet.
 *
 *  recordDeadLetter / resolveDeadLetter — the failure-visibility queue for async
 *  steps that exhaust their retries.
 */

export interface RecordDeadLetterInput {
  source: string;
  reference?: string | null;
  error: string;
  payload?: Record<string, unknown>;
}

export async function recordDeadLetter(
  tenantId: string,
  input: RecordDeadLetterInput,
): Promise<{ id: string }> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query<{ id: string }>(
      `INSERT INTO dead_letters (tenant_id, source, reference, error, payload)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       RETURNING id`,
      [
        tenantId,
        input.source,
        input.reference ?? null,
        input.error,
        JSON.stringify(input.payload ?? {}),
      ],
    );
    return { id: r.rows[0]!.id };
  });
}

export async function resolveDeadLetter(
  tenantId: string,
  id: string,
  resolvedBy: string | null = null,
): Promise<void> {
  await withTenant(tenantId, async (client) => {
    await client.query(
      `UPDATE dead_letters
          SET status = 'resolved', resolved_at = now(), resolved_by = $2, updated_at = now()
        WHERE id = $1 AND status = 'open'`,
      [id, resolvedBy],
    );
  });
}

export async function findNeedsAttention(tenantId: string): Promise<AttentionItem[]> {
  return withTenant(tenantId, async (client) => {
    const items: AttentionItem[] = [];

    const enquiries = await client.query<{
      reference: string;
      next_action: string | null;
      mins_overdue: number | null;
    }>(
      `SELECT reference, next_action,
              EXTRACT(EPOCH FROM (now() - next_action_date)) / 60 AS mins_overdue
         FROM enquiries
        WHERE stage = ANY($1)
          AND (next_action_date IS NULL OR next_action_date < now())`,
      [OPEN_STAGES as readonly string[]],
    );
    for (const row of enquiries.rows) {
      if (row.mins_overdue == null) {
        items.push({
          kind: 'missing_next_action',
          reference: row.reference,
          severity: 'critical',
          detail: 'Open lead with no next action',
        });
      } else {
        const mins = Number(row.mins_overdue);
        items.push({
          kind: 'overdue_next_action',
          reference: row.reference,
          severity: overdueSeverity(mins),
          detail: `${row.next_action ?? 'Follow up'} overdue by ${Math.round(mins)} min`,
        });
      }
    }

    const stalled = await client.query<{ reference: string; mins: number }>(
      `SELECT reference, EXTRACT(EPOCH FROM (now() - created_at)) / 60 AS mins
         FROM bookings
        WHERE status = 'pending_deposit'
          AND created_at < now() - ($1 || ' minutes')::interval`,
      [DEPOSIT_GRACE_MINUTES],
    );
    for (const row of stalled.rows) {
      items.push({
        kind: 'stalled_deposit',
        reference: row.reference,
        severity: 'high',
        detail: `Deposit not paid ${Math.round(Number(row.mins))} min after booking`,
      });
    }

    const deadLetters = await client.query<{
      reference: string | null;
      source: string;
      error: string;
    }>(`SELECT reference, source, error FROM dead_letters WHERE status = 'open'`);
    for (const row of deadLetters.rows) {
      items.push({
        kind: 'dead_letter',
        reference: row.reference ?? row.source,
        severity: 'critical',
        detail: `${row.source}: ${row.error}`,
      });
    }

    return sortByUrgency(items);
  });
}

export interface SweepResult {
  reDriven: number;
}

/**
 * BC9 backstop. Re-drive open leads whose next action has slipped past due: give
 * them a fresh short action window and log an activity so they re-surface for
 * the owner. Runs across all open, concrete-action stages; never touches closed
 * leads. Returns how many were re-driven.
 */
export async function sweepOrphans(tenantId: string): Promise<SweepResult> {
  return withTenant(tenantId, async (client) => {
    const overdue = await client.query<{ id: string }>(
      `SELECT id FROM enquiries
        WHERE stage = ANY($1) AND next_action_date < now()`,
      [OPEN_STAGES as readonly string[]],
    );
    for (const row of overdue.rows) {
      await reDrive(client, tenantId, row.id);
    }
    return { reDriven: overdue.rows.length };
  });
}

async function reDrive(client: PoolClient, tenantId: string, enquiryId: string): Promise<void> {
  await client.query(
    `UPDATE enquiries
        SET next_action = COALESCE(next_action, 'Follow up'),
            next_action_date = now() + interval '30 minutes',
            updated_at = now()
      WHERE id = $1`,
    [enquiryId],
  );
  await client.query(
    `INSERT INTO activities (tenant_id, enquiry_id, type, body)
     VALUES ($1,$2,'system','Orphan sweep re-drove this lead (BC9 — never forgotten)')`,
    [tenantId, enquiryId],
  );
  await recordEvent(client, tenantId, {
    name: 'enquiry/stage.changed',
    data: { enquiryId, tenantId, from: 'overdue', to: 're_driven' },
  });
}
