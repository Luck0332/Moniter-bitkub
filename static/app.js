// Bitkub Liquidity Monitor - Frontend

let refreshTimer = null;
let currentDetailCoin = null;
let summaryData = null;  // cache last summary for per-coin recalc

// ── Formatting helpers ──

function fmtNum(n, decimals = 2) {
    if (n == null || isNaN(n)) return '-';
    return Number(n).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

function fmtThb(n) { return fmtNum(n, 2); }

function fmtPct(n) {
    if (n == null || isNaN(n)) return '-';
    return n.toFixed(3) + '%';
}

function slipClass(pct) {
    const t = Math.abs(getThreshold());
    if (pct == null) return '';
    if (Math.abs(pct) < t * 0.5) return 'slip-ok';       // well within
    if (Math.abs(pct) < t) return 'slip-warn';            // approaching
    return 'slip-danger';                                   // beyond threshold
}

function getDepth() {
    return (parseFloat(document.getElementById('depthInput').value) || 90) / 100;
}

function getThreshold() {
    return parseFloat(document.getElementById('thresholdInput').value) || -3.5;
}

function getThresholdDecimal() {
    return getThreshold() / 100;
}

// ── Summary ──

async function fetchSummary() {
    const btn = document.getElementById('refreshBtn');
    btn.textContent = 'Loading...';
    btn.disabled = true;

    try {
        const depth = getDepth();
        const threshold = getThresholdDecimal();
        const resp = await fetch(`/api/summary?depth=${depth}&threshold=${threshold}`);
        const data = await resp.json();
        summaryData = data;
        renderSummary(data);
        document.getElementById('lastUpdate').textContent =
            'Updated: ' + new Date(data.timestamp).toLocaleString('th-TH');
    } catch (err) {
        console.error('Failed to fetch summary:', err);
        document.getElementById('summaryBody').innerHTML =
            `<tr><td colspan="10" class="loading">Error: ${err.message}</td></tr>`;
    } finally {
        btn.textContent = 'Refresh';
        btn.disabled = false;
    }
}

function renderSummary(data) {
    const tbody = document.getElementById('summaryBody');
    const coins = data.coins;
    const thresholdPct = data.threshold;
    const rows = [];

    const entries = Object.entries(coins).sort((a, b) =>
        (b[1].liquidity_depth || 0) - (a[1].liquidity_depth || 0)
    );

    for (const [coin, info] of entries) {
        if (info.error) {
            rows.push(`<tr>
                <td class="coin-name">${coin}</td>
                <td colspan="9" class="slip-danger">Error: ${info.error}</td>
            </tr>`);
            continue;
        }

        const slipCls = slipClass(info.slippage_pct);
        const scenSlipCls = slipClass(info.scenario_5pct.slippage_pct);
        const enoughCls = info.scenario_5pct.has_enough ? 'badge-ok' : 'badge-fail';
        const enoughText = info.scenario_5pct.has_enough ? 'YES' : 'NO';

        // Threshold breach check
        const breached = info.threshold_breached;
        const rowCls = breached ? 'row-threshold-breach' : '';

        rows.push(`<tr class="${rowCls}">
            <td class="coin-name">${coin}</td>
            <td>${fmtThb(info.best_bid)}</td>
            <td class="vol-input-cell">
                <input type="number" class="vol-input" id="vol_${coin}"
                       placeholder="${fmtNum(info.vol_used, 4)}"
                       data-coin="${coin}" data-default="${info.vol_used}"
                       step="any" min="0">
                <button class="btn-calc" onclick="recalcCoin('${coin}')">Calc</button>
            </td>
            <td>${fmtThb(info.liquidity_depth)}</td>
            <td class="${slipCls}">${fmtPct(info.slippage_pct)}</td>
            <td>${fmtNum(info.safety.safe_vol, 4)}</td>
            <td>${fmtThb(info.safety.safe_thb)}</td>
            <td class="${scenSlipCls}">${fmtPct(info.scenario_5pct.slippage_pct)}</td>
            <td><span class="badge ${enoughCls}">${enoughText}</span></td>
            <td><button class="btn-detail" onclick="showDetail('${coin}')">View</button></td>
        </tr>`);
    }

    tbody.innerHTML = rows.join('');
}

// Recalculate a single coin with custom vol from summary table
async function recalcCoin(coin) {
    const input = document.getElementById(`vol_${coin}`);
    const customVol = parseFloat(input.value);
    if (!customVol || customVol <= 0) return;

    const depth = getDepth();
    const threshold = getThresholdDecimal();
    let url = `/api/orderbook/${coin}?depth=${depth}&custom_vol=${customVol}&threshold=${threshold}`;

    try {
        const resp = await fetch(url);
        const data = await resp.json();

        // Update just this coin's row in the summary
        const row = input.closest('tr');
        const cells = row.querySelectorAll('td');

        const slipPct = data.slippage;
        const slipCls = slipClass(slipPct);
        const breached = data.threshold_breached;

        row.className = breached ? 'row-threshold-breach' : '';
        cells[3].textContent = fmtThb(data.vol_received);
        cells[4].className = slipCls;
        cells[4].textContent = fmtPct(slipPct);
        cells[5].textContent = fmtNum(data.safety.safe_vol, 4);
        cells[6].textContent = fmtThb(data.safety.safe_thb);
    } catch (err) {
        console.error(`Failed to recalc ${coin}:`, err);
    }
}

// ── Detail View ──

async function showDetail(coin) {
    currentDetailCoin = coin;
    const depth = getDepth();
    const threshold = getThresholdDecimal();

    // Check if there's a custom vol from summary input
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
    if (!isNaN(customVol) && customVol > 0) {
        url += `&custom_vol=${customVol}`;
    }

    const resp = await fetch(url);
    const data = await resp.json();
    renderDetail(data);
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

    // Metrics
    document.getElementById('dBestBid').textContent = fmtThb(data.best_bid);
    document.getElementById('dVolUsed').textContent = fmtNum(data.vol_used, 6);
    document.getElementById('dVolReceived').textContent = fmtThb(data.vol_received);
    document.getElementById('dDiff').textContent = fmtThb(data.diff);
    document.getElementById('dDiff').className = 'value ' + (data.diff < 0 ? 'slip-danger' : 'slip-ok');
    document.getElementById('dSlippage').textContent = fmtPct(data.slippage);
    document.getElementById('dSlippage').className = 'value ' + slipClass(data.slippage);
    document.getElementById('dSafeVol').textContent = fmtNum(data.safety.safe_vol, 6);
    document.getElementById('dSafeThb').textContent = fmtThb(data.safety.safe_thb);

    // Order book table with per-level slippage and threshold line
    const tbody = document.getElementById('detailBody');
    const bestBid = data.best_bid;
    const safetyLevel = data.safety.crossed_at_level;
    let thresholdLineInserted = false;
    const rows = [];

    for (let i = 0; i < data.levels.length; i++) {
        const l = data.levels[i];

        // Calculate per-level cumulative slippage
        let levelSlip = null;
        if (l.accru_matched > 0 && l.amount_match > 0) {
            // cumulative vol matched up to this level
            let accumVol = 0;
            for (let j = 0; j <= i; j++) {
                accumVol += data.levels[j].amount_match;
            }
            if (accumVol > 0 && bestBid > 0) {
                const expectedThb = accumVol * bestBid;
                levelSlip = ((l.accru_matched - expectedThb) / expectedThb) * 100;
            }
        }

        // Insert threshold safety line before the level where it crosses
        if (!thresholdLineInserted && safetyLevel === i) {
            rows.push(`<tr class="row-threshold-line">
                <td colspan="9">
                    ── Safety Line: Threshold ${thresholdPct}% ──
                    Safe Vol: ${fmtNum(data.safety.safe_vol, 6)} |
                    Safe THB: ${fmtThb(data.safety.safe_thb)}
                </td>
            </tr>`);
            thresholdLineInserted = true;
        }

        let cls = '';
        if (l.amount_match > 0 && l.amount_match >= l.amount) cls = 'row-matched';
        else if (l.amount_match > 0) cls = 'row-partial';
        else cls = 'row-unmatched';

        const slipText = levelSlip != null ? fmtPct(levelSlip) : '-';
        const slipCls = levelSlip != null ? slipClass(levelSlip) : '';

        rows.push(`<tr class="${cls}">
            <td>${i + 1}</td>
            <td>${fmtNum(l.amount, 6)}</td>
            <td>${fmtThb(l.price)}</td>
            <td>${fmtThb(l.bid_size)}</td>
            <td>${fmtNum(l.accru_amount, 6)}</td>
            <td>${fmtNum(l.amount_match, 6)}</td>
            <td>${fmtThb(l.sales_matched)}</td>
            <td>${fmtThb(l.accru_matched)}</td>
            <td class="${slipCls}">${slipText}</td>
        </tr>`);
    }

    tbody.innerHTML = rows.join('');

    // Scenario -5%
    const s = data.scenario;
    document.getElementById('sExpected').textContent = fmtThb(s.expected_size);
    document.getElementById('sMinSize').textContent = fmtThb(s.min_size);
    document.getElementById('sTestValue').textContent = fmtThb(s.test_value);
    document.getElementById('sVolNeeded').textContent = fmtNum(s.vol_needed, 6);
    document.getElementById('sVolReceived').textContent = fmtThb(s.vol_received);
    document.getElementById('sSlippage').textContent = fmtPct(s.slippage);
    document.getElementById('sSlippage').className = 'value ' + slipClass(s.slippage);

    const scenBody = document.getElementById('scenarioBody');
    const scenRows = s.levels.map((l, i) => {
        let cls = '';
        if (l.amount_match > 0 && l.amount_match >= l.amount) cls = 'row-matched';
        else if (l.amount_match > 0) cls = 'row-partial';
        else cls = 'row-unmatched';

        return `<tr class="${cls}">
            <td>${i + 1}</td>
            <td>${fmtNum(l.amount, 6)}</td>
            <td>${fmtThb(l.price)}</td>
            <td>${fmtThb(l.bid_size)}</td>
            <td>${fmtNum(l.accru_amount, 6)}</td>
            <td>${fmtNum(l.amount_match, 6)}</td>
            <td>${fmtThb(l.sales_matched)}</td>
        </tr>`;
    });
    scenBody.innerHTML = scenRows.join('');
}

function closeDetail() {
    document.getElementById('detailSection').classList.add('hidden');
    document.getElementById('summarySection').classList.remove('hidden');
    currentDetailCoin = null;
}

// ── Auto-refresh ──

function setupAutoRefresh() {
    const checkbox = document.getElementById('autoRefresh');
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) startAutoRefresh();
        else stopAutoRefresh();
    });
    startAutoRefresh();
}

function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(() => {
        // Only auto-refresh if on summary page
        if (!document.getElementById('summarySection').classList.contains('hidden')) {
            fetchSummary();
        }
    }, 30000);
}

function stopAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
});

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    fetchSummary();
    setupAutoRefresh();
    document.getElementById('depthInput').addEventListener('change', fetchSummary);
    document.getElementById('thresholdInput').addEventListener('change', fetchSummary);
});
