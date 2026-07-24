import { Pool } from 'pg';

/**
 * Resolve the active tenant. For the single-tenant launch this is the sole
 * seeded tenant; multi-tenant deployments resolve it from the request hostname
 * (a readable hostname→tenant map) with no change to callers.
 *
 * Uses the owner connection because a request cannot yet know its tenant id to
 * set the RLS context — this is the bootstrap step before withTenant.
 */
let ownerPool: Pool | null = null;
function pool(): Pool {
  ownerPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  return ownerPool;
}

export interface TenantContext {
  id: string;
  base: { lng: number; lat: number };
}

export async function getDefaultTenant(): Promise<TenantContext> {
  const r = await pool().query<{ id: string; lng: number; lat: number }>(
    `SELECT id,
            ST_X(base_location::geometry) AS lng,
            ST_Y(base_location::geometry) AS lat
       FROM tenants
      ORDER BY created_at
      LIMIT 1`,
  );
  const row = r.rows[0];
  if (!row) throw new Error('No tenant configured');
  return { id: row.id, base: { lng: row.lng, lat: row.lat } };
}
