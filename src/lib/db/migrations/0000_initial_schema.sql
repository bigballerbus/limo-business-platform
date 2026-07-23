-- ============================================================================
-- 0000 — Initial schema
--
-- Authoritative DDL for Kent Limousines. Money is always integer pence. Every
-- tenant-scoped table carries tenant_id (D3). Business constraints BC1–BC5 and
-- BC9 are enforced here as CHECK / EXCLUDE / NOT NULL — not in application code.
-- RLS policies live in migration 0001.
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;     -- geospatial pricing (D2)
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- '=' on uuid inside EXCLUDE (BC5)
CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive email

-- ── UUIDv7 (time-sortable ids; PG16 has no native uuidv7) — decision T-001 ──
CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms := substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3);
  uuid_bytes := uuid_send(gen_random_uuid());
  uuid_bytes := overlay(uuid_bytes PLACING unix_ts_ms FROM 1 FOR 6);
  -- version 7 in the high nibble of byte 6; variant 10 in the high bits of byte 8
  uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
  uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
  RETURN encode(uuid_bytes, 'hex')::uuid;
END
$$ LANGUAGE plpgsql VOLATILE;

-- updated_at maintenance
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- ── Enums (closed regulatory / state-machine sets) ──────────────────────────
CREATE TYPE tenant_status       AS ENUM ('active','suspended','closed');
CREATE TYPE region_enum         AS ENUM ('kent','se_london','essex','surrey','sussex','other');
CREATE TYPE venue_type_enum     AS ENUM ('castle','barn','hotel','manor','golf_club','vineyard','registry_office','other');
CREATE TYPE surface_enum        AS ENUM ('tarmac','gravel','cobbles','grass','block_paving');
CREATE TYPE partner_tier_enum   AS ENUM ('none','bronze','silver','gold');
CREATE TYPE supplier_list_enum  AS ENUM ('not_approached','approached','listed','declined');
CREATE TYPE route_dest_enum     AS ENUM ('airport','terminal','location');
CREATE TYPE vehicle_status_enum AS ENUM ('active','maintenance','retired');
CREATE TYPE staff_role_enum     AS ENUM ('chauffeur','coordinator','manager');
CREATE TYPE staff_status_enum   AS ENUM ('active','inactive');
CREATE TYPE customer_type_enum  AS ENUM ('consumer','corporate');
CREATE TYPE consent_channel_enum AS ENUM ('email','sms','whatsapp','phone');
CREATE TYPE consent_state_enum  AS ENUM ('granted','withdrawn','soft_opt_in','never');
CREATE TYPE consent_basis_enum  AS ENUM ('consent','soft_opt_in','legitimate_interest','contract');
CREATE TYPE account_tier_enum   AS ENUM ('registered','account','preferred','managed');
CREATE TYPE account_status_enum AS ENUM ('active','suspended','closed');
CREATE TYPE enquiry_stage AS ENUM (
  'enquiry','contacted','quoted','follow_up','won',
  'deposit_paid','confirmed','pre_service','in_service',
  'completed','review_requested','referral_requested','repeat',
  'lost','nurture');
CREATE TYPE journey_variant   AS ENUM ('wedding','prom','transfer','celebration','corporate');
CREATE TYPE package_tier_enum AS ENUM ('essential','classic','signature');
CREATE TYPE loss_reason_enum  AS ENUM ('price','availability','timing','competitor','no_response','changed_plans','other');
CREATE TYPE booking_status_enum AS ENUM ('pending_deposit','deposit_paid','confirmed','in_service','completed','cancelled');
CREATE TYPE resource_type_enum AS ENUM ('vehicle','chauffeur');
CREATE TYPE payment_type_enum  AS ENUM ('deposit','balance','additional','refund');
CREATE TYPE payment_status_enum AS ENUM ('pending','succeeded','failed','refunded');
CREATE TYPE review_platform_enum AS ENUM ('google','facebook','trustpilot','internal');
CREATE TYPE journey_event_enum AS ENUM ('dispatched','en_route','arrived','started','completed','exception');
CREATE TYPE proof_entity_enum  AS ENUM ('venue','location','route','vehicle','service','service_location','guide');
CREATE TYPE proof_asset_enum   AS ENUM ('photo','fact','faq','review','job','route_data');
CREATE TYPE partner_status_enum AS ENUM ('active','suspended','terminated');
CREATE TYPE promo_type_enum    AS ENUM ('upgrade','value_add','percentage','amount');
CREATE TYPE referral_status_enum AS ENUM ('pending','qualified','rewarded','expired');
CREATE TYPE notification_channel_enum AS ENUM ('email','sms','whatsapp','push');
CREATE TYPE message_class_enum AS ENUM ('transactional','marketing');
CREATE TYPE notification_status_enum AS ENUM ('pending','sent','delivered','failed','suppressed');
CREATE TYPE activity_type_enum AS ENUM ('note','call','email','sms','whatsapp','stage_change','system');
CREATE TYPE activity_direction_enum AS ENUM ('inbound','outbound');

-- ── Lookup tables (growable sets — decision T-002) ──────────────────────────
CREATE TABLE service_types (
  code       text PRIMARY KEY,
  label      text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true
);
CREATE TABLE vehicle_categories (
  code       text PRIMARY KEY,
  label      text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true
);

-- ── Tenants ─────────────────────────────────────────────────────────────────
CREATE TABLE tenants (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  name                text NOT NULL,
  slug                text NOT NULL UNIQUE,
  base_location       geography(POINT, 4326) NOT NULL,   -- pricing-zone origin
  licensing_authority text NOT NULL,
  operator_licence_no text NOT NULL,                      -- published on every page
  licence_expiry      date NOT NULL,
  status              tenant_status NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Locations (towns / boroughs) ────────────────────────────────────────────
CREATE TABLE locations (
  id                      uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id),
  name                    text NOT NULL,
  slug                    text NOT NULL,
  region                  region_enum NOT NULL,
  county                  text NOT NULL,
  centroid                geography(POINT, 4326) NOT NULL,
  boundary                geography(POLYGON, 4326),
  postcode_prefixes       text[] NOT NULL DEFAULT '{}',
  pricing_zone            smallint,
  drive_minutes_from_base smallint,
  is_serviceable          boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX locations_centroid_gix ON locations USING gist (centroid);

-- ── Venues ──────────────────────────────────────────────────────────────────
CREATE TABLE venues (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  name                 text NOT NULL,
  slug                 text NOT NULL,
  location_id          uuid REFERENCES locations(id),
  coordinates          geography(POINT, 4326) NOT NULL,
  address              jsonb NOT NULL DEFAULT '{}',
  venue_type           venue_type_enum NOT NULL,
  is_trading           boolean NOT NULL DEFAULT true,
  hosts_weddings       boolean NOT NULL DEFAULT true,
  approach_notes       text,
  height_restriction_m numeric(3,2),
  width_restriction_m  numeric(3,2),
  surface_type         surface_enum[],
  waiting_area_notes   text,
  arrival_timing_notes text,
  photo_positions      text,
  coordinator_name     text,
  coordinator_email    text,
  partnership_tier     partner_tier_enum,
  supplier_list_status supplier_list_enum,
  jobs_completed_count integer NOT NULL DEFAULT 0,   -- BC8 gate input
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX venues_coordinates_gix ON venues USING gist (coordinates);

-- ── Vehicles (BC1 — regulatory capacity boundary) ───────────────────────────
CREATE TABLE vehicles (
  id                    uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  name                  text NOT NULL,
  slug                  text NOT NULL,
  category              text NOT NULL REFERENCES vehicle_categories(code),
  make                  text NOT NULL,
  model                 text NOT NULL,
  year                  smallint,
  registration          text NOT NULL,
  passenger_capacity    smallint NOT NULL
    CONSTRAINT capacity_phv_limit CHECK (passenger_capacity BETWEEN 1 AND 8), -- BC1
  luggage_capacity      smallint NOT NULL DEFAULT 0,
  wheelchair_accessible boolean NOT NULL DEFAULT false,
  licence_plate_no      text NOT NULL,
  licence_expiry        date NOT NULL,
  mot_expiry            date NOT NULL,
  insurance_expiry      date NOT NULL,
  iva_reference         text,
  next_service_due      date,
  status                vehicle_status_enum NOT NULL DEFAULT 'active',
  base_location_id      uuid REFERENCES locations(id),
  tier_multiplier       numeric(4,2) NOT NULL DEFAULT 1.00,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- ── Routes ──────────────────────────────────────────────────────────────────
CREATE TABLE routes (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  slug               text NOT NULL,
  origin_location_id uuid NOT NULL REFERENCES locations(id),
  destination_type   route_dest_enum NOT NULL,
  destination_id     uuid,
  distance_miles     numeric(6,2) NOT NULL,
  typical_minutes    smallint NOT NULL,
  peak_minutes       smallint,
  charges            jsonb NOT NULL DEFAULT '[]',
  fixed_price_pence  integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- ── Staff (BC2 safeguarding inputs live here) ───────────────────────────────
CREATE TABLE staff (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  user_id             uuid,                              -- soft ref to Payload users
  full_name           text NOT NULL,
  role                staff_role_enum NOT NULL,
  mobile              text NOT NULL,
  dbs_certificate_no  text,
  dbs_issued_date     date,
  dbs_expiry_date     date,
  dbs_enhanced        boolean NOT NULL DEFAULT false,
  phv_licence_no      text,
  phv_licence_expiry  date,
  licensing_authority text,
  photo_media_id      uuid,                              -- soft ref to media
  status              staff_status_enum NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Customers, consent, accounts ────────────────────────────────────────────
CREATE TABLE customers (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  first_name           text NOT NULL,
  last_name            text NOT NULL,
  email                citext NOT NULL,
  mobile               text NOT NULL,
  postcode             text,
  location_id          uuid REFERENCES locations(id),
  pricing_zone         smallint,
  customer_type        customer_type_enum NOT NULL DEFAULT 'consumer',
  persona_tag          text,
  first_touch_source   text NOT NULL,                    -- write-once (app-enforced)
  first_touch_at       timestamptz NOT NULL DEFAULT now(),
  last_touch_source    text NOT NULL,
  stated_source        text,
  referral_code_owned  text UNIQUE,
  referred_by_code     text,
  lifetime_value_pence integer NOT NULL DEFAULT 0,
  booking_count        integer NOT NULL DEFAULT 0,
  whatsapp_opt_in      boolean NOT NULL DEFAULT false,
  do_not_contact       boolean NOT NULL DEFAULT false,
  erasure_requested_at timestamptz,
  deleted_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE accounts (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  company_name       text NOT NULL,
  tier               account_tier_enum NOT NULL,
  credit_limit_pence integer,
  payment_terms_days smallint NOT NULL DEFAULT 30,
  account_manager_id uuid REFERENCES staff(id),
  cost_centres       jsonb NOT NULL DEFAULT '[]',
  status             account_status_enum NOT NULL DEFAULT 'active',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consents (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel       consent_channel_enum NOT NULL,
  state         consent_state_enum NOT NULL,
  basis         consent_basis_enum NOT NULL,
  wording_shown text NOT NULL,
  source_url    text,
  ip_address    inet,
  granted_at    timestamptz,
  withdrawn_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consents_lookup_idx ON consents (customer_id, channel, created_at DESC);

-- ── Enquiries (BC2, BC9) ────────────────────────────────────────────────────
CREATE TABLE enquiries (
  id                       uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                uuid NOT NULL REFERENCES tenants(id),
  reference                text NOT NULL UNIQUE,
  customer_id              uuid NOT NULL REFERENCES customers(id),
  stage                    enquiry_stage NOT NULL DEFAULT 'enquiry',
  stage_entered_at         timestamptz NOT NULL DEFAULT now(),
  owner_id                 uuid NOT NULL REFERENCES staff(id),   -- never null
  next_action              text,
  next_action_date         timestamptz,
  -- BC9 — every open lead carries a dated next action
  CONSTRAINT next_action_required CHECK (
    stage IN ('won','lost','completed','repeat')
    OR (next_action IS NOT NULL AND next_action_date IS NOT NULL)
  ),
  service_type             text NOT NULL REFERENCES service_types(code),
  journey_variant          journey_variant NOT NULL,
  event_date               date NOT NULL,
  pickup_postcode          text NOT NULL,
  pickup_point             geography(POINT, 4326),
  destination_text         text,
  destination_point        geography(POINT, 4326),
  venue_id                 uuid REFERENCES venues(id),
  route_id                 uuid REFERENCES routes(id),
  passenger_count          smallint NOT NULL,
  vehicle_preference_id    uuid REFERENCES vehicles(id),
  -- BC2 — safeguarding
  under_18_passengers      boolean NOT NULL DEFAULT false,
  parent_guardian_verified boolean NOT NULL DEFAULT false,
  parent_contact_id        uuid REFERENCES customers(id),
  CONSTRAINT under_18_requires_parent CHECK (
    NOT under_18_passengers
    OR stage IN ('enquiry','contacted','quoted','follow_up','lost','nurture')
    OR (parent_guardian_verified AND parent_contact_id IS NOT NULL)
  ),
  accessibility_requirement text,
  quoted_value_pence       integer,
  package_tier             package_tier_enum,
  lead_score               smallint NOT NULL DEFAULT 0,
  loss_reason              loss_reason_enum,
  loss_competitor          text,
  CONSTRAINT loss_reason_required CHECK (stage <> 'lost' OR loss_reason IS NOT NULL),
  nurture_reentry_date     date,
  CONSTRAINT nurture_reentry_required CHECK (
    stage <> 'nurture' OR nurture_reentry_date > current_date
  ),
  source                   text NOT NULL,                -- BC9 — NOT NULL by design
  utm                      jsonb NOT NULL DEFAULT '{}',
  quote_payload            jsonb,
  sla_breached             boolean NOT NULL DEFAULT false,
  escalation_level         smallint NOT NULL DEFAULT 0,
  first_response_at        timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enquiries_open_next_action_idx ON enquiries (tenant_id, stage, next_action_date)
  WHERE stage NOT IN ('won','lost','completed','repeat');
CREATE INDEX enquiries_event_date_idx ON enquiries (tenant_id, event_date);
CREATE INDEX enquiries_owner_idx ON enquiries (tenant_id, owner_id, stage);

-- ── Quotes (BC3 — margin floor) ─────────────────────────────────────────────
CREATE TABLE quotes (
  id                      uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id),
  enquiry_id              uuid NOT NULL REFERENCES enquiries(id),
  version                 smallint NOT NULL DEFAULT 1,
  base_pence              integer NOT NULL,
  distance_multiplier     numeric(4,2) NOT NULL,
  seasonal_multiplier     numeric(4,2) NOT NULL,
  day_time_multiplier     numeric(4,2) NOT NULL,
  addons_pence            integer NOT NULL DEFAULT 0,
  passthrough_pence       integer NOT NULL DEFAULT 0,
  total_pence             integer NOT NULL,               -- gross (customer pays)
  vat_rate_pct            numeric(5,2) NOT NULL DEFAULT 0, -- D-002: no VAT (0%)
  vat_pence               integer NOT NULL DEFAULT 0,
  net_pence               integer NOT NULL,                -- = total when VAT is 0
  estimated_cost_pence    integer NOT NULL,
  contribution_margin_pct numeric(5,2) NOT NULL,
  CONSTRAINT margin_floor CHECK (contribution_margin_pct >= 35.00),  -- BC3
  is_range                boolean NOT NULL DEFAULT false,
  range_low_pence         integer,
  range_high_pence        integer,
  valid_until             timestamptz NOT NULL,
  sent_at                 timestamptz,
  opened_at               timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_enquiry_idx ON quotes (enquiry_id);

-- ── Partners (subcontract operators) ────────────────────────────────────────
CREATE TABLE partners (
  id                            uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                     uuid NOT NULL REFERENCES tenants(id),
  company_name                  text NOT NULL,
  tier                          smallint NOT NULL CHECK (tier BETWEEN 1 AND 3),
  operator_licence_no           text NOT NULL,
  licence_expiry                date NOT NULL,
  insurance_expiry              date NOT NULL,
  dbs_verified                  boolean NOT NULL DEFAULT false,
  vehicle_inspected_at          date,
  standards_agreement_signed_at date,
  complaint_count               integer NOT NULL DEFAULT 0,
  status                        partner_status_enum NOT NULL DEFAULT 'active',
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

-- ── Bookings (BC4 — wedding backup vehicle) ─────────────────────────────────
CREATE TABLE bookings (
  id                    uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  reference             text NOT NULL UNIQUE,
  enquiry_id            uuid NOT NULL REFERENCES enquiries(id),
  customer_id           uuid NOT NULL REFERENCES customers(id),
  account_id            uuid REFERENCES accounts(id),
  status                booking_status_enum NOT NULL DEFAULT 'pending_deposit',
  service_type          text NOT NULL REFERENCES service_types(code),
  venue_id              uuid REFERENCES venues(id),
  pickup_at             timestamptz NOT NULL,
  estimated_end_at      timestamptz NOT NULL,
  pickup_address        jsonb NOT NULL DEFAULT '{}',
  destinations          jsonb NOT NULL DEFAULT '[]',
  passenger_count       smallint NOT NULL,
  special_requirements  text,
  total_pence           integer NOT NULL,
  vat_pence             integer NOT NULL DEFAULT 0,       -- D-002
  deposit_pence         integer NOT NULL,
  deposit_paid_at       timestamptz,
  balance_pence         integer NOT NULL,
  balance_due_date      date NOT NULL,
  balance_paid_at       timestamptz,
  backup_vehicle_id     uuid REFERENCES vehicles(id),
  CONSTRAINT wedding_requires_backup CHECK (
    service_type <> 'wedding'
    OR status IN ('pending_deposit','cancelled')
    OR backup_vehicle_id IS NOT NULL
  ),
  fulfilling_partner_id uuid REFERENCES partners(id),     -- null = own fleet
  terms_accepted_at     timestamptz,
  cancelled_at          timestamptz,
  cancellation_reason   text,
  refund_pence          integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_pickup_idx ON bookings (tenant_id, pickup_at) WHERE status <> 'cancelled';

-- ── Booking resources (BC5 — the double-booking guarantee) ──────────────────
CREATE TABLE booking_resources (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  booking_id    uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  resource_type resource_type_enum NOT NULL,
  vehicle_id    uuid REFERENCES vehicles(id),
  staff_id      uuid REFERENCES staff(id),
  period        tstzrange NOT NULL,                       -- includes turnaround buffer
  is_backup     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_exactly_one CHECK (
    (vehicle_id IS NOT NULL)::int + (staff_id IS NOT NULL)::int = 1
  ),
  -- BC5 — no vehicle or chauffeur can hold two overlapping (non-backup) periods
  CONSTRAINT no_vehicle_double_booking EXCLUDE USING gist (
    vehicle_id WITH =, period WITH &&
  ) WHERE (vehicle_id IS NOT NULL AND NOT is_backup),
  CONSTRAINT no_chauffeur_double_booking EXCLUDE USING gist (
    staff_id WITH =, period WITH &&
  ) WHERE (staff_id IS NOT NULL AND NOT is_backup)
);
CREATE INDEX booking_resources_period_gix ON booking_resources USING gist (period);

-- ── Payments, journeys, reviews ─────────────────────────────────────────────
CREATE TABLE payments (
  id                       uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id                uuid NOT NULL REFERENCES tenants(id),
  booking_id               uuid NOT NULL REFERENCES bookings(id),
  type                     payment_type_enum NOT NULL,
  amount_pence             integer NOT NULL,
  stripe_payment_intent_id text UNIQUE,
  stripe_refund_id         text,
  status                   payment_status_enum NOT NULL,
  method                   text,
  paid_at                  timestamptz,
  failure_reason           text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE journeys (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  booking_id      uuid NOT NULL REFERENCES bookings(id) UNIQUE,
  vehicle_id      uuid NOT NULL REFERENCES vehicles(id),
  staff_id        uuid NOT NULL REFERENCES staff(id),
  dispatched_at   timestamptz,
  en_route_at     timestamptz,
  arrived_at      timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  actual_miles    numeric(6,2),
  dead_miles      numeric(6,2),
  on_time         boolean,
  chauffeur_notes text,
  incident_logged boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE journey_events (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  journey_id  uuid NOT NULL REFERENCES journeys(id),
  event_type  journey_event_enum NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  location    geography(POINT, 4326),
  metadata    jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE reviews (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  booking_id    uuid REFERENCES bookings(id),
  customer_id   uuid REFERENCES customers(id),
  platform      review_platform_enum NOT NULL,
  external_id   text,
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body          text,
  author_name   text,
  published_at  timestamptz NOT NULL,
  responded_at  timestamptz,
  response_body text,
  staff_id      uuid REFERENCES staff(id),
  vehicle_id    uuid REFERENCES vehicles(id),
  venue_id      uuid REFERENCES venues(id),
  location_id   uuid REFERENCES locations(id),
  partner_id    uuid REFERENCES partners(id),
  themes        text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_unresponded_idx ON reviews (tenant_id, published_at DESC) WHERE responded_at IS NULL;

-- ── Media & Proof Ledger ────────────────────────────────────────────────────
CREATE TABLE media (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  filename         text NOT NULL,
  storage_key      text NOT NULL,
  mime_type        text NOT NULL,
  width            integer NOT NULL,                      -- required — CLS prevention
  height           integer NOT NULL,
  filesize_bytes   integer NOT NULL,
  alt_text         text NOT NULL,
  caption          text,
  venue_id         uuid REFERENCES venues(id),
  location_id      uuid REFERENCES locations(id),
  vehicle_id       uuid REFERENCES vehicles(id),
  booking_id       uuid REFERENCES bookings(id),
  captured_at      timestamptz,
  captured_point   geography(POINT, 4326),
  contains_people  boolean NOT NULL DEFAULT false,
  contains_minors  boolean NOT NULL DEFAULT false,
  consent_obtained boolean NOT NULL DEFAULT false,
  consent_evidence text,
  CONSTRAINT people_require_consent CHECK (NOT contains_people OR consent_obtained),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_venue_idx ON media (venue_id) WHERE venue_id IS NOT NULL;

CREATE TABLE proof_assets (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  entity_type  proof_entity_enum NOT NULL,
  entity_id    uuid NOT NULL,
  asset_type   proof_asset_enum NOT NULL,
  media_id     uuid REFERENCES media(id),
  review_id    uuid REFERENCES reviews(id),
  booking_id   uuid REFERENCES bookings(id),
  fact_text    text,
  faq_question text,
  faq_answer   text,
  verified_by  uuid,                                      -- soft ref to Payload users
  verified_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX proof_assets_entity_idx ON proof_assets (entity_type, entity_id, asset_type);

-- ── Supporting tables ───────────────────────────────────────────────────────
CREATE TABLE promotions (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  code        text NOT NULL,
  type        promo_type_enum NOT NULL,
  applies_to  text[] NOT NULL DEFAULT '{}',
  valid_from  date,
  valid_to    date,
  max_uses    integer,
  uses_count  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE referrals (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  referrer_customer_id uuid NOT NULL REFERENCES customers(id),
  referee_customer_id  uuid REFERENCES customers(id),
  code                 text NOT NULL,
  status               referral_status_enum NOT NULL DEFAULT 'pending',
  booking_id           uuid REFERENCES bookings(id),
  reward_fulfilled_at  timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  customer_id         uuid REFERENCES customers(id),
  booking_id          uuid REFERENCES bookings(id),
  channel             notification_channel_enum NOT NULL,
  message_class       message_class_enum NOT NULL,        -- BC6 — required, never null
  template_key        text NOT NULL,
  status              notification_status_enum NOT NULL,
  provider_message_id text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  failed_at           timestamptz,
  failure_reason      text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_dead_letter_idx ON notifications (tenant_id, status, created_at)
  WHERE status IN ('failed','pending');

CREATE TABLE activities (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  enquiry_id  uuid REFERENCES enquiries(id),
  customer_id uuid REFERENCES customers(id),
  type        activity_type_enum NOT NULL,
  direction   activity_direction_enum,
  body        text,
  staff_id    uuid REFERENCES staff(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb NOT NULL DEFAULT '{}'
);

-- Sitewide-unique primary keyword — cannibalisation control (decision T-006)
CREATE TABLE page_keywords (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  keyword          text NOT NULL,
  owner_collection text NOT NULL,
  owner_id         uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, keyword)
);

-- Append-only, immutable audit log
CREATE TABLE audit_logs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     uuid,
  actor_user_id uuid,
  actor_type    text NOT NULL,                            -- user | system | webhook
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  before_state  jsonb,
  after_state   jsonb,
  ip_address    inet,
  user_agent    text,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;          -- immutability

-- ── updated_at triggers ─────────────────────────────────────────────────────
CREATE TRIGGER trg_tenants_updated   BEFORE UPDATE ON tenants   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_locations_updated BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venues_updated    BEFORE UPDATE ON venues    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vehicles_updated  BEFORE UPDATE ON vehicles  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_routes_updated    BEFORE UPDATE ON routes    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_staff_updated     BEFORE UPDATE ON staff     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_accounts_updated  BEFORE UPDATE ON accounts  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_enquiries_updated BEFORE UPDATE ON enquiries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bookings_updated  BEFORE UPDATE ON bookings  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_partners_updated  BEFORE UPDATE ON partners  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_media_updated     BEFORE UPDATE ON media     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
