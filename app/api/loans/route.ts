import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveLoans, getClosedLoans, getAllLoans, createLoan, calculateLoanMetrics } from '@/lib/loans';
import { fetchPrices } from '@/lib/bitkub';

async function enrichLoans(loans: ReturnType<typeof getActiveLoans>) {
  const prices = await fetchPrices();
  return loans.map(l => calculateLoanMetrics(l, prices[l.asset_type] || 0));
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const status = req.nextUrl.searchParams.get('status') || 'active';
  let loans;
  if (status === 'closed') loans = getClosedLoans(db);
  else if (status === 'all') loans = getAllLoans(db);
  else loans = getActiveLoans(db);
  return NextResponse.json({ loans: await enrichLoans(loans) });
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const data = await req.json();
  const loan = createLoan(db, data);
  return NextResponse.json({ ok: true, loan });
}
