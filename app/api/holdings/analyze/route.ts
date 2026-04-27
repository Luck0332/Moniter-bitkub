import { NextRequest, NextResponse } from 'next/server';
import { getHolding } from '@/lib/holdings';
import { getActiveLoans } from '@/lib/loans';
import { fetchOrderBook, fetchPrices } from '@/lib/bitkub';
import { calculateLiquidity } from '@/lib/calculator';
import { DEFAULT_DEPTH, DEFAULT_THRESHOLD } from '@/lib/config';

export async function GET(req: NextRequest) {
  const asset = req.nextUrl.searchParams.get('asset')?.toUpperCase();
  const customSell = req.nextUrl.searchParams.get('sell_amount');
  const depth = Number(req.nextUrl.searchParams.get('depth')) || DEFAULT_DEPTH;
  const threshold = Number(req.nextUrl.searchParams.get('threshold')) || DEFAULT_THRESHOLD;

  if (!asset) return NextResponse.json({ error: 'asset required' }, { status: 400 });

  const [holding, prices, book, allLoans] = await Promise.all([
    getHolding(asset),
    fetchPrices(),
    fetchOrderBook(`THB_${asset}`),
    getActiveLoans(),
  ]);

  const currentPrice = prices[asset] || 0;
  const holdingAmount = holding?.amount ?? 0;
  const sellAmount = customSell ? Math.min(parseFloat(customSell), holdingAmount) : holdingAmount;
  const holdingsValueThb = holdingAmount * currentPrice;

  // Liquidity calculation for sell amount
  const calc = calculateLiquidity(book.bids, depth, sellAmount > 0 ? sellAmount : null, threshold);

  // Loan obligations for this asset
  const assetLoans = allLoans.filter(l => l.asset_type === asset);
  const loanCollateral = assetLoans.reduce((s, l) => s + l.collateral_amount, 0);
  const loanPrincipal = assetLoans.reduce((s, l) => s + l.loan_amount, 0);

  // Calculate total repayment with accrued interest
  const today = new Date();
  const loanRepayment = assetLoans.reduce((s, l) => {
    const start = new Date(l.start_date);
    const end = l.end_date ? new Date(l.end_date) : today;
    const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
    const interest = l.loan_amount * (l.daily_interest_rate / 100) * days;
    return s + l.loan_amount + interest;
  }, 0);

  const receivedThb = calc.vol_received;
  const slippagePct = calc.slippage * 100;
  const surplusThb = receivedThb - loanRepayment;
  const isEnough = receivedThb >= loanRepayment;

  return NextResponse.json({
    asset,
    current_price: currentPrice,
    holdings: holdingAmount,
    holdings_value_thb: holdingsValueThb,
    sell_amount: sellAmount,
    best_bid: calc.best_bid,
    expected_thb: sellAmount * (calc.best_bid || currentPrice),
    received_thb: receivedThb,
    slippage_pct: Math.round(slippagePct * 1000) / 1000,
    safety: calc.safety,
    threshold: threshold * 100,
    loan_count: assetLoans.length,
    loan_collateral,
    loan_principal: loanPrincipal,
    loan_repayment: Math.round(loanRepayment * 100) / 100,
    is_enough: isEnough,
    surplus_thb: Math.round(surplusThb * 100) / 100,
    levels: calc.levels.map(l => ({
      amount: l.amount, price: l.price, bid_size: l.bid_size,
      accru_amount: l.accru_amount, amount_match: l.amount_match,
      sales_matched: l.sales_matched, accru_matched: l.accru_matched,
    })),
  });
}
