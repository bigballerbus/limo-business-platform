/**
 * On-demand revalidation (spec §7). Content edited in Payload publishes to the
 * live site without a rebuild: an `afterChange` hook maps the changed document
 * to its public path(s) and revalidates them. Pure path mapping is separated
 * from the framework call so it can be reasoned about and reused.
 */

/** Map a content collection + slug to the public path(s) that must revalidate. */
export function pathsForContent(collection: string, slug: string | null): string[] {
  const paths = new Set<string>(['/', '/sitemap.xml']);
  switch (collection) {
    case 'guides':
      if (slug) paths.add(`/guides/${slug}`);
      break;
    case 'faqs':
      // FAQs surface on the home and service pages.
      paths.add('/services');
      break;
    case 'legal-pages':
      if (slug) paths.add(`/${slug}`);
      break;
    default:
      if (slug) paths.add(`/${collection}/${slug}`);
  }
  return [...paths];
}
