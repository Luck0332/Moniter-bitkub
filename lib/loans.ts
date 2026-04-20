import { d1Query, d1Run } from './db';

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

export async function getAllLoans(): Promise<Loan[]> {
  return d1Query<Loan>('SELECT * FROM loans ORDER BY created_at DESC');
}

export async function getActiveLoans(): Promise<Loan[]> {
  return d1Query<Loan>("SELECT * FROM loans WHERE status != 'closed' ORDER BY created_at DESC");
}

export async function getClosedLoans(): Promise<Loan[]> {
  return d1Query<Loan>("SELECT * FROM loans WHERE status = 'closed' ORDER BY created_at DESC");
}

export async function getLoanById(id: string): Promise<Loan | null> {
  const rows = await d1Query<Loan>('SELECT * FROM loans WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function createLoan(data: Partial<Loan>): Promise<Loan> {
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

  await d1Run(
    `INSERT INTO loans (id, asset_type, collateral_amount, initial_collateral_value,
     loan_amount, ltv_ratio, daily_interest_rate, start_date, end_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [loan.id, loan.asset_type, loan.collateral_amount, loan.initial_collateral_value,
     loan.loan_amount, loan.ltv_ratio, loan.daily_interest_rate,
     loan.start_date, loan.end_date, loan.status, loan.created_at]
  );

  return loan;
}

const ALLOWED_FIELDS = [
  'asset_type','collateral_amount','initial_collateral_value','loan_amount',
  'ltv_ratio','daily_interest_rate','start_date','end_date','status',
];

export async function updateLoan(id: string, updates: Partial<Loan>): Promise<Loan | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, val] of Object.entries(updates)) {
    if (ALLOWED_FIELDS.includes(key)) { sets.push(`${key} = ?`); vals.push(val); }
  }
  if (!sets.length) return null;
  vals.push(id);
  await d1Run(`UPDATE loans SET ${sets.join(', ')} WHERE id = ?`, vals);
  return getLoanById(id);
}

export async function deleteLoan(id: string): Promise<boolean> {
  const result = await d1Run('DELETE FROM loans WHERE id = ?', [id]);
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
