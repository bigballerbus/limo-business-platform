/**
 * XML sitemap construction (spec §7) — pure logic.
 *
 * The sitemap is segmented by page group (services, venues, towns, routes,
 * vehicles, airports, guides…) so a large tail stays cache-friendly and a change
 * to one group need not regenerate the rest. Entries are built here from typed
 * inputs; the Next `sitemap.ts` route maps them onto the framework type.
 */

export type SitemapSegment =
  'core' | 'services' | 'venues' | 'towns' | 'routes' | 'vehicles' | 'airports' | 'guides';

export interface SitemapPage {
  path: string;
  segment: SitemapSegment;
  lastModified?: Date;
  /** 0..1 — home and money pages high, thin tail low. */
  priority?: number;
  changeFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
}

export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  priority: number;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
}

const DEFAULT_PRIORITY: Record<SitemapSegment, number> = {
  core: 1.0,
  services: 0.9,
  venues: 0.8,
  towns: 0.7,
  routes: 0.7,
  vehicles: 0.6,
  airports: 0.7,
  guides: 0.5,
};

const DEFAULT_FREQ: Record<SitemapSegment, SitemapEntry['changeFrequency']> = {
  core: 'weekly',
  services: 'weekly',
  venues: 'monthly',
  towns: 'monthly',
  routes: 'monthly',
  vehicles: 'monthly',
  airports: 'monthly',
  guides: 'monthly',
};

function canonical(path: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (!path || path === '/') return `${base}/`;
  return `${base}/${path.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

export function buildSitemapEntries(
  pages: readonly SitemapPage[],
  baseUrl: string,
): SitemapEntry[] {
  return pages.map((page) => ({
    url: canonical(page.path, baseUrl),
    lastModified: page.lastModified,
    priority: page.priority ?? DEFAULT_PRIORITY[page.segment],
    changeFrequency: page.changeFrequency ?? DEFAULT_FREQ[page.segment],
  }));
}

/** Group pages by segment — used to emit one sitemap file per segment. */
export function bySegment(pages: readonly SitemapPage[]): Record<SitemapSegment, SitemapPage[]> {
  const out = {} as Record<SitemapSegment, SitemapPage[]>;
  for (const page of pages) {
    (out[page.segment] ??= []).push(page);
  }
  return out;
}
