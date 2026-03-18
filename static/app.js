// ══════════════════════════════════════════════
//  Liberix Monitor - Frontend
// ══════════════════════════════════════════════

let refreshTimer = null;
let currentDetailCoin = null;
let livePrices = {};

// ── Formatting ──
function fmtNum(n, d = 2) {
    if (n == null || isNaN(n)) return '-';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtThb(n) { return fmtNum(n, 2); }
function fmtBaht(n) { return '฿' + fmtThb(n); }
function fmtPct(n) { return (n == null || isNaN(n)) ? '-' : n.toFixed(3) + '%'; }
function slipClass(pct) {
    const t = Math.abs(getThreshold());
    if (pct == null) return '';
    if (Math.abs(pct) < t * 0.5) return 'slip-ok';
    if (Math.abs(pct) < t) return 'slip-warn';
    return 'slip-danger';
}
function getDepth() { return (parseFloat(document.getElementById('depthInput').value) || 90) / 100; }
function getThreshold() { return parseFloat(document.getElementById('thresholdInput').value) || -3.5; }
function getThresholdDecimal() { return getThreshold() / 100; }
function ltvColor(ltv) {
    if (ltv < 50) return '#3fb950';
    if (ltv < 70) return '#d29922';
    return '#f85149';
}

// ══════════════════════════════════════════════
//  Navigation
// ══════════════════════════════════════════════
function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + name)?.classList.add('active');
    document.querySelector(`.nav-item[data-page="${name}"]`)?.classList.add('active');

    if (name === 'loans') loadLoans();
    if (name === 'closed') loadClosedLoans();
    if (name === 'liquidity') fetchSummary();
    if (name === 'dashboard') loadDashboard();
}

// ══════════════════════════════════════════════
//  Live Prices
// ══════════════════════════════════════════════
async function fetchPrices() {
    try {
        const resp = await fetch('/api/prices');
        livePrices = await resp.json();
        renderPrices();
    } catch (e) { console.error('Price fetch failed:', e); }
}

function renderPrices() {
    const el = document.getElementById('livePrices');
    const show = ['BTC', 'USDT', 'ETH', 'BNB', 'SOL'];
    el.innerHTML = show.map(a => {
        const p = livePrices[a] || 0;
        const color = p > 0 ? '#3fb950' : '#8b949e';
        return `<div class="price-row">
            <span class="asset"><span class="price-dot" style="background:${color}"></span>${a}</span>
            <span>${fmtNum(p, 0)}</span>
        </div>`;
    }).join('');
}

// ══════════════════════════════════════════════
//  Open-End Loans
// ══════════════════════════════════════════════
async function loadLoans() {
    try {
        const resp = await fetch('/api/loans?status=active');
        const data = await resp.json();
        renderLoanSummary(data.loans);
        renderLoanCards(data.loans, 'loanCards');
    } catch (e) {
        document.getElementById('loanCards').innerHTML = `<p class="loading">Error: ${e.message}</p>`;
    }
}

function renderLoanSummary(loans) {
    const active = loans.filter(l => l.status === 'active');
    const totalLoans = loans.length;
    const totalLoanValue = loans.reduce((s, l) => s + l.loan_amount, 0);
    const totalRepayment = loans.reduce((s, l) => s + l.total_repayment, 0);
    const totalCollateral = loans.reduce((s, l) => s + l.current_collateral_value, 0);

    document.getElementById('scTotalLoans').textContent = totalLoans;
    document.getElementById('scActiveCount').textContent = active.length + ' active';
    document.getElementById('scTotalLoanValue').innerHTML = fmtBaht(totalLoanValue);
    document.getElementById('scTotalRepayment').innerHTML = fmtBaht(totalRepayment);
    document.getElementById('scTotalCollateral').innerHTML = fmtBaht(totalCollateral);
}

function renderLoanCards(loans, containerId) {
    const container = document.getElementById(containerId);
    if (!loans.length) {
        container.innerHTML = '<p class="loading">No loans found</p>';
        return;
    }
    container.innerHTML = loans.map(l => {
        const statusCls = 'status-' + l.status;
        const statusText = l.status.replace('_', ' ').toUpperCase();
        const ltv = l.current_ltv;
        const ltvCol = ltvColor(ltv);
        const tagCls = 'tag-' + l.asset_type;

        return `<div class="loan-card">
            <div class="loan-card-header">
                <div class="coin-badge">
                    <span class="coin-tag ${tagCls}">${l.asset_type}</span>
                    <span class="loan-id">${l.id}</span>
                </div>
                <span class="status-badge ${statusCls}">${statusText}</span>
            </div>
            <div class="loan-grid">
                <div class="loan-field"><div class="lf-label">COLLATERAL AMOUNT</div><div class="lf-value">${fmtNum(l.collateral_amount, 6)} ${l.asset_type}</div></div>
                <div class="loan-field"><div class="lf-label">INIT. COLLATERAL VALUE</div><div class="lf-value">${fmtBaht(l.initial_collateral_value)}</div></div>
                <div class="loan-field"><div class="lf-label">LOAN AMOUNT</div><div class="lf-value">${fmtBaht(l.loan_amount)}</div></div>
                <div class="loan-field"><div class="lf-label">LTV AT ORIGINATION</div><div class="lf-value">${l.ltv_ratio}%</div></div>
                <div class="loan-field"><div class="lf-label">DAILY INTEREST RATE</div><div class="lf-value">${l.daily_interest_rate}%</div></div>
                <div class="loan-field"><div class="lf-label">START DATE</div><div class="lf-value">${l.start_date}</div></div>
                <div class="loan-field"><div class="lf-label">DURATION</div><div class="lf-value">${l.duration_days} days <span style="color:#3fb950">(as of today)</span></div></div>
                <div class="loan-field"><div class="lf-label">ACCRU. INTEREST</div><div class="lf-value text-orange">${fmtBaht(l.accrued_interest)}</div></div>
                <div class="loan-field"><div class="lf-label">TOTAL REPAYMENT</div><div class="lf-value text-red">${fmtBaht(l.total_repayment)}</div></div>
                <div class="loan-field"><div class="lf-label">CURRENT PRICE</div><div class="lf-value">${fmtBaht(l.current_price)}</div></div>
                <div class="loan-field"><div class="lf-label">CURRENT COLLATERAL VALUE</div><div class="lf-value">${fmtBaht(l.current_collateral_value)}</div></div>
            </div>
            <div class="ltv-bar-container">
                <span class="ltv-label">CURRENT LTV</span>
                <div class="ltv-bar"><div class="ltv-bar-fill" style="width:${Math.min(ltv, 100)}%;background:${ltvCol}"></div></div>
                <span class="ltv-value" style="color:${ltvCol}">${ltv.toFixed(2)}%</span>
            </div>
            <div class="loan-card-actions">
                ${l.status !== 'closed' ? `<button class="btn-danger" onclick="deleteLoan('${l.id}')">Delete</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

async function loadClosedLoans() {
    const resp = await fetch('/api/loans?status=closed');
    const data = await resp.json();
    renderLoanCards(data.loans, 'closedLoanCards');
}

// ── New Loan Modal ──
async function openNewLoanModal() {
    // Load config
    const resp = await fetch('/api/loan-config');
    const config = await resp.json();

    const assetSel = document.getElementById('fAssetType');
    assetSel.innerHTML = '<option value="">Select asset...</option>' +
        config.asset_types.map(a => `<option value="${a}">${a}</option>`).join('');

    const ltvSel = document.getElementById('fLtvRatio');
    ltvSel.innerHTML = '<option value="">Select LTV...</option>' +
        config.ltv_options.map(l => `<option value="${l}">${l}%</option>`).join('');

    document.getElementById('fStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('fLoanId').value = '';
    document.getElementById('fCollateralAmount').value = '0';
    document.getElementById('fInitCollateralValue').value = '0';
    document.getElementById('fLoanAmount').value = '0';
    document.getElementById('fDailyRate').value = '';

    document.getElementById('newLoanModal').classList.remove('hidden');
}

function closeNewLoanModal() {
    document.getElementById('newLoanModal').classList.add('hidden');
}

async function submitNewLoan() {
    const data = {
        id: document.getElementById('fLoanId').value.trim(),
        asset_type: document.getElementById('fAssetType').value,
        collateral_amount: parseFloat(document.getElementById('fCollateralAmount').value) || 0,
        initial_collateral_value: parseFloat(document.getElementById('fInitCollateralValue').value) || 0,
        loan_amount: parseFloat(document.getElementById('fLoanAmount').value) || 0,
        ltv_ratio: parseInt(document.getElementById('fLtvRatio').value) || 0,
        daily_interest_rate: parseFloat(document.getElementById('fDailyRate').value) || 0,
        start_date: document.getElementById('fStartDate').value,
        status: document.getElementById('fStatus').value,
    };

    if (!data.id || !data.asset_type) {
        alert('Please fill in Loan ID and Asset Type');
        return;
    }

    await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    closeNewLoanModal();
    loadLoans();
}

async function deleteLoan(id) {
    if (!confirm(`Delete loan ${id}?`)) return;
    await fetch(`/api/loans/${id}`, { method: 'DELETE' });
    loadLoans();
}

// ══════════════════════════════════════════════
//  Loan Viewer
// ══════════════════════════════════════════════
async function lookupLoan() {
    const id = document.getElementById('viewerLoanId').value.trim();
    if (!id) return;
    const resp = await fetch(`/api/loans/${id}`);
    const data = await resp.json();

    if (data.error) {
        document.getElementById('viewerResult').innerHTML =
            '<p class="loading">Loan not found</p>';
        return;
    }

    const l = data;
    const ltv = l.current_ltv;
    const ltvCol = ltvColor(ltv);
    const tagCls = 'tag-' + l.asset_type;
    const statusCls = 'status-' + l.status;

    document.getElementById('viewerResult').innerHTML = `
    <div class="viewer-card">
        <div class="viewer-card-header">
            <div class="coin-badge">
                <span class="coin-tag ${tagCls}">${l.asset_type}</span>
                <span class="loan-id">${l.id}</span>
            </div>
            <span class="status-badge ${statusCls}">${l.status.replace('_',' ').toUpperCase()}</span>
        </div>
        <div class="viewer-card-body">
            <div class="loan-grid">
                <div class="loan-field"><div class="lf-label">COLLATERAL AMOUNT</div><div class="lf-value">${fmtNum(l.collateral_amount, 6)} ${l.asset_type}</div></div>
                <div class="loan-field"><div class="lf-label">INIT. COLLATERAL VALUE</div><div class="lf-value">${fmtBaht(l.initial_collateral_value)}</div></div>
                <div class="loan-field"><div class="lf-label">LOAN AMOUNT</div><div class="lf-value">${fmtBaht(l.loan_amount)}</div></div>
                <div class="loan-field"><div class="lf-label">LTV AT ORIGINATION</div><div class="lf-value">${l.ltv_ratio}%</div></div>
                <div class="loan-field"><div class="lf-label">DAILY INTEREST RATE</div><div class="lf-value">${l.daily_interest_rate}%</div></div>
                <div class="loan-field"><div class="lf-label">START DATE</div><div class="lf-value">${l.start_date}</div></div>
                <div class="loan-field"><div class="lf-label">END DATE</div><div class="lf-value">${l.end_date || 'Open (no end date)'}</div></div>
                <div class="loan-field"><div class="lf-label">DURATION</div><div class="lf-value">${l.duration_days} days (as of today)</div></div>
                <div class="loan-field"><div class="lf-label">ACCRUED INTEREST</div><div class="lf-value text-orange">${fmtBaht(l.accrued_interest)}</div></div>
                <div class="loan-field"><div class="lf-label">TOTAL REPAYMENT</div><div class="lf-value text-red">${fmtBaht(l.total_repayment)}</div></div>
                <div class="loan-field"><div class="lf-label">CURRENT ASSET PRICE</div><div class="lf-value">${fmtBaht(l.current_price)}</div></div>
                <div class="loan-field"><div class="lf-label">CURRENT COLLATERAL VALUE</div><div class="lf-value">${fmtBaht(l.current_collateral_value)}</div></div>
            </div>
            <div class="ltv-bar-container">
                <span class="ltv-label">CURRENT LTV</span>
                <div class="ltv-bar"><div class="ltv-bar-fill" style="width:${Math.min(ltv,100)}%;background:${ltvCol}"></div></div>
                <span class="ltv-value" style="color:${ltvCol}">${ltv.toFixed(2)}%</span>
            </div>
        </div>
        <div class="viewer-card-footer">
            Read-only view &middot; Data reflects current asset prices &middot; Contact admin for changes
        </div>
    </div>`;
}

// ══════════════════════════════════════════════
//  Dashboard
// ══════════════════════════════════════════════
async function loadDashboard() {
    const resp = await fetch('/api/loans?status=all');
    const data = await resp.json();
    const loans = data.loans;
    const active = loans.filter(l => l.status !== 'closed');
    const closed = loans.filter(l => l.status === 'closed');

    document.getElementById('dashSummaryCards').innerHTML = `
        <div class="summary-card card-blue">
            <span class="sc-label">ACTIVE LOANS</span>
            <span class="sc-value">${active.length}</span>
        </div>
        <div class="summary-card card-green">
            <span class="sc-label">CLOSED LOANS</span>
            <span class="sc-value">${closed.length}</span>
        </div>
        <div class="summary-card card-orange">
            <span class="sc-label">TOTAL OUTSTANDING</span>
            <span class="sc-value">${fmtBaht(active.reduce((s,l) => s + l.total_repayment, 0))}</span>
        </div>
        <div class="summary-card card-purple">
            <span class="sc-label">TOTAL COLLATERAL</span>
            <span class="sc-value">${fmtBaht(active.reduce((s,l) => s + l.current_collateral_value, 0))}</span>
        </div>`;
}

// ══════════════════════════════════════════════
//  Liquidity Monitor
// ══════════════════════════════════════════════
async function fetchSummary() {
    const btn = document.getElementById('refreshBtn');
    btn.textContent = 'Loading...'; btn.disabled = true;
    try {
        const depth = getDepth();
        const threshold = getThresholdDecimal();
        const resp = await fetch(`/api/summary?depth=${depth}&threshold=${threshold}`);
        const data = await resp.json();
        renderSummary(data);
        document.getElementById('lastUpdate').textContent =
            'Updated: ' + new Date(data.timestamp).toLocaleString('th-TH');
    } catch (err) {
        document.getElementById('summaryBody').innerHTML =
            `<tr><td colspan="8" class="loading">Error: ${err.message}</td></tr>`;
    } finally { btn.textContent = 'Refresh'; btn.disabled = false; }
}

function renderSummary(data) {
    const tbody = document.getElementById('summaryBody');
    const entries = Object.entries(data.coins).sort((a, b) =>
        (b[1].liquidity_depth || 0) - (a[1].liquidity_depth || 0));

    const rows = entries.map(([coin, info]) => {
        if (info.error) return `<tr><td class="coin-name">${coin}</td><td colspan="7" class="slip-danger">Error: ${info.error}</td></tr>`;

        const slipCls = slipClass(info.slippage_pct);
        const breached = info.threshold_breached;
        const rowCls = breached ? 'row-threshold-breach' : '';

        // Safety column: show SAFE if is_safe, otherwise show values
        let safeVolText, safeThbText, safeBadge;
        if (info.safety.is_safe) {
            safeVolText = '';
            safeThbText = '';
            safeBadge = '<span class="badge badge-safe">SAFE</span>';
        } else {
            safeVolText = fmtNum(info.safety.safe_vol, 4);
            safeThbText = fmtThb(info.safety.safe_thb);
            safeBadge = '';
        }

        return `<tr class="${rowCls}">
            <td class="coin-name">${coin}</td>
            <td>${fmtThb(info.best_bid)}</td>
            <td class="vol-input-cell">
                <input type="number" class="vol-input" id="vol_${coin}" placeholder="${fmtNum(info.vol_used,4)}" data-coin="${coin}" step="any" min="0">
                <button class="btn-calc" onclick="recalcCoin('${coin}')">Calc</button>
            </td>
            <td>${fmtThb(info.liquidity_depth)}</td>
            <td class="${slipCls}">${fmtPct(info.slippage_pct)}</td>
            <td>${safeBadge || safeVolText}</td>
            <td>${safeThbText}</td>
            <td><button class="btn-detail" onclick="showDetail('${coin}')">View</button></td>
        </tr>`;
    });
    tbody.innerHTML = rows.join('');
}

async function recalcCoin(coin) {
    const input = document.getElementById(`vol_${coin}`);
    const customVol = parseFloat(input.value);
    if (!customVol || customVol <= 0) return;
    const depth = getDepth();
    const threshold = getThresholdDecimal();
    try {
        const resp = await fetch(`/api/orderbook/${coin}?depth=${depth}&custom_vol=${customVol}&threshold=${threshold}`);
        const data = await resp.json();
        const row = input.closest('tr');
        const cells = row.querySelectorAll('td');
        row.className = data.threshold_breached ? 'row-threshold-breach' : '';
        cells[3].textContent = fmtThb(data.vol_received);
        cells[4].className = slipClass(data.slippage);
        cells[4].textContent = fmtPct(data.slippage);
        if (data.safety.is_safe) {
            cells[5].innerHTML = '<span class="badge badge-safe">SAFE</span>';
            cells[6].textContent = '';
        } else {
            cells[5].textContent = fmtNum(data.safety.safe_vol, 4);
            cells[6].textContent = fmtThb(data.safety.safe_thb);
        }
    } catch (e) { console.error(`Recalc ${coin} failed:`, e); }
}

// ── Detail View ──
async function showDetail(coin) {
    currentDetailCoin = coin;
    const depth = getDepth();
    const threshold = getThresholdDecimal();
    const summaryInput = document.getElementById(`vol_${coin}`);
    let customVol = summaryInput ? parseFloat(summaryInput.value) : NaN;

    let url = `/api/orderbook/${coin}?depth=${depth}&threshold=${threshold}`;
    if (!isNaN(customVol) && customVol > 0) {
        url += `&custom_vol=${customVol}`;
        document.getElementById('detailVolInput').value = customVol;
    } else {
        document.getElementById('detailVolInput').value = '';
    }

    const resp = await fetch(url);
    const data = await resp.json();
    renderDetail(data);
    document.getElementById('summarySection').classList.add('hidden');
    document.getElementById('detailSection').classList.remove('hidden');
}

async function recalcDetail() {
    if (!currentDetailCoin) return;
    const depth = getDepth();
    const threshold = getThresholdDecimal();
    const customVol = parseFloat(document.getElementById('detailVolInput').value);
    let url = `/api/orderbook/${currentDetailCoin}?depth=${depth}&threshold=${threshold}`;
    if (!isNaN(customVol) && customVol > 0) url += `&custom_vol=${customVol}`;
    const resp = await fetch(url);
    renderDetail(await resp.json());
}

function resetDetailVol() {
    document.getElementById('detailVolInput').value = '';
    recalcDetail();
}

function renderDetail(data) {
    const depth = parseFloat(document.getElementById('depthInput').value) || 90;
    const thresholdPct = getThreshold();

    document.getElementById('detailTitle').textContent = `${data.symbol} - Order Book Detail`;
    document.getElementById('depthLabel').textContent = depth;
    document.getElementById('dThresholdLabel').textContent = thresholdPct + '%';
    document.getElementById('dBestBid').textContent = fmtThb(data.best_bid);
    document.getElementById('dVolUsed').textContent = fmtNum(data.vol_used, 6);
    document.getElementById('dVolReceived').textContent = fmtThb(data.vol_received);
    document.getElementById('dDiff').textContent = fmtThb(data.diff);
    document.getElementById('dDiff').className = 'value ' + (data.diff < 0 ? 'slip-danger' : 'slip-ok');
    document.getElementById('dSlippage').textContent = fmtPct(data.slippage);
    document.getElementById('dSlippage').className = 'value ' + slipClass(data.slippage);

    if (data.safety.is_safe) {
        document.getElementById('dSafeVol').textContent = 'SAFE';
        document.getElementById('dSafeThb').textContent = 'Entire book within threshold';
    } else {
        document.getElementById('dSafeVol').textContent = fmtNum(data.safety.safe_vol, 6);
        document.getElementById('dSafeThb').textContent = fmtThb(data.safety.safe_thb);
    }

    const tbody = document.getElementById('detailBody');
    const bestBid = data.best_bid;
    const safetyLevel = data.safety.crossed_at_level;
    let thresholdLineInserted = false;
    const rows = [];

    for (let i = 0; i < data.levels.length; i++) {
        const l = data.levels[i];
        let levelSlip = null;
        if (l.accru_matched > 0 && l.amount_match > 0) {
            let accumVol = 0;
            for (let j = 0; j <= i; j++) accumVol += data.levels[j].amount_match;
            if (accumVol > 0 && bestBid > 0) {
                levelSlip = ((l.accru_matched - accumVol * bestBid) / (accumVol * bestBid)) * 100;
            }
        }
        if (!thresholdLineInserted && safetyLevel === i) {
            rows.push(`<tr class="row-threshold-line"><td colspan="9">── Safety Line: Threshold ${thresholdPct}% ── Safe Vol: ${fmtNum(data.safety.safe_vol, 6)} | Safe THB: ${fmtThb(data.safety.safe_thb)}</td></tr>`);
            thresholdLineInserted = true;
        }
        let cls = l.amount_match > 0 && l.amount_match >= l.amount ? 'row-matched' : l.amount_match > 0 ? 'row-partial' : 'row-unmatched';
        rows.push(`<tr class="${cls}">
            <td>${i+1}</td><td>${fmtNum(l.amount,6)}</td><td>${fmtThb(l.price)}</td><td>${fmtThb(l.bid_size)}</td>
            <td>${fmtNum(l.accru_amount,6)}</td><td>${fmtNum(l.amount_match,6)}</td><td>${fmtThb(l.sales_matched)}</td>
            <td>${fmtThb(l.accru_matched)}</td><td class="${levelSlip!=null?slipClass(levelSlip):''}">${levelSlip!=null?fmtPct(levelSlip):'-'}</td>
        </tr>`);
    }
    tbody.innerHTML = rows.join('');
}

function closeDetail() {
    document.getElementById('detailSection').classList.add('hidden');
    document.getElementById('summarySection').classList.remove('hidden');
    currentDetailCoin = null;
}

// ── Auto-refresh ──
function setupAutoRefresh() {
    const cb = document.getElementById('autoRefresh');
    cb.addEventListener('change', () => cb.checked ? startAutoRefresh() : stopAutoRefresh());
    startAutoRefresh();
}
function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(() => {
        const liqPage = document.getElementById('page-liquidity');
        if (liqPage.classList.contains('active') && !document.getElementById('summarySection').classList.contains('hidden')) {
            fetchSummary();
        }
    }, 30000);
}
function stopAutoRefresh() { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } }

// ── Keyboard ──
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeDetail(); closeNewLoanModal(); }
});

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    fetchPrices();
    setInterval(fetchPrices, 30000);
    loadLoans();
    setupAutoRefresh();
    document.getElementById('depthInput').addEventListener('change', fetchSummary);
    document.getElementById('thresholdInput').addEventListener('change', fetchSummary);
    // Enter key for viewer search
    document.getElementById('viewerLoanId')?.addEventListener('keydown', e => { if (e.key === 'Enter') lookupLoan(); });
});
