# Decisions Log (Architecture & Business Decision Record)

**Project:** Kent Limousines — Luxury Ground Transport Platform
**Purpose:** This log records every decision that amends or clarifies the _Technical Implementation Specification v1.0_ (`docs/specification/technical-implementation-specification-v1.0.docx`).

> **Single source of truth:** the Specification v1.0 **plus this log**, read together. Where the two conflict, **this log wins** — it is the more recent, agreed position. Every future material decision is appended here with a date and rationale.

**Legend:** ✅ Accepted · 🟡 Proposed (proceeding unless vetoed) · ⏳ Open (awaiting input)

---

## Business decisions

### D-001 — Adopt all four engineering improvements ✅

**Date:** 2026-07-23 · **Decided by:** MD · **Status:** Accepted

All four Phase-1 improvements are adopted:

1. **Prove tenant isolation** — a `withTenant` request-context helper that sets `app.tenant_id` via `SET LOCAL` inside every transaction, a dedicated non-`BYPASSRLS` application DB role, and an automated "hostile-tenant" integration test that attempts a cross-tenant read and must fail. (Sprint 1)
2. **One scheduler (Inngest)** — all deferred/scheduled work runs through Inngest; Payload's job queue is used only where Payload itself requires it. (Ongoing)
3. **Feature-flag / config service** — a small DB-backed, Redis-cached flag service powering integration kill-switches, graceful degradation, and later A/B experiments. (Sprint 1, extended as needed)
4. **Enquiry trace IDs** — a correlation ID threaded from Server Action → DB transaction → Inngest events → messaging, with structured, PII-scrubbed logging on the enquiry critical path. (Sprint 5)

**Rationale:** Directly serve the stated priorities — franchise-safe scalability, reliable lead capture, clean operability — for ~3–4 days of total effort.

---

### D-002 — VAT treatment: no VAT charged ✅

**Date:** 2026-07-23 · **Decided by:** MD · **Status:** Accepted

The business's services are treated as **VAT-exempt — no VAT is charged on any service**. Consequences for the build:

- **No VAT line** anywhere on customer-facing or corporate pricing; the displayed price is the full price paid.
- **Margin floor (BC3, 35%)** is computed on the **full price** (no VAT to strip; gross = net).
- **Future-proofing:** the data model still stores `net`, `vat`, `gross` with **VAT rate defaulted to 0%**, so if circumstances ever change (VAT registration, or adding 10+ seat vehicles under a different regulatory model) it is a configuration change, not a schema migration.

**Advisory note (not a blocker):** HMRC standard-rates passenger transport in vehicles under 10 seats; zero-rating applies only to 10+ seat vehicles. This treatment is correct where the business is below the VAT-registration threshold. To be confirmed by the client's accountant; the platform is built to the client's instruction either way, and the VAT-capable model makes any future change cheap.

---

### D-003 — Brand and domain ✅

**Date:** 2026-07-23 · **Decided by:** MD · **Status:** Accepted

- **Brand name:** Kent Limousines
- **Primary domain:** `kentlimousines.co.uk`

This fixes the URL taxonomy (permanent once indexed) and the tenant's public identity. A strong exact-match local brand for Kent SEO.

**Housekeeping (non-blocking):** secure matching social handles; run a trademark check. If the `.com` is also owned, 301-redirect it to the `.co.uk` primary to consolidate SEO authority. **Franchise note:** the brand is Kent-anchored; nationwide expansion / franchising will trade under their own local brands, which the multi-tenant model (D3) already supports — no schema impact.

---

### D-004 — Rate card and cost inputs: build against a documented placeholder ✅

**Date:** 2026-07-23 · **Decided by:** MD · **Status:** Accepted

The client does not yet have a finalised rate card. The pricing engine (Sprint 3) and quote flow (Sprint 4) will be **built and fully tested against a documented, clearly-labelled placeholder rate card and cost model**. Real figures are **configuration, not code**, and will be swapped in before go-live.

**Deliverable:** engineering will provide a fill-in **rate-card + cost-inputs template** for the client to complete (with operations and accountant). Real figures are required before launch to enforce BC3 with true costs.

**Real figures still required before go-live:** base rates (service × vehicle × duration), zone/season/day multipliers, add-on prices, pass-through charges, and the confidential cost inputs (fuel/mile, chauffeur/hour, dead-mile cost, maintenance, insurance, overhead), plus deposit % and cancellation terms (see OI-4).

---

## Technical decisions (engineering-led)

These were presented in Phase 1 as "engineering will decide with a recommendation unless you object." They are proceeding as recommended; the MD may veto any at the pre-Sprint-0 approval.

| Ref   | Decision                                                                                                                                                                                                                                                                                                                              | Rationale                                                                                                                                                                                                                                                                                   | Status      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| T-001 | **Generate UUIDv7 IDs in the application** (not `DEFAULT uuidv7()`)                                                                                                                                                                                                                                                                   | `uuidv7()` is not built into Postgres 16; app-side generation is portable and test-friendly, with a DB default only where the `pg_uuidv7` extension is available.                                                                                                                           | 🟡 Proposed |
| T-002 | **Lookup tables** for growable sets (`service_type`, `vehicle_category`); **native enums** for fixed regulatory sets (e.g. `resource_type`, `consent_channel`)                                                                                                                                                                        | Enums cannot be reordered/removed and can't vary per tenant; §19 plans to grow these sets and franchises may differ.                                                                                                                                                                        | 🟡 Proposed |
| T-003 | **Cloudflare for DNS, WAF, bot management, R2**; serve the app hostname to **Vercel directly (DNS-only / grey cloud)**                                                                                                                                                                                                                | Avoids double-caching that fights Vercel ISR and image optimization; keeps Cloudflare's security and zero-egress asset storage. Confirm at DNS setup.                                                                                                                                       | 🟡 Proposed |
| T-004 | **Quote event-date horizon:** 36 months for weddings, 24 months for other services                                                                                                                                                                                                                                                    | Some weddings book 2–3 years out; other occasions rarely do.                                                                                                                                                                                                                                | 🟡 Proposed |
| T-005 | **`passengerCount` accepts 9+** to trigger the multi-vehicle / human-routing branch (BC1); only the _single-vehicle quote_ is blocked, not the input                                                                                                                                                                                  | Otherwise the explanatory 9+ branch could never render.                                                                                                                                                                                                                                     | 🟡 Proposed |
| T-006 | **Sitewide-unique `primaryKeyword`** enforced via a shared `page_keywords` table with a DB `UNIQUE(tenant_id, keyword)` constraint                                                                                                                                                                                                    | Payload's per-collection `unique` cannot enforce uniqueness across ~10 collections; this centralises the cannibalisation control.                                                                                                                                                           | 🟡 Proposed |
| T-007 | **Proof-gate thresholds defined for every gated collection**; the gate **fails closed** (blocks publish) if a collection has no threshold entry                                                                                                                                                                                       | §4.1 marks collections gated that §4.2 leaves without thresholds.                                                                                                                                                                                                                           | 🟡 Proposed |
| T-008 | **Lighthouse gating (Sprint 0):** performance score ≥0.90, CLS ≤0.05, accessibility =100 and byte budgets are hard errors now; absolute **LCP<1.8s and TBT are warnings** until the performance milestone (§7.6) lands edge-ISR caching + critical-CSS inlining, then flip to hard errors                                             | Enforcing an absolute lab-LCP on a placeholder page before the CWV optimisations exist would be a flaky, misleading gate; the perf score already incorporates LCP.                                                                                                                          | 🟡 Proposed |
| T-009 | **DB-first schema ownership:** our SQL migration runner owns the complete schema (reference + operational tables) with full control of PostGIS, CHECK/EXCLUDE constraints and RLS. Payload runs with `push:false` and its admin is mapped onto these tables in the CMS sprint (§4), rather than Payload auto-creating parallel tables | One migration system, one source of truth; lets BC1–BC5/BC9 be enforced and tested as real DB constraints now with full referential integrity, and avoids two migration systems fighting over the same tables. Sprint 2 aligns Payload collection field/table names to the existing schema. | 🟡 Proposed |

---

### T-010 — CMS persistence: Payload owns content collections (amends T-009) 🟡

**Date:** 2026-07-23 · **Status:** Proposed (proceeding)

Payload (the CMS) is designed to own its tables — its admin UI, drafts, versioning,
relationships and the publish proof-gate all assume it manages storage. Forcing it
onto hand-built tables fights the framework and risks fragility. So:

- **Payload owns** the editorial/content collections (pure content — guides, FAQs,
  case studies, occasions, comparisons, legal/landing pages, redirects, GBP posts —
  and, in the follow-on reference-entity step, services, locations, venues, routes,
  vehicles, airports, media). Payload is configured with **UUID ids** so operational
  references line up. Content-table constraints (e.g. BC1 vehicle capacity, PostGIS
  pricing columns, RLS on content tables) are re-applied via a follow-on migration.
- **Our SQL migrations keep owning** the operational tables (bookings, enquiries,
  quotes, resources, payments, customers…) with their proven BC1–BC5/BC9 constraints
  and RLS — unchanged.
- Operational→content references are soft UUID columns (app-level integrity), or FKs
  re-added after Payload's migrations run.

**Sequencing:** the pure-content collections + shared hooks (proof gate, media
validation, access, keyword uniqueness) land first (no collision with Sprint 1
tables); the reference entities (venues et al.) transition in a dedicated,
re-verified step so the proven operational schema is never destabilised.

The pure proof-gate / media / access domain logic is reused unchanged either way.

---

### T-011 — Payments: a `PaymentProvider` boundary with a stub, Stripe behind it 🟡

**Date:** 2026-07-24 · **Status:** Proposed (proceeding)

The booking flow depends on a `PaymentProvider` interface (create deposit intent,
refund, verify + parse webhook), never on Stripe directly — the same seam the
messaging pipeline uses for `Notifier`. A stub implements it with the **same
semantics** Stripe has: intent/refund identifiers, booking-keyed idempotency, and
HMAC-signed webhooks in Stripe's `t=…,v1=…` scheme (constant-time verify, replay
window). This makes the whole deposit → confirm → refund path testable with no
live keys, and the real `StripePaymentProvider` is a drop-in for the integrations
sprint (OI-12). The webhook route reads the **raw body** and verifies before
parsing; signature verification fails closed (HTTP 400, nothing processed).

**Deposit terms are a documented placeholder** (`PLACEHOLDER_DEPOSIT_POLICY`: 20%,
£50 minimum, balance due 14 days before pickup) pending the client's real terms
(OI-6) — configuration, not code, exactly like the rate card (D-004).

**BC5 fulfilment guarantee:** resource locks are taken inside a `SAVEPOINT` in the
deposit-confirmation transaction. If the `EXCLUDE` constraint fires (a concurrent
booking took the vehicle/chauffeur), the locks roll back to the savepoint, the
booking is cancelled `resource_unavailable`, and the captured deposit is
**automatically refunded** — the platform never holds money it cannot fulfil. The
webhook is idempotent, including re-driving a refund that was recorded-as-owed but
whose provider call had not yet completed.

## Open items still outstanding

Resolved so far: OI (brand/domain) → D-003; VAT → D-002; rate-card approach → D-004. Remaining, none blocking Sprint 0 or Sprint 1:

| Ref   | Item                                                                                                             | Needed by                                    | Owner                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------- |
| OI-2  | Real rate card figures                                                                                           | Before go-live (placeholder used until then) | Client + Accountant                    |
| OI-3  | Real cost inputs                                                                                                 | Before go-live (BC3 with true costs)         | Client + Accountant                    |
| OI-4  | Licensing authority + operator licence number                                                                    | Tenant seeding / published on every page     | Client                                 |
| OI-5  | Fleet inventory with verified seat counts                                                                        | BC1 seeding; fleet pages                     | Client                                 |
| OI-6  | Deposit % + cancellation terms                                                                                   | Booking logic (Sprint 7)                     | Client                                 |
| OI-7  | Brand palette (colours)                                                                                          | Design system; must pass contrast            | Client                                 |
| OI-8  | Launch service area (towns, venues, routes)                                                                      | Initial page set / sitemap                   | Client + Engineering                   |
| OI-9  | Operating hours + out-of-hours policy                                                                            | LocalBusiness schema, SLA clocks             | Client                                 |
| OI-10 | Phone number(s) + call-tracking provider                                                                         | DNI call tracking                            | Client                                 |
| OI-11 | Follow-up cadence for 5 journey variants                                                                         | Nurture/SLA (Sprint 5/11)                    | Engineering proposes → Client approves |
| OI-12 | Vendor account ownership (Vercel, Neon, Cloudflare, Stripe, Resend, Twilio, WhatsApp/Meta, Sentry, Google, Meta) | Various; several have lead time              | Client + Engineering                   |

---

## Change history

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-23 | Log created. Recorded D-001…D-004 (accepted) and T-001…T-007 (proposed). Remaining open items catalogued.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-07-23 | D-003 corrected: primary domain is `kentlimousines.co.uk` (was `.com`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-07-23 | Sprint 0 delivered (foundation, CI, Payload wiring). Added T-008 (Lighthouse gating).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-07-23 | Sprint 1 delivered (schema, BC1–BC5/BC9 constraints, RLS, seed, integration tests). Added T-009 (DB-first schema ownership).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-07-23 | Sprint 2 (part 1): proof-gate/media/access domain logic + Payload content collections & hooks. Added T-010 (Payload owns content collections; reference-entity transition to follow).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-07-23 | Sprint 3: pricing engine (calculateQuote, cost model, BC3 margin floor) — pure, 100% branch coverage — against the placeholder rate card (D-004). CMS reference-entity transition deferred to the page-templates milestone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-07-23 | Sprint 4: shared Zod quote schema, submitQuote Server Action, atomic lead-capture transaction (write-once first-touch, BC9 next-action, enquiry/created event), geocoder stub, quote UI. Domain events recorded to audit now; async Inngest dispatch in Sprint 5.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-07-23 | Sprint 5: Inngest client/functions/route; enquiryCreated (instant response + owner alert) and slaEnforcement workflows; BC6 message-class send gate (notifier stub); pure SLA logic; trace IDs (D-001). Notifier providers (Resend/Twilio) and quoted/follow_up SLA dwell (OI-11) still pending.                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-07-24 | Sprint 6: safeguarding & capacity rules (pure `capacityDecision`/`canTakeDeposit`, BC1/BC2). Enquiry critical path branches a 9+ party to `captureMultiVehicleLead` (lead captured, no quote fabricated, routed to a human) and captures the parent/guardian as a linked contact on minors bookings (`parent_contact_id`, `under_18_passengers`). Quote UI reveals a conditional guardian fieldset; deposit remains gated on guardian verification (a later, deliberate step).                                                                                                                                                                                                                       |
| 2026-07-24 | Sprint 7: booking & deposit critical path (T-011). `PaymentProvider` boundary + Stripe-semantics stub (HMAC webhook, idempotency); pure deposit split + resource plan (turnaround buffer, BC4 backup guard); `createBookingFromQuote` (BC2 deposit gate) and `confirmDepositAndAssign` (SAVEPOINT resource locks → BC5 exclusion → cancel + auto-refund). Raw-body webhook route. Inngest `depositPaid` confirmation. Deposit terms placeholder pending OI-6.                                                                                                                                                                                                                                        |
| 2026-07-24 | Sprint 8: pre-service ladder & dispatch. Pure `preServiceSchedule` (balance −7d, itinerary −48h, chauffeur disclosure −24h, en-route −2h; drops past milestones for late bookings). Durable Inngest `preService` sleeps to each milestone and sends transactional touches (BC6). Balance capture (`createBalanceIntent`/`confirmBalancePaid`, idempotent; webhook now handles `balance.succeeded`); `dispatchJourney` creates one journey per booking and moves it to `in_service`. Chauffeur disclosure resolves the assigned (non-backup) chauffeur.                                                                                                                                               |
| 2026-07-24 | Sprint 9: public site & SEO engine. Pure builders — JSON-LD (LocalBusiness/LimousineService, Service, FAQPage, BreadcrumbList, AggregateRating, WebPage), metadata + canonical, segmented sitemap, orphan-free internal linking. Homepage + `/services/[service]` templates with `generateStaticParams`, `dynamicParams=false` (no soft-404 farm, F14), per-page structured data, ISR (1h). `sitemap.xml`, `robots.txt`, on-demand revalidation (Payload `afterChange` hook on content collections + secret-guarded `/api/revalidate`). Service copy is documented placeholder pending CMS reference-entity transition; town/venue/route population depends on OI-8.                                 |
| 2026-07-24 | Sprint 10: never-forgotten-lead sweep + dead-letter queue (BC9, §13). Migration 0002 adds `dead_letters` (tenant RLS, open/resolved/ignored, resolution CHECK). Pure attention rules (open-stage set, overdue severity, urgency sort, empty-by-18:00 `isClear`). `findNeedsAttention` aggregates overdue leads, stalled deposits and open dead-letters ranked most-urgent-first; `sweepOrphans` re-drives overdue open leads (fresh action window + audit activity); `recordDeadLetter`/`resolveDeadLetter`. Hourly Inngest `attentionSweep` cron; secret-guarded `/api/internal/needs-attention` (rich admin dashboard UI binds in Sprint 12).                                                      |
| 2026-07-24 | Sprint 11: growth engines (§10, §12). Pure per-variant nurture cadences (`dueNurtureTouches` resumes exactly where it left off), review rules (eligibility window, one-decimal `aggregateRating` returning null for none, response SLA), referral rules (deterministic code, self-referral rejection, qualification). Durable Inngest `nurtureLadder` (stops on conversion), `reviewRequest` (settle +1d), `referralQualification` off `booking/deposit.paid`. Services: `enterNurture`/`sendDueNurture`, `requestReview`/`recordReview`/`tenantAggregateRating`, `issue`/`redeem`/`qualify`/`fulfil` referral, `completeBooking`. Nurture/reward figures are documented placeholders pending OI-11. |
| 2026-07-24 | Sprint 12: reporting, hardening & launch readiness (§13–14). Pure KPIs (`conversionRate`/`funnelRates`/`revenueMetrics`, zero-safe) + `dashboardMetrics` service; migration 0003 `reporting_funnel` view for Looker Studio. Security: middleware headers (HSTS, X-Frame-Options, nosniff, Referrer/Permissions-Policy) with **Report-Only CSP** (tuned during UAT); per-IP fixed-window quote rate limit (pure `rateLimit` + process-local store). `docs/LAUNCH-READINESS.md`: DoD status, §13.9 alerting spec, runbooks, OI-12 vendor cutover, go-live sign-off gate. Core build (Sprints 0–12) complete; remaining is client/vendor input + manual UAT sign-offs.                                  |
