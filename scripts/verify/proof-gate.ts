/**
 * End-to-end proof-gate (BC8) verification via Payload's Local API.
 *
 * Run as a standalone script (not under Vitest, which is sensitive to Payload's
 * async boot): proves a compliant guide publishes, an underfed one is rejected,
 * a near-duplicate is rejected on similarity, and the keyword is recorded.
 *
 *   pnpm verify:proof-gate
 */
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { getPayload } from 'payload';
import config from '../../src/payload.config';

function lexicalBody(text: string): unknown {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          direction: 'ltr',
          textFormat: 0,
          children: [
            { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text, version: 1 },
          ],
        },
      ],
    },
  };
}

const LONG = Array.from({ length: 1300 }, (_, i) => `word${i % 40}`).join(' ');
const IMAGES = [
  { url: 'wedding-car-at-leeds-castle.jpg', alt: 'Wedding car outside Leeds Castle' },
  { url: 'chauffeur-opening-door-kent.jpg', alt: 'Chauffeur opening the door in Kent' },
];

function guide(over: Record<string, unknown> = {}): Record<string, unknown> {
  const s = randomUUID().slice(0, 8);
  return {
    title: `Guide ${s}`,
    slug: `guide-${s}`,
    primaryKeyword: `verify keyword ${s}`,
    metaTitle: `Guide ${s} | Kent Limousines`,
    metaDescription: `A guide ${s} to luxury wedding transport across Kent and the South East.`,
    images: IMAGES,
    body: lexicalBody(LONG),
    _status: 'draft',
    ...over,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.warn(`  ✓ ${message}`);
}

interface LocalApi {
  create(o: unknown): Promise<{ id: string; _status?: string }>;
  update(o: unknown): Promise<{ id: string; _status?: string }>;
  delete(o: unknown): Promise<unknown>;
}

async function main(): Promise<void> {
  const payload = await getPayload({ config });
  const p = payload as unknown as LocalApi;
  const pool = (payload.db as unknown as { pool: Pool }).pool;
  const created: string[] = [];
  try {
    await pool.query(
      `INSERT INTO tenants (name, slug, base_location, licensing_authority, operator_licence_no, licence_expiry)
       VALUES ('Verify Tenant','verify-tenant', ST_SetSRID(ST_MakePoint(0.52,51.27),4326)::geography,'A','L','2030-01-01')
       ON CONFLICT (slug) DO NOTHING`,
    );

    // 1. Compliant guide publishes and records its keyword.
    const ok = await p.create({ collection: 'guides', data: guide(), overrideAccess: true });
    created.push(String(ok.id));
    const published = await p.update({
      collection: 'guides',
      id: ok.id,
      data: { _status: 'published' },
      overrideAccess: true,
    });
    assert(published._status === 'published', 'compliant guide publishes');
    const kw = await pool.query('SELECT 1 FROM page_keywords WHERE owner_id = $1', [String(ok.id)]);
    assert(kw.rowCount === 1, 'keyword recorded in page_keywords');

    // 2. Underfed guide is rejected.
    const thin = await p.create({
      collection: 'guides',
      data: guide({ images: [], body: lexicalBody('too short') }),
      overrideAccess: true,
    });
    created.push(String(thin.id));
    let blocked = false;
    try {
      await p.update({
        collection: 'guides',
        id: thin.id,
        data: { _status: 'published' },
        overrideAccess: true,
      });
    } catch (e) {
      blocked = /proof gate/i.test((e as Error).message);
    }
    assert(blocked, 'underfed guide is blocked by the proof gate');

    // 3. Near-duplicate is rejected on similarity.
    const dup = await p.create({ collection: 'guides', data: guide(), overrideAccess: true });
    created.push(String(dup.id));
    let dupBlocked = false;
    try {
      await p.update({
        collection: 'guides',
        id: dup.id,
        data: { _status: 'published' },
        overrideAccess: true,
      });
    } catch (e) {
      dupBlocked = /similar/i.test((e as Error).message);
    }
    assert(dupBlocked, 'near-duplicate guide is blocked on similarity');

    console.warn('\n✅ Proof gate verified end to end.');
    for (const id of created) {
      await p.delete({ collection: 'guides', id, overrideAccess: true }).catch(() => undefined);
    }
    await pool
      .query("DELETE FROM page_keywords WHERE keyword LIKE 'verify keyword %'")
      .catch(() => undefined);
  } finally {
    await (payload as unknown as { destroy?: () => Promise<void> }).destroy?.();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
