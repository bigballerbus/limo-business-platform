import { describe, expect, it } from 'vitest';
import { rateLimit } from '@/lib/domain/security/rateLimit';

const config = { limit: 3, windowMs: 60_000 };

describe('rateLimit', () => {
  it('allows up to the limit within a window, then denies', () => {
    let state = null as Parameters<typeof rateLimit>[0];
    const start = 1_000_000;
    const results = [];
    for (let i = 0; i < 4; i++) {
      const d = rateLimit(state, start + i, config);
      state = d.next;
      results.push(d.allowed);
    }
    expect(results).toEqual([true, true, true, false]);
  });

  it('reports remaining and reset time', () => {
    const d = rateLimit(null, 1000, config);
    expect(d.remaining).toBe(2);
    expect(d.resetMs).toBe(1000 + config.windowMs);
  });

  it('starts a fresh window once the previous has elapsed', () => {
    const first = rateLimit(null, 0, config);
    const denied = rateLimit({ count: 3, windowStartMs: 0 }, 100, config);
    expect(denied.allowed).toBe(false);
    const afterWindow = rateLimit({ count: 3, windowStartMs: 0 }, config.windowMs + 1, config);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.next.count).toBe(1);
    void first;
  });

  it('does not increment the count when denied', () => {
    const denied = rateLimit({ count: 3, windowStartMs: 0 }, 100, config);
    expect(denied.next.count).toBe(3);
  });
});
