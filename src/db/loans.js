// D1 database operations for loans

export async function getAllLoans(db) {
  const { results } = await db.prepare('SELECT * FROM loans ORDER BY created_at DESC').all();
  return results || [];
}

export async function getActiveLoans(db) {
  const { results } = await db.prepare("SELECT * FROM loans WHERE status != 'closed' ORDER BY created_at DESC").all();
  return results || [];
}

export async function getClosedLoans(db) {
  const { results } = await db.prepare("SELECT * FROM loans WHERE status = 'closed' ORDER BY created_at DESC").all();
  return results || [];
}

export async function getLoanById(db, id) {
  return await db.prepare('SELECT * FROM loans WHERE id = ?').bind(id).first();
}

export async function createLoan(db, data) {
  const loan = {
    id: data.id,
    asset_type: data.asset_type,
    collateral_amount: Number(data.collateral_amount),
    initial_collateral_value: Number(data.initial_collateral_value),
    loan_amount: Number(data.loan_amount),
    ltv_ratio: Number(data.ltv_ratio),
    daily_interest_rate: Number(data.daily_interest_rate),
    start_date: data.start_date,
    end_date: data.end_date || null,
    status: data.status || 'active',
    created_at: new Date().toISOString(),
  };

  await db.prepare(
    `INSERT INTO loans (id, asset_type, collateral_amount, initial_collateral_value,
     loan_amount, ltv_ratio, daily_interest_rate, start_date, end_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    loan.id, loan.asset_type, loan.collateral_amount, loan.initial_collateral_value,
    loan.loan_amount, loan.ltv_ratio, loan.daily_interest_rate,
    loan.start_date, loan.end_date, loan.status, loan.created_at
  ).run();

  return loan;
}

export async function updateLoan(db, id, updates) {
  const allowed = ['asset_type','collateral_amount','initial_collateral_value','loan_amount',
    'ltv_ratio','daily_interest_rate','start_date','end_date','status'];
  const sets = [];
  const vals = [];
  for (const [key, val] of Object.entries(updates)) {
    if (allowed.includes(key)) { sets.push(`${key} = ?`); vals.push(val); }
  }
  if (!sets.length) return null;
  vals.push(id);
  await db.prepare(`UPDATE loans SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return await getLoanById(db, id);
}

export async function deleteLoan(db, id) {
  const result = await db.prepare('DELETE FROM loans WHERE id = ?').bind(id).run();
  return result.meta.changes > 0;
}

export function calculateLoanMetrics(loan, currentPrice) {
  const start = new Date(loan.start_date);
  const end = loan.end_date ? new Date(loan.end_date) : new Date();
  const durationDays = Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));

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
