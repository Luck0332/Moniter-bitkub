import { NextRequest, NextResponse } from 'next/server';
import { fetchOrderBook, fetchTicker, normalizeOrderBook } from '@/lib/bitkub';
import { calculateLiquidity } from '@/lib/calculator';
import { DEFAULT_DEPTH, DEFAULT_THRESHOLD } from '@/lib/config';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ coin: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { coin } = await params;
  const symbol = coin.toUpperCase();
  const depth = Number(req.nextUrl.searchParams.get('depth')) || DEFAULT_DEPTH;
  const customVol = req.nextUrl.searchParams.get('custom_vol') ? Number(req.nextUrl.searchParams.get('custom_vol')) : null;
  const threshold = Number(req.nextUrl.searchParams.get('threshold')) || DEFAULT_THRESHOLD;

  const [book, ticker] = await Promise.all([fetchOrderBook(`THB_${symbol}`), fetchTicker()]);
  const currentPrice = ticker[symbol]?.last || ticker[symbol]?.highestBid || 0;
  const rawBookBid = book.bids[0]?.price || 0;
  const priceNormalized = rawBookBid > 0 && currentPrice > 0 && Math.abs(currentPrice - rawBookBid) / rawBookBid >= 0.005;
  const normalizedBook = normalizeOrderBook(book, currentPrice);
  const calc = calculateLiquidity(normalizedBook.bids, depth, customVol, threshold);
  const displayPrice = currentPrice || calc.best_bid;

  const levels = calc.levels.map(l => ({
    amount: l.amount, price: l.price, bid_size: l.bid_size,
    accru_amount: l.accru_amount, amount_match: l.amount_match,
    sales_matched: l.sales_matched, accru_matched: l.accru_matched,
  }));

  return NextResponse.json({
    symbol, timestamp: new Date().toISOString(),
    best_bid: displayPrice, worst_bid: calc.worst_bid,
    total_amount: calc.total_amount, total_thb: calc.total_thb,
    vol_used: calc.vol_used, vol_received: calc.vol_received,
    diff: calc.diff, slippage: calc.slippage * 100,
    slippage_display: calc.slippage_pct,
    threshold: threshold * 100, threshold_breached: calc.threshold_breached,
    safety: calc.safety, levels,
    price_normalized: priceNormalized, book_best_bid: rawBookBid,
    from_cache: book.from_cache ?? false,
    cache_age_ms: book.cache_age_ms ?? null,
  }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
