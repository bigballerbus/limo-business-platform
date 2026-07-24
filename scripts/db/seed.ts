/**
 * Idempotent development seed.
 *
 * Inserts the Kent Limousines tenant and enough reference data (service types,
 * vehicle categories, locations, a venue, a small ≤8-seat fleet and a staff
 * member) to develop against believable data. Runs as the owner (DATABASE_URL).
 * The pricing rate card is seeded in the pricing sprint (§8).
 */
import { Client } from 'pg';

const SERVICE_TYPES: Array<[string, string, number]> = [
  ['wedding', 'Wedding', 1],
  ['prom', 'Prom', 2],
  ['airport_transfer', 'Airport Transfer', 3],
  ['corporate', 'Corporate', 4],
  ['celebration', 'Celebration', 5],
];

const VEHICLE_CATEGORIES: Array<[string, string, number]> = [
  ['saloon', 'Executive Saloon', 1],
  ['mpv', 'Executive MPV', 2],
  ['stretch_limo', 'Stretch Limousine', 3],
  ['wedding_car', 'Wedding Car', 4],
  ['accessible', 'Wheelchair Accessible', 5],
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required to seed');
  const db = new Client({ connectionString });
  await db.connect();
  try {
    await db.query('BEGIN');

    for (const [code, label, sort] of SERVICE_TYPES) {
      await db.query(
        `INSERT INTO service_types (code, label, sort_order) VALUES ($1,$2,$3)
         ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label`,
        [code, label, sort],
      );
    }
    for (const [code, label, sort] of VEHICLE_CATEGORIES) {
      await db.query(
        `INSERT INTO vehicle_categories (code, label, sort_order) VALUES ($1,$2,$3)
         ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label`,
        [code, label, sort],
      );
    }

    // Tenant (base near Maidstone, Kent).
    const tenant = await db.query<{ id: string }>(
      `INSERT INTO tenants (name, slug, base_location, licensing_authority, operator_licence_no, licence_expiry)
       VALUES ($1,$2, ST_SetSRID(ST_MakePoint($3,$4),4326)::geography, $5,$6,$7)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [
        'Kent Limousines',
        'kent-limousines',
        0.5227,
        51.2704,
        'Maidstone Borough Council',
        'PENDING-OI-4',
        '2027-12-31',
      ],
    );
    const tenantId = tenant.rows[0]!.id;

    async function upsertLocation(
      name: string,
      slug: string,
      region: string,
      county: string,
      lng: number,
      lat: number,
    ): Promise<string> {
      const r = await db.query<{ id: string }>(
        `INSERT INTO locations (tenant_id, name, slug, region, county, centroid)
         VALUES ($1,$2,$3,$4,$5, ST_SetSRID(ST_MakePoint($6,$7),4326)::geography)
         ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [tenantId, name, slug, region, county, lng, lat],
      );
      return r.rows[0]!.id;
    }
    const maidstone = await upsertLocation(
      'Maidstone',
      'maidstone',
      'kent',
      'Kent',
      0.5227,
      51.2704,
    );
    await upsertLocation('Canterbury', 'canterbury', 'kent', 'Kent', 1.0789, 51.28);

    // A wedding venue (Leeds Castle).
    await db.query(
      `INSERT INTO venues (tenant_id, name, slug, location_id, coordinates, venue_type)
       VALUES ($1,$2,$3,$4, ST_SetSRID(ST_MakePoint($5,$6),4326)::geography, 'castle')
       ON CONFLICT (tenant_id, slug) DO NOTHING`,
      [tenantId, 'Leeds Castle', 'leeds-castle', maidstone, 0.6316, 51.2486],
    );

    // A small ≤8-seat fleet (BC1 holds).
    const fleet: Array<[string, string, string, string, string, number]> = [
      ['Mercedes E-Class', 'mercedes-e-class', 'saloon', 'Mercedes-Benz', 'E-Class', 3],
      ['Lincoln Stretch', 'lincoln-stretch', 'stretch_limo', 'Lincoln', 'Town Car', 8],
    ];
    for (const [name, slug, category, make, model, seats] of fleet) {
      await db.query(
        `INSERT INTO vehicles
          (tenant_id, name, slug, category, make, model, registration, passenger_capacity,
           licence_plate_no, licence_expiry, mot_expiry, insurance_expiry)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'2027-01-01','2027-01-01','2027-01-01')
         ON CONFLICT (tenant_id, slug) DO NOTHING`,
        [tenantId, name, slug, category, make, model, `KL-${slug}`, seats, `KL-${slug}`],
      );
    }

    await db.query(
      `INSERT INTO staff (tenant_id, full_name, role, mobile, status)
       VALUES ($1,'Booking Coordinator','coordinator','+447000000000','active')
       ON CONFLICT DO NOTHING`,
      [tenantId],
    );

    await db.query('COMMIT');
    console.warn(`Seeded tenant ${tenantId} (Kent Limousines) with reference data.`);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
