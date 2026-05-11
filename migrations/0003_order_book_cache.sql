CREATE TABLE IF NOT EXISTS order_book_cache (
  symbol     TEXT PRIMARY KEY,
  bids_json  TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
