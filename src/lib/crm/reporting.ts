import { withTenant } from '@/lib/db/client';
import { funnelRates, revenueMetrics, type FunnelCounts } from '@/lib/domain/reporting/kpi';

/**
 * Reporting (spec §14). Aggregates the funnel and revenue for the in-app
 * dashboard over a rolling window. The same numbers are exposed to Looker Studio
 * through the reporting view (migration 0003); this service is the real-time,
 * in-app path.
 */

export interface DashboardMetrics {
  windowDays: number;
  counts: FunnelCounts;
  rates: ReturnType<typeof funnelRates>;
  revenue: ReturnType<typeof revenueMetrics>;
}

export async function dashboardMetrics(
  tenantId: string,
  windowDays = 30,
): Promise<DashboardMetrics> {
  return withTenant(tenantId, async (client) => {
    const enq = await client.query<{ enquiries: string; quoted: string }>(
      `SELECT count(*)::text AS enquiries,
              count(*) FILTER (WHERE quoted_value_pence IS NOT NULL)::text AS quoted
         FROM enquiries
        WHERE created_at > now() - ($1 || ' days')::interval`,
      [windowDays],
    );

    const bk = await client.query<{
      booked: string;
      completed: string;
      booked_value: string | null;
      completed_value: string | null;
    }>(
      `SELECT count(*)::text AS booked,
              count(*) FILTER (WHERE status = 'completed')::text AS completed,
              COALESCE(sum(total_pence), 0)::text AS booked_value,
              COALESCE(sum(total_pence) FILTER (WHERE status = 'completed'), 0)::text AS completed_value
         FROM bookings
        WHERE created_at > now() - ($1 || ' days')::interval`,
      [windowDays],
    );

    const counts: FunnelCounts = {
      enquiries: Number(enq.rows[0]!.enquiries),
      quoted: Number(enq.rows[0]!.quoted),
      booked: Number(bk.rows[0]!.booked),
      completed: Number(bk.rows[0]!.completed),
    };

    return {
      windowDays,
      counts,
      rates: funnelRates(counts),
      revenue: revenueMetrics({
        bookedValuePence: Number(bk.rows[0]!.booked_value ?? 0),
        completedValuePence: Number(bk.rows[0]!.completed_value ?? 0),
        bookingCount: counts.booked,
      }),
    };
  });
}
