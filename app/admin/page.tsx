'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────────────
interface Loan {
  id: string; asset_type: string; collateral_amount: number;
  initial_collateral_value: number; loan_amount: number; ltv_ratio: number;
  daily_interest_rate: number; start_date: string; end_date: string | null;
  status: string; duration_days: number; accrued_interest: number;
  total_repayment: number; current_price: number; current_collateral_value: number; current_ltv: number;
}
interface LoanForm {
  id: string; asset_type: string; collateral_amount: string; initial_collateral_value: string;
  loan_amount: string; ltv_ratio: string; daily_interest_rate: string;
  start_date: string; end_date: string; status: string;
}
interface CoinSummary {
  best_bid: number; total_amount: number; liquidity_depth: number; slippage_pct: number;
  vol_used: number; threshold: number; threshold_breached: boolean; error?: string;
  safety: { safe_vol: number; safe_thb: number; is_safe: boolean };
}
interface LiqSummary { timestamp: string; coins: Record<string, CoinSummary> }
interface LiqDetailLevel {
  amount: number; price: number; bid_size: number; accru_amount: number;
  amount_match: number; sales_matched: number; accru_matched: number;
}
interface LiqDetail {
  symbol: string; best_bid: number; vol_used: number; vol_received: number;
  slippage: number; threshold: number;
  safety: { safe_vol: number; safe_thb: number; crossed_at_level: number; is_safe: boolean };
  levels: LiqDetailLevel[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const PASSCODE_HASH = '2440809e3ec26b00648124b65a81946fff578a91c8365009ffe4dd0e964af874';
const ASSET_COLORS: Record<string, string> = {BTC:'#f7931a',USDT:'#26a17b',ETH:'#627eea',BNB:'#f3ba2f',SOL:'#9945ff',ADA:'#3366ff',DOT:'#e6007a',TRX:'#ef0027',XRP:'#8b949e',DOGE:'#c2a633',WLD:'#8b949e',TON:'#0098ea',SUI:'#4da2ff',AVAX:'#e84142',POL:'#8247e5'};
const ASSETS_SHOW = ['BTC','USDT','ETH','BNB','SOL'];
const fmtThb = (n: number) => '฿' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n: number, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (n: number | null) => n == null || isNaN(n) ? '-' : n.toFixed(3) + '%';
const ltvColor = (v: number) => v < 60 ? 'var(--green)' : v < 80 ? 'var(--orange)' : 'var(--red)';
const ltvClass = (v: number) => v < 60 ? 'ltv-safe' : v < 80 ? 'ltv-warn' : 'ltv-danger';

async function hashPasscode(s: string): Promise<string> {
  const d = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest('SHA-256', d);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const emptyForm = (): LoanForm => ({
  id: '', asset_type: '', collateral_amount: '', initial_collateral_value: '',
  loan_amount: '', ltv_ratio: '', daily_interest_rate: '0.041666667',
  start_date: new Date().toISOString().split('T')[0], end_date: '', status: 'active',
});

// ── Component ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  // Lock
  const [locked, setLocked] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [lockError, setLockError] = useState('');
  const [lockShake, setLockShake] = useState(false);
  const lockInputRef = useRef<HTMLInputElement>(null);

  // App
  const [page, setPage] = useState<'loans' | 'liquidity' | 'closed'>('loans');
  const [loans, setLoans] = useState<Loan[]>([]);
  const [closedLoans, setClosedLoans] = useState<Loan[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [assetTypes, setAssetTypes] = useState<string[]>([]);
  const [ltvOptions, setLtvOptions] = useState<number[]>([]);
  const [lastPriceFetch, setLastPriceFetch] = useState<Date | null>(null);
  const [priceStatus, setPriceStatus] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<LoanForm>(emptyForm());

  // Liquidity
  const [depth, setDepth] = useState(90);
  const [threshold, setThreshold] = useState(-3.5);
  const [liqData, setLiqData] = useState<LiqSummary | null>(null);
  const [liqLoading, setLiqLoading] = useState(false);
  const [liqLastUpdate, setLiqLastUpdate] = useState('');
  const [liqDetail, setLiqDetail] = useState<LiqDetail | null>(null);
  const [liqCoin, setLiqCoin] = useState<string | null>(null);
  const [volInputs, setVolInputs] = useState<Record<string, string>>({});
  const [liqDetailVol, setLiqDetailVol] = useState('');

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionStorage.getItem('liberix-admin')) {
      setLocked(false);
      loadActiveLoans();
    } else {
      setTimeout(() => lockInputRef.current?.focus(), 100);
    }
  }, []);

  // ── Prices ─────────────────────────────────────────────────────────────────
  const fetchPricesData = useCallback(async () => {
    try {
      const r = await fetch('/api/prices');
      const d = await r.json();
      setPrices(d);
      setLastPriceFetch(new Date());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (locked) return;
    fetchPricesData();
    const iv = setInterval(fetchPricesData, 60000);
    return () => clearInterval(iv);
  }, [locked, fetchPricesData]);

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

  // ── Lock ───────────────────────────────────────────────────────────────────
  async function attemptUnlock() {
    const hash = await hashPasscode(passcode);
    if (hash === PASSCODE_HASH) {
      setLocked(false);
      sessionStorage.setItem('liberix-admin', '1');
      setPasscode('');
      setLockError('');
      loadActiveLoans();
    } else {
      setLockShake(true);
      setLockError('Incorrect passcode.');
      setPasscode('');
      setTimeout(() => { setLockShake(false); lockInputRef.current?.focus(); }, 500);
    }
  }

  function lockApp() {
    setLocked(true);
    sessionStorage.removeItem('liberix-admin');
    setPasscode('');
    setLockError('');
    setTimeout(() => lockInputRef.current?.focus(), 400);
  }

  // ── Loans ──────────────────────────────────────────────────────────────────
  async function loadActiveLoans() {
    try {
      const r = await fetch('/api/loans?status=active');
      const d = await r.json();
      setLoans(d.loans || []);
    } catch (e) { console.error(e); }
  }

  async function loadClosedLoans() {
    try {
      const r = await fetch('/api/loans?status=closed');
      const d = await r.json();
      setClosedLoans(d.loans || []);
    } catch (e) { console.error(e); }
  }

  async function openModal() {
    try {
      const r = await fetch('/api/loans/config');
      const c = await r.json();
      setAssetTypes(c.asset_types || []);
      setLtvOptions(c.ltv_options || []);
    } catch { /* use existing */ }
    setForm(emptyForm());
    setShowModal(true);
  }

  // Auto-calc collateral value and loan amount
  function handleFormChange(field: string, value: string) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      const asset = field === 'asset_type' ? value : next.asset_type;
      const amt = field === 'collateral_amount' ? parseFloat(value) : parseFloat(next.collateral_amount);
      const ltv = field === 'ltv_ratio' ? parseInt(value) : parseInt(next.ltv_ratio);
      const price = prices[asset] || 0;
      if (asset && amt > 0 && price > 0) {
        const collVal = amt * price;
        next.initial_collateral_value = collVal.toFixed(2);
        if (ltv > 0) next.loan_amount = (collVal * ltv / 100).toFixed(2);
      }
      return next;
    });
  }

  async function createLoan() {
    if (!form.id || !form.asset_type) { alert('Please fill Loan ID and Asset Type'); return; }
    await fetch('/api/loans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: form.id, asset_type: form.asset_type,
        collateral_amount: parseFloat(form.collateral_amount) || 0,
        initial_collateral_value: parseFloat(form.initial_collateral_value) || 0,
        loan_amount: parseFloat(form.loan_amount) || 0,
        ltv_ratio: parseInt(form.ltv_ratio) || 0,
        daily_interest_rate: parseFloat(form.daily_interest_rate) || 0,
        start_date: form.start_date, end_date: form.end_date || null, status: form.status,
      }),
    });
    setShowModal(false);
    loadActiveLoans();
  }

  async function updateEndDate(id: string, value: string) {
    await fetch('/api/loans/' + id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ end_date: value || null }),
    });
    loadActiveLoans();
  }

  async function deleteLoan(id: string) {
    if (!confirm('Delete loan ' + id + '?')) return;
    await fetch('/api/loans/' + id, { method: 'DELETE' });
    loadActiveLoans();
  }

  // ── Liquidity ──────────────────────────────────────────────────────────────
  async function fetchLiqSummary() {
    setLiqLoading(true);
    try {
      const r = await fetch(`/api/liquidity/summary?depth=${depth / 100}&threshold=${threshold / 100}`);
      const d = await r.json();
      setLiqData(d);
      setLiqLastUpdate('Updated: ' + new Date(d.timestamp).toLocaleTimeString());
    } catch (e) { console.error(e); }
    setLiqLoading(false);
  }

  async function recalcCoin(coin: string) {
    const v = parseFloat(volInputs[coin] || '');
    if (!v || v <= 0) return;
    const r = await fetch(`/api/liquidity/orderbook/${coin}?depth=${depth / 100}&custom_vol=${v}&threshold=${threshold / 100}`);
    const d = await r.json();
    setLiqData(prev => {
      if (!prev) return prev;
      return { ...prev, coins: { ...prev.coins, [coin]: { ...prev.coins[coin], liquidity_depth: d.vol_received, slippage_pct: d.slippage, safety: d.safety } } };
    });
  }

  async function showLiqDetail(coin: string) {
    setLiqCoin(coin);
    const v = parseFloat(volInputs[coin] || '');
    let url = `/api/liquidity/orderbook/${coin}?depth=${depth / 100}&threshold=${threshold / 100}`;
    if (v > 0) { url += `&custom_vol=${v}`; setLiqDetailVol(String(v)); } else { setLiqDetailVol(''); }
    const r = await fetch(url);
    setLiqDetail(await r.json());
  }

  async function recalcDetail() {
    if (!liqCoin) return;
    const v = parseFloat(liqDetailVol);
    let url = `/api/liquidity/orderbook/${liqCoin}?depth=${depth / 100}&threshold=${threshold / 100}`;
    if (v > 0) url += `&custom_vol=${v}`;
    const r = await fetch(url);
    setLiqDetail(await r.json());
  }

  function slipClass(p: number | null) {
    if (p == null) return '';
    const t = Math.abs(threshold);
    return Math.abs(p) < t * 0.5 ? 'slip-ok' : Math.abs(p) < t ? 'slip-warn' : 'slip-danger';
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function goToPage(p: typeof page) {
    setPage(p);
    if (p === 'loans') loadActiveLoans();
    if (p === 'liquidity') fetchLiqSummary();
    if (p === 'closed') loadClosedLoans();
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowModal(false); setLiqDetail(null); setLiqCoin(null); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (locked) {
    return (
      <div className="lock-overlay">
        <div className="lock-box">
          <div className="landing-logo" style={{ marginBottom: 20 }}>
            <div className="logo-letter" style={{ width: '100%', height: '100%', borderRadius: 22, fontSize: '2rem' }}>L</div>
          </div>
          <div className="lock-title">Admin Access</div>
          <div className="lock-subtitle">Enter your passcode to continue</div>
          <div className="lock-input-wrap">
            <input ref={lockInputRef} className={`lock-input${lockShake ? ' error' : ''}`} type="password" value={passcode}
              onChange={e => setPasscode(e.target.value)} onKeyDown={e => e.key === 'Enter' && attemptUnlock()} placeholder="••••••" />
            <button className="lock-btn" onClick={attemptUnlock}>Enter</button>
          </div>
          <div className="lock-error-msg">{lockError}</div>
          <Link href="/" className="lock-back-link">← Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── App Shell ── */}
      <div className="app">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-letter sm">L</div>
            <div className="logo-label"><span>Liber</span>ix</div>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-section-title">Management</div>
            {(['loans', 'liquidity', 'closed'] as const).map(p => (
              <div key={p} className={`sidebar-link${page === p ? ' active' : ''}`} onClick={() => goToPage(p)}>
                <span className="ico">{p === 'loans' ? '💳' : p === 'liquidity' ? '📊' : '🗃️'}</span>
                {p === 'loans' ? 'Active Loans' : p === 'liquidity' ? 'Liquidity Monitor' : 'Closed Loans'}
              </div>
            ))}
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

        {/* Main */}
        <div className="main">
          {/* ── LOANS PAGE ── */}
          {page === 'loans' && (
            <>
              <div className="page-header">
                <div><div className="page-title">Active Loans</div><div className="page-subtitle">Current open-end loan portfolio</div></div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={openModal}>+ New Loan</button>
                  <button className="lock-toggle" onClick={lockApp}>&#128274; Lock</button>
                  <Link href="/" className="logout-btn">&#8592; Exit</Link>
                </div>
              </div>
              <SummaryStrip loans={loans} />
              {loans.length === 0 ? (
                <div className="empty-state"><div className="ico">💳</div><p>No active loans yet.</p><button className="btn btn-primary" onClick={openModal}>+ New Loan</button></div>
              ) : (
                <div className="loans-grid">
                  {loans.map((l, i) => (
                    <LoanCard key={l.id} loan={l} index={i} onDeleteLoan={deleteLoan} onUpdateEndDate={updateEndDate} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── LIQUIDITY PAGE ── */}
          {page === 'liquidity' && (
            <>
              <div className="page-header">
                <div><div className="page-title">Liquidity Monitor</div><div className="page-subtitle">Bitkub order book depth analysis</div></div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button className="lock-toggle" onClick={lockApp}>&#128274; Lock</button>
                  <Link href="/" className="logout-btn">&#8592; Exit</Link>
                </div>
              </div>

              {!liqDetail ? (
                <div id="liqSummarySection">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                    <div className="liq-controls">
                      <label>Depth %: <input className="form-input" style={{ width: 70, display: 'inline-block' }} type="number" value={depth} onChange={e => setDepth(Number(e.target.value))} onBlur={fetchLiqSummary} /></label>
                      <label>Safety Threshold %: <input className="form-input" style={{ width: 80, display: 'inline-block' }} type="number" value={threshold} onChange={e => setThreshold(Number(e.target.value))} onBlur={fetchLiqSummary} /></label>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{liqLastUpdate}</span>
                      <button className="btn btn-primary btn-sm" onClick={fetchLiqSummary} disabled={liqLoading}>{liqLoading ? '...' : 'Refresh'}</button>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table className="liq-table">
                      <thead><tr><th>Coin</th><th>Best Bid</th><th>Custom Vol</th><th>Liq. Depth (THB)</th><th>Slippage %</th><th>Safe Vol</th><th>Safe THB</th><th></th></tr></thead>
                      <tbody>
                        {!liqData ? (
                          <tr><td colSpan={8} className="loading">Click Refresh to load data</td></tr>
                        ) : Object.entries(liqData.coins).sort((a, b) => (b[1].liquidity_depth || 0) - (a[1].liquidity_depth || 0)).map(([coin, info]) => {
                          if (info.error) return <tr key={coin}><td className="coin-name">{coin}</td><td colSpan={7} className="slip-danger">{info.error}</td></tr>;
                          const sc = slipClass(info.slippage_pct);
                          return (
                            <tr key={coin}>
                              <td className="coin-name">{coin}</td>
                              <td>{fmtNum(info.best_bid, 2)}</td>
                              <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input type="number" className="vol-input" value={volInputs[coin] || ''} onChange={e => setVolInputs(v => ({ ...v, [coin]: e.target.value }))} placeholder={fmtNum(info.vol_used, 4)} step="any" min="0" />
                                <button className="btn-calc" onClick={() => recalcCoin(coin)}>Calc</button>
                              </td>
                              <td>{fmtNum(info.liquidity_depth, 2)}</td>
                              <td className={sc}>{fmtPct(info.slippage_pct)}</td>
                              <td>{info.safety.is_safe ? <span className="badge-safe">SAFE</span> : fmtNum(info.safety.safe_vol, 4)}</td>
                              <td>{info.safety.is_safe ? '' : fmtNum(info.safety.safe_thb, 2)}</td>
                              <td><button className="btn btn-ghost btn-sm" onClick={() => showLiqDetail(coin)}>View</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <LiquidityDetail detail={liqDetail} threshold={threshold} depth={depth} liqDetailVol={liqDetailVol} setLiqDetailVol={setLiqDetailVol} onRecalc={recalcDetail} onClose={() => { setLiqDetail(null); setLiqCoin(null); }} slipClass={slipClass} />
              )}
            </>
          )}

          {/* ── CLOSED LOANS PAGE ── */}
          {page === 'closed' && (
            <>
              <div className="page-header">
                <div><div className="page-title">Closed Loans</div><div className="page-subtitle">Historical closed loan records</div></div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button className="lock-toggle" onClick={lockApp}>&#128274; Lock</button>
                  <Link href="/" className="logout-btn">&#8592; Exit</Link>
                </div>
              </div>
              {closedLoans.length === 0 ? (
                <div className="empty-state"><div className="ico">🗃️</div><p>No closed loans yet.</p></div>
              ) : (
                <div className="loans-grid">
                  {closedLoans.map((l, i) => (
                    <LoanCard key={l.id} loan={l} index={i} onDeleteLoan={deleteLoan} onUpdateEndDate={updateEndDate} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── New Loan Modal ── */}
      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">New Loan</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Loan ID *</label>
                  <input className="form-input" value={form.id} onChange={e => handleFormChange('id', e.target.value)} placeholder="OEL-2026-001" />
                </div>
                <div className="form-group">
                  <label className="form-label">Asset Type *</label>
                  <select className="form-select" value={form.asset_type} onChange={e => handleFormChange('asset_type', e.target.value)}>
                    <option value="">Select asset...</option>
                    {assetTypes.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Collateral Amount</label>
                  <input className="form-input" type="number" step="any" value={form.collateral_amount} onChange={e => handleFormChange('collateral_amount', e.target.value)} placeholder="0.00000" />
                </div>
                <div className="form-group">
                  <label className="form-label">LTV Ratio (%)</label>
                  <select className="form-select" value={form.ltv_ratio} onChange={e => handleFormChange('ltv_ratio', e.target.value)}>
                    <option value="">Select LTV...</option>
                    {ltvOptions.map(l => <option key={l} value={l}>{l}%</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Init. Collateral Value (THB)</label>
                  <input className="form-input" type="number" step="any" value={form.initial_collateral_value} onChange={e => setForm(f => ({ ...f, initial_collateral_value: e.target.value }))} placeholder="auto-calc" />
                </div>
                <div className="form-group">
                  <label className="form-label">Loan Amount (THB)</label>
                  <input className="form-input" type="number" step="any" value={form.loan_amount} onChange={e => setForm(f => ({ ...f, loan_amount: e.target.value }))} placeholder="auto-calc" />
                </div>
                <div className="form-group">
                  <label className="form-label">Daily Interest Rate (%)</label>
                  <input className="form-input" type="number" step="any" value={form.daily_interest_rate} onChange={e => setForm(f => ({ ...f, daily_interest_rate: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="pending_transfer">Pending Transfer</option>
                    <option value="pending_deposit">Pending Deposit</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input className="form-input" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
                  <input className="form-input" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createLoan}>Create Loan</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Summary Strip ─────────────────────────────────────────────────────────────
function SummaryStrip({ loans }: { loans: Loan[] }) {
  if (!loans.length) return null;
  const tv = loans.reduce((s, l) => s + l.loan_amount, 0);
  const tr = loans.reduce((s, l) => s + l.total_repayment, 0);
  const tc = loans.reduce((s, l) => s + l.current_collateral_value, 0);
  const fmtThb = (n: number) => '฿' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="summary-strip">
      <div className="summary-card blue"><div className="summary-label">Total Loans</div><div className="summary-value">{loans.length}</div><div className="summary-sub">{loans.filter(l => l.status === 'active').length} active</div></div>
      <div className="summary-card green"><div className="summary-label">Total Loan Value</div><div className="summary-value">{fmtThb(tv)}</div><div className="summary-sub">outstanding principal</div></div>
      <div className="summary-card orange"><div className="summary-label">Total Repayment</div><div className="summary-value">{fmtThb(tr)}</div><div className="summary-sub">incl. accrued interest</div></div>
      <div className="summary-card purple"><div className="summary-label">Total Collateral Value</div><div className="summary-value">{fmtThb(tc)}</div><div className="summary-sub">at current prices</div></div>
    </div>
  );
}

// ── Loan Card ─────────────────────────────────────────────────────────────────
function LoanCard({ loan: l, index: i, onDeleteLoan, onUpdateEndDate }: {
  loan: Loan; index: number;
  onDeleteLoan: (id: string) => void;
  onUpdateEndDate: (id: string, value: string) => void;
}) {
  const ltv = l.current_ltv || 0;
  const pct = Math.min(100, ltv);
  const fmtT = (n: number) => '฿' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtN = (n: number, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const ltvC = (v: number) => v < 60 ? 'var(--green)' : v < 80 ? 'var(--orange)' : 'var(--red)';
  const ltvCls = (v: number) => v < 60 ? 'ltv-safe' : v < 80 ? 'ltv-warn' : 'ltv-danger';

  return (
    <div className="loan-card" style={{ animationDelay: i * 0.05 + 's' }}>
      <div className="loan-card-header">
        <div className="loan-card-id"><span className={`asset-chip ${l.asset_type.toLowerCase()}`}>{l.asset_type}</span>{l.id}</div>
        <span className={`status-badge status-${l.status}`}>{l.status.replace('_', ' ').toUpperCase()}</span>
      </div>
      <div className="loan-card-body">
        <div className="loan-card-grid">
          {[
            ['Collateral Amount', fmtN(l.collateral_amount, 6) + ' ' + l.asset_type],
            ['Init. Collateral Value', fmtT(l.initial_collateral_value)],
            ['Loan Amount', fmtT(l.loan_amount), 'large'],
            ['LTV at Origination', l.ltv_ratio + '%'],
            ['Daily Interest Rate', l.daily_interest_rate + '%'],
            ['Start Date', l.start_date],
          ].map(([label, value, cls]) => (
            <div key={label as string} className="loan-field">
              <div className="loan-field-label">{label}</div>
              <div className={`loan-field-value${cls ? ' ' + cls : ''}`}>{value}</div>
            </div>
          ))}
          <div className="loan-field">
            <div className="loan-field-label">End Date</div>
            <div className="loan-field-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="date" className="end-date-input" defaultValue={l.end_date || ''} onBlur={e => onUpdateEndDate(l.id, e.target.value)} />
              {!l.end_date && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>open</span>}
            </div>
          </div>
          <div className="loan-field">
            <div className="loan-field-label">Duration</div>
            <div className="loan-field-value">{l.duration_days} days {!l.end_date && <span style={{ fontSize: 10, color: 'var(--accent)' }}>(as of today)</span>}</div>
          </div>
          <div className="loan-field">
            <div className="loan-field-label">Accru. Interest</div>
            <div className="loan-field-value" style={{ color: 'var(--orange)' }}>{fmtT(l.accrued_interest)}</div>
          </div>
          <div className="loan-field">
            <div className="loan-field-label">Total Repayment</div>
            <div className="loan-field-value large" style={{ color: 'var(--orange)' }}>{fmtT(l.total_repayment)}</div>
          </div>
          <div className="loan-field">
            <div className="loan-field-label">Current Price</div>
            <div className="loan-field-value">{fmtT(l.current_price)}</div>
          </div>
          <div className="loan-field">
            <div className="loan-field-label">Current Collateral Value</div>
            <div className="loan-field-value">{fmtT(l.current_collateral_value)}</div>
          </div>
        </div>
        <div style={{ padding: '12px 0 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span className="loan-field-label">Current LTV</span>
            <span style={{ fontFamily: 'var(--font-ibm-mono,monospace)', fontSize: 14, fontWeight: 700, color: ltvC(ltv) }}>{fmtN(ltv, 2)}%</span>
          </div>
          <div className="ltv-bar-wrap"><div className="ltv-bar-track"><div className={`ltv-bar-fill ${ltvCls(ltv)}`} style={{ width: pct + '%' }} /></div></div>
        </div>
      </div>
      {l.status !== 'closed' && (
        <div className="loan-card-footer">
          <button className="btn btn-sm btn-danger" onClick={() => onDeleteLoan(l.id)}>Delete</button>
        </div>
      )}
    </div>
  );
}

// ── Liquidity Detail ──────────────────────────────────────────────────────────
function LiquidityDetail({ detail: d, threshold, depth, liqDetailVol, setLiqDetailVol, onRecalc, onClose, slipClass }: {
  detail: LiqDetail; threshold: number; depth: number;
  liqDetailVol: string; setLiqDetailVol: (v: string) => void;
  onRecalc: () => void; onClose: () => void;
  slipClass: (p: number | null) => string;
}) {
  const fmtN = (n: number, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtP = (n: number | null) => n == null || isNaN(n) ? '-' : n.toFixed(3) + '%';
  const fmtT = (n: number) => '฿' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bb = d.best_bid;
  const sl = d.safety.crossed_at_level;
  const safeText = d.safety.is_safe ? 'SAFE (entire book)' : fmtN(d.safety.safe_vol, 6);

  const rows: { type: 'threshold'; content: string } | { type: 'level'; level: LiqDetailLevel; index: number; slip: number | null; cls: string }[] = [];
  let inserted = false;
  for (let i = 0; i < d.levels.length; i++) {
    const l = d.levels[i];
    let ls: number | null = null;
    if (l.accru_matched > 0 && l.amount_match > 0) {
      let av = 0; for (let j = 0; j <= i; j++) av += d.levels[j].amount_match; if (av > 0 && bb > 0) ls = ((l.accru_matched - av * bb) / (av * bb)) * 100;
    }
    if (!inserted && sl === i) {
      (rows as unknown[]).push({ type: 'threshold', content: `── Safety Line: ${threshold}% ── Safe Vol: ${fmtN(d.safety.safe_vol, 6)} | Safe THB: ${fmtN(d.safety.safe_thb, 2)}` });
      inserted = true;
    }
    const cls = l.amount_match > 0 && l.amount_match >= l.amount ? 'row-matched' : l.amount_match > 0 ? 'row-partial' : 'row-unmatched';
    (rows as unknown[]).push({ type: 'level', level: l, index: i, slip: ls, cls });
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div className="page-title">{d.symbol} — Order Book Detail</div>
          <div className="page-subtitle">Liquidity depth analysis</div>
        </div>
        <button className="btn btn-ghost" onClick={onClose}>← Back to Summary</button>
      </div>
      <div className="summary-strip" style={{ marginBottom: 20 }}>
        <div className="summary-card blue"><div className="summary-label">Best Bid</div><div className="summary-value">{fmtN(d.best_bid, 2)}</div></div>
        <div className="summary-card green"><div className="summary-label">Vol Used</div><div className="summary-value">{fmtN(d.vol_used, 6)}</div></div>
        <div className="summary-card orange"><div className="summary-label">Vol Received (THB)</div><div className="summary-value">{fmtN(d.vol_received, 2)}</div></div>
        <div className={`summary-card ${d.slippage < 0 ? 'orange' : 'green'}`}><div className="summary-label">Slippage</div><div className="summary-value">{fmtP(d.slippage)}</div></div>
        <div className="summary-card purple"><div className="summary-label">Safe Vol ({threshold}%)</div><div className="summary-value">{safeText}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <input type="number" className="vol-input" style={{ width: 120 }} value={liqDetailVol} onChange={e => setLiqDetailVol(e.target.value)} placeholder="Custom vol" step="any" />
        <button className="btn btn-primary btn-sm" onClick={onRecalc}>Recalculate</button>
      </div>
      <div className="table-scroll">
        <table className="liq-table">
          <thead><tr><th>#</th><th>Amount</th><th>Price</th><th>Bid Size</th><th>Accru Amt</th><th>Amt Match</th><th>Sales Match</th><th>Accru Match</th><th>Slip %</th></tr></thead>
          <tbody>
            {(rows as unknown[]).map((row: unknown, idx: number) => {
              const r = row as { type: string; content?: string; level?: LiqDetailLevel; index?: number; slip?: number | null; cls?: string };
              if (r.type === 'threshold') return (
                <tr key={'thr-' + idx} className="row-threshold-line"><td colSpan={9}>{r.content}</td></tr>
              );
              const l = r.level!; const cls = r.cls!; const ls = r.slip!;
              return (
                <tr key={(r.index ?? idx)} className={cls}>
                  <td>{(r.index ?? 0) + 1}</td>
                  <td>{fmtN(l.amount, 6)}</td><td>{fmtN(l.price, 2)}</td><td>{fmtN(l.bid_size, 2)}</td>
                  <td>{fmtN(l.accru_amount, 6)}</td><td>{fmtN(l.amount_match, 6)}</td>
                  <td>{fmtN(l.sales_matched, 2)}</td><td>{fmtN(l.accru_matched, 2)}</td>
                  <td className={ls != null ? slipClass(ls) : ''}>{ls != null ? fmtP(ls) : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
