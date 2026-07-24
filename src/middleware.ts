import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security headers (spec §13). Applied to every response. The strong,
 * low-risk headers are enforced now; Content-Security-Policy is shipped in
 * Report-Only so it can be tuned against the real page set during UAT before
 * being flipped to enforcing (a blocking CSP tuned blind would break the
 * Payload admin and inline structured data).
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export function middleware(_request: NextRequest): NextResponse {
  const response = NextResponse.next();
  const headers = response.headers;
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  headers.set('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY);
  return response;
}

/** Run on all routes except Next internals and static assets. */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
