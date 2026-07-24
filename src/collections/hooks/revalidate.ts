import { revalidatePath } from 'next/cache';
import type { CollectionAfterChangeHook } from 'payload';
import { pathsForContent } from '@/lib/seo/revalidate';

/**
 * Payload `afterChange` hook that revalidates the public paths a document
 * affects. Attached to content collections so an editor's publish reaches the
 * live site immediately (spec §7 on-demand ISR), without a redeploy. Failures
 * are swallowed deliberately — a revalidation miss must never fail the editor's
 * save; the periodic ISR refresh is the backstop.
 */
export const revalidateContent: CollectionAfterChangeHook = ({ doc, collection }) => {
  try {
    const slug = (doc as { slug?: string | null })?.slug ?? null;
    for (const path of pathsForContent(collection.slug, slug)) {
      revalidatePath(path);
    }
  } catch {
    // best-effort; periodic revalidate covers a miss
  }
  return doc;
};
