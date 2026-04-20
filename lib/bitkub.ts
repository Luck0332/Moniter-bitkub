import { BITKUB_API, ORDER_BOOK_LIMIT, COINS, ASSET_TYPES } from './config';

interface Bid { price: number; amount: number; volume_thb: number }
interface Ask { price: number; amount: number; volume_thb: number }
export interface OrderBook { bids: Bid[]; asks: Ask[]; error?: string }

export async function fetchOrderBook(symbol: string, limit = ORDER_BOOK_LIMIT): Promise<OrderBook> {
  const url = `${BITKUB_API}/market/books?sym=${symbol}&lmt=${limit}`;
  const resp = await fetch(url, { next: { revalidate: 0 } });
  if (!resp.ok) throw new Error(`Bitkub API error: ${resp.status}`);
  const data = await resp.json();
  if (data.error !== 0) throw new Error(`Bitkub error: ${JSON.stringify(data)}`);

  const result = data.result;
  const bids = (result.bids || []).map((e: number[]) => ({ price: Number(e[3]), amount: Number(e[4]), volume_thb: Number(e[2]) }));
  const asks = (result.asks || []).map((e: number[]) => ({ price: Number(e[3]), amount: Number(e[4]), volume_thb: Number(e[2]) }));
  return { bids, asks };
}

export async function fetchAllOrderBooks(symbols = COINS): Promise<Record<string, OrderBook>> {
  const results: Record<string, OrderBook> = {};
  await Promise.all(symbols.map(async (sym) => {
    try { results[sym] = await fetchOrderBook(sym); }
    catch (e) { results[sym] = { bids: [], asks: [], error: (e as Error).message }; }
  }));
  return results;
}

export async function fetchPrices(): Promise<Record<string, number>> {
  const resp = await fetch(`${BITKUB_API}/market/ticker`, { next: { revalidate: 0 } });
  if (!resp.ok) throw new Error('Ticker fetch failed');
  const data = await resp.json();
  const prices: Record<string, number> = {};
  for (const asset of ASSET_TYPES) {
    const key = `THB_${asset}`;
    prices[asset] = data[key]?.last || 0;
  }
  return prices;
}
