import { NextResponse } from 'next/server';
import { fetchPrices } from '@/lib/bitkub';

export async function GET() {
  const prices = await fetchPrices();
  return NextResponse.json(prices);
}
