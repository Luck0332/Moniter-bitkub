import { NextRequest, NextResponse } from 'next/server';
import { updateLoan } from '@/lib/loans';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const endDate = body.end_date || new Date().toISOString().split('T')[0];
  const loan = await updateLoan(id, { status: 'closed', end_date: endDate });
  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
  return NextResponse.json({ ok: true, loan });
}
