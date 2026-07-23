import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { Users } from './collections/Users';
import { Guides } from './collections/Guides';
import { Faqs } from './collections/Faqs';
import { LegalPages } from './collections/LegalPages';
import { Redirects } from './collections/Redirects';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/**
 * Payload 3 configuration.
 *
 * Sprint 0 establishes the CMS foundation: the Postgres (PostGIS) adapter,
 * authentication via the Users collection, and the generated-types contract
 * shared between CMS and frontend. Content collections, the BC8 proof gate,
 * media validation and RLS wiring land in the CMS sprint (§4). PostGIS and the
 * database constraints are created in the schema sprint's first migration.
 */
export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
  },
  collections: [Users, Guides, Faqs, LegalPages, Redirects],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET ?? '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    // UUID ids so Payload-owned content lines up with operational UUID
    // references (decision T-010).
    idType: 'uuid',
    pool: { connectionString: process.env.DATABASE_URL ?? '' },
    // Schema changes are applied via committed migrations (expand/contract).
    push: false,
  }),
});
