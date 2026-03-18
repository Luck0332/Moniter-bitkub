import { getAllLoans, getActiveLoans, getClosedLoans, getLoanById, createLoan, updateLoan, deleteLoan, calculateLoanMetrics } from '../db/loans.js';
import { fetchPrices } from '../lib/bitkub-client.js';
import { ASSET_TYPES } from '../lib/config.js';

const LTV_OPTIONS = [30, 40, 50, 60, 70, 80];

async function enrichLoans(db, loans) {
  const prices = await fetchPrices();
  return loans.map(l => calculateLoanMetrics(l, prices[l.asset_type] || 0));
}

export async function handleGetLoans(c) {
  const db = c.env.DB;
  const status = c.req.query('status') || 'active';
  let loans;
  if (status === 'closed') loans = await getClosedLoans(db);
  else if (status === 'all') loans = await getAllLoans(db);
  else loans = await getActiveLoans(db);
  return c.json({ loans: await enrichLoans(db, loans) });
}

export async function handleGetLoan(c) {
  const db = c.env.DB;
  const id = c.req.param('id');
  const loan = await getLoanById(db, id);
  if (!loan) return c.json({ error: 'Loan not found' }, 404);
  const prices = await fetchPrices();
  return c.json(calculateLoanMetrics(loan, prices[loan.asset_type] || 0));
}

export async function handleCreateLoan(c) {
  const db = c.env.DB;
  const data = await c.req.json();
  const loan = await createLoan(db, data);
  return c.json({ ok: true, loan });
}

export async function handleUpdateLoan(c) {
  const db = c.env.DB;
  const id = c.req.param('id');
  const updates = await c.req.json();
  const loan = await updateLoan(db, id, updates);
  if (!loan) return c.json({ error: 'Loan not found' }, 404);
  return c.json({ ok: true, loan });
}

export async function handleDeleteLoan(c) {
  const db = c.env.DB;
  const id = c.req.param('id');
  const ok = await deleteLoan(db, id);
  if (!ok) return c.json({ error: 'Loan not found' }, 404);
  return c.json({ ok: true });
}

export async function handleCloseLoan(c) {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const endDate = body.end_date || new Date().toISOString().split('T')[0];
  const loan = await updateLoan(db, id, { status: 'closed', end_date: endDate });
  if (!loan) return c.json({ error: 'Loan not found' }, 404);
  return c.json({ ok: true, loan });
}

export async function handleLoanConfig(c) {
  return c.json({ asset_types: ASSET_TYPES, ltv_options: LTV_OPTIONS });
}
