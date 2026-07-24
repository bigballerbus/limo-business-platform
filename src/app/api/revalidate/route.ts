import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { pathsForContent } from '@/lib/seo/revalidate';

/**
 * External on-demand revalidation (spec §7). Used by out-of-process producers
 * (e.g. a review sync, a GBP update) to refresh affected pages. Guarded by a
 * shared secret; in-process Payload edits use the afterChange hook instead.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET;
  const provided = request.headers.get('x-revalidate-secret');
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    collection?: string;
    slug?: string | null;
    path?: string;
  };

  const paths = body.path
    ? [body.path]
    : body.collection
      ? pathsForContent(body.collection, body.slug ?? null)
      : [];

  if (paths.length === 0) {
    return NextResponse.json({ error: 'nothing to revalidate' }, { status: 400 });
  }

  for (const path of paths) revalidatePath(path);
  return NextResponse.json({ revalidated: true, paths });
}
