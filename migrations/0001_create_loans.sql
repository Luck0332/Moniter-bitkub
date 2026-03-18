CREATE TABLE IF NOT EXISTS loans (
    id                       TEXT PRIMARY KEY,
    asset_type               TEXT NOT NULL,
    collateral_amount        REAL NOT NULL,
    initial_collateral_value REAL NOT NULL,
    loan_amount              REAL NOT NULL,
    ltv_ratio                INTEGER NOT NULL,
    daily_interest_rate      REAL NOT NULL,
    start_date               TEXT NOT NULL,
    end_date                 TEXT,
    status                   TEXT NOT NULL DEFAULT 'active',
    created_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
