import { NextRequest, NextResponse } from 'next/server';
import { getActiveLoans, getClosedLoans, getAllLoans, createLoan, calculateLoanMetrics } from '@/lib/loans';
import { fetchPrices } from '@/lib/bitkub';

async function enrichLoans(loans: Awaited<ReturnType<typeof getActiveLoans>>) {
  const prices = await fetchPrices();
  return loans.map(l => calculateLoanMetrics(l, prices[l.asset_type] || 0));
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') || 'active';
  let loans;
  if (status === 'closed') loans = await getClosedLoans();
  else if (status === 'all') loans = await getAllLoans();
  else loans = await getActiveLoans();
  return NextResponse.json({ loans: await enrichLoans(loans) });
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const loan = await createLoan(data);
  return NextResponse.json({ ok: true, loan });
}
