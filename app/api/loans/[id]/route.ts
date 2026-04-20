import { NextRequest, NextResponse } from 'next/server';
import { getLoanById, updateLoan, deleteLoan, calculateLoanMetrics } from '@/lib/loans';
import { fetchPrices } from '@/lib/bitkub';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const loan = await getLoanById(id);
  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
  const prices = await fetchPrices();
  return NextResponse.json(calculateLoanMetrics(loan, prices[loan.asset_type] || 0));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const updates = await req.json();
  const loan = await updateLoan(id, updates);
  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
  return NextResponse.json({ ok: true, loan });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ok = await deleteLoan(id);
  if (!ok) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
