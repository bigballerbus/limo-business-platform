/**
 * Doorway-page prevention (spec §2.6 / §4.2). Two pages of the same type may
 * share at most 30% of their body content; above that, publish is rejected.
 *
 * Similarity is the Jaccard overlap of 3-word shingles — a simple, deterministic
 * near-duplicate measure that needs no model or network, so it lives in the pure
 * domain layer and is fully testable.
 */
export interface SimilarityResult {
  score: number;
  against: string | null;
}

/** Lowercase, strip punctuation, collapse whitespace → word list. */
export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Set of k-word shingles (default trigrams). */
export function shingles(words: readonly string[], k = 3): Set<string> {
  const set = new Set<string>();
  if (words.length < k) {
    if (words.length > 0) set.add(words.join(' '));
    return set;
  }
  for (let i = 0; i <= words.length - k; i += 1) {
    set.add(words.slice(i, i + k).join(' '));
  }
  return set;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Highest similarity of `body` against any peer, and which peer it was. */
export function similarityScore(
  body: string,
  peers: ReadonlyArray<{ id: string; body: string }>,
): SimilarityResult {
  const target = shingles(normalize(body));
  let worst: SimilarityResult = { score: 0, against: null };
  for (const peer of peers) {
    const score = jaccard(target, shingles(normalize(peer.body)));
    if (score > worst.score) worst = { score, against: peer.id };
  }
  return worst;
}
