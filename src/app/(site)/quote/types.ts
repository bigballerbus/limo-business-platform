import type { LineItem } from '@/lib/domain/pricing/types';

export type QuoteActionResult =
  | {
      status: 'ok';
      reference: string;
      totalPence: number;
      confidence: 'exact' | 'range';
      rangeLowPence?: number;
      rangeHighPence?: number;
      breakdown: LineItem[];
      /** BC2 — when minors travel, a guardian must be verified before deposit. */
      requiresGuardian: boolean;
    }
  | { status: 'human'; reason: 'multi_vehicle' | 'below_floor' | 'geocode_unavailable' | 'minors' }
  | { status: 'error'; fieldErrors: Record<string, string[]> }
  | { status: 'rate_limited'; retryAfterSeconds: number };
