'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────
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
interface HoldingEntry { asset_type: string; amount: number; updated_at: string; current_price: number; current_value_thb: number; }
interface SellAnalysis {
  asset: string; current_price: number; holdings: number; holdings_value_thb: number;
  sell_amount: number; best_bid: number; expected_thb: number; received_thb: number;
  slippage_pct: number; threshold: number;
  safety: { safe_vol: number; safe_thb: number; is_safe: boolean; crossed_at_level: number };
  loan_count: number; loan_collateral: number; loan_principal: number; loan_repayment: number;
  is_enough: boolean; surplus_thb: number;
  levels: LiqDetailLevel[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const PASSCODE_HASH = '2440809e3ec26b00648124b65a81946fff578a91c8365009ffe4dd0e964af874';
const ASSET_COLORS: Record<string, string> = { BTC: '#f7931a', USDT: '#26a17b', ETH: '#627eea', BNB: '#f3ba2f', SOL: '#9945ff', ADA: '#3366ff', DOT: '#e6007a', TRX: '#ef0027', XRP: '#8b949e', DOGE: '#c2a633', WLD: '#8b949e', TON: '#0098ea', SUI: '#4da2ff', AVAX: '#e84142', POL: '#8247e5', KUB: '#1abc9c', JFIN: '#29b6f6' };
const ASSETS_SHOW = ['BTC', 'USDT', 'ETH', 'BNB', 'SOL'];
const ASSET_TYPES_ALL = ['BTC', 'ETH', 'SOL', 'BNB', 'ADA', 'DOT', 'POL', 'TRX', 'TON', 'XRP', 'SUI', 'AVAX', 'DOGE', 'WLD', 'USDT', 'KUB', 'JFIN'];
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [locked, setLocked] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [lockError, setLockError] = useState('');
  const [lockShake, setLockShake] = useState(false);
  const lockInputRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState<'loans' | 'liquidity' | 'closed' | 'holdings'>('loans');
  const [loans, setLoans] = useState<Loan[]>([]);
  const [closedLoans, setClosedLoans] = useState<Loan[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [assetTypes, setAssetTypes] = useState<string[]>([]);
  const [ltvOptions, setLtvOptions] = useState<number[]>([]);
  const [lastPriceFetch, setLastPriceFetch] = useState<Date | null>(null);
  const [priceStatus, setPriceStatus] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<LoanForm>(emptyForm());

  const [depth, setDepth] = useState(90);
  const [threshold, setThreshold] = useState(-3.5);
  const [liqData, setLiqData] = useState<LiqSummary | null>(null);
  const [liqLoading, setLiqLoading] = useState(false);
  const [liqLastUpdate, setLiqLastUpdate] = useState('');
  const [liqDetail, setLiqDetail] = useState<LiqDetail | null>(null);
  const [liqCoin, setLiqCoin] = useState<string | null>(null);
  const [volInputs, setVolInputs] = useState<Record<string, string>>({});
  const [liqDetailVol, setLiqDetailVol] = useState('');

  const [holdings, setHoldings] = useState<HoldingEntry[]>([]);
  const [holdingsInputs, setHoldingsInputs] = useState<Record<string, string>>({});
  const [holdingsSaving, setHoldingsSaving] = useState(false);
  const [holdingsSaved, setHoldingsSaved] = useState(false);
  const [holdingsTab, setHoldingsTab] = useState<'import' | 'analyze'>('import');
  const [analyzeAsset, setAnalyzeAsset] = useState('');
  const [analyzeSellAmt, setAnalyzeSellAmt] = useState('');
  const [analyzeThreshold, setAnalyzeThreshold] = useState(-3.5);
  const [analyzeResult, setAnalyzeResult] = useState<SellAnalysis | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [analyzeShowBook, setAnalyzeShowBook] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('liberix-admin')) {
      setLocked(false);
      loadActiveLoans();
    } else {
      setTimeout(() => lockInputRef.current?.focus(), 100);
    }
  }, []);

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
      setPriceStatus(s < 60 ? 'just now' : Math.floor(s / 60) + 'm ago');
    };
    update();
    const iv = setInterval(update, 30000);
    return () => clearInterval(iv);
  }, [lastPriceFetch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowModal(false); setLiqDetail(null); setLiqCoin(null); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

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

  async function loadActiveLoans() {
    try { const r = await fetch('/api/loans?status=active'); const d = await r.json(); setLoans(d.loans || []); } catch { /* silent */ }
  }
  async function loadClosedLoans() {
    try { const r = await fetch('/api/loans?status=closed'); const d = await r.json(); setClosedLoans(d.loans || []); } catch { /* silent */ }
  }

  async function openModal() {
    try { const r = await fetch('/api/loans/config'); const c = await r.json(); setAssetTypes(c.asset_types || []); setLtvOptions(c.ltv_options || []); } catch { /* use existing */ }
    setForm(emptyForm());
    setShowModal(true);
  }

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
    if (!form.id || !form.asset_type) { alert('Fill Loan ID and Asset Type'); return; }
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
    await fetch('/api/loans/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ end_date: value || null }) });
    loadActiveLoans();
  }

  async function deleteLoan(id: string) {
    if (!confirm('Delete loan ' + id + '?')) return;
    await fetch('/api/loans/' + id, { method: 'DELETE' });
    loadActiveLoans();
  }

  async function loadHoldings() {
    try {
      const r = await fetch('/api/holdings');
      const d = await r.json();
      setHoldings(d.holdings || []);
      const inputs: Record<string, string> = {};
      for (const h of d.holdings || []) inputs[h.asset_type] = h.amount > 0 ? String(h.amount) : '';
      setHoldingsInputs(inputs);
    } catch { /* silent */ }
  }

  async function saveHoldings() {
    setHoldingsSaving(true); setHoldingsSaved(false);
    const entries = Object.entries(holdingsInputs).map(([asset_type, v]) => ({ asset_type, amount: parseFloat(v) || 0 })).filter(e => e.amount > 0);
    await fetch('/api/holdings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holdings: entries }) });
    await loadHoldings();
    setHoldingsSaving(false); setHoldingsSaved(true);
    setTimeout(() => setHoldingsSaved(false), 3000);
  }

  async function runSellAnalysis() {
    if (!analyzeAsset) { setAnalyzeError('Select an asset.'); return; }
    setAnalyzeLoading(true); setAnalyzeError(''); setAnalyzeResult(null); setAnalyzeShowBook(false);
    try {
      let url = `/api/holdings/analyze?asset=${analyzeAsset}&threshold=${analyzeThreshold / 100}`;
      if (analyzeSellAmt) url += `&sell_amount=${analyzeSellAmt}`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.error) { setAnalyzeError(d.error); }
      else { setAnalyzeResult(d); if (!analyzeSellAmt) setAnalyzeSellAmt(String(d.sell_amount)); }
    } catch (e) { setAnalyzeError('Error: ' + (e as Error).message); }
    setAnalyzeLoading(false);
  }

  async function fetchLiqSummary() {
    setLiqLoading(true);
    try {
      const r = await fetch(`/api/liquidity/summary?depth=${depth / 100}&threshold=${threshold / 100}`);
      const d = await r.json();
      setLiqData(d);
      setLiqLastUpdate(new Date(d.timestamp).toLocaleTimeString());
    } catch { /* silent */ }
    setLiqLoading(false);
  }

  async function recalcCoin(coin: string) {
    const v = parseFloat(volInputs[coin] || '');
    if (!v || v <= 0) return;
    const r = await fetch(`/api/liquidity/orderbook/${coin}?depth=${depth / 100}&custom_vol=${v}&threshold=${threshold / 100}`);
    const d = await r.json();
    setLiqData(prev => prev ? { ...prev, coins: { ...prev.coins, [coin]: { ...prev.coins[coin], liquidity_depth: d.vol_received, slippage_pct: d.slippage, safety: d.safety } } } : prev);
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

  function goToPage(p: typeof page) {
    setPage(p);
    if (p === 'loans') loadActiveLoans();
    if (p === 'liquidity') fetchLiqSummary();
    if (p === 'closed') loadClosedLoans();
    if (p === 'holdings') loadHoldings();
  }

  if (locked) {
    return (
      <div className="lock-screen">
        <div className="lock-box">
          <div className="lock-logo">L</div>
          <div className="lock-title">Admin Access</div>
          <div className="lock-sub">Enter your passcode to continue</div>
          <div className="lock-row">
            <input ref={lockInputRef} className={`lock-input${lockShake ? ' error' : ''}`} type="password"
              value={passcode} onChange={e => setPasscode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && attemptUnlock()} placeholder="••••••" />
            <button className="btn btn-primary" onClick={attemptUnlock}>Enter</button>
          </div>
          <div className="lock-err">{lockError}</div>
          <Link href="/" className="lock-back">&#8592; Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar-head">
            <div className="sidebar-logo-icon">L</div>
            <div className="sidebar-logo-name">Liberix</div>
          </div>
          <nav className="sidebar-nav">
            {([
              { key: 'loans', ico: '💳', label: 'Active Loans' },
              { key: 'liquidity', ico: '📊', label: 'Liquidity' },
              { key: 'holdings', ico: '💼', label: 'Holdings & Sell' },
              { key: 'closed', ico: '🗃️', label: 'Closed Loans' },
            ] as const).map(({ key, ico, label }) => (
              <div key={key} className={`nav-item${page === key ? ' active' : ''}`} onClick={() => goToPage(key)}>
                <span className="nav-ico">{ico}</span> {label}
              </div>
            ))}
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
          {/* ── ACTIVE LOANS ── */}
          {page === 'loans' && (
            <>
              <div className="page-head">
                <div>
                  <div className="page-title">Active Loans</div>
                  <div className="page-sub">Open-end loan portfolio</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={openModal}>+ New Loan</button>
                  <button className="btn-lock" onClick={lockApp}>&#128274; Lock</button>
                  <Link href="/" className="btn-lock">&#8592; Exit</Link>
                </div>
              </div>
              <SummaryStrip loans={loans} />
              {loans.length === 0 ? (
                <div className="empty"><div className="empty-ico">💳</div><p>No active loans.</p><button className="btn btn-primary" onClick={openModal}>+ New Loan</button></div>
              ) : (
                <div className="loans-grid">
                  {loans.map((l, i) => <LoanCard key={l.id} loan={l} index={i} onDelete={deleteLoan} onUpdateEndDate={updateEndDate} />)}
                </div>
              )}
            </>
          )}

          {/* ── LIQUIDITY ── */}
          {page === 'liquidity' && (
            <>
              <div className="page-head">
                <div>
                  <div className="page-title">Liquidity Monitor</div>
                  <div className="page-sub">Bitkub order book depth</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn-lock" onClick={lockApp}>&#128274; Lock</button>
                  <Link href="/" className="btn-lock">&#8592; Exit</Link>
                </div>
              </div>

              {!liqDetail ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                    <div className="liq-controls">
                      <label>Depth %: <input className="form-input" style={{ width: 65, display: 'inline-block' }} type="number" value={depth} onChange={e => setDepth(Number(e.target.value))} onBlur={fetchLiqSummary} /></label>
                      <label>Threshold %: <input className="form-input" style={{ width: 72, display: 'inline-block' }} type="number" value={threshold} onChange={e => setThreshold(Number(e.target.value))} onBlur={fetchLiqSummary} /></label>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {liqLastUpdate && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{liqLastUpdate}</span>}
                      <button className="btn btn-primary btn-sm" onClick={fetchLiqSummary} disabled={liqLoading}>{liqLoading ? '…' : 'Refresh'}</button>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr><th>Coin</th><th>Best Bid</th><th>Custom Vol</th><th>Depth (THB)</th><th>Slippage</th><th>Safe Vol</th><th>Safe THB</th><th></th></tr>
                      </thead>
                      <tbody>
                        {!liqData ? (
                          <tr><td colSpan={8} className="loading-cell">Click Refresh to load</td></tr>
                        ) : Object.entries(liqData.coins).sort((a, b) => (b[1].liquidity_depth || 0) - (a[1].liquidity_depth || 0)).map(([coin, info]) => {
                          if (info.error) return <tr key={coin}><td>{coin}</td><td colSpan={7} className="slip-danger">{info.error}</td></tr>;
                          return (
                            <tr key={coin}>
                              <td style={{ fontWeight: 600 }}>{coin}</td>
                              <td>{fmtNum(info.best_bid, 2)}</td>
                              <td>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <input type="number" className="vol-input" value={volInputs[coin] || ''} onChange={e => setVolInputs(v => ({ ...v, [coin]: e.target.value }))} placeholder={fmtNum(info.vol_used, 4)} step="any" min="0" />
                                  <button className="btn btn-ghost btn-sm" onClick={() => recalcCoin(coin)}>Calc</button>
                                </div>
                              </td>
                              <td>{fmtNum(info.liquidity_depth, 2)}</td>
                              <td className={slipClass(info.slippage_pct)}>{fmtPct(info.slippage_pct)}</td>
                              <td>{info.safety.is_safe ? <span className="badge-safe">SAFE</span> : fmtNum(info.safety.safe_vol, 4)}</td>
                              <td>{info.safety.is_safe ? '' : fmtNum(info.safety.safe_thb, 2)}</td>
                              <td><button className="btn btn-ghost btn-sm" onClick={() => showLiqDetail(coin)}>View</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <LiquidityDetail detail={liqDetail} threshold={threshold} liqDetailVol={liqDetailVol} setLiqDetailVol={setLiqDetailVol} onRecalc={recalcDetail} onClose={() => { setLiqDetail(null); setLiqCoin(null); }} slipClass={slipClass} />
              )}
            </>
          )}

          {/* ── HOLDINGS ── */}
          {page === 'holdings' && (
            <HoldingsPage
              holdings={holdings} holdingsInputs={holdingsInputs} setHoldingsInputs={setHoldingsInputs}
              holdingsSaving={holdingsSaving} holdingsSaved={holdingsSaved} onSave={saveHoldings}
              prices={prices}
              tab={holdingsTab} setTab={setHoldingsTab}
              analyzeAsset={analyzeAsset} setAnalyzeAsset={setAnalyzeAsset}
              analyzeSellAmt={analyzeSellAmt} setAnalyzeSellAmt={setAnalyzeSellAmt}
              analyzeThreshold={analyzeThreshold} setAnalyzeThreshold={setAnalyzeThreshold}
              analyzeResult={analyzeResult} analyzeLoading={analyzeLoading}
              analyzeError={analyzeError} analyzeShowBook={analyzeShowBook}
              setAnalyzeShowBook={setAnalyzeShowBook}
              onAnalyze={runSellAnalysis} onLock={lockApp}
            />
          )}

          {/* ── CLOSED LOANS ── */}
          {page === 'closed' && (
            <>
              <div className="page-head">
                <div>
                  <div className="page-title">Closed Loans</div>
                  <div className="page-sub">Historical records</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn-lock" onClick={lockApp}>&#128274; Lock</button>
                  <Link href="/" className="btn-lock">&#8592; Exit</Link>
                </div>
              </div>
              {closedLoans.length === 0 ? (
                <div className="empty"><div className="empty-ico">🗃️</div><p>No closed loans.</p></div>
              ) : (
                <div className="loans-grid">
                  {closedLoans.map((l, i) => <LoanCard key={l.id} loan={l} index={i} onDelete={deleteLoan} onUpdateEndDate={updateEndDate} />)}
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
            <div className="modal-head">
              <div className="modal-title">New Loan</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>&#10005;</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Loan ID *</label>
                  <input className="form-input" value={form.id} onChange={e => handleFormChange('id', e.target.value)} placeholder="OEL-2026-001" />
                </div>
                <div className="form-group">
                  <label className="form-label">Asset *</label>
                  <select className="form-select" value={form.asset_type} onChange={e => handleFormChange('asset_type', e.target.value)}>
                    <option value="">Select…</option>
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
                    <option value="">Select…</option>
                    {ltvOptions.map(l => <option key={l} value={l}>{l}%</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Collateral Value (THB)</label>
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
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createLoan}>Create</button>
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
  return (
    <div className="stats-row">
      <div className="stat-card">
        <div className="stat-label">Total Loans</div>
        <div className="stat-value">{loans.length}</div>
        <div className="stat-sub">{loans.filter(l => l.status === 'active').length} active</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Total Loan Value</div>
        <div className="stat-value mono">{fmtThb(tv)}</div>
        <div className="stat-sub">principal</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Total Repayment</div>
        <div className="stat-value mono" style={{ color: 'var(--orange)' }}>{fmtThb(tr)}</div>
        <div className="stat-sub">incl. interest</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Collateral Value</div>
        <div className="stat-value mono">{fmtThb(tc)}</div>
        <div className="stat-sub">at current prices</div>
      </div>
    </div>
  );
}

// ── Loan Card ─────────────────────────────────────────────────────────────────
function LoanCard({ loan: l, index: i, onDelete, onUpdateEndDate }: {
  loan: Loan; index: number;
  onDelete: (id: string) => void;
  onUpdateEndDate: (id: string, value: string) => void;
}) {
  const ltv = l.current_ltv || 0;
  return (
    <div className="loan-card" style={{ animationDelay: i * 0.04 + 's' }}>
      <div className="loan-card-head">
        <div className="loan-id">
          <span className={`chip chip-${l.asset_type.toLowerCase()}`}>{l.asset_type}</span>
          {l.id}
        </div>
        <span className={`sbadge s-${l.status}`}>{l.status.replace('_', ' ')}</span>
      </div>
      <div className="loan-body">
        <div className="loan-fields">
          {([
            ['Collateral', fmtNum(l.collateral_amount, 6) + ' ' + l.asset_type],
            ['Init. Value', fmtThb(l.initial_collateral_value)],
            ['Loan Amount', fmtThb(l.loan_amount)],
            ['LTV at Origin', l.ltv_ratio + '%'],
            ['Daily Interest', l.daily_interest_rate + '%'],
            ['Start Date', l.start_date],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} className="loan-field">
              <div className="field-label">{label}</div>
              <div className="field-val mono">{value}</div>
            </div>
          ))}
          <div className="loan-field">
            <div className="field-label">End Date</div>
            <div className="field-val" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="date" className="end-date-input" defaultValue={l.end_date || ''} onBlur={e => onUpdateEndDate(l.id, e.target.value)} />
              {!l.end_date && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>open</span>}
            </div>
          </div>
          <div className="loan-field">
            <div className="field-label">Duration</div>
            <div className="field-val mono">{l.duration_days}d {!l.end_date && <span style={{ fontSize: 10, color: 'var(--accent)' }}>(today)</span>}</div>
          </div>
          <div className="loan-field">
            <div className="field-label">Accrued Interest</div>
            <div className="field-val mono" style={{ color: 'var(--orange)' }}>{fmtThb(l.accrued_interest)}</div>
          </div>
          <div className="loan-field">
            <div className="field-label">Total Repayment</div>
            <div className="field-val lg mono" style={{ color: 'var(--orange)' }}>{fmtThb(l.total_repayment)}</div>
          </div>
          <div className="loan-field">
            <div className="field-label">Current Price</div>
            <div className="field-val mono">{fmtThb(l.current_price)}</div>
          </div>
          <div className="loan-field">
            <div className="field-label">Collateral Value Now</div>
            <div className="field-val mono">{fmtThb(l.current_collateral_value)}</div>
          </div>
        </div>
        <div className="loan-ltv-row">
          <div className="ltv-label-row">
            <span>Current LTV</span>
            <span className="mono" style={{ fontWeight: 700, fontSize: 13, color: ltvColor(ltv) }}>{fmtNum(ltv, 2)}%</span>
          </div>
          <div className="ltv-bar"><div className={`ltv-fill ${ltvClass(ltv)}`} style={{ width: Math.min(100, ltv) + '%' }} /></div>
        </div>
      </div>
      {l.status !== 'closed' && (
        <div className="loan-foot">
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(l.id)}>Delete</button>
        </div>
      )}
    </div>
  );
}

// ── Liquidity Detail ──────────────────────────────────────────────────────────
function LiquidityDetail({ detail: d, threshold, liqDetailVol, setLiqDetailVol, onRecalc, onClose, slipClass }: {
  detail: LiqDetail; threshold: number;
  liqDetailVol: string; setLiqDetailVol: (v: string) => void;
  onRecalc: () => void; onClose: () => void;
  slipClass: (p: number | null) => string;
}) {
  const fmtP = (n: number | null) => n == null || isNaN(n) ? '-' : n.toFixed(3) + '%';
  const bb = d.best_bid;
  const sl = d.safety.crossed_at_level;
  const safeText = d.safety.is_safe ? 'SAFE (entire book)' : fmtNum(d.safety.safe_vol, 6);

  const rows: unknown[] = [];
  let inserted = false;
  for (let i = 0; i < d.levels.length; i++) {
    const l = d.levels[i];
    let ls: number | null = null;
    if (l.accru_matched > 0 && l.amount_match > 0) {
      let av = 0; for (let j = 0; j <= i; j++) av += d.levels[j].amount_match;
      if (av > 0 && bb > 0) ls = ((l.accru_matched - av * bb) / (av * bb)) * 100;
    }
    if (!inserted && sl === i) {
      rows.push({ type: 'threshold', content: `Safety Line ${threshold}% — Safe Vol: ${fmtNum(d.safety.safe_vol, 6)} | Safe THB: ${fmtNum(d.safety.safe_thb, 2)}` });
      inserted = true;
    }
    const cls = l.amount_match > 0 && l.amount_match >= l.amount ? 'row-matched' : l.amount_match > 0 ? 'row-partial' : 'row-unmatched';
    rows.push({ type: 'level', level: l, index: i, slip: ls, cls });
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div className="page-title">{d.symbol} — Order Book</div>
          <div className="page-sub">Liquidity depth analysis</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>&#8592; Back</button>
      </div>
      <div className="stats-row" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-label">Best Bid</div><div className="stat-value mono">{fmtNum(d.best_bid, 2)}</div></div>
        <div className="stat-card"><div className="stat-label">Vol Used</div><div className="stat-value mono">{fmtNum(d.vol_used, 6)}</div></div>
        <div className="stat-card"><div className="stat-label">Received (THB)</div><div className="stat-value mono">{fmtNum(d.vol_received, 2)}</div></div>
        <div className="stat-card"><div className="stat-label">Slippage</div><div className={`stat-value mono ${slipClass(d.slippage)}`}>{fmtP(d.slippage)}</div></div>
        <div className="stat-card"><div className="stat-label">Safe Vol ({threshold}%)</div><div className="stat-value mono">{safeText}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <input type="number" className="vol-input" style={{ width: 120 }} value={liqDetailVol} onChange={e => setLiqDetailVol(e.target.value)} placeholder="Custom vol" step="any" />
        <button className="btn btn-primary btn-sm" onClick={onRecalc}>Recalculate</button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>#</th><th>Amount</th><th>Price</th><th>Bid Size</th><th>Accru Amt</th><th>Amt Match</th><th>Sales</th><th>Accru Match</th><th>Slip %</th></tr></thead>
          <tbody>
            {rows.map((row, idx) => {
              const r = row as { type: string; content?: string; level?: LiqDetailLevel; index?: number; slip?: number | null; cls?: string };
              if (r.type === 'threshold') return <tr key={'thr-' + idx} className="row-threshold"><td colSpan={9}>{r.content}</td></tr>;
              const l = r.level!; const cls = r.cls!; const ls = r.slip ?? null;
              return (
                <tr key={r.index ?? idx} className={cls}>
                  <td>{(r.index ?? 0) + 1}</td>
                  <td>{fmtNum(l.amount, 6)}</td><td>{fmtNum(l.price, 2)}</td><td>{fmtNum(l.bid_size, 2)}</td>
                  <td>{fmtNum(l.accru_amount, 6)}</td><td>{fmtNum(l.amount_match, 6)}</td>
                  <td>{fmtNum(l.sales_matched, 2)}</td><td>{fmtNum(l.accru_matched, 2)}</td>
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

// ── Holdings Page ─────────────────────────────────────────────────────────────
function HoldingsPage({ holdings, holdingsInputs, setHoldingsInputs, holdingsSaving, holdingsSaved, onSave, prices,
  tab, setTab, analyzeAsset, setAnalyzeAsset, analyzeSellAmt, setAnalyzeSellAmt,
  analyzeThreshold, setAnalyzeThreshold, analyzeResult, analyzeLoading, analyzeError,
  analyzeShowBook, setAnalyzeShowBook, onAnalyze, onLock,
}: {
  holdings: HoldingEntry[]; holdingsInputs: Record<string, string>;
  setHoldingsInputs: (fn: (p: Record<string, string>) => Record<string, string>) => void;
  holdingsSaving: boolean; holdingsSaved: boolean; onSave: () => void; prices: Record<string, number>;
  tab: 'import' | 'analyze'; setTab: (t: 'import' | 'analyze') => void;
  analyzeAsset: string; setAnalyzeAsset: (v: string) => void;
  analyzeSellAmt: string; setAnalyzeSellAmt: (v: string) => void;
  analyzeThreshold: number; setAnalyzeThreshold: (v: number) => void;
  analyzeResult: SellAnalysis | null; analyzeLoading: boolean; analyzeError: string;
  analyzeShowBook: boolean; setAnalyzeShowBook: (v: boolean) => void;
  onAnalyze: () => void; onLock: () => void;
}) {
  const holdingMap: Record<string, HoldingEntry> = {};
  for (const h of holdings) holdingMap[h.asset_type] = h;

  const totalValue = Object.entries(holdingsInputs).reduce((s, [a, v]) => s + (parseFloat(v) || 0) * (prices[a] || 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Holdings & Sell Analysis</div>
          <div className="page-sub">Manage balances and simulate sell scenarios</div>
        </div>
        <button className="btn-lock" onClick={onLock}>&#128274; Lock</button>
      </div>

      <div className="holdings-tabs">
        <button className={`htab${tab === 'import' ? ' active' : ''}`} onClick={() => setTab('import')}>Holdings</button>
        <button className={`htab${tab === 'analyze' ? ' active' : ''}`} onClick={() => setTab('analyze')}>Sell Analysis</button>
      </div>

      {tab === 'import' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
              Portfolio: <span className="mono" style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>{fmtThb(totalValue)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {holdingsSaved && <span style={{ fontSize: 12, color: 'var(--green)' }}>&#10003; Saved</span>}
              <button className="btn btn-primary" onClick={onSave} disabled={holdingsSaving}>{holdingsSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Asset</th><th style={{ textAlign: 'left' }}>Amount</th><th>Price (THB)</th><th>Value (THB)</th><th>Updated</th></tr></thead>
              <tbody>
                {ASSET_TYPES_ALL.map(a => {
                  const val = parseFloat(holdingsInputs[a] || '0') || 0;
                  const price = prices[a] || 0;
                  const thbVal = val * price;
                  const existing = holdingMap[a];
                  return (
                    <tr key={a} style={{ background: val > 0 ? 'rgba(79,143,255,.03)' : undefined }}>
                      <td><span className={`chip chip-${a.toLowerCase()}`}>{a}</span></td>
                      <td style={{ textAlign: 'left' }}>
                        <input type="number" className="vol-input" style={{ width: 120 }} step="any" min="0"
                          value={holdingsInputs[a] || ''} placeholder="0"
                          onChange={e => setHoldingsInputs(p => ({ ...p, [a]: e.target.value }))} />
                      </td>
                      <td className="mono">{price > 0 ? fmtThb(price) : '—'}</td>
                      <td className="mono" style={{ fontWeight: thbVal > 0 ? 600 : 400, color: thbVal > 0 ? 'var(--text)' : 'var(--text-3)' }}>
                        {thbVal > 0 ? fmtThb(thbVal) : '—'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {existing?.updated_at ? new Date(existing.updated_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'analyze' && (
        <>
          <div className="config-box">
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>Sell Scenario</div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Asset to Sell</label>
                <select className="form-select" value={analyzeAsset} onChange={e => { setAnalyzeAsset(e.target.value); setAnalyzeSellAmt(''); }}>
                  <option value="">Select asset…</option>
                  {ASSET_TYPES_ALL.map(a => {
                    const h = holdingMap[a];
                    return <option key={a} value={a}>{a}{h && h.amount > 0 ? ` (${fmtNum(h.amount, 6)})` : ''}</option>;
                  })}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Sell Amount <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(blank = all)</span></label>
                <input className="form-input" type="number" step="any" min="0" value={analyzeSellAmt}
                  onChange={e => setAnalyzeSellAmt(e.target.value)} placeholder="All holdings" />
              </div>
              <div className="form-group">
                <label className="form-label">Safety Threshold (%)</label>
                <input className="form-input" type="number" step="0.1" value={analyzeThreshold}
                  onChange={e => setAnalyzeThreshold(Number(e.target.value))} />
              </div>
            </div>
            {analyzeError && <div className="form-err">{analyzeError}</div>}
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-primary" onClick={onAnalyze} disabled={analyzeLoading || !analyzeAsset}>
                {analyzeLoading ? 'Analyzing…' : 'Analyze'}
              </button>
            </div>
          </div>

          {analyzeResult && <SellAnalysisResult result={analyzeResult} showBook={analyzeShowBook} setShowBook={setAnalyzeShowBook} />}
        </>
      )}
    </>
  );
}

// ── Sell Analysis Result ──────────────────────────────────────────────────────
function SellAnalysisResult({ result: r, showBook, setShowBook }: {
  result: SellAnalysis; showBook: boolean; setShowBook: (v: boolean) => void;
}) {
  const fmtP = (n: number | null) => n == null || isNaN(n) ? '-' : n.toFixed(3) + '%';
  const slipC = (p: number) => { const t = Math.abs(r.threshold); return Math.abs(p) < t * 0.5 ? 'slip-ok' : Math.abs(p) < t ? 'slip-warn' : 'slip-danger'; };
  const verdictColor = r.is_enough ? 'var(--green)' : 'var(--red)';
  const verdictBg = r.is_enough ? 'rgba(34,197,128,.07)' : 'rgba(239,68,102,.07)';

  return (
    <div>
      <div className="verdict-banner" style={{ background: verdictBg, border: `1px solid ${verdictColor}` }}>
        <div>
          <div className="verdict-label" style={{ color: verdictColor }}>
            {r.is_enough ? '✓ Sufficient — proceeds cover loan obligations' : '✗ Shortfall — proceeds do not cover obligations'}
          </div>
          <div className="verdict-amount mono" style={{ color: verdictColor }}>
            {r.is_enough ? '+' : ''}{fmtThb(r.surplus_thb)}
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>{r.is_enough ? 'surplus' : 'shortfall'}</span>
          </div>
        </div>
        <span className={`chip chip-${r.asset.toLowerCase()}`} style={{ fontSize: 13, padding: '5px 12px' }}>{r.asset}</span>
      </div>

      <div className="stats-row" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Holdings</div>
          <div className="stat-value mono">{fmtNum(r.holdings, 6)}</div>
          <div className="stat-sub">{r.asset} · {fmtThb(r.holdings_value_thb)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Sell Amount</div>
          <div className="stat-value mono">{fmtNum(r.sell_amount, 6)}</div>
          <div className="stat-sub">Best bid: {fmtThb(r.best_bid)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Will Receive</div>
          <div className="stat-value mono">{fmtThb(r.received_thb)}</div>
          <div className="stat-sub">Expected: {fmtThb(r.expected_thb)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Slippage</div>
          <div className={`stat-value mono ${slipC(r.slippage_pct)}`}>{fmtP(r.slippage_pct)}</div>
          <div className="stat-sub">Threshold: {r.threshold}%{r.safety.is_safe ? ' · SAFE' : ''}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Loan Obligations ({r.loan_count})</div>
          <div className="stat-value mono">{fmtThb(r.loan_repayment)}</div>
          <div className="stat-sub">Collateral: {fmtNum(r.loan_collateral, 6)} {r.asset}</div>
        </div>
      </div>

      {!r.safety.is_safe && (
        <div style={{ background: 'rgba(245,158,11,.06)', border: '1px dashed rgba(245,158,11,.4)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13 }}>
          <span style={{ color: 'var(--orange)', fontWeight: 600 }}>⚠ Safety Line ({r.threshold}%):</span>
          {' '}Safe to sell up to <strong className="mono">{fmtNum(r.safety.safe_vol, 6)} {r.asset}</strong>
          {' '}= <strong className="mono">{fmtThb(r.safety.safe_thb)}</strong>
        </div>
      )}

      <button className="btn btn-ghost btn-sm" onClick={() => setShowBook(!showBook)} style={{ marginBottom: 14 }}>
        {showBook ? '▲ Hide Order Book' : '▼ Show Order Book'}
      </button>

      {showBook && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>#</th><th>Amount</th><th>Price</th><th>Bid Size</th><th>Accru Amt</th><th>Amt Match</th><th>Sales</th><th>Accru Match</th><th>Slip %</th></tr></thead>
            <tbody>
              {r.levels.map((l, i) => {
                let ls: number | null = null;
                if (l.accru_matched > 0 && l.amount_match > 0) {
                  let av = 0; for (let j = 0; j <= i; j++) av += r.levels[j].amount_match;
                  if (av > 0 && r.best_bid > 0) ls = ((l.accru_matched - av * r.best_bid) / (av * r.best_bid)) * 100;
                }
                const cls = l.amount_match > 0 && l.amount_match >= l.amount ? 'row-matched' : l.amount_match > 0 ? 'row-partial' : 'row-unmatched';
                return (
                  <tr key={i} className={cls}>
                    <td>{i + 1}</td>
                    <td>{fmtNum(l.amount, 6)}</td><td>{fmtNum(l.price, 2)}</td><td>{fmtNum(l.bid_size, 2)}</td>
                    <td>{fmtNum(l.accru_amount, 6)}</td><td>{fmtNum(l.amount_match, 6)}</td>
                    <td>{fmtNum(l.sales_matched, 2)}</td><td>{fmtNum(l.accru_matched, 2)}</td>
                    <td className={ls != null ? slipC(ls) : ''}>{ls != null ? fmtP(ls) : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
