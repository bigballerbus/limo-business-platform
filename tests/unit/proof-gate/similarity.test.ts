import { describe, expect, it } from 'vitest';
import { jaccard, normalize, shingles, similarityScore } from '@/lib/domain/proof-gate/similarity';

describe('normalize', () => {
  it('lowercases, strips punctuation and splits', () => {
    expect(normalize('Leeds Castle, Kent!')).toEqual(['leeds', 'castle', 'kent']);
  });
  it('returns empty for blank input', () => {
    expect(normalize('   ')).toEqual([]);
  });
});

describe('shingles', () => {
  it('builds trigrams', () => {
    expect(shingles(['a', 'b', 'c', 'd'])).toEqual(new Set(['a b c', 'b c d']));
  });
  it('handles text shorter than k', () => {
    expect(shingles(['a', 'b'])).toEqual(new Set(['a b']));
    expect(shingles([])).toEqual(new Set());
  });
});

describe('jaccard', () => {
  it('is 1 for identical sets and 0 for disjoint', () => {
    expect(jaccard(new Set(['x', 'y']), new Set(['x', 'y']))).toBe(1);
    expect(jaccard(new Set(['x']), new Set(['y']))).toBe(0);
  });
  it('is 0 for two empty sets', () => {
    expect(jaccard(new Set(), new Set())).toBe(0);
  });
});

describe('similarityScore', () => {
  const body =
    'Our chauffeurs know the approach to Leeds Castle and the best photo positions for wedding cars.';

  it('detects a near-duplicate peer', () => {
    const result = similarityScore(body, [
      { id: 'peer-1', body },
      { id: 'peer-2', body: 'A completely different page about airport transfers to Gatwick.' },
    ]);
    expect(result.against).toBe('peer-1');
    expect(result.score).toBeCloseTo(1);
  });

  it('returns zero against no peers', () => {
    expect(similarityScore(body, [])).toEqual({ score: 0, against: null });
  });

  it('scores distinct content low', () => {
    const result = similarityScore(body, [
      {
        id: 'peer',
        body: 'Corporate roadshow logistics across the South East for executive teams.',
      },
    ]);
    expect(result.score).toBeLessThan(0.3);
  });
});
