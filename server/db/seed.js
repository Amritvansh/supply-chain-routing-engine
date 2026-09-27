/**
 * Database Seed Script
 *
 * Populates the database with realistic sample data for development
 * and testing. Inserts:
 *   - 2 default users (host + customer)
 *   - 5 warehouses (spread across India)
 *   - 10 SKUs (varied dimensions, weights, prices, and categories)
 *   - Inventory rows per warehouse/SKU pair with mixed stock levels
 *
 * The seed is safely repeatable: it uses INSERT ... ON CONFLICT DO UPDATE
 * so running it multiple times hydrates any new columns.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node db/seed.js
 *
 * Or with .env file in /server:
 *   npm run seed
 */

const { Client } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');

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
  {
    sku: 'SKU-PHONE-001',
    name: 'Smartphone Pro 15',
    length_cm: 16, width_cm: 8, height_cm: 1, weight_kg: 0.2,
    price: 29999,
    category: 'Smartphones',
    description: 'Flagship smartphone with 6.7" AMOLED display, 108MP triple camera system, 5G connectivity, and all-day battery life. Perfect for power users who demand the best.',
    image_url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&h=600&fit=crop',
  },
  {
    sku: 'SKU-LAPTOP-002',
    name: 'UltraBook 14"',
    length_cm: 35, width_cm: 25, height_cm: 2, weight_kg: 1.5,
    price: 49999,
    category: 'Laptops',
    description: 'Ultra-thin 14" laptop with Intel i7 processor, 16GB RAM, 512GB SSD, and stunning Retina display. Weighing just 1.5kg, it is the perfect companion for professionals on the go.',
    image_url: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&h=600&fit=crop',
  },
  {
    sku: 'SKU-HEADPH-003',
    name: 'Wireless Noise-Cancel Headphones',
    length_cm: 20, width_cm: 18, height_cm: 8, weight_kg: 0.35,
    price: 4999,
    category: 'Audio',
    description: 'Premium over-ear headphones with industry-leading active noise cancellation, 30-hour battery, Hi-Res Audio support, and plush memory-foam ear cushions.',
    image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=600&fit=crop',
  },
  {
    sku: 'SKU-TABLET-004',
    name: 'Digital Tablet 11"',
    length_cm: 25, width_cm: 18, height_cm: 1, weight_kg: 0.5,
    price: 24999,
    category: 'Laptops',
    description: 'Versatile 11" tablet with M-series chip, Liquid Retina XDR display, stylus support, and all-day battery. Ideal for creativity and entertainment.',
    image_url: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600&h=600&fit=crop',
  },
  {
    sku: 'SKU-MONITOR-005',
    name: '27" 4K Monitor',
    length_cm: 65, width_cm: 45, height_cm: 15, weight_kg: 6.5,
    price: 34999,
    category: 'Monitors',
    description: 'Professional-grade 27" 4K UHD monitor with 99% sRGB color accuracy, USB-C connectivity, adjustable ergonomic stand, and eye-care technology.',
    image_url: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600&h=600&fit=crop',
  },
  {
    sku: 'SKU-KEYBOARD-006',
    name: 'Mechanical Keyboard',
    length_cm: 45, width_cm: 15, height_cm: 4, weight_kg: 0.9,
    price: 3499,
    category: 'Peripherals',
    description: 'RGB mechanical keyboard with hot-swappable switches, aircraft-grade aluminium frame, PBT keycaps, and customizable macro keys for gaming and productivity.',
    image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&h=600&fit=crop',
  },
  {
    sku: 'SKU-MOUSE-007',
    name: 'Ergonomic Wireless Mouse',
    length_cm: 12, width_cm: 7, height_cm: 4, weight_kg: 0.1,
    price: 1499,
    category: 'Peripherals',
    description: 'Ergonomic wireless mouse with 16000 DPI sensor, silent clicks, USB-C fast charging, and multi-device Bluetooth support for seamless workflow.',
    image_url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=600&h=600&fit=crop',
  },
  {
    sku: 'SKU-CHARGER-008',
    name: '100W USB-C Charger',
    length_cm: 8, width_cm: 8, height_cm: 3, weight_kg: 0.25,
    price: 2499,
    category: 'Peripherals',
    description: 'Compact 100W GaN USB-C charger with 4 ports, intelligent power distribution, and universal compatibility. Charge your laptop, phone, and tablet simultaneously.',
    image_url: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&h=600&fit=crop',
  },
  {
    sku: 'SKU-SPEAKER-009',
    name: 'Portable Bluetooth Speaker',
    length_cm: 22, width_cm: 10, height_cm: 10, weight_kg: 0.7,
    price: 3999,
    category: 'Audio',
    description: 'Rugged portable speaker with 360° sound, IP67 waterproof rating, 20-hour battery, and deep bass boost. Take the party anywhere.',
    image_url: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&h=600&fit=crop',
  },
  {
    sku: 'SKU-CAMERA-010',
    name: 'Mirrorless Camera Body',
    length_cm: 14, width_cm: 10, height_cm: 8, weight_kg: 0.65,
    price: 44999,
    category: 'Monitors',
    description: 'Professional mirrorless camera with 45MP full-frame sensor, 8K video recording, advanced AF with eye-tracking, and weather-sealed magnesium alloy body.',
    image_url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&h=600&fit=crop',
  },
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

    // ── Seed Default Users ────────────────────────────────────────────────
    console.log('\nSeeding users...');
    const defaultUsers = [
      { name: 'Host Admin',     email: 'host@supplychain.com',  password: 'host123',     role: 'host' },
      { name: 'Test Customer',  email: 'customer@test.com',     password: 'customer123', role: 'customer' },
    ];

    for (const u of defaultUsers) {
      const existing = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [u.email]
      );
      if (existing.rows.length > 0) {
        console.log(`  SKIP  user: ${u.email} (already exists)`);
      } else {
        const hash = await bcrypt.hash(u.password, 12);
        await client.query(
          'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
          [u.name, u.email, hash, u.role]
        );
        console.log(`  INSERT user: ${u.email} (role: ${u.role})`);
      }
    }

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

    // ── Insert / Update SKUs ──────────────────────────────────────────────
    console.log('\nSeeding SKUs...');
    for (const s of skus) {
      const result = await client.query(
        `INSERT INTO skus (sku, name, length_cm, width_cm, height_cm, weight_kg, price, category, image_url, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (sku) DO UPDATE SET
           name        = EXCLUDED.name,
           length_cm   = EXCLUDED.length_cm,
           width_cm    = EXCLUDED.width_cm,
           height_cm   = EXCLUDED.height_cm,
           weight_kg   = EXCLUDED.weight_kg,
           price       = EXCLUDED.price,
           category    = EXCLUDED.category,
           image_url   = EXCLUDED.image_url,
           description = EXCLUDED.description`,
        [
          s.sku, s.name, s.length_cm, s.width_cm, s.height_cm, s.weight_kg,
          s.price, s.category, s.image_url, s.description,
        ]
      );
      // ON CONFLICT DO UPDATE always returns rowCount = 1
      console.log(`  UPSERT sku: ${s.sku} (${s.name}) — ₹${s.price.toLocaleString('en-IN')}`);
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
