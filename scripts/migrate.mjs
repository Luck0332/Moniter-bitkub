import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const files = [
  '0001_create_loans.sql',
  '0002_create_holdings.sql',
  '0003_order_book_cache.sql',
];

for (const file of files) {
  const sql = readFileSync(join(__dirname, '../migrations', file), 'utf-8');
  await pool.query(sql);
  console.log(`✓ ${file}`);
}

await pool.end();
console.log('Migrations complete.');
