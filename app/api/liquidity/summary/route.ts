import { NextRequest, NextResponse } from 'next/server';
import { fetchAllOrderBooks, fetchTicker, normalizeOrderBook } from '@/lib/bitkub';
import { calculateLiquidity } from '@/lib/calculator';
import { COINS, DEFAULT_DEPTH, DEFAULT_THRESHOLD } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const depth = Number(req.nextUrl.searchParams.get('depth')) || DEFAULT_DEPTH;
  const threshold = Number(req.nextUrl.searchParams.get('threshold')) || DEFAULT_THRESHOLD;

  const [books, ticker] = await Promise.all([fetchAllOrderBooks(COINS), fetchTicker()]);
  const results: Record<string, unknown> = {};

  for (const [symbol, book] of Object.entries(books)) {
    const coin = symbol.replace('THB_', '');
    if (book.error) { results[coin] = { error: book.error }; continue; }
    const currentPrice = ticker[coin]?.last || ticker[coin]?.highestBid || 0;
    const rawBookBid = book.bids[0]?.price || 0;
    const priceNormalized = rawBookBid > 0 && currentPrice > 0 && Math.abs(currentPrice - rawBookBid) / rawBookBid >= 0.005;
    const normalizedBook = normalizeOrderBook(book, currentPrice);
    const calc = calculateLiquidity(normalizedBook.bids, depth, null, threshold);
    results[coin] = {
      best_bid: currentPrice,
      total_amount: calc.total_amount,
      liquidity_depth: calc.vol_received,
      slippage_pct: calc.slippage * 100,
      slippage_display: calc.slippage_pct,
      vol_used: calc.vol_used,
      base_volume_24h: ticker[coin]?.baseVolume || 0,
      threshold: threshold * 100,
      threshold_breached: calc.threshold_breached,
      safety: { safe_vol: calc.safety.safe_vol, safe_thb: calc.safety.safe_thb, is_safe: calc.safety.is_safe },
      price_normalized: priceNormalized,
    };
  }

  return NextResponse.json({ timestamp: new Date().toISOString(), depth_percent: depth, threshold: threshold * 100, coins: results }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
