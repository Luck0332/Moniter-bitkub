// Liberix Monitor v2 — API-backed Frontend
const ASSETS_SHOW = ['BTC','USDT','ETH','BNB','SOL'];
const ASSET_COLORS = {BTC:'#f7931a',USDT:'#26a17b',ETH:'#627eea',BNB:'#f3ba2f',SOL:'#9945ff',ADA:'#3366ff',DOT:'#e6007a',TRX:'#ef0027',XRP:'#8b949e',DOGE:'#c2a633',WLD:'#8b949e',TON:'#0098ea',SUI:'#4da2ff',AVAX:'#e84142',POL:'#8247e5'};
const PASSCODE_HASH = '2440809e3ec26b00648124b65a81946fff578a91c8365009ffe4dd0e964af874';
let prices = {};
let lastPriceFetch = null;
let currentLiqCoin = null;

// ── Formatting ──
function fmtThb(n){return '฿'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtNum(n,d=2){return Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})}
function fmtPct(n){return n==null||isNaN(n)?'-':n.toFixed(3)+'%'}
function ltvColor(v){return v<60?'var(--green)':v<80?'var(--orange)':'var(--red)'}
function ltvClass(v){return v<60?'ltv-safe':v<80?'ltv-warn':'ltv-danger'}
function slipClass(p){if(p==null)return'';const t=Math.abs(getThreshold());return Math.abs(p)<t*.5?'slip-ok':Math.abs(p)<t?'slip-warn':'slip-danger'}
function getDepth(){return(parseFloat(document.getElementById('depthInput')?.value)||90)/100}
function getThreshold(){return parseFloat(document.getElementById('thresholdInput')?.value)||-3.5}

// ── Navigation (Landing) ──
function enterUserMode(){
  document.getElementById('landingOverlay').classList.add('hidden');
  document.getElementById('userOverlay').classList.add('show');
  document.getElementById('userLoanInput').focus();
}
async function enterAdminMode(){
  document.getElementById('landingOverlay').classList.add('hidden');
  if(sessionStorage.getItem('liberix-admin')){
    document.getElementById('appRoot').classList.add('visible');
    document.getElementById('appRoot').classList.remove('locked');
    loadActiveLoans(); return;
  }
  document.getElementById('lockOverlay').classList.add('show');
  setTimeout(()=>document.getElementById('lockInput').focus(),400);
}
function backToLanding(){
  document.getElementById('userOverlay').classList.remove('show');
  document.getElementById('lockOverlay').classList.remove('show');
  document.getElementById('lockOverlay').classList.remove('unlocked');
  document.getElementById('appRoot').classList.remove('visible');
  clearLoanResult();
  document.getElementById('lockInput').value='';document.getElementById('lockError').textContent='';
  document.getElementById('landingOverlay').classList.remove('hidden');
}
function adminLogout(){sessionStorage.removeItem('liberix-admin');backToLanding()}

// ── Lock ──
async function hashPasscode(s){const d=new TextEncoder().encode(s);const h=await crypto.subtle.digest('SHA-256',d);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function attemptUnlock(){
  const inp=document.getElementById('lockInput'),err=document.getElementById('lockError');
  if(await hashPasscode(inp.value)===PASSCODE_HASH){
    document.getElementById('lockOverlay').classList.add('unlocked');
    document.getElementById('appRoot').classList.add('visible');
    document.getElementById('appRoot').classList.remove('locked');
    sessionStorage.setItem('liberix-admin','1');
    inp.value='';err.textContent='';loadActiveLoans();
  }else{inp.classList.add('error');err.textContent='Incorrect passcode.';setTimeout(()=>inp.classList.remove('error'),500);inp.value='';inp.focus()}
}
function lockApp(){
  document.getElementById('lockOverlay').classList.remove('unlocked');
  document.getElementById('lockOverlay').classList.add('show');
  document.getElementById('appRoot').classList.add('locked');
  document.getElementById('lockInput').value='';
  setTimeout(()=>document.getElementById('lockInput').focus(),400);
}

// ── Prices ──
async function fetchPrices(){
  try{
    const r=await fetch('/api/prices');prices=await r.json();lastPriceFetch=new Date();
    renderPricePanel();renderPriceStatus();
  }catch(e){console.error('Price fetch:',e)}
}
function renderPricePanel(){
  const el=document.getElementById('pricePanel');if(!el)return;
  el.innerHTML=ASSETS_SHOW.map(a=>`<div class="price-row"><div class="price-asset"><span class="price-dot" style="background:${ASSET_COLORS[a]||'#888'}"></span>${a}</div><span class="price-val">${fmtNum(prices[a]||0,0)}</span></div>`).join('');
}
function renderPriceStatus(){
  const els=[document.getElementById('priceStatus'),document.getElementById('userPriceStatus')];
  els.forEach(el=>{if(!el)return;if(lastPriceFetch){const s=Math.round((Date.now()-lastPriceFetch)/1000);const t=s<60?'just now':Math.floor(s/60)+'m ago';el.innerHTML='<span style="color:var(--green)">● Live</span> · '+t}else{el.innerHTML='<span style="color:var(--text-3)">loading...</span>'}});
}

// ── Admin Pages ──
function showPage(page){
  ['pageLoan','pageLiquidity','pageClosed'].forEach(p=>document.getElementById(p).style.display='none');
  document.querySelectorAll('.sidebar-link').forEach(l=>l.classList.remove('active'));
  if(page==='loans'){document.getElementById('pageLoan').style.display='';loadActiveLoans()}
  if(page==='liquidity'){document.getElementById('pageLiquidity').style.display='';fetchLiqSummary()}
  if(page==='closed'){document.getElementById('pageClosed').style.display='';loadClosedLoans()}
  document.querySelector(`.sidebar-link[data-page="${page}"]`)?.classList.add('active');
}

// ── Loans ──
async function loadActiveLoans(){
  try{const r=await fetch('/api/loans?status=active');const d=await r.json();renderSummary(d.loans);renderLoanCards(d.loans,'loansGrid','emptyState')}catch(e){console.error(e)}
}
async function loadClosedLoans(){
  try{const r=await fetch('/api/loans?status=closed');const d=await r.json();renderLoanCards(d.loans,'closedGrid','closedEmpty')}catch(e){console.error(e)}
}
function renderSummary(loans){
  const el=document.getElementById('summaryStrip');if(!loans.length){el.innerHTML='';return}
  const tv=loans.reduce((s,l)=>s+l.loan_amount,0);
  const tr=loans.reduce((s,l)=>s+l.total_repayment,0);
  const tc=loans.reduce((s,l)=>s+l.current_collateral_value,0);
  el.innerHTML=`
    <div class="summary-card blue"><div class="summary-label">Total Loans</div><div class="summary-value">${loans.length}</div><div class="summary-sub">${loans.filter(l=>l.status==='active').length} active</div></div>
    <div class="summary-card green"><div class="summary-label">Total Loan Value</div><div class="summary-value">${fmtThb(tv)}</div><div class="summary-sub">outstanding principal</div></div>
    <div class="summary-card orange"><div class="summary-label">Total Repayment</div><div class="summary-value">${fmtThb(tr)}</div><div class="summary-sub">incl. accrued interest</div></div>
    <div class="summary-card purple"><div class="summary-label">Total Collateral Value</div><div class="summary-value">${fmtThb(tc)}</div><div class="summary-sub">at current prices</div></div>`;
}
function renderLoanCards(loans,gridId,emptyId){
  const grid=document.getElementById(gridId),empty=document.getElementById(emptyId);
  if(!loans.length){grid.innerHTML='';if(empty)empty.style.display='';return}
  if(empty)empty.style.display='none';
  grid.innerHTML=loans.map((l,i)=>{
    const ltv=l.current_ltv||0;const lc=ltvClass(ltv);const pct=Math.min(100,ltv);
    const a=l.asset_type.toLowerCase();const sc='status-'+l.status;
    return `<div class="loan-card" style="animation-delay:${i*.05}s">
      <div class="loan-card-header"><div class="loan-card-id"><span class="asset-chip ${a}">${l.asset_type}</span>${l.id}</div><span class="status-badge ${sc}">${l.status.replace('_',' ').toUpperCase()}</span></div>
      <div class="loan-card-body"><div class="loan-card-grid">
        <div class="loan-field"><div class="loan-field-label">Collateral Amount</div><div class="loan-field-value">${fmtNum(l.collateral_amount,6)} ${l.asset_type}</div></div>
        <div class="loan-field"><div class="loan-field-label">Init. Collateral Value</div><div class="loan-field-value">${fmtThb(l.initial_collateral_value)}</div></div>
        <div class="loan-field"><div class="loan-field-label">Loan Amount</div><div class="loan-field-value large">${fmtThb(l.loan_amount)}</div></div>
        <div class="loan-field"><div class="loan-field-label">LTV at Origination</div><div class="loan-field-value">${l.ltv_ratio}%</div></div>
        <div class="loan-field"><div class="loan-field-label">Daily Interest Rate</div><div class="loan-field-value">${l.daily_interest_rate}%</div></div>
        <div class="loan-field"><div class="loan-field-label">Start Date</div><div class="loan-field-value">${l.start_date}</div></div>
        <div class="loan-field"><div class="loan-field-label">End Date</div><div class="loan-field-value"><div style="display:flex;align-items:center;gap:6px"><input type="date" class="end-date-input" value="${l.end_date||''}" onchange="updateEndDate('${l.id}',this.value)">${!l.end_date?'<span style="font-size:10px;color:var(--text-3)">open</span>':''}</div></div></div>
        <div class="loan-field"><div class="loan-field-label">Duration</div><div class="loan-field-value">${l.duration_days} days ${!l.end_date?'<span style="font-size:10px;color:var(--accent)">(as of today)</span>':''}</div></div>
        <div class="loan-field"><div class="loan-field-label">Accru. Interest</div><div class="loan-field-value" style="color:var(--orange)">${fmtThb(l.accrued_interest)}</div></div>
        <div class="loan-field"><div class="loan-field-label">Total Repayment</div><div class="loan-field-value large" style="color:var(--orange)">${fmtThb(l.total_repayment)}</div></div>
        <div class="loan-field"><div class="loan-field-label">Current Price</div><div class="loan-field-value">${fmtThb(l.current_price)}</div></div>
        <div class="loan-field"><div class="loan-field-label">Current Collateral Value</div><div class="loan-field-value">${fmtThb(l.current_collateral_value)}</div></div>
      </div>
      <div style="padding:12px 0 4px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span class="loan-field-label">Current LTV</span><span style="font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:700;color:${ltvColor(ltv)}">${fmtNum(ltv,2)}%</span>
      </div><div class="ltv-bar-wrap"><div class="ltv-bar-track"><div class="ltv-bar-fill ${lc}" style="width:${pct}%"></div></div></div></div></div>
      ${l.status!=='closed'?`<div class="loan-card-footer"><button class="btn btn-sm btn-danger" onclick="deleteLoan('${l.id}')">Delete</button></div>`:''}
    </div>`}).join('');
}

// ── Modal ──
async function openModal(){
  const r=await fetch('/api/loan-config');const c=await r.json();
  document.getElementById('fAssetType').innerHTML='<option value="">Select asset...</option>'+c.asset_types.map(a=>`<option value="${a}">${a}</option>`).join('');
  document.getElementById('fLtv').innerHTML='<option value="">Select LTV...</option>'+c.ltv_options.map(l=>`<option value="${l}">${l}%</option>`).join('');
  document.getElementById('fStartDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('fLoanId').value='';document.getElementById('fCollateralAmt').value='';
  document.getElementById('fInitCollateralVal').value='';document.getElementById('fLoanAmt').value='';
  document.getElementById('fDailyRate').value='0.041666667';
  document.getElementById('fEndDate').value='';
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal(){document.getElementById('modalOverlay').classList.remove('show')}
async function createLoan(){
  const d={id:document.getElementById('fLoanId').value.trim(),asset_type:document.getElementById('fAssetType').value,
    collateral_amount:parseFloat(document.getElementById('fCollateralAmt').value)||0,
    initial_collateral_value:parseFloat(document.getElementById('fInitCollateralVal').value)||0,
    loan_amount:parseFloat(document.getElementById('fLoanAmt').value)||0,
    ltv_ratio:parseInt(document.getElementById('fLtv').value)||0,
    daily_interest_rate:parseFloat(document.getElementById('fDailyRate').value)||0,
    start_date:document.getElementById('fStartDate').value,
    end_date:document.getElementById('fEndDate').value||null,
    status:document.getElementById('fStatus').value};
  if(!d.id||!d.asset_type){alert('Please fill Loan ID and Asset Type');return}
  await fetch('/api/loans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
  closeModal();loadActiveLoans();
}
async function updateEndDate(id,value){
  await fetch('/api/loans/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({end_date:value||null})});
  loadActiveLoans();
}
async function deleteLoan(id){
  if(!confirm('Delete loan '+id+'?'))return;
  await fetch('/api/loans/'+id,{method:'DELETE'});loadActiveLoans();
}

// ── User Lookup ──
async function userLookupLoan(){
  const id=document.getElementById('userLoanInput').value.trim();const err=document.getElementById('userLookupError');
  if(!id){err.textContent='Please enter a Loan ID.';return}
  try{const r=await fetch('/api/loans/'+id);const d=await r.json();
    if(d.error){err.textContent='No loan found with ID "'+id+'".';return}
    err.textContent='';renderUserLoanCard(d);
  }catch(e){err.textContent='Error: '+e.message}
}
function renderUserLoanCard(l){
  document.getElementById('userLookupBox').style.display='none';
  document.getElementById('userLoanResult').classList.add('show');
  const ltv=l.current_ltv||0;const lc=ltvClass(ltv);const a=l.asset_type.toLowerCase();
  document.getElementById('userLoanCard').innerHTML=`
    <div class="user-loan-card-header"><div class="user-loan-card-id"><span class="asset-chip ${a}">${l.asset_type}</span>${l.id}</div><span class="status-badge status-${l.status}">${l.status.replace('_',' ').toUpperCase()}</span></div>
    <div class="user-loan-card-body"><div class="user-loan-grid">
      <div class="user-loan-field"><div class="user-loan-field-label">Collateral Amount</div><div class="user-loan-field-value">${fmtNum(l.collateral_amount,6)} ${l.asset_type}</div></div>
      <div class="user-loan-field"><div class="user-loan-field-label">Init. Collateral Value</div><div class="user-loan-field-value">${fmtThb(l.initial_collateral_value)}</div></div>
      <div class="user-loan-field"><div class="user-loan-field-label">Loan Amount</div><div class="user-loan-field-value large">${fmtThb(l.loan_amount)}</div></div>
      <div class="user-loan-field"><div class="user-loan-field-label">LTV at Origination</div><div class="user-loan-field-value">${l.ltv_ratio}%</div></div>
      <div class="user-loan-field"><div class="user-loan-field-label">Daily Interest Rate</div><div class="user-loan-field-value">${l.daily_interest_rate}%</div></div>
      <div class="user-loan-field"><div class="user-loan-field-label">Start Date</div><div class="user-loan-field-value">${l.start_date}</div></div>
      <div class="user-loan-field"><div class="user-loan-field-label">End Date</div><div class="user-loan-field-value">${l.end_date||'Open (no end date)'}</div></div>
      <div class="user-loan-field"><div class="user-loan-field-label">Duration</div><div class="user-loan-field-value">${l.duration_days} days</div></div>
      <div class="user-loan-field"><div class="user-loan-field-label">Accrued Interest</div><div class="user-loan-field-value">${fmtThb(l.accrued_interest)}</div></div>
      <div class="user-loan-field"><div class="user-loan-field-label">Total Repayment</div><div class="user-loan-field-value large highlight">${fmtThb(l.total_repayment)}</div></div>
      <div class="user-loan-field"><div class="user-loan-field-label">Current Price</div><div class="user-loan-field-value">${fmtThb(l.current_price)}</div></div>
      <div class="user-loan-field"><div class="user-loan-field-label">Current Collateral Value</div><div class="user-loan-field-value">${fmtThb(l.current_collateral_value)}</div></div>
    </div>
    <div style="padding:16px 0 8px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span class="user-loan-field-label">Current LTV</span><span style="font-family:'IBM Plex Mono',monospace;font-size:15px;font-weight:700;color:${ltvColor(ltv)}">${fmtNum(ltv,2)}%</span>
    </div><div class="ltv-bar-wrap"><div class="ltv-bar-track"><div class="ltv-bar-fill ${lc}" style="width:${Math.min(100,ltv)}%"></div></div></div></div></div>
    <div class="user-loan-card-footer"><div class="user-loan-timestamp">Queried ${new Date().toLocaleString()}</div><span style="font-size:11px;color:var(--text-3)">Read-only view</span></div>`;
}
function clearLoanResult(){
  document.getElementById('userLoanResult').classList.remove('show');
  document.getElementById('userLookupBox').style.display='';
  document.getElementById('userLoanInput').value='';document.getElementById('userLookupError').textContent='';
}

// ── Liquidity Monitor ──
async function fetchLiqSummary(){
  const btn=document.getElementById('refreshBtn');btn.textContent='...';btn.disabled=true;
  try{const r=await fetch(`/api/summary?depth=${getDepth()}&threshold=${getThreshold()/100}`);const d=await r.json();
    renderLiqSummary(d);document.getElementById('lastUpdate').textContent='Updated: '+new Date(d.timestamp).toLocaleTimeString();
  }catch(e){document.getElementById('liqBody').innerHTML=`<tr><td colspan="8" class="loading">Error: ${e.message}</td></tr>`}
  finally{btn.textContent='Refresh';btn.disabled=false}
}
function renderLiqSummary(data){
  const tbody=document.getElementById('liqBody');
  const entries=Object.entries(data.coins).sort((a,b)=>(b[1].liquidity_depth||0)-(a[1].liquidity_depth||0));
  tbody.innerHTML=entries.map(([coin,i])=>{
    if(i.error)return`<tr><td class="coin-name">${coin}</td><td colspan="7" class="slip-danger">${i.error}</td></tr>`;
    const sc=slipClass(i.slippage_pct);
    const safe=i.safety.is_safe?'<span class="badge-safe">SAFE</span>':fmtNum(i.safety.safe_vol,4);
    const safeThb=i.safety.is_safe?'':fmtNum(i.safety.safe_thb,2);
    return`<tr><td class="coin-name">${coin}</td><td>${fmtNum(i.best_bid,2)}</td>
      <td style="display:flex;gap:4px;align-items:center"><input type="number" class="vol-input" id="vol_${coin}" placeholder="${fmtNum(i.vol_used,4)}" step="any" min="0"><button class="btn-calc" onclick="recalcLiqCoin('${coin}')">Calc</button></td>
      <td>${fmtNum(i.liquidity_depth,2)}</td><td class="${sc}">${fmtPct(i.slippage_pct)}</td><td>${safe}</td><td>${safeThb}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="showLiqDetail('${coin}')">View</button></td></tr>`}).join('');
}
async function recalcLiqCoin(coin){
  const v=parseFloat(document.getElementById('vol_'+coin)?.value);if(!v||v<=0)return;
  const r=await fetch(`/api/orderbook/${coin}?depth=${getDepth()}&custom_vol=${v}&threshold=${getThreshold()/100}`);
  const d=await r.json();const row=document.getElementById('vol_'+coin).closest('tr').querySelectorAll('td');
  row[3].textContent=fmtNum(d.vol_received,2);row[4].className=slipClass(d.slippage);row[4].textContent=fmtPct(d.slippage);
  row[5].innerHTML=d.safety.is_safe?'<span class="badge-safe">SAFE</span>':fmtNum(d.safety.safe_vol,4);
  row[6].textContent=d.safety.is_safe?'':fmtNum(d.safety.safe_thb,2);
}
async function showLiqDetail(coin){
  currentLiqCoin=coin;const v=parseFloat(document.getElementById('vol_'+coin)?.value);
  let url=`/api/orderbook/${coin}?depth=${getDepth()}&threshold=${getThreshold()/100}`;
  if(v>0){url+=`&custom_vol=${v}`;document.getElementById('liqDetailVol').value=v}else{document.getElementById('liqDetailVol').value=''}
  const r=await fetch(url);renderLiqDetail(await r.json());
  document.getElementById('liqSummarySection').style.display='none';document.getElementById('liqDetailSection').style.display='';
}
async function recalcLiqDetail(){
  if(!currentLiqCoin)return;const v=parseFloat(document.getElementById('liqDetailVol').value);
  let url=`/api/orderbook/${currentLiqCoin}?depth=${getDepth()}&threshold=${getThreshold()/100}`;
  if(v>0)url+=`&custom_vol=${v}`;
  const r=await fetch(url);renderLiqDetail(await r.json());
}
function renderLiqDetail(d){
  document.getElementById('liqDetailTitle').textContent=d.symbol+' — Order Book Detail';
  const m=document.getElementById('liqDetailMetrics');
  const safeText=d.safety.is_safe?'SAFE (entire book)':fmtNum(d.safety.safe_vol,6);
  m.innerHTML=`
    <div class="summary-card blue"><div class="summary-label">Best Bid</div><div class="summary-value">${fmtNum(d.best_bid,2)}</div></div>
    <div class="summary-card green"><div class="summary-label">Vol Used</div><div class="summary-value">${fmtNum(d.vol_used,6)}</div></div>
    <div class="summary-card orange"><div class="summary-label">Vol Received (THB)</div><div class="summary-value">${fmtNum(d.vol_received,2)}</div></div>
    <div class="summary-card ${d.slippage<0?'orange':'green'}"><div class="summary-label">Slippage</div><div class="summary-value">${fmtPct(d.slippage)}</div></div>
    <div class="summary-card purple"><div class="summary-label">Safe Vol (${getThreshold()}%)</div><div class="summary-value">${safeText}</div></div>`;
  const tbody=document.getElementById('liqDetailBody');const bb=d.best_bid;const sl=d.safety.crossed_at_level;
  let inserted=false;const rows=[];
  for(let i=0;i<d.levels.length;i++){
    const l=d.levels[i];let ls=null;
    if(l.accru_matched>0&&l.amount_match>0){let av=0;for(let j=0;j<=i;j++)av+=d.levels[j].amount_match;if(av>0&&bb>0)ls=((l.accru_matched-av*bb)/(av*bb))*100}
    if(!inserted&&sl===i){rows.push(`<tr class="row-threshold-line"><td colspan="9">── Safety Line: ${getThreshold()}% ── Safe Vol: ${fmtNum(d.safety.safe_vol,6)} | Safe THB: ${fmtNum(d.safety.safe_thb,2)}</td></tr>`);inserted=true}
    const c=l.amount_match>0&&l.amount_match>=l.amount?'row-matched':l.amount_match>0?'row-partial':'row-unmatched';
    rows.push(`<tr class="${c}"><td>${i+1}</td><td>${fmtNum(l.amount,6)}</td><td>${fmtNum(l.price,2)}</td><td>${fmtNum(l.bid_size,2)}</td><td>${fmtNum(l.accru_amount,6)}</td><td>${fmtNum(l.amount_match,6)}</td><td>${fmtNum(l.sales_matched,2)}</td><td>${fmtNum(l.accru_matched,2)}</td><td class="${ls!=null?slipClass(ls):''}">${ls!=null?fmtPct(ls):'-'}</td></tr>`);
  }
  tbody.innerHTML=rows.join('');
}
function closeLiqDetail(){document.getElementById('liqDetailSection').style.display='none';document.getElementById('liqSummarySection').style.display='';currentLiqCoin=null}

// ── Keyboard ──
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeLiqDetail()}});

// ── Init ──
(async function(){
  fetchPrices();setInterval(fetchPrices,60000);setInterval(renderPriceStatus,30000);
  document.getElementById('depthInput')?.addEventListener('change',fetchLiqSummary);
  document.getElementById('thresholdInput')?.addEventListener('change',fetchLiqSummary);
})();
