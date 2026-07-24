import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appAsTenant, appPool, closePools, ownerPool, uid } from './helpers/db';

/**
 * Hostile-tenant test (decision D-001). Proves Row-Level Security actually
 * isolates tenants: the application role, scoped to tenant A, can never read,
 * write, or update tenant B's data — and with no tenant set at all, sees
 * nothing (fail closed).
 */
describe('Row-Level Security — tenant isolation', () => {
  let tenantA: string;
  let tenantB: string;
  let customerB: string;

  beforeAll(async () => {
    const mk = async (): Promise<string> => {
      const s = uid();
      const r = await ownerPool.query<{ id: string }>(
        `INSERT INTO tenants (name, slug, base_location, licensing_authority, operator_licence_no, licence_expiry)
         VALUES ($1,$2, ST_SetSRID(ST_MakePoint(0.52,51.27),4326)::geography,'A','L','2030-01-01')
         RETURNING id`,
        [`RLS ${s}`, `rls-${s}`],
      );
      return r.rows[0]!.id;
    };
    tenantA = await mk();
    tenantB = await mk();

    const custB = await ownerPool.query<{ id: string }>(
      `INSERT INTO customers (tenant_id, first_name, last_name, email, mobile, first_touch_source, last_touch_source)
       VALUES ($1,'B','User',$2,'+447000000000','organic','organic') RETURNING id`,
      [tenantB, `b-${uid()}@example.com`],
    );
    customerB = custB.rows[0]!.id;
  });

  afterAll(async () => {
    // Clean up in FK order, then close pools.
    await ownerPool.query('DELETE FROM customers WHERE tenant_id = ANY($1)', [[tenantA, tenantB]]);
    await ownerPool.query('DELETE FROM tenants WHERE id = ANY($1)', [[tenantA, tenantB]]);
    await closePools();
  });

  it("cannot read another tenant's rows", async () => {
    const visible = await appAsTenant(tenantA, async (c) => {
      const r = await c.query('SELECT id FROM customers WHERE id = $1', [customerB]);
      return r.rowCount;
    });
    expect(visible).toBe(0);
  });

  it('cannot insert a row for another tenant (WITH CHECK)', async () => {
    let code: string | undefined;
    try {
      await appAsTenant(tenantA, async (c) => {
        await c.query(
          `INSERT INTO customers (tenant_id, first_name, last_name, email, mobile, first_touch_source, last_touch_source)
           VALUES ($1,'X','Y',$2,'+447000000000','organic','organic')`,
          [tenantB, `x-${uid()}@example.com`],
        );
      });
    } catch (error) {
      code = (error as { code?: string }).code;
    }
    // 42501 = new row violates row-level security policy
    expect(code).toBe('42501');
  });

  it("cannot update another tenant's row (invisible → 0 rows affected)", async () => {
    const affected = await appAsTenant(tenantA, async (c) => {
      const r = await c.query('UPDATE customers SET first_name = $1 WHERE id = $2', [
        'Hacked',
        customerB,
      ]);
      return r.rowCount;
    });
    expect(affected).toBe(0);
    // Confirm B's row is untouched (checked as owner).
    const check = await ownerPool.query<{ first_name: string }>(
      'SELECT first_name FROM customers WHERE id = $1',
      [customerB],
    );
    expect(check.rows[0]?.first_name).toBe('B');
  });

  it('with no tenant context, sees no rows (fail closed)', async () => {
    const client = await appPool.connect();
    try {
      const r = await client.query('SELECT count(*)::int AS n FROM customers');
      expect(r.rows[0]?.n).toBe(0);
    } finally {
      client.release();
    }
  });

  it('sees its own tenant row and not the other', async () => {
    const seen = await appAsTenant(tenantA, async (c) => {
      const r = await c.query<{ id: string }>('SELECT id FROM tenants');
      return r.rows.map((row) => row.id);
    });
    expect(seen).toContain(tenantA);
    expect(seen).not.toContain(tenantB);
  });
});
