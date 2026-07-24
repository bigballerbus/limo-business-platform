import type { CollectionBeforeValidateHook } from 'payload';
import { evaluateGate, formatGateFailures } from '@/lib/domain/proof-gate/evaluate';
import { getThreshold } from '@/lib/domain/proof-gate/thresholds';
import { similarityScore } from '@/lib/domain/proof-gate/similarity';

/** Recursively collect plain text from a Lexical richText value. */
export function lexicalToText(value: unknown): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as { text?: unknown; children?: unknown; root?: unknown };
    if (typeof n.text === 'string') out.push(n.text);
    if (n.root) walk(n.root);
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(value);
  return out.join(' ');
}

function arrayLen(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * BC8 — the publish proof gate. On the draft→published transition it counts the
 * page's evidence and body length, evaluates against the collection's threshold
 * (fail-closed if none — T-007), and runs a doorway-page similarity check
 * against already-published peers. Any failure throws, and the API rejects the
 * publish. There is no UI path around it.
 */
export const enforceProofGate =
  (collectionSlug: string): CollectionBeforeValidateHook =>
  async ({ data, originalDoc, req }) => {
    const status = (data?._status ?? originalDoc?._status) as string | undefined;
    const wasPublished = (originalDoc?._status as string | undefined) === 'published';
    const becomingPublished = status === 'published' && !wasPublished;
    if (!becomingPublished || !data) return data;

    // A publish is often a status-only update; unchanged fields (body, images…)
    // live on originalDoc. Evaluate the merged document.
    const doc = { ...(originalDoc ?? {}), ...data } as Record<string, unknown>;
    const threshold = getThreshold(collectionSlug);
    const bodyText = lexicalToText(doc.body);

    const result = evaluateGate(
      {
        assetCounts: {
          photo: arrayLen(doc.images) || arrayLen(doc.gallery),
          fact: arrayLen(doc.facts),
          faq: arrayLen(doc.faqs),
          review: arrayLen(doc.reviews),
          job: 0, // Proof-Ledger jobs are wired with the reference-entity step.
        },
        wordCount: bodyText.split(/\s+/).filter(Boolean).length,
      },
      threshold,
    );
    if (!result.pass) {
      throw new Error(
        `Cannot publish: proof gate not met.\n${formatGateFailures(result.failures)}`,
      );
    }

    // Doorway-page prevention — max 30% body overlap with any published peer.
    const peers = await req.payload.find({
      collection: collectionSlug as never,
      where: { _status: { equals: 'published' } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    });
    const worst = similarityScore(
      bodyText,
      peers.docs
        .filter((d) => (d as { id: unknown }).id !== (data.id ?? originalDoc?.id))
        .map((d) => ({
          id: String((d as { id: unknown }).id),
          body: lexicalToText((d as { body?: unknown }).body),
        })),
    );
    if (worst.score > threshold.maxSimilarity) {
      throw new Error(
        `Cannot publish: ${Math.round(worst.score * 100)}% similar to "${worst.against}". ` +
          `Maximum is ${Math.round(threshold.maxSimilarity * 100)}%.`,
      );
    }

    return data;
  };
