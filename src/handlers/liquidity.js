import { fetchOrderBook, fetchAllOrderBooks } from '../lib/bitkub-client.js';
import { calculateLiquidity } from '../lib/calculator.js';
import { COINS, DEFAULT_DEPTH, DEFAULT_THRESHOLD } from '../lib/config.js';

export async function handleGetSummary(c) {
  const depth = Number(c.req.query('depth')) || DEFAULT_DEPTH;
  const threshold = Number(c.req.query('threshold')) || DEFAULT_THRESHOLD;

  const books = await fetchAllOrderBooks(COINS);
  const results = {};

  for (const [symbol, book] of Object.entries(books)) {
    const coin = symbol.replace('THB_', '');
    if (book.error) { results[coin] = { error: book.error }; continue; }

    const calc = calculateLiquidity(book.bids, depth, null, threshold);
    results[coin] = {
      best_bid: calc.best_bid,
      total_amount: calc.total_amount,
      liquidity_depth: calc.vol_received,
      slippage_pct: calc.slippage * 100,
      slippage_display: calc.slippage_pct,
      vol_used: calc.vol_used,
      threshold: threshold * 100,
      threshold_breached: calc.threshold_breached,
      safety: { safe_vol: calc.safety.safe_vol, safe_thb: calc.safety.safe_thb, is_safe: calc.safety.is_safe },
    };
  }

  return c.json({ timestamp: new Date().toISOString(), depth_percent: depth, threshold: threshold * 100, coins: results });
}

export async function handleGetOrderbook(c) {
  const symbol = c.req.param('symbol').toUpperCase();
  const depth = Number(c.req.query('depth')) || DEFAULT_DEPTH;
  const customVol = c.req.query('custom_vol') ? Number(c.req.query('custom_vol')) : null;
  const threshold = Number(c.req.query('threshold')) || DEFAULT_THRESHOLD;

  const book = await fetchOrderBook(`THB_${symbol}`);
  const calc = calculateLiquidity(book.bids, depth, customVol, threshold);

  const levels = calc.levels.map(l => ({
    amount: l.amount, price: l.price, bid_size: l.bid_size,
    accru_amount: l.accru_amount, amount_match: l.amount_match,
    sales_matched: l.sales_matched, accru_matched: l.accru_matched,
  }));

  return c.json({
    symbol, timestamp: new Date().toISOString(),
    best_bid: calc.best_bid, worst_bid: calc.worst_bid,
    total_amount: calc.total_amount, total_thb: calc.total_thb,
    vol_used: calc.vol_used, vol_received: calc.vol_received,
    diff: calc.diff, slippage: calc.slippage * 100,
    slippage_display: calc.slippage_pct,
    threshold: threshold * 100, threshold_breached: calc.threshold_breached,
    safety: calc.safety, levels,
  });
}
