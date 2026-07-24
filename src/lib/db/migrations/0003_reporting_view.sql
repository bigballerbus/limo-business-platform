-- ============================================================================
-- 0003 — Reporting view (spec §14)
--
-- A per-tenant, per-day funnel rollup for external BI (Looker Studio via a
-- read-only federated connection). The in-app real-time dashboard uses the
-- reporting service instead; this view is the stable, documented shape BI tools
-- bind to, so dashboards do not couple to the operational table layout.
--
-- The view keeps tenant_id in every row so a read-only reporting role can be
-- constrained per tenant, and it aggregates only non-PII counts and sums.
-- ============================================================================

CREATE VIEW reporting_funnel AS
WITH enq AS (
  SELECT tenant_id,
         date_trunc('day', created_at) AS day,
         count(*) AS enquiries,
         count(*) FILTER (WHERE quoted_value_pence IS NOT NULL) AS quoted
    FROM enquiries
   GROUP BY tenant_id, date_trunc('day', created_at)
),
bk AS (
  SELECT tenant_id,
         date_trunc('day', created_at) AS day,
         count(*) AS booked,
         count(*) FILTER (WHERE status = 'completed') AS completed,
         COALESCE(sum(total_pence), 0) AS booked_value_pence,
         COALESCE(sum(total_pence) FILTER (WHERE status = 'completed'), 0) AS completed_value_pence
    FROM bookings
   GROUP BY tenant_id, date_trunc('day', created_at)
)
SELECT COALESCE(enq.tenant_id, bk.tenant_id) AS tenant_id,
       COALESCE(enq.day, bk.day)             AS day,
       COALESCE(enq.enquiries, 0)            AS enquiries,
       COALESCE(enq.quoted, 0)               AS quoted,
       COALESCE(bk.booked, 0)                AS booked,
       COALESCE(bk.completed, 0)             AS completed,
       COALESCE(bk.booked_value_pence, 0)    AS booked_value_pence,
       COALESCE(bk.completed_value_pence, 0) AS completed_value_pence
  FROM enq
  FULL OUTER JOIN bk ON enq.tenant_id = bk.tenant_id AND enq.day = bk.day;

GRANT SELECT ON reporting_funnel TO kentlimos_app;
