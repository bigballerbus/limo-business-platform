import { describe, expect, it } from 'vitest';
import { evaluateGate, formatGateFailures } from '@/lib/domain/proof-gate/evaluate';
import { GATE_THRESHOLDS, getThreshold } from '@/lib/domain/proof-gate/thresholds';

const venue = GATE_THRESHOLDS.venues;

describe('getThreshold', () => {
  it('returns a threshold for a gated collection', () => {
    expect(getThreshold('venues')).toEqual(venue);
  });
  it('fails closed for an unknown collection', () => {
    expect(() => getThreshold('nonexistent')).toThrow(/fail closed/i);
  });
  it('defines a threshold for every gated collection (T-007)', () => {
    for (const key of [
      'services',
      'venues',
      'airports',
      'occasions',
      'comparisons',
      'case-studies',
    ]) {
      expect(() => getThreshold(key)).not.toThrow();
    }
  });
});

describe('evaluateGate', () => {
  it('passes when every requirement is met', () => {
    const result = evaluateGate(
      { assetCounts: { photo: 3, fact: 12, faq: 5, review: 1, job: 1 }, wordCount: 600 },
      venue,
    );
    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('reports every shortfall', () => {
    const result = evaluateGate(
      { assetCounts: { photo: 1, fact: 12, faq: 2, review: 0, job: 0 }, wordCount: 300 },
      venue,
    );
    expect(result.pass).toBe(false);
    const failed = result.failures.map((f) => f.requirement);
    expect(failed).toEqual(['photos', 'faqs', 'reviews', 'jobs', 'words']);
  });

  it('formats failures for the rejection message', () => {
    const msg = formatGateFailures([{ requirement: 'photos', actual: 1, required: 3 }]);
    expect(msg).toContain('photos: 1/3');
  });
});
