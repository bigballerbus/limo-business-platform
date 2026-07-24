import { NextResponse } from 'next/server';

/**
 * Liveness probe used by uptime monitoring (Better Stack) and CI smoke tests.
 * Intentionally dependency-free so it reflects process health, not integration
 * health — integration checks live behind their own diagnostic route later.
 */
export function GET() {
  return NextResponse.json(
    { status: 'ok', service: 'kent-limousines-platform' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
