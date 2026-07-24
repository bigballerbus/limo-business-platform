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
    }
  | { status: 'human'; reason: 'multi_vehicle' | 'below_floor' | 'geocode_unavailable' | 'minors' }
  | { status: 'error'; fieldErrors: Record<string, string[]> };
