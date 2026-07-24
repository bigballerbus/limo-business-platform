import { NextResponse } from 'next/server';
import { dashboardMetrics } from '@/lib/crm/reporting';
import { getDefaultTenant } from '@/lib/tenant/resolve';

/**
 * Reporting data endpoint (spec §14). Secret-guarded JSON for the in-app,
 * real-time dashboard: the funnel counts, conversion rates and revenue over a
 * rolling window. The rich in-admin visualisation binds this; Looker Studio uses
 * the reporting_funnel view instead. Never cached.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.INTERNAL_API_SECRET;
  const provided = request.headers.get('x-internal-secret');
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const windowDays = Number(url.searchParams.get('days') ?? '30');
  const tenant = await getDefaultTenant();
  const metrics = await dashboardMetrics(tenant.id, Number.isFinite(windowDays) ? windowDays : 30);
  return NextResponse.json(metrics, { headers: { 'cache-control': 'no-store' } });
}
