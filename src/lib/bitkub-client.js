import { BITKUB_API, ORDER_BOOK_LIMIT, COINS, ASSET_TYPES } from './config.js';

export async function fetchOrderBook(symbol, limit = ORDER_BOOK_LIMIT) {
  const url = `${BITKUB_API}/market/books?sym=${symbol}&lmt=${limit}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Bitkub API error: ${resp.status}`);
  const data = await resp.json();
  if (data.error !== 0) throw new Error(`Bitkub error: ${JSON.stringify(data)}`);

  const result = data.result;
  const bids = (result.bids || []).map(e => ({
    price: Number(e[3]), amount: Number(e[4]), volume_thb: Number(e[2]),
  }));
  const asks = (result.asks || []).map(e => ({
    price: Number(e[3]), amount: Number(e[4]), volume_thb: Number(e[2]),
  }));
  return { bids, asks };
}

export async function fetchAllOrderBooks(symbols = COINS) {
  const results = {};
  const tasks = symbols.map(async (sym) => {
    try {
      results[sym] = await fetchOrderBook(sym);
    } catch (e) {
      results[sym] = { bids: [], asks: [], error: e.message };
    }
  });
  await Promise.all(tasks);
  return results;
}

export async function fetchPrices() {
  const resp = await fetch(`${BITKUB_API}/market/ticker`);
  if (!resp.ok) throw new Error('Ticker fetch failed');
  const data = await resp.json();
  const prices = {};
  for (const asset of ASSET_TYPES) {
    const key = `THB_${asset}`;
    prices[asset] = data[key]?.last || 0;
  }
  return prices;
}
