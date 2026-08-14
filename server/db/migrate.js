/**
 * Migration Runner
 *
 * Discovers all .sql files in db/migrations/, sorts them numerically,
 * and executes each one in order. Uses a _migrations tracking table
 * to ensure idempotency — already-applied migrations are skipped.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node db/migrate.js
 *
 * Or with .env file in /server:
 *   npm run migrate
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env from the server directory
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate() {
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

    // Create the migration tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Discover and sort migration files numerically
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort((a, b) => {
        const numA = parseInt(a.split('_')[0], 10);
        const numB = parseInt(b.split('_')[0], 10);
        return numA - numB;
      });

    if (files.length === 0) {
      console.log('No migration files found in', MIGRATIONS_DIR);
      return;
    }

    console.log(`Found ${files.length} migration file(s).`);

    // Check which migrations have already been applied
    const { rows: applied } = await client.query(
      'SELECT filename FROM _migrations ORDER BY id'
    );
    const appliedSet = new Set(applied.map(r => r.filename));

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  SKIP  ${file} (already applied)`);
        skippedCount++;
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`  APPLY ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  FAIL  ${file}: ${err.message}`);
        process.exit(1);
      }
    }

    console.log(
      `\nMigration complete: ${appliedCount} applied, ${skippedCount} skipped.`
    );
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('Database connection closed.');
  }
}

migrate();
