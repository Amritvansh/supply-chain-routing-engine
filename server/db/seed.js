/**
 * Database Seed Script
 *
 * Populates the database with realistic sample data for development
 * and testing. Inserts:
 *   - 5 warehouses (spread across India)
 *   - 10 SKUs (varied dimensions and weights)
 *   - Inventory rows per warehouse/SKU pair with mixed stock levels
 *
 * The seed is safely repeatable: it uses INSERT ... ON CONFLICT DO NOTHING
 * so running it multiple times won't create duplicate rows.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node db/seed.js
 *
 * Or with .env file in /server:
 *   npm run seed
 */

const { Client } = require('pg');
const path = require('path');

// Load .env from the server directory
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// ─── Seed Data ──────────────────────────────────────────────────────────────

const warehouses = [
  { name: 'Mumbai Central Warehouse',   lat: 19.0760, lng: 72.8777 },
  { name: 'Delhi NCR Fulfillment Hub',  lat: 28.7041, lng: 77.1025 },
  { name: 'Bangalore Tech Park DC',     lat: 12.9716, lng: 77.5946 },
  { name: 'Chennai Port Warehouse',     lat: 13.0827, lng: 80.2707 },
  { name: 'Kolkata East Hub',           lat: 22.5726, lng: 88.3639 },
];

const skus = [
  { sku: 'SKU-PHONE-001',    name: 'Smartphone Pro 15',         length_cm: 16,  width_cm: 8,   height_cm: 1,   weight_kg: 0.2  },
  { sku: 'SKU-LAPTOP-002',   name: 'UltraBook 14"',             length_cm: 35,  width_cm: 25,  height_cm: 2,   weight_kg: 1.5  },
  { sku: 'SKU-HEADPH-003',   name: 'Wireless Noise-Cancel Headphones', length_cm: 20, width_cm: 18, height_cm: 8, weight_kg: 0.35 },
  { sku: 'SKU-TABLET-004',   name: 'Digital Tablet 11"',        length_cm: 25,  width_cm: 18,  height_cm: 1,   weight_kg: 0.5  },
  { sku: 'SKU-MONITOR-005',  name: '27" 4K Monitor',            length_cm: 65,  width_cm: 45,  height_cm: 15,  weight_kg: 6.5  },
  { sku: 'SKU-KEYBOARD-006', name: 'Mechanical Keyboard',       length_cm: 45,  width_cm: 15,  height_cm: 4,   weight_kg: 0.9  },
  { sku: 'SKU-MOUSE-007',    name: 'Ergonomic Wireless Mouse',  length_cm: 12,  width_cm: 7,   height_cm: 4,   weight_kg: 0.1  },
  { sku: 'SKU-CHARGER-008',  name: '100W USB-C Charger',        length_cm: 8,   width_cm: 8,   height_cm: 3,   weight_kg: 0.25 },
  { sku: 'SKU-SPEAKER-009',  name: 'Portable Bluetooth Speaker',length_cm: 22,  width_cm: 10,  height_cm: 10,  weight_kg: 0.7  },
  { sku: 'SKU-CAMERA-010',   name: 'Mirrorless Camera Body',    length_cm: 14,  width_cm: 10,  height_cm: 8,   weight_kg: 0.65 },
];

/**
 * Inventory matrix — deliberately includes:
 *   - Healthy stock (qty >= 20): most warehouse/SKU combos
 *   - Low stock (qty 1-5): triggers depletion_penalty = 10 in cost function
 *   - Zero stock (qty = 0): triggers depletion_penalty = 50, effectively excluded
 *   - Missing combos: some warehouses won't carry all SKUs
 *
 * This variety is essential for testing routing algorithm edge cases.
 */
function generateInventory(warehouseIndex, skuIndex) {
  // Deterministic pseudo-random distribution based on indices
  const hash = (warehouseIndex * 7 + skuIndex * 13) % 100;

  if (hash < 8) return null;       // ~8% chance: warehouse doesn't carry this SKU
  if (hash < 15) return 0;         // ~7% chance: out of stock
  if (hash < 30) return (hash % 5) + 1; // ~15% chance: low stock (1-5 units)
  return 10 + (hash % 91);         // ~70% chance: healthy stock (10-100 units)
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is not set.');
    console.error('Set it in /server/.env or export it before running this script.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL.');

    // ── Insert Warehouses ─────────────────────────────────────────────────
    console.log('\nSeeding warehouses...');
    const warehouseIds = [];
    for (const wh of warehouses) {
      // Check if warehouse already exists by name (no UNIQUE constraint on name,
      // so we check explicitly to make the seed safely repeatable)
      const existing = await client.query(
        'SELECT id FROM warehouses WHERE name = $1 LIMIT 1',
        [wh.name]
      );

      if (existing.rows.length > 0) {
        warehouseIds.push(existing.rows[0].id);
        console.log(`  SKIP  warehouse: ${wh.name} (already exists)`);
      } else {
        const { rows } = await client.query(
          `INSERT INTO warehouses (name, lat, lng)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [wh.name, wh.lat, wh.lng]
        );
        warehouseIds.push(rows[0].id);
        console.log(`  INSERT warehouse: ${wh.name}`);
      }
    }

    // ── Insert SKUs ───────────────────────────────────────────────────────
    console.log('\nSeeding SKUs...');
    for (const s of skus) {
      const { rowCount } = await client.query(
        `INSERT INTO skus (sku, name, length_cm, width_cm, height_cm, weight_kg)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (sku) DO NOTHING`,
        [s.sku, s.name, s.length_cm, s.width_cm, s.height_cm, s.weight_kg]
      );
      if (rowCount > 0) {
        console.log(`  INSERT sku: ${s.sku} (${s.name})`);
      } else {
        console.log(`  SKIP  sku: ${s.sku} (already exists)`);
      }
    }

    // ── Insert Inventory ──────────────────────────────────────────────────
    console.log('\nSeeding inventory...');
    let insertedCount = 0;
    let skippedCount = 0;
    let nullCount = 0;

    for (let wi = 0; wi < warehouses.length; wi++) {
      for (let si = 0; si < skus.length; si++) {
        const qty = generateInventory(wi, si);
        if (qty === null) {
          nullCount++;
          continue; // This warehouse doesn't stock this SKU
        }

        const { rowCount } = await client.query(
          `INSERT INTO inventories (warehouse_id, sku, available_qty, reserved_qty)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (warehouse_id, sku) DO NOTHING`,
          [warehouseIds[wi], skus[si].sku, qty]
        );

        if (rowCount > 0) {
          insertedCount++;
        } else {
          skippedCount++;
        }
      }
    }

    console.log(
      `  Inventory: ${insertedCount} inserted, ${skippedCount} skipped (existing), ${nullCount} not stocked.`
    );

    // ── Summary ───────────────────────────────────────────────────────────
    console.log('\n── Seed Summary ──');
    const whCount = await client.query('SELECT COUNT(*) FROM warehouses');
    const skuCount = await client.query('SELECT COUNT(*) FROM skus');
    const invCount = await client.query('SELECT COUNT(*) FROM inventories');
    const lowStock = await client.query(
      'SELECT COUNT(*) FROM inventories WHERE available_qty > 0 AND available_qty <= 5'
    );
    const outOfStock = await client.query(
      'SELECT COUNT(*) FROM inventories WHERE available_qty = 0'
    );

    console.log(`  Warehouses:       ${whCount.rows[0].count}`);
    console.log(`  SKUs:             ${skuCount.rows[0].count}`);
    console.log(`  Inventory rows:   ${invCount.rows[0].count}`);
    console.log(`  Low stock (1-5):  ${lowStock.rows[0].count}`);
    console.log(`  Out of stock (0): ${outOfStock.rows[0].count}`);
    console.log('\nSeed complete.');
  } catch (err) {
    console.error('Seeding failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('Database connection closed.');
  }
}

seed();
