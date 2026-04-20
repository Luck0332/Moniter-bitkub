import { DEFAULT_DEPTH, DEFAULT_THRESHOLD } from './config';

interface Bid { price: number; amount: number }
interface Level {
  price: number; amount: number; bid_size: number;
  accru_amount: number; accru_thb: number;
  amount_match?: number; sales_matched?: number; accru_matched?: number;
}
export interface Safety {
  safe_vol: number; safe_thb: number; crossed_at_level: number; is_safe: boolean;
}
export interface LiqResult {
  best_bid: number; worst_bid: number; total_amount: number; total_thb: number;
  vol_used: number; vol_received: number; diff: number; slippage: number;
  slippage_pct: string; threshold: number; threshold_breached: boolean;
  safety: Safety; levels: Level[];
}

export function calculateLiquidity(
  bids: Bid[],
  depthPercent = DEFAULT_DEPTH,
  customVol: number | null = null,
  threshold = DEFAULT_THRESHOLD
): LiqResult {
  if (!bids || !bids.length) return emptyResult(threshold);

  const levels: Level[] = [];
  let accruAmount = 0, accruThb = 0;
  for (const bid of bids) {
    const bidSize = bid.amount * bid.price;
    accruAmount += bid.amount;
    accruThb += bidSize;
    levels.push({ price: bid.price, amount: bid.amount, bid_size: bidSize, accru_amount: accruAmount, accru_thb: accruThb });
  }

  const totalAmount = accruAmount;
  const bestBid = levels[0].price;
  const worstBid = levels[levels.length - 1].price;
  const volUsed = customVol != null ? Math.min(customVol, totalAmount) : totalAmount * depthPercent;

  const matchedLevels = fillOrders(levels, volUsed);
  const volReceived = matchedLevels.reduce((s, l) => s + (l.sales_matched ?? 0), 0);

  let accruMatched = 0;
  for (const ml of matchedLevels) { accruMatched += ml.sales_matched ?? 0; ml.accru_matched = accruMatched; }

  const expectedThb = volUsed * bestBid;
  const diff = volReceived - expectedThb;
  const slippage = expectedThb > 0 ? diff / expectedThb : 0;
  const safety = calculateSafetyLine(levels, bestBid, threshold);

  return {
    best_bid: bestBid, worst_bid: worstBid, total_amount: totalAmount,
    total_thb: levels[levels.length - 1].accru_thb,
    vol_used: volUsed, vol_received: volReceived, diff, slippage,
    slippage_pct: (slippage * 100).toFixed(3) + '%',
    threshold, threshold_breached: slippage < threshold,
    safety, levels: matchedLevels,
  };
}

function fillOrders(levels: Level[], volTarget: number): Level[] {
  const matched: Level[] = [];
  let remaining = volTarget;
  for (const level of levels) {
    if (remaining <= 0) { matched.push({ ...level, amount_match: 0, sales_matched: 0 }); continue; }
    const matchAmount = Math.min(remaining, level.amount);
    const matchThb = matchAmount * level.price;
    remaining -= matchAmount;
    matched.push({ ...level, amount_match: matchAmount, sales_matched: matchThb });
  }
  return matched;
}

function calculateSafetyLine(levels: Level[], bestBid: number, threshold: number): Safety {
  if (bestBid <= 0 || !levels.length) return { safe_vol: 0, safe_thb: 0, crossed_at_level: -1, is_safe: false };

  let accruVol = 0, accruThb = 0;
  for (let i = 0; i < levels.length; i++) {
    const { price, amount } = levels[i];
    const nextVol = accruVol + amount;
    const nextThb = accruThb + amount * price;
    const expected = nextVol * bestBid;
    const slip = expected > 0 ? (nextThb - expected) / expected : 0;

    if (slip < threshold) {
      const t = threshold;
      const num = (1 + t) * accruVol * bestBid - accruThb;
      const den = price - (1 + t) * bestBid;
      const x = den !== 0 ? Math.max(0, Math.min(num / den, amount)) : 0;
      return { safe_vol: accruVol + x, safe_thb: accruThb + x * price, crossed_at_level: i, is_safe: false };
    }
    accruVol = nextVol;
    accruThb = nextThb;
  }
  return { safe_vol: accruVol, safe_thb: accruThb, crossed_at_level: -1, is_safe: true };
}

function emptyResult(threshold: number): LiqResult {
  return {
    best_bid: 0, worst_bid: 0, total_amount: 0, total_thb: 0,
    vol_used: 0, vol_received: 0, diff: 0, slippage: 0,
    slippage_pct: 'N/A', threshold, threshold_breached: false,
    safety: { safe_vol: 0, safe_thb: 0, crossed_at_level: -1, is_safe: false },
    levels: [],
  };
}
