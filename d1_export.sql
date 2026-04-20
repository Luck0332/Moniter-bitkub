PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE loans (
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
INSERT INTO "loans" ("id","asset_type","collateral_amount","initial_collateral_value","loan_amount","ltv_ratio","daily_interest_rate","start_date","end_date","status","created_at") VALUES('DevTest01','BTC',45,104498426.25,41799370.5,40,0.041666667,'2026-03-19',NULL,'active','2026-03-19T05:41:48.201Z');
INSERT INTO "loans" ("id","asset_type","collateral_amount","initial_collateral_value","loan_amount","ltv_ratio","daily_interest_rate","start_date","end_date","status","created_at") VALUES('test001','BTC',2,4000000,2000000,50,0.041666667,'2026-03-19','2026-03-22','active','2026-03-19T06:14:46.562Z');
CREATE INDEX idx_loans_status ON loans(status);
