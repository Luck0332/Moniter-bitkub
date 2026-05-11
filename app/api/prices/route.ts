import { NextResponse } from 'next/server';
import { fetchPrices } from '@/lib/bitkub';

export const dynamic = 'force-dynamic';

export async function GET() {
  const prices = await fetchPrices();
  return NextResponse.json(prices, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
