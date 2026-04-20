import { getDb } from './db';
import type Database from 'better-sqlite3';

export interface Loan {
  id: string;
  asset_type: string;
  collateral_amount: number;
  initial_collateral_value: number;
  loan_amount: number;
  ltv_ratio: number;
  daily_interest_rate: number;
  start_date: string;
  end_date: string | null;
  status: string;
  created_at: string;
}

export interface LoanWithMetrics extends Loan {
  duration_days: number;
  accrued_interest: number;
  total_repayment: number;
  current_price: number;
  current_collateral_value: number;
  current_ltv: number;
}

type Db = ReturnType<typeof getDb>;

export function getAllLoans(db: Db = getDb()): Loan[] {
  return db.prepare('SELECT * FROM loans ORDER BY created_at DESC').all() as Loan[];
}

export function getActiveLoans(db: Db = getDb()): Loan[] {
  return db.prepare("SELECT * FROM loans WHERE status != 'closed' ORDER BY created_at DESC").all() as Loan[];
}

export function getClosedLoans(db: Db = getDb()): Loan[] {
  return db.prepare("SELECT * FROM loans WHERE status = 'closed' ORDER BY created_at DESC").all() as Loan[];
}

export function getLoanById(db: Db = getDb(), id: string): Loan | null {
  return (db.prepare('SELECT * FROM loans WHERE id = ?').get(id) as Loan) || null;
}

export function createLoan(db: Db = getDb(), data: Partial<Loan>): Loan {
  const loan: Loan = {
    id: data.id!,
    asset_type: data.asset_type!,
    collateral_amount: Number(data.collateral_amount),
    initial_collateral_value: Number(data.initial_collateral_value),
    loan_amount: Number(data.loan_amount),
    ltv_ratio: Number(data.ltv_ratio),
    daily_interest_rate: Number(data.daily_interest_rate),
    start_date: data.start_date!,
    end_date: data.end_date || null,
    status: data.status || 'active',
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO loans (id, asset_type, collateral_amount, initial_collateral_value,
     loan_amount, ltv_ratio, daily_interest_rate, start_date, end_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    loan.id, loan.asset_type, loan.collateral_amount, loan.initial_collateral_value,
    loan.loan_amount, loan.ltv_ratio, loan.daily_interest_rate,
    loan.start_date, loan.end_date, loan.status, loan.created_at
  );

  return loan;
}

const ALLOWED_FIELDS = [
  'asset_type','collateral_amount','initial_collateral_value','loan_amount',
  'ltv_ratio','daily_interest_rate','start_date','end_date','status',
];

export function updateLoan(db: Db = getDb(), id: string, updates: Partial<Loan>): Loan | null {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, val] of Object.entries(updates)) {
    if (ALLOWED_FIELDS.includes(key)) { sets.push(`${key} = ?`); vals.push(val); }
  }
  if (!sets.length) return null;
  vals.push(id);
  db.prepare(`UPDATE loans SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getLoanById(db, id);
}

export function deleteLoan(db: Db = getDb(), id: string): boolean {
  const result = db.prepare('DELETE FROM loans WHERE id = ?').run(id);
  return result.changes > 0;
}

export function calculateLoanMetrics(loan: Loan, currentPrice: number): LoanWithMetrics {
  const start = new Date(loan.start_date);
  const end = loan.end_date ? new Date(loan.end_date) : new Date();
  const durationDays = Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  const loanAmount = loan.loan_amount;
  const dailyRate = loan.daily_interest_rate / 100;
  const accruedInterest = loanAmount * dailyRate * durationDays;
  const totalRepayment = loanAmount + accruedInterest;
  const currentCollateralValue = loan.collateral_amount * currentPrice;
  const currentLtv = currentCollateralValue > 0 ? (totalRepayment / currentCollateralValue) * 100 : 0;

  return {
    ...loan,
    duration_days: durationDays,
    accrued_interest: Math.round(accruedInterest * 100) / 100,
    total_repayment: Math.round(totalRepayment * 100) / 100,
    current_price: currentPrice,
    current_collateral_value: Math.round(currentCollateralValue * 100) / 100,
    current_ltv: Math.round(currentLtv * 100) / 100,
  };
}
