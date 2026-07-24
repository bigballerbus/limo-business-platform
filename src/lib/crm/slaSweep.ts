import { Pool } from 'pg';
import { slaStatus, type SlaAction } from '@/lib/domain/sla/sla';

/**
 * SLA enforcement sweep (§10.1) — a system job that scans open enquiries across
 * all tenants, so it uses the owner connection rather than a tenant-scoped one.
 *
 * Stages with concrete first-response thresholds (enquiry, contacted, won) are
 * swept here. The fraction-of-dwell stages (quoted, follow_up) need the
 * journey-variant cadence tables (OI-11) and are wired when those land.
 */
let ownerPool: Pool | null = null;
function pool(): Pool {
  ownerPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  return ownerPool;
}

const CONCRETE_STAGES = ['enquiry', 'contacted', 'won'];

export interface SlaBreach {
  enquiryId: string;
  tenantId: string;
  level: 1 | 2 | 3;
  action: SlaAction | null;
}

export async function findSlaBreaches(): Promise<SlaBreach[]> {
  const r = await pool().query<{
    id: string;
    tenant_id: string;
    stage: string;
    quoted_value_pence: number | null;
    mins: string;
  }>(
    `SELECT id, tenant_id, stage, quoted_value_pence,
            EXTRACT(EPOCH FROM (now() - stage_entered_at)) / 60 AS mins
       FROM enquiries
      WHERE stage = ANY($1)`,
    [CONCRETE_STAGES],
  );

  const breaches: SlaBreach[] = [];
  for (const row of r.rows) {
    const status = slaStatus(row.stage, Number(row.mins), {
      quotedValuePence: row.quoted_value_pence ?? 0,
    });
    if (status.breached && status.level > 0) {
      breaches.push({
        enquiryId: row.id,
        tenantId: row.tenant_id,
        level: status.level as 1 | 2 | 3,
        action: status.action,
      });
    }
  }
  return breaches;
}

export async function escalate(breach: SlaBreach): Promise<void> {
  await pool().query(
    `UPDATE enquiries SET sla_breached = true, escalation_level = $2 WHERE id = $1`,
    [breach.enquiryId, breach.level],
  );
  await pool().query(
    `INSERT INTO activities (tenant_id, enquiry_id, type, body)
     VALUES ($1,$2,'system',$3)`,
    [
      breach.tenantId,
      breach.enquiryId,
      `SLA escalation level ${breach.level}${breach.action ? ` → ${breach.action}` : ''}`,
    ],
  );
}
