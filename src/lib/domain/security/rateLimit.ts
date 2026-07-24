/**
 * Fixed-window rate limiting (spec §13) — pure logic.
 *
 * The public quote endpoint is abuse-exposed; a simple per-key fixed window
 * blunts scripted floods without a stateful dependency in the hot path. The
 * decision is pure — the caller owns the counter store (in-memory, Redis, or the
 * feature-flag/config service) and passes the current window state in.
 */

export interface WindowState {
  /** Requests already counted in the current window. */
  count: number;
  /** When the current window started (ms epoch). */
  windowStartMs: number;
}

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** The window state to persist for the next request. */
  next: WindowState;
  /** Requests remaining in the current window after this one. */
  remaining: number;
  /** When the current window resets (ms epoch). */
  resetMs: number;
}

/**
 * Decide whether a request is allowed and return the updated window. A request
 * arriving after the window has elapsed starts a fresh window. At the limit the
 * request is denied and the count is not incremented (so a flood cannot push the
 * reset further out).
 */
export function rateLimit(
  state: WindowState | null,
  nowMs: number,
  config: RateLimitConfig,
): RateLimitDecision {
  const fresh = !state || nowMs - state.windowStartMs >= config.windowMs;
  const windowStartMs = fresh ? nowMs : state!.windowStartMs;
  const currentCount = fresh ? 0 : state!.count;
  const resetMs = windowStartMs + config.windowMs;

  if (currentCount >= config.limit) {
    return {
      allowed: false,
      next: { count: currentCount, windowStartMs },
      remaining: 0,
      resetMs,
    };
  }

  const nextCount = currentCount + 1;
  return {
    allowed: true,
    next: { count: nextCount, windowStartMs },
    remaining: Math.max(0, config.limit - nextCount),
    resetMs,
  };
}
