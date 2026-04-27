CREATE TABLE IF NOT EXISTS holdings (
  asset_type TEXT PRIMARY KEY,
  amount     REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
