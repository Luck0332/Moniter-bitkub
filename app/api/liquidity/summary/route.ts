import { NextRequest, NextResponse } from 'next/server';
import { fetchAllOrderBooks } from '@/lib/bitkub';
import { calculateLiquidity } from '@/lib/calculator';
import { COINS, DEFAULT_DEPTH, DEFAULT_THRESHOLD } from '@/lib/config';

export async function GET(req: NextRequest) {
  const depth = Number(req.nextUrl.searchParams.get('depth')) || DEFAULT_DEPTH;
  const threshold = Number(req.nextUrl.searchParams.get('threshold')) || DEFAULT_THRESHOLD;

  const books = await fetchAllOrderBooks(COINS);
  const results: Record<string, unknown> = {};

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

  return NextResponse.json({ timestamp: new Date().toISOString(), depth_percent: depth, threshold: threshold * 100, coins: results });
}
