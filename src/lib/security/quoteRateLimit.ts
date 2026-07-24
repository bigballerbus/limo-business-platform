import { rateLimit, type WindowState } from '@/lib/domain/security/rateLimit';

/**
 * Per-IP rate limit for the public quote endpoint (spec §13). The store is a
 * process-local map — correct for a single instance and for tests; production
 * swaps it for the shared config/Redis store (the pure `rateLimit` decision is
 * unchanged). Keeps a scripted flood off the pricing engine and CRM writes.
 */
const WINDOW_MS = 60_000;
const LIMIT = 10;

const store = new Map<string, WindowState>();

export interface QuoteRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkQuoteRateLimit(key: string, nowMs: number): QuoteRateLimitResult {
  const decision = rateLimit(store.get(key) ?? null, nowMs, { limit: LIMIT, windowMs: WINDOW_MS });
  store.set(key, decision.next);
  return {
    allowed: decision.allowed,
    retryAfterSeconds: Math.max(0, Math.ceil((decision.resetMs - nowMs) / 1000)),
  };
}

/** Test seam — reset the in-memory store. */
export function resetQuoteRateLimit(): void {
  store.clear();
}
