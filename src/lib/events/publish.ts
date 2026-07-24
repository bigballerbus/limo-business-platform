import type { PoolClient } from 'pg';
import type { DomainEvent } from './types';

/**
 * Record a domain event to the append-only audit log, inside the caller's
 * transaction so it commits atomically with the state change that produced it.
 *
 * Sprint 5 adds durable async dispatch (Inngest) on top of this; the audit
 * record remains the immutable ground truth of what happened.
 */
export async function recordEvent(
  client: PoolClient,
  tenantId: string,
  event: DomainEvent,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs (tenant_id, actor_type, action, entity_type, after_state)
     VALUES ($1, 'system', $2, 'event', $3::jsonb)`,
    [tenantId, event.name, JSON.stringify(event.data)],
  );
}
