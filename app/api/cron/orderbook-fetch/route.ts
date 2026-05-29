import { NextRequest, NextResponse } from 'next/server';
import { d1Run } from '@/lib/db';
import { COINS, BITKUB_API, ORDER_BOOK_LIMIT } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, string> = {};

  await Promise.all(COINS.map(async (sym) => {
    try {
      const url = `${BITKUB_API}/market/books?sym=${sym}&lmt=${ORDER_BOOK_LIMIT}&_t=${Date.now()}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.error !== 0) throw new Error(`Bitkub error ${data.error}`);

      const bids = (data.result?.bids || [])
        .map((e: number[]) => ({ price: Number(e[3]), amount: Number(e[4]), volume_thb: Number(e[2]) }))
        .filter((b: { price: number; amount: number }) => b.price > 0 && b.amount > 0)
        .sort((a: { price: number }, b: { price: number }) => b.price - a.price)
        .slice(0, ORDER_BOOK_LIMIT);

      await d1Run(
        `INSERT INTO order_book_cache (symbol, bids_json, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET bids_json = EXCLUDED.bids_json, fetched_at = EXCLUDED.fetched_at`,
        [sym, JSON.stringify(bids), new Date().toISOString()]
      );
      results[sym] = `ok (${bids.length} levels)`;
    } catch (e) {
      results[sym] = `error: ${(e as Error).message}`;
    }
  }));

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), results });
}
