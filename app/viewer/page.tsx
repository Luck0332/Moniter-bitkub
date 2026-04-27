'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface LoanData {
  id: string; asset_type: string; collateral_amount: number;
  initial_collateral_value: number; loan_amount: number; ltv_ratio: number;
  daily_interest_rate: number; start_date: string; end_date: string | null;
  status: string; duration_days: number; accrued_interest: number;
  total_repayment: number; current_price: number; current_collateral_value: number;
  current_ltv: number;
}

const ASSET_COLORS: Record<string, string> = { BTC: '#f7931a', USDT: '#26a17b', ETH: '#627eea', BNB: '#f3ba2f', SOL: '#9945ff', ADA: '#3366ff', DOT: '#e6007a', TRX: '#ef0027', XRP: '#8b949e', DOGE: '#c2a633', WLD: '#8b949e', TON: '#0098ea', SUI: '#4da2ff', AVAX: '#e84142', POL: '#8247e5' };
const ASSETS_SHOW = ['BTC', 'USDT', 'ETH', 'BNB', 'SOL'];
const fmtThb = (n: number) => '฿' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n: number, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const ltvColor = (v: number) => v < 60 ? 'var(--green)' : v < 80 ? 'var(--orange)' : 'var(--red)';
const ltvClass = (v: number) => v < 60 ? 'ltv-safe' : v < 80 ? 'ltv-warn' : 'ltv-danger';

export default function ViewerPage() {
  const [currentPage, setCurrentPage] = useState<'view' | 'edit'>('view');
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [lastPriceFetch, setLastPriceFetch] = useState<Date | null>(null);
  const [priceStatus, setPriceStatus] = useState('');

  const [viewInput, setViewInput] = useState('');
  const [viewError, setViewError] = useState('');
  const [viewLoan, setViewLoan] = useState<LoanData | null>(null);

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
      setPriceStatus(s < 60 ? 'just now' : Math.floor(s / 60) + 'm ago');
    };
    update();
    const iv = setInterval(update, 30000);
    return () => clearInterval(iv);
  }, [lastPriceFetch]);

  async function lookupLoan() {
    const id = viewInput.trim();
    if (!id) { setViewError('Enter a Loan ID.'); return; }
    setViewError('');
    try {
      const r = await fetch('/api/loans/' + id);
      const d = await r.json();
      if (d.error) { setViewError('No loan found with ID "' + id + '".'); return; }
      setViewLoan(d);
    } catch (e) { setViewError('Error: ' + (e as Error).message); }
  }

  async function loadForEdit() {
    const id = editInput.trim();
    if (!id) { setEditError('Enter a Loan ID.'); return; }
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
    if (isNaN(collateral_amount) || collateral_amount <= 0) { setSaveError('Collateral amount must be positive.'); return; }
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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="sidebar-logo-icon">L</div>
          <div className="sidebar-logo-name">Liberix</div>
        </div>
        <nav className="sidebar-nav">
          <div className={`nav-item${currentPage === 'view' ? ' active' : ''}`} onClick={() => { setCurrentPage('view'); setViewLoan(null); setViewInput(''); setViewError(''); }}>
            <span className="nav-ico">&#128269;</span> View Loan
          </div>
          <div className={`nav-item${currentPage === 'edit' ? ' active' : ''}`} onClick={() => { setCurrentPage('edit'); setEditLoan(null); setEditInput(''); setEditError(''); }}>
            <span className="nav-ico">&#9998;</span> Edit Loan
          </div>
        </nav>
        <div className="sidebar-prices">
          <div className="prices-label">
            Prices
            <button className="price-refresh" onClick={fetchPricesData} title="Refresh">&#8635;</button>
          </div>
          <div className="prices-status">{priceStatus}</div>
          {ASSETS_SHOW.map(a => (
            <div key={a} className="price-row">
              <div className="price-asset"><span className="price-dot" style={{ background: ASSET_COLORS[a] || '#888' }} />{a}</div>
              <span className="price-val">{fmtNum(prices[a] || 0, 0)}</span>
            </div>
          ))}
        </div>
      </aside>

      <div className="main">
        {currentPage === 'view' && (
          <>
            <div className="page-head">
              <div>
                <div className="page-title">View Loan</div>
                <div className="page-sub">Look up loan details by ID</div>
              </div>
              <Link href="/" className="btn-lock">&#8592; Back</Link>
            </div>

            {!viewLoan ? (
              <div className="lookup-box">
                <div className="lookup-title">Look Up Loan</div>
                <div className="lookup-sub">Enter your Loan ID</div>
                <div className="lookup-row">
                  <input className="lookup-input" value={viewInput} onChange={e => setViewInput(e.target.value)} placeholder="OEL-2026-001" onKeyDown={e => e.key === 'Enter' && lookupLoan()} />
                  <button className="btn btn-primary" onClick={lookupLoan}>Search</button>
                </div>
                {viewError && <div className="lookup-err">{viewError}</div>}
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setViewLoan(null); setViewInput(''); }}>&#8592; Search another</button>
                </div>
                <LoanViewCard loan={viewLoan} />
              </>
            )}
          </>
        )}

        {currentPage === 'edit' && (
          <>
            <div className="page-head">
              <div>
                <div className="page-title">Edit Loan</div>
                <div className="page-sub">Update loan details by ID</div>
              </div>
              <Link href="/" className="btn-lock">&#8592; Back</Link>
            </div>

            {!editLoan ? (
              <div className="lookup-box">
                <div className="lookup-title">Find Loan</div>
                <div className="lookup-sub">Enter your Loan ID to load editable fields</div>
                <div className="lookup-row">
                  <input className="lookup-input" value={editInput} onChange={e => setEditInput(e.target.value)} placeholder="OEL-2026-001" onKeyDown={e => e.key === 'Enter' && loadForEdit()} />
                  <button className="btn btn-primary" onClick={loadForEdit}>Load</button>
                </div>
                {editError && <div className="lookup-err">{editError}</div>}
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditLoan(null); setEditInput(''); setSaveError(''); setSaveOk(false); }}>&#8592; Search another</button>
                </div>
                <div className="edit-card">
                  <div className="edit-card-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`chip chip-${editLoan.asset_type.toLowerCase()}`}>{editLoan.asset_type}</span>
                      <span style={{ fontFamily: 'var(--font-ibm-mono,monospace)', fontSize: 13, fontWeight: 600 }}>{editLoan.id}</span>
                    </div>
                    <span className={`sbadge s-${editForm.status}`}>{editForm.status.replace('_', ' ')}</span>
                  </div>
                  <div className="edit-card-body">
                    <div className="section-label">Editable fields</div>
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
                    {saveError && <div className="form-err">{saveError}</div>}
                    {saveOk && <div className="form-ok">&#10003; Saved successfully.</div>}
                  </div>
                  <div className="edit-card-foot">
                    <button className="btn btn-ghost" onClick={() => { setEditLoan(null); setEditInput(''); }}>Cancel</button>
                    <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LoanViewCard({ loan: l }: { loan: LoanData }) {
  const ltv = l.current_ltv || 0;
  return (
    <div className="view-card">
      <div className="view-card-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`chip chip-${l.asset_type.toLowerCase()}`}>{l.asset_type}</span>
          <span style={{ fontFamily: 'var(--font-ibm-mono,monospace)', fontSize: 13, fontWeight: 600 }}>{l.id}</span>
        </div>
        <span className={`sbadge s-${l.status}`}>{l.status.replace('_', ' ')}</span>
      </div>
      <div className="view-card-body">
        <div className="view-fields">
          {([
            ['Collateral', fmtNum(l.collateral_amount, 6) + ' ' + l.asset_type],
            ['Init. Collateral Value', fmtThb(l.initial_collateral_value)],
            ['Loan Amount', fmtThb(l.loan_amount)],
            ['LTV at Origination', l.ltv_ratio + '%'],
            ['Daily Interest', l.daily_interest_rate + '%'],
            ['Start Date', l.start_date],
            ['End Date', l.end_date || 'Open'],
            ['Duration', l.duration_days + ' days'],
            ['Accrued Interest', fmtThb(l.accrued_interest)],
            ['Total Repayment', fmtThb(l.total_repayment)],
            ['Current Price', fmtThb(l.current_price)],
            ['Collateral Value Now', fmtThb(l.current_collateral_value)],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} className="view-field">
              <div className="field-label">{label}</div>
              <div className="field-val mono">{value}</div>
            </div>
          ))}
        </div>
        <div style={{ paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, fontSize: 11 }}>
            <span style={{ color: 'var(--text-3)' }}>Current LTV</span>
            <span className="mono" style={{ fontWeight: 700, fontSize: 13, color: ltvColor(ltv) }}>{fmtNum(ltv, 2)}%</span>
          </div>
          <div className="ltv-bar"><div className={`ltv-fill ${ltvClass(ltv)}`} style={{ width: Math.min(100, ltv) + '%' }} /></div>
        </div>
      </div>
    </div>
  );
}
