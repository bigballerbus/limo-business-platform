-- ============================================================================
-- 0002 — Dead-letter queue (spec §13, Milestone F)
--
-- The failure-visibility backbone for the never-forgotten-lead guarantee (BC9).
-- Any async step that exhausts its retries (a webhook that never confirmed, a
-- message that could not send, an event a consumer rejected) records a
-- dead-letter here instead of failing silently. The attention sweep surfaces
-- open dead-letters on the Needs-Attention dashboard, which must be empty by
-- 18:00 each day.
-- ============================================================================

CREATE TYPE dead_letter_status_enum AS ENUM ('open', 'resolved', 'ignored');

CREATE TABLE dead_letters (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  source       text NOT NULL,                       -- e.g. 'payment_webhook', 'messaging', 'inngest'
  reference    text,                                -- domain id the failure relates to (booking, enquiry…)
  error        text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  status       dead_letter_status_enum NOT NULL DEFAULT 'open',
  attempts     integer NOT NULL DEFAULT 1,
  resolved_by  uuid REFERENCES staff(id),
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- A resolved/ignored row must record when it left the queue.
  CONSTRAINT dead_letter_resolution CHECK (
    status = 'open' OR resolved_at IS NOT NULL
  )
);

-- The dashboard reads open items per tenant, newest first.
CREATE INDEX dead_letters_open_idx ON dead_letters (tenant_id, created_at DESC)
  WHERE status = 'open';

-- Tenant isolation, consistent with every other operational table (0001).
GRANT SELECT, INSERT, UPDATE, DELETE ON dead_letters TO kentlimos_app;
ALTER TABLE dead_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dead_letters
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
