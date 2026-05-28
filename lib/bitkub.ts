import { BITKUB_API, ORDER_BOOK_LIMIT, COINS, ASSET_TYPES } from './config';
import { getCachedOrderBook, getBulkCachedOrderBooks } from './orderbook-cache';

interface Bid { price: number; amount: number; volume_thb: number }
interface Ask { price: number; amount: number; volume_thb: number }
export interface OrderBook { bids: Bid[]; asks: Ask[]; error?: string }

// Cloudflare Workers: bypass both HTTP cache and CF edge cache
const noCacheInit = {
  cache: 'no-store' as RequestCache,
  headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' },
  // cf is a Cloudflare Workers-specific option to bypass CDN edge caching
  cf: { cacheTtl: 0, cacheEverything: false },
} as RequestInit;

export async function fetchOrderBook(symbol: string, limit = ORDER_BOOK_LIMIT): Promise<OrderBook & { from_cache?: boolean; cache_age_ms?: number }> {
  // Try WebSocket-populated D1 cache first (real-time data from cron worker)
  const cached = await getCachedOrderBook(symbol);
  if (cached) return { ...cached.book, from_cache: true, cache_age_ms: cached.age_ms };

  // Fall back to Bitkub REST API (may be stale — normalizeOrderBook will fix prices)
  const url = `${BITKUB_API}/market/books?sym=${symbol}&lmt=${limit}&_t=${Date.now()}`;
  const resp = await fetch(url, noCacheInit);
  if (!resp.ok) throw new Error(`Bitkub API error: ${resp.status}`);
  const data = await resp.json();
  if (data.error !== 0) throw new Error(`Bitkub error: ${JSON.stringify(data)}`);

  const result = data.result;
  const bids = (result.bids || []).map((e: number[]) => ({ price: Number(e[3]), amount: Number(e[4]), volume_thb: Number(e[2]) }));
  const asks = (result.asks || []).map((e: number[]) => ({ price: Number(e[3]), amount: Number(e[4]), volume_thb: Number(e[2]) }));
  return { bids, asks, from_cache: false };
}

// Scale stale order book prices to current ticker price, preserving relative depth/slippage structure
export function normalizeOrderBook(book: OrderBook, currentPrice: number): OrderBook {
  if (!book.bids.length || !currentPrice) return book;
  const bookBestBid = book.bids[0].price;
  if (!bookBestBid || Math.abs(currentPrice - bookBestBid) / bookBestBid < 0.005) return book;
  const scale = currentPrice / bookBestBid;
  return {
    ...book,
    bids: book.bids.map(b => ({ price: b.price * scale, amount: b.amount, volume_thb: b.volume_thb * scale })),
  };
}

export async function fetchAllOrderBooks(symbols = COINS): Promise<Record<string, OrderBook & { from_cache?: boolean; cache_age_ms?: number }>> {
  // Single D1 query for all cached books instead of N parallel queries
  const bulkCache = await getBulkCachedOrderBooks(symbols);

  // Only fall back to REST for symbols missing from cache
  const missing = symbols.filter(sym => !bulkCache[sym]);
  const restResults: Record<string, OrderBook> = {};
  if (missing.length) {
    await Promise.all(missing.map(async (sym) => {
      try {
        const url = `${BITKUB_API}/market/books?sym=${sym}&lmt=${ORDER_BOOK_LIMIT}&_t=${Date.now()}`;
        const resp = await fetch(url, noCacheInit);
        if (!resp.ok) throw new Error(`Bitkub API error: ${resp.status}`);
        const data = await resp.json();
        if (data.error !== 0) throw new Error(`Bitkub error: ${JSON.stringify(data)}`);
        const result = data.result;
        restResults[sym] = {
          bids: (result.bids || []).map((e: number[]) => ({ price: Number(e[3]), amount: Number(e[4]), volume_thb: Number(e[2]) })),
          asks: (result.asks || []).map((e: number[]) => ({ price: Number(e[3]), amount: Number(e[4]), volume_thb: Number(e[2]) })),
        };
      } catch (e) {
        restResults[sym] = { bids: [], asks: [], error: (e as Error).message };
      }
    }));
  }

  const results: Record<string, OrderBook & { from_cache?: boolean; cache_age_ms?: number }> = {};
  for (const sym of symbols) {
    if (bulkCache[sym]) {
      results[sym] = { ...bulkCache[sym].book, from_cache: true, cache_age_ms: bulkCache[sym].age_ms };
    } else {
      results[sym] = restResults[sym] || { bids: [], asks: [], error: 'not found' };
    }
  }
  return results;
}

export async function fetchTicker(): Promise<Record<string, { last: number; highestBid: number; baseVolume: number }>> {
  const url = `${BITKUB_API}/market/ticker?_t=${Date.now()}`;
  const resp = await fetch(url, noCacheInit);
  if (!resp.ok) throw new Error('Ticker fetch failed');
  const data = await resp.json();
  const result: Record<string, { last: number; highestBid: number; baseVolume: number }> = {};
  for (const asset of ASSET_TYPES) {
    const key = `THB_${asset}`;
    result[asset] = {
      last: data[key]?.last || 0,
      highestBid: data[key]?.highestBid || 0,
      baseVolume: data[key]?.baseVolume || 0,
    };
  }
  return result;
}

export async function fetchPrices(): Promise<Record<string, number>> {
  const ticker = await fetchTicker();
  const prices: Record<string, number> = {};
  for (const [asset, t] of Object.entries(ticker)) prices[asset] = t.last;
  return prices;
}
