'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────────────
interface LoanData {
  id: string; asset_type: string; collateral_amount: number;
  initial_collateral_value: number; loan_amount: number; ltv_ratio: number;
  daily_interest_rate: number; start_date: string; end_date: string | null;
  status: string; duration_days: number; accrued_interest: number;
  total_repayment: number; current_price: number; current_collateral_value: number;
  current_ltv: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const ASSET_COLORS: Record<string, string> = {BTC:'#f7931a',USDT:'#26a17b',ETH:'#627eea',BNB:'#f3ba2f',SOL:'#9945ff',ADA:'#3366ff',DOT:'#e6007a',TRX:'#ef0027',XRP:'#8b949e',DOGE:'#c2a633',WLD:'#8b949e',TON:'#0098ea',SUI:'#4da2ff',AVAX:'#e84142',POL:'#8247e5'};
const ASSETS_SHOW = ['BTC','USDT','ETH','BNB','SOL'];
const fmtThb = (n: number) => '฿' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n: number, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (n: number | null) => n == null || isNaN(n) ? '-' : n.toFixed(3) + '%';
const ltvColor = (v: number) => v < 60 ? 'var(--green)' : v < 80 ? 'var(--orange)' : 'var(--red)';
const ltvClass = (v: number) => v < 60 ? 'ltv-safe' : v < 80 ? 'ltv-warn' : 'ltv-danger';

// ── Component ────────────────────────────────────────────────────────────────
export default function ViewerPage() {
  const [currentPage, setCurrentPage] = useState<'view' | 'edit'>('view');
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [lastPriceFetch, setLastPriceFetch] = useState<Date | null>(null);
  const [priceStatus, setPriceStatus] = useState('');

  // View state
  const [viewInput, setViewInput] = useState('');
  const [viewError, setViewError] = useState('');
  const [viewLoan, setViewLoan] = useState<LoanData | null>(null);

  // Edit state
  const [editInput, setEditInput] = useState('');
  const [editError, setEditError] = useState('');
  const [editLoan, setEditLoan] = useState<LoanData | null>(null);
  const [editForm, setEditForm] = useState({ collateral_amount: '', daily_interest_rate: '', start_date: '', end_date: '', status: 'active' });
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchPricesData = useCallback(async () => {
    try {
      const r = await fetch('/api/prices');
      const d = await r.json();
      setPrices(d);
      setLastPriceFetch(new Date());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchPricesData();
    const iv = setInterval(fetchPricesData, 60000);
    return () => clearInterval(iv);
  }, [fetchPricesData]);

  useEffect(() => {
    if (!lastPriceFetch) { setPriceStatus('loading...'); return; }
    const update = () => {
      const s = Math.round((Date.now() - lastPriceFetch.getTime()) / 1000);
      const t = s < 60 ? 'just now' : Math.floor(s / 60) + 'm ago';
      setPriceStatus('● Live · ' + t);
    };
    update();
    const iv = setInterval(update, 30000);
    return () => clearInterval(iv);
  }, [lastPriceFetch]);

  // ── View Loan ──────────────────────────────────────────────────────────────
  async function lookupLoan() {
    const id = viewInput.trim();
    if (!id) { setViewError('Please enter a Loan ID.'); return; }
    setViewError('');
    try {
      const r = await fetch('/api/loans/' + id);
      const d = await r.json();
      if (d.error) { setViewError('No loan found with ID "' + id + '".'); return; }
      setViewLoan(d);
    } catch (e) { setViewError('Error: ' + (e as Error).message); }
  }

  // ── Edit Loan ──────────────────────────────────────────────────────────────
  async function loadForEdit() {
    const id = editInput.trim();
    if (!id) { setEditError('Please enter a Loan ID.'); return; }
    setEditError('');
    try {
      const r = await fetch('/api/loans/' + id);
      const d = await r.json();
      if (d.error) { setEditError('No loan found with ID "' + id + '".'); return; }
      setEditLoan(d);
      setEditForm({ collateral_amount: String(d.collateral_amount), daily_interest_rate: String(d.daily_interest_rate), start_date: d.start_date || '', end_date: d.end_date || '', status: d.status });
      setSaveError(''); setSaveOk(false);
    } catch (e) { setEditError('Error: ' + (e as Error).message); }
  }

  async function saveEdit() {
    if (!editLoan) return;
    const collateral_amount = parseFloat(editForm.collateral_amount);
    const daily_interest_rate = parseFloat(editForm.daily_interest_rate);
    if (isNaN(collateral_amount) || collateral_amount <= 0) { setSaveError('Collateral amount must be a positive number.'); return; }
    if (isNaN(daily_interest_rate) || daily_interest_rate < 0) { setSaveError('Daily interest rate must be 0 or greater.'); return; }
    setSaving(true); setSaveError(''); setSaveOk(false);
    try {
      const r = await fetch('/api/loans/' + editLoan.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collateral_amount, daily_interest_rate, start_date: editForm.start_date || null, end_date: editForm.end_date || null, status: editForm.status }),
      });
      const d = await r.json();
      if (!d.ok) { setSaveError(d.error || 'Update failed.'); }
      else { setEditLoan(d.loan); setSaveOk(true); setEditForm(f => ({ ...f, status: d.loan.status })); }
    } catch (e) { setSaveError('Error: ' + (e as Error).message); }
    setSaving(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-letter sm">L</div>
          <div className="logo-label"><span>Liber</span>ix</div>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-section-title">User Menu</div>
          <div className={`sidebar-link${currentPage === 'view' ? ' active' : ''}`} onClick={() => { setCurrentPage('view'); setViewLoan(null); setViewInput(''); setViewError(''); }}>
            <span className="ico">&#128269;</span> View Loan
          </div>
          <div className={`sidebar-link${currentPage === 'edit' ? ' active' : ''}`} onClick={() => { setCurrentPage('edit'); setEditLoan(null); setEditInput(''); setEditError(''); }}>
            <span className="ico">&#9998;</span> Edit Loan
          </div>
        </div>
        <div className="sidebar-price-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div className="price-panel-title">Asset Prices (THB)</div>
            <button onClick={fetchPricesData} className="price-refresh-btn" title="Refresh">&#8635;</button>
          </div>
          <div className="price-status-text">{priceStatus}</div>
          {ASSETS_SHOW.map(a => (
            <div key={a} className="price-row">
              <div className="price-asset"><span className="price-dot" style={{ background: ASSET_COLORS[a] || '#888' }} />{a}</div>
              <span className="price-val">{fmtNum(prices[a] || 0, 0)}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <div className="main">
        {/* VIEW PAGE */}
        {currentPage === 'view' && (
          <>
            <div className="page-header">
              <div><div className="page-title">View Loan</div><div className="page-subtitle">Look up your loan details by ID</div></div>
              <Link href="/" className="logout-btn">&#8592; Back</Link>
            </div>

            {!viewLoan ? (
              <div className="user-lookup-box">
                <div className="user-lookup-title">Look Up Your Loan</div>
                <div className="user-lookup-sub">Enter your Loan ID to view loan details</div>
                <div className="user-lookup-input-wrap">
                  <input className="user-lookup-input" value={viewInput} onChange={e => setViewInput(e.target.value)} placeholder="Enter Loan ID (e.g. OEL-2026-001)" onKeyDown={e => e.key === 'Enter' && lookupLoan()} />
                  <button className="user-lookup-btn" onClick={lookupLoan}>Search</button>
                </div>
                {viewError && <div className="user-lookup-error">{viewError}</div>}
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <button className="user-back-btn" onClick={() => { setViewLoan(null); setViewInput(''); }}>&#8592; Search Another Loan</button>
                </div>
                <LoanViewCard loan={viewLoan} />
              </div>
            )}
          </>
        )}

        {/* EDIT PAGE */}
        {currentPage === 'edit' && (
          <>
            <div className="page-header">
              <div><div className="page-title">Edit Loan</div><div className="page-subtitle">Update loan details by ID</div></div>
              <Link href="/" className="logout-btn">&#8592; Back</Link>
            </div>

            {!editLoan ? (
              <div className="user-lookup-box">
                <div className="user-lookup-title">Find Your Loan</div>
                <div className="user-lookup-sub">Enter your Loan ID to load editable fields</div>
                <div className="user-lookup-input-wrap">
                  <input className="user-lookup-input" value={editInput} onChange={e => setEditInput(e.target.value)} placeholder="Enter Loan ID (e.g. OEL-2026-001)" onKeyDown={e => e.key === 'Enter' && loadForEdit()} />
                  <button className="user-lookup-btn" onClick={loadForEdit}>Load</button>
                </div>
                {editError && <div className="user-lookup-error">{editError}</div>}
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <button className="user-back-btn" onClick={() => { setEditLoan(null); setEditInput(''); setSaveError(''); setSaveOk(false); }}>&#8592; Search Another Loan</button>
                </div>
                <div className="edit-loan-card">
                  <div className="edit-loan-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className={`asset-chip ${editLoan.asset_type.toLowerCase()}`}>{editLoan.asset_type}</span>
                      <strong style={{ fontFamily: 'var(--font-ibm-mono,monospace)', fontSize: 15 }}>{editLoan.id}</strong>
                    </div>
                    <span className={`status-badge status-${editForm.status}`}>{editForm.status.replace('_', ' ').toUpperCase()}</span>
                  </div>
                  <div className="edit-loan-body">
                    <div className="edit-section-title">Editable Fields</div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Collateral Amount</label>
                        <input className="form-input" type="number" step="any" value={editForm.collateral_amount} onChange={e => setEditForm(f => ({ ...f, collateral_amount: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Daily Interest Rate (%)</label>
                        <input className="form-input" type="number" step="any" value={editForm.daily_interest_rate} onChange={e => setEditForm(f => ({ ...f, daily_interest_rate: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Start Date</label>
                        <input className="form-input" type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">End Date <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
                        <input className="form-input" type="date" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Status</label>
                        <select className="form-select" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                          <option value="active">Active</option>
                          <option value="pending_transfer">Pending Transfer</option>
                          <option value="pending_deposit">Pending Deposit</option>
                          <option value="closed">Closed</option>
                        </select>
                      </div>
                    </div>
                    {saveError && <div className="user-lookup-error" style={{ marginTop: 8 }}>{saveError}</div>}
                    {saveOk && <div style={{ color: 'var(--green)', fontSize: 13, marginTop: 8 }}>&#10003; Loan updated successfully.</div>}
                  </div>
                  <div className="edit-loan-footer">
                    <button className="btn btn-ghost" onClick={() => { setEditLoan(null); setEditInput(''); }}>Cancel</button>
                    <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Loan View Card ────────────────────────────────────────────────────────────
function LoanViewCard({ loan: l }: { loan: LoanData }) {
  const ltv = l.current_ltv || 0;
  const fmtThb = (n: number) => '฿' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNum = (n: number, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const ltvColorFn = (v: number) => v < 60 ? 'var(--green)' : v < 80 ? 'var(--orange)' : 'var(--red)';
  const ltvClassFn = (v: number) => v < 60 ? 'ltv-safe' : v < 80 ? 'ltv-warn' : 'ltv-danger';

  return (
    <div className="user-loan-card">
      <div className="user-loan-card-header">
        <div className="user-loan-card-id">
          <span className={`asset-chip ${l.asset_type.toLowerCase()}`}>{l.asset_type}</span>
          {l.id}
        </div>
        <span className={`status-badge status-${l.status}`}>{l.status.replace('_', ' ').toUpperCase()}</span>
      </div>
      <div className="user-loan-card-body">
        <div className="user-loan-grid">
          {[
            ['Collateral Amount', fmtNum(l.collateral_amount, 6) + ' ' + l.asset_type],
            ['Init. Collateral Value', fmtThb(l.initial_collateral_value)],
            ['Loan Amount', fmtThb(l.loan_amount), 'large'],
            ['LTV at Origination', l.ltv_ratio + '%'],
            ['Daily Interest Rate', l.daily_interest_rate + '%'],
            ['Start Date', l.start_date],
            ['End Date', l.end_date || 'Open (no end date)'],
            ['Duration', l.duration_days + ' days'],
            ['Accrued Interest', fmtThb(l.accrued_interest)],
            ['Total Repayment', fmtThb(l.total_repayment), 'large highlight'],
            ['Current Price', fmtThb(l.current_price)],
            ['Current Collateral Value', fmtThb(l.current_collateral_value)],
          ].map(([label, value, cls]) => (
            <div key={label as string} className="user-loan-field">
              <div className="user-loan-field-label">{label}</div>
              <div className={`user-loan-field-value${cls ? ' ' + cls : ''}`}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '16px 0 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="user-loan-field-label">Current LTV</span>
            <span style={{ fontFamily: 'var(--font-ibm-mono,monospace)', fontSize: 15, fontWeight: 700, color: ltvColorFn(ltv) }}>{fmtNum(ltv, 2)}%</span>
          </div>
          <div className="ltv-bar-wrap"><div className="ltv-bar-track"><div className={`ltv-bar-fill ${ltvClassFn(ltv)}`} style={{ width: Math.min(100, ltv) + '%' }} /></div></div>
        </div>
      </div>
      <div className="user-loan-card-footer">
        <div className="user-loan-timestamp">Queried {new Date().toLocaleString()}</div>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Read-only view</span>
      </div>
    </div>
  );
}
