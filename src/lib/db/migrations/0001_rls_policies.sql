-- ============================================================================
-- 0001 — Row-Level Security (D3 / decision D-001)
--
-- Tenant isolation is enforced by Postgres, not application code. The app
-- connects as a dedicated non-owner, non-BYPASSRLS role; every tenant-scoped
-- table denies rows whose tenant_id does not match app.tenant_id (set per
-- transaction by withTenant). If the setting is absent, policies deny all rows
-- (fail closed).
-- ============================================================================

-- ── Application role ────────────────────────────────────────────────────────
-- Local/CI dev credential only. In production the app role is provisioned by
-- infrastructure with a real secret; this guarded block is a no-op if it exists.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kentlimos_app') THEN
    CREATE ROLE kentlimos_app LOGIN PASSWORD 'kentlimos_app'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO kentlimos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kentlimos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kentlimos_app;

-- audit_logs is append-only for everyone, including the app role.
REVOKE UPDATE, DELETE ON audit_logs FROM kentlimos_app;
-- schema_migrations is owned by the migration process only.
REVOKE ALL ON schema_migrations FROM kentlimos_app;

-- ── Tenant isolation on every tenant-scoped table ───────────────────────────
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'locations','venues','vehicles','routes','staff','customers','accounts',
    'consents','enquiries','quotes','partners','bookings','booking_resources',
    'payments','journeys','journey_events','reviews','media','proof_assets',
    'promotions','referrals','notifications','activities','page_keywords'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
      || 'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;

-- tenants: a tenant sees only its own row (keyed on id, not tenant_id).
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- audit_logs: tenant rows are isolated; system rows (tenant_id IS NULL) are shared.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
