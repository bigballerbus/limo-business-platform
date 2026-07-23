/**
 * SQL migration runner.
 *
 * The operational schema is authored as hand-written SQL (full control over
 * PostGIS types, EXCLUDE constraints and RLS — things an ORM generator cannot
 * express) and applied in filename order. Applied files are recorded in
 * `schema_migrations`, so re-runs are no-ops. Migrations run as the database
 * owner via DATABASE_URL.
 *
 * Usage:
 *   tsx scripts/db/migrate.ts            # apply pending migrations
 *   tsx scripts/db/migrate.ts --fresh    # drop schema then reapply (dev/CI only)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '../../src/lib/db/migrations');

async function main(): Promise<void> {
  const fresh = process.argv.includes('--fresh');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required to run migrations');

  const client = new Client({ connectionString });
  await client.connect();
  try {
    if (fresh) {
      console.warn('⚠️  --fresh: dropping and recreating schema "public"');
      await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (await client.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
        (r) => r.filename,
      ),
    );

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      process.stdout.write(`→ applying ${file} ... `);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.warn('done');
        count += 1;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`\n✗ migration ${file} failed`);
        throw error;
      }
    }

    console.warn(count === 0 ? 'No pending migrations.' : `Applied ${count} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
