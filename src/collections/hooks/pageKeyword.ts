import type { Pool } from 'pg';
import type {
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  PayloadRequest,
} from 'payload';

/**
 * Sitewide-unique primaryKeyword — the cannibalisation control (decision T-006).
 *
 * Payload's per-collection `unique` cannot span collections, so ownership of each
 * keyword is recorded in the `page_keywords` table, whose `UNIQUE (tenant_id,
 * keyword)` constraint is the real guarantee. `enforceUniqueKeyword` blocks a
 * save that would claim a keyword owned by another page; `recordKeyword` writes
 * the ownership after a successful save.
 *
 * Until per-document tenancy lands with the reference-entity step, the tenant is
 * resolved as the sole seeded tenant (single-tenant launch); the code upgrades to
 * `data.tenant` with no change to the guarantee.
 */
function pool(req: PayloadRequest): Pool {
  return (req.payload.db as unknown as { pool: Pool }).pool;
}

async function resolveTenantId(
  req: PayloadRequest,
  data: Record<string, unknown>,
): Promise<string | null> {
  const fromDoc = data.tenant;
  if (typeof fromDoc === 'string') return fromDoc;
  const r = await pool(req).query<{ id: string }>(
    'SELECT id FROM tenants ORDER BY created_at LIMIT 1',
  );
  return r.rows[0]?.id ?? null;
}

export const enforceUniqueKeyword =
  (collectionSlug: string): CollectionBeforeValidateHook =>
  async ({ data, originalDoc, req }) => {
    const keyword = (data?.primaryKeyword as string | undefined)?.trim();
    if (!keyword) return data;
    const tenantId = await resolveTenantId(req, data ?? {});
    if (!tenantId) return data;

    const ownerId = (data?.id ?? originalDoc?.id) as string | undefined;
    const clash = await pool(req).query(
      `SELECT 1 FROM page_keywords
       WHERE tenant_id = $1 AND lower(keyword) = lower($2)
         AND NOT (owner_collection = $3 AND owner_id = $4)
       LIMIT 1`,
      [tenantId, keyword, collectionSlug, ownerId ?? '00000000-0000-0000-0000-000000000000'],
    );
    if ((clash.rowCount ?? 0) > 0) {
      throw new Error(
        `The keyword "${keyword}" is already used by another page. Keywords are unique sitewide.`,
      );
    }
    return data;
  };

export const recordKeyword =
  (collectionSlug: string): CollectionAfterChangeHook =>
  async ({ doc, req }) => {
    const keyword = (doc?.primaryKeyword as string | undefined)?.trim();
    if (!keyword || !doc?.id) return doc;
    const tenantId = await resolveTenantId(req, doc as Record<string, unknown>);
    if (!tenantId) return doc;

    await pool(req).query(
      `INSERT INTO page_keywords (tenant_id, keyword, owner_collection, owner_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, keyword)
       DO UPDATE SET owner_collection = EXCLUDED.owner_collection, owner_id = EXCLUDED.owner_id`,
      [tenantId, keyword, collectionSlug, doc.id],
    );
    return doc;
  };
