/**
 * Metadata + canonical URL construction (spec §7) — pure logic.
 *
 * A single builder produces the title/description/canonical/OpenGraph shape for
 * every template so no page hand-rolls its own (and forgets a canonical or an
 * OG image). The Next `generateMetadata` functions map this plain object onto
 * the framework `Metadata` type — the mapping is trivial; the decisions live
 * here where they are tested.
 */

/** Join a path onto the origin, guaranteeing exactly one slash and no trailing slash (except root). */
export function canonicalUrl(path: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (!path || path === '/') return `${base}/`;
  const clean = `/${path.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return `${base}${clean}`;
}

export interface PageMetaInput {
  title: string;
  description: string;
  path: string;
  baseUrl: string;
  brand: string;
  locale: string;
  image?: string;
  /** Non-indexable pages (thin/thank-you) set this false. */
  index?: boolean;
  ogType?: 'website' | 'article';
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  robots: { index: boolean; follow: boolean };
  openGraph: {
    title: string;
    description: string;
    url: string;
    type: 'website' | 'article';
    locale: string;
    siteName: string;
    images: { url: string }[];
  };
}

export function buildMetadata(input: PageMetaInput): PageMeta {
  const canonical = canonicalUrl(input.path, input.baseUrl);
  const index = input.index ?? true;
  return {
    title: input.title,
    description: input.description,
    canonical,
    robots: { index, follow: index },
    openGraph: {
      title: input.title,
      description: input.description,
      url: canonical,
      type: input.ogType ?? 'website',
      locale: input.locale,
      siteName: input.brand,
      images: input.image ? [{ url: input.image }] : [],
    },
  };
}
