import { z } from 'zod';

/**
 * Environment-variable contract, validated at startup.
 *
 * Fail fast: a missing or malformed variable throws here rather than surfacing
 * as an obscure runtime error deep in a request. Server-only secrets and
 * public (NEXT_PUBLIC_*) values are separated so client bundles can never read
 * a secret.
 *
 * Variables are added to these schemas as each integration lands in its sprint;
 * the schema is the single source of truth for what the app requires to run.
 */

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Owner Postgres connection — migrations and seeds (Neon in cloud, Docker locally). */
  DATABASE_URL: z.string().url().optional(),
  /**
   * Application Postgres connection — a non-owner, non-BYPASSRLS role so RLS is
   * enforced at runtime (D3). Falls back to DATABASE_URL if unset.
   */
  APP_DATABASE_URL: z.string().url().optional(),
  /** Payload signing secret. Required once the CMS is wired (Payload sprint). */
  PAYLOAD_SECRET: z.string().min(32).optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

function format(error: z.ZodError): string {
  return error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
}

const serverParsed = serverSchema.safeParse(process.env);
if (!serverParsed.success) {
  throw new Error(`Invalid server environment variables:\n${format(serverParsed.error)}`);
}

const clientParsed = clientSchema.safeParse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
if (!clientParsed.success) {
  throw new Error(`Invalid public environment variables:\n${format(clientParsed.error)}`);
}

export const serverEnv = serverParsed.data;
export const clientEnv = clientParsed.data;
