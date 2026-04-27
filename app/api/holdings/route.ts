import { NextRequest, NextResponse } from 'next/server';
import { getAllHoldings, bulkUpsertHoldings } from '@/lib/holdings';
import { fetchPrices } from '@/lib/bitkub';

export async function GET() {
  const [holdings, prices] = await Promise.all([getAllHoldings(), fetchPrices()]);
  const enriched = holdings.map(h => ({
    ...h,
    current_price: prices[h.asset_type] || 0,
    current_value_thb: h.amount * (prices[h.asset_type] || 0),
  }));
  return NextResponse.json({ holdings: enriched });
}

export async function POST(req: NextRequest) {
  const { holdings } = await req.json() as { holdings: { asset_type: string; amount: number }[] };
  if (!Array.isArray(holdings)) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  await bulkUpsertHoldings(holdings);
  return NextResponse.json({ ok: true });
}
