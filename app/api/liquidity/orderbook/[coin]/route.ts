import { NextRequest, NextResponse } from 'next/server';
import { fetchOrderBook } from '@/lib/bitkub';
import { calculateLiquidity } from '@/lib/calculator';
import { DEFAULT_DEPTH, DEFAULT_THRESHOLD } from '@/lib/config';

type Params = { params: Promise<{ coin: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { coin } = await params;
  const symbol = coin.toUpperCase();
  const depth = Number(req.nextUrl.searchParams.get('depth')) || DEFAULT_DEPTH;
  const customVol = req.nextUrl.searchParams.get('custom_vol') ? Number(req.nextUrl.searchParams.get('custom_vol')) : null;
  const threshold = Number(req.nextUrl.searchParams.get('threshold')) || DEFAULT_THRESHOLD;

  const book = await fetchOrderBook(`THB_${symbol}`);
  const calc = calculateLiquidity(book.bids, depth, customVol, threshold);

  const levels = calc.levels.map(l => ({
    amount: l.amount, price: l.price, bid_size: l.bid_size,
    accru_amount: l.accru_amount, amount_match: l.amount_match,
    sales_matched: l.sales_matched, accru_matched: l.accru_matched,
  }));

  return NextResponse.json({
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
