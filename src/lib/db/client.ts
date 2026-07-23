import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

/**
 * Application database access.
 *
 * The app connects as a dedicated, non-owner, non-`BYPASSRLS` role
 * (`APP_DATABASE_URL`) so Row-Level Security is actually enforced at runtime
 * (decision D3 / D-001). Migrations and seeds use the owner connection
 * (`DATABASE_URL`) instead.
 */
const connectionString = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;

export const pool = new Pool({ connectionString, max: 10 });
export const db = drizzle(pool);

/**
 * Run `fn` inside a transaction scoped to a single tenant.
 *
 * `app.tenant_id` is set with `SET LOCAL` (transaction-scoped) so it cannot
 * leak to another request via the pooled connection. Every RLS policy keys off
 * this setting; if it is unset, policies deny all rows (fail closed). All
 * runtime queries that touch tenant-scoped tables must go through this helper.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
