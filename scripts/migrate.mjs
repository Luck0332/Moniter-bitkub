// Run: node scripts/migrate.mjs
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'liberix.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,
    asset_type TEXT NOT NULL,
    collateral_amount REAL NOT NULL,
    initial_collateral_value REAL NOT NULL,
    loan_amount REAL NOT NULL,
    ltv_ratio REAL NOT NULL,
    daily_interest_rate REAL NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  )
`);

console.log('✓ Database migrated:', DB_PATH);
db.close();
