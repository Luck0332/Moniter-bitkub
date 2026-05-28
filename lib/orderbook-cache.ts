import { d1Query } from './db';
import type { OrderBook } from './bitkub';

// Treat cache as stale after 90 s (cron runs every 60 s, allow some slack)
const CACHE_TTL_MS = 90_000;

interface CacheRow {
  symbol: string;
  bids_json: string;
  fetched_at: string;
}

export async function getCachedOrderBook(symbol: string): Promise<{ book: OrderBook; age_ms: number } | null> {
  try {
    const rows = await d1Query<CacheRow>(
      'SELECT symbol, bids_json, fetched_at FROM order_book_cache WHERE symbol = ?',
      [symbol],
    );
    if (!rows.length) return null;

    const { bids_json, fetched_at } = rows[0];
    const age_ms = Date.now() - new Date(fetched_at).getTime();
    if (age_ms > CACHE_TTL_MS) return null;

    const bids = JSON.parse(bids_json);
    return { book: { bids, asks: [] }, age_ms };
  } catch {
    return null;
  }
}

// Bulk fetch all cached books in a single D1 query (avoids N parallel HTTP calls)
export async function getBulkCachedOrderBooks(
  symbols: string[],
): Promise<Record<string, { book: OrderBook; age_ms: number }>> {
  if (!symbols.length) return {};
  try {
    const placeholders = symbols.map(() => '?').join(',');
    const rows = await d1Query<CacheRow>(
      `SELECT symbol, bids_json, fetched_at FROM order_book_cache WHERE symbol IN (${placeholders})`,
      symbols,
    );
    const now = Date.now();
    const result: Record<string, { book: OrderBook; age_ms: number }> = {};
    for (const row of rows) {
      const age_ms = now - new Date(row.fetched_at).getTime();
      if (age_ms > CACHE_TTL_MS) continue;
      result[row.symbol] = { book: { bids: JSON.parse(row.bids_json), asks: [] }, age_ms };
    }
    return result;
  } catch {
    return {};
  }
}
