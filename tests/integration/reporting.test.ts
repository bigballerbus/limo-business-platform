import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appClientPool } from '@/lib/db/client';
import { dashboardMetrics } from '@/lib/crm/reporting';
import { closePools, ensureLookups, ownerPool, uid } from './helpers/db';

/**
 * Reporting (§14). Builds a fully isolated tenant with a known funnel so the
 * aggregated counts, conversion rates and revenue are deterministic (the shared
 * default tenant carries other tests' data).
 */
describe('dashboard reporting metrics', () => {
  let tenantId: string;
  let ownerId: string;
  let customerId: string;

  beforeAll(async () => {
    await ensureLookups();
    const s = uid();
    tenantId = (
      await ownerPool.query<{ id: string }>(
        `INSERT INTO tenants (name, slug, base_location, licensing_authority, operator_licence_no, licence_expiry)
         VALUES ($1,$2, ST_SetSRID(ST_MakePoint(0.52,51.27),4326)::geography,'Auth','LIC','2035-01-01')
         RETURNING id`,
        [`Report Tenant ${s}`, `report-tenant-${s}`],
      )
    ).rows[0]!.id;
    ownerId = (
      await ownerPool.query<{ id: string }>(
        `INSERT INTO staff (tenant_id, full_name, role, mobile, status)
         VALUES ($1,'Report Owner','coordinator','+447004000000','active') RETURNING id`,
        [tenantId],
      )
    ).rows[0]!.id;
    customerId = (
      await ownerPool.query<{ id: string }>(
        `INSERT INTO customers (tenant_id, first_name, last_name, email, mobile, first_touch_source, last_touch_source)
         VALUES ($1,'Rep','Ort',$2,'07123456789','organic','organic') RETURNING id`,
        [tenantId, `rep-${s}@example.com`],
      )
    ).rows[0]!.id;

    // 3 enquiries, 2 of them quoted.
    const enquiryIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const quoted = i < 2 ? 100000 : null;
      const r = await ownerPool.query<{ id: string }>(
        `INSERT INTO enquiries
           (tenant_id, reference, customer_id, stage, owner_id, service_type, journey_variant,
            event_date, pickup_postcode, passenger_count, source, next_action, next_action_date, quoted_value_pence)
         VALUES ($1,$2,$5,'quoted',$3,'celebration','celebration','2031-06-01','ME14 1AA',2,'organic',
                 'Call', now() + interval '1 day', $4)
         RETURNING id`,
        [tenantId, `ENQ-REP-${uid()}`, ownerId, quoted, customerId],
      );
      enquiryIds.push(r.rows[0]!.id);
    }

    // 2 bookings (1 completed), £1,000 each.
    for (let i = 0; i < 2; i++) {
      await ownerPool.query(
        `INSERT INTO bookings
           (tenant_id, reference, enquiry_id, customer_id, status, service_type,
            pickup_at, estimated_end_at, passenger_count, total_pence, deposit_pence, balance_pence, balance_due_date)
         VALUES ($1,$2,$3,$5,$4,'celebration','2031-06-01T10:00:00Z','2031-06-01T14:00:00Z',
                 2,100000,20000,80000,'2031-05-18')`,
        [
          tenantId,
          `BKG-REP-${uid()}`,
          enquiryIds[i],
          i === 0 ? 'completed' : 'confirmed',
          customerId,
        ],
      );
    }
  });

  afterAll(async () => {
    await ownerPool.query(`DELETE FROM bookings WHERE tenant_id = $1`, [tenantId]);
    await ownerPool.query(`DELETE FROM enquiries WHERE tenant_id = $1`, [tenantId]);
    await ownerPool.query(`DELETE FROM customers WHERE tenant_id = $1`, [tenantId]);
    await ownerPool.query(`DELETE FROM staff WHERE tenant_id = $1`, [tenantId]);
    await ownerPool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await closePools();
    await appClientPool.end();
  });

  it('aggregates the funnel, rates and revenue for the window', async () => {
    const m = await dashboardMetrics(tenantId, 30);

    expect(m.counts).toEqual({ enquiries: 3, quoted: 2, booked: 2, completed: 1 });
    expect(m.rates.quoteRate).toBe(66.7);
    expect(m.rates.bookingRate).toBe(100); // 2 booked of 2 quoted
    expect(m.rates.completionRate).toBe(50);
    expect(m.revenue.bookedValuePence).toBe(200000);
    expect(m.revenue.completedValuePence).toBe(100000);
    expect(m.revenue.averageBookingValuePence).toBe(100000);
  });
});
