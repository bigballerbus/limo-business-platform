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

| Ref   | Decision                                                                                                                                                       | Rationale                                                                                                                                                         | Status      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| T-001 | **Generate UUIDv7 IDs in the application** (not `DEFAULT uuidv7()`)                                                                                            | `uuidv7()` is not built into Postgres 16; app-side generation is portable and test-friendly, with a DB default only where the `pg_uuidv7` extension is available. | 🟡 Proposed |
| T-002 | **Lookup tables** for growable sets (`service_type`, `vehicle_category`); **native enums** for fixed regulatory sets (e.g. `resource_type`, `consent_channel`) | Enums cannot be reordered/removed and can't vary per tenant; §19 plans to grow these sets and franchises may differ.                                              | 🟡 Proposed |
| T-003 | **Cloudflare for DNS, WAF, bot management, R2**; serve the app hostname to **Vercel directly (DNS-only / grey cloud)**                                         | Avoids double-caching that fights Vercel ISR and image optimization; keeps Cloudflare's security and zero-egress asset storage. Confirm at DNS setup.             | 🟡 Proposed |
| T-004 | **Quote event-date horizon:** 36 months for weddings, 24 months for other services                                                                             | Some weddings book 2–3 years out; other occasions rarely do.                                                                                                      | 🟡 Proposed |
| T-005 | **`passengerCount` accepts 9+** to trigger the multi-vehicle / human-routing branch (BC1); only the _single-vehicle quote_ is blocked, not the input           | Otherwise the explanatory 9+ branch could never render.                                                                                                           | 🟡 Proposed |
| T-006 | **Sitewide-unique `primaryKeyword`** enforced via a shared `page_keywords` table with a DB `UNIQUE(tenant_id, keyword)` constraint                             | Payload's per-collection `unique` cannot enforce uniqueness across ~10 collections; this centralises the cannibalisation control.                                 | 🟡 Proposed |
| T-007 | **Proof-gate thresholds defined for every gated collection**; the gate **fails closed** (blocks publish) if a collection has no threshold entry                | §4.1 marks collections gated that §4.2 leaves without thresholds.                                                                                                 | 🟡 Proposed |

---

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

| Date       | Change                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| 2026-07-23 | Log created. Recorded D-001…D-004 (accepted) and T-001…T-007 (proposed). Remaining open items catalogued. |
| 2026-07-23 | D-003 corrected: primary domain is `kentlimousines.co.uk` (was `.com`).                                   |
