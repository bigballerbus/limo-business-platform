/**
 * Programmatic internal linking (spec §7) — pure logic.
 *
 * A large programmatic site risks orphan pages (nothing links to them) and thin
 * hubs (nothing links out). This picks contextual related links for a page from
 * a candidate pool, ranked by shared facets (service, area), so every generated
 * page both links out and, reciprocally, becomes a link target. The zero-orphan
 * guarantee is a launch gate (§7 SEO); this is the mechanism behind it.
 */

export interface LinkableEntity {
  path: string;
  title: string;
  /** Facets used to score relatedness, e.g. { service: 'wedding', area: 'maidstone' }. */
  facets: Record<string, string>;
}

export interface RelatedLink {
  path: string;
  title: string;
  score: number;
}

/**
 * Rank `candidates` by how many facets they share with `current`, drop the
 * current page itself and anything with no overlap, and return the top `limit`.
 * Ties break by title for deterministic output (stable across builds).
 */
export function relatedLinks(
  current: LinkableEntity,
  candidates: readonly LinkableEntity[],
  limit = 6,
): RelatedLink[] {
  const currentFacets = Object.entries(current.facets);
  return candidates
    .filter((c) => c.path !== current.path)
    .map((c) => ({
      path: c.path,
      title: c.title,
      score: currentFacets.reduce((n, [k, v]) => n + (c.facets[k] === v ? 1 : 0), 0),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/**
 * Identify orphans: entities that no other entity links to under `relatedLinks`.
 * Used by the SEO regression suite to fail the build if any page is unreachable
 * through the internal-link graph.
 */
export function findOrphans(entities: readonly LinkableEntity[], limit = 6): string[] {
  const linkedTo = new Set<string>();
  for (const entity of entities) {
    for (const link of relatedLinks(entity, entities, limit)) {
      linkedTo.add(link.path);
    }
  }
  return entities.filter((e) => !linkedTo.has(e.path)).map((e) => e.path);
}
