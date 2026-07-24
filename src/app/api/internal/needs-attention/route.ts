import { NextResponse } from 'next/server';
import { findNeedsAttention } from '@/lib/crm/attentionSweep';
import { isClear } from '@/lib/domain/attention/rules';
import { getDefaultTenant } from '@/lib/tenant/resolve';

/**
 * Needs-Attention data endpoint (spec §13). Secret-guarded JSON for the
 * operations dashboard — the rich in-admin view binds this in the dashboards
 * sprint (§14). Reports the ranked queue and whether it is clear (the 18:00
 * target). Never cached.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.INTERNAL_API_SECRET;
  const provided = request.headers.get('x-internal-secret');
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const tenant = await getDefaultTenant();
  const items = await findNeedsAttention(tenant.id);
  return NextResponse.json(
    { clear: isClear(items), count: items.length, items },
    { headers: { 'cache-control': 'no-store' } },
  );
}
