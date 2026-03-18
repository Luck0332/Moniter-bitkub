// User Loan Viewer — read-only lookup

async function userLookupLoan(){
  const id=document.getElementById('userLoanInput').value.trim();
  const err=document.getElementById('userLookupError');
  if(!id){err.textContent='Please enter a Loan ID.';return}
  try{
    const r=await fetch(API_BASE+'/api/loans/'+id);const d=await r.json();
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
  document.getElementById('userLoanInput').value='';
  document.getElementById('userLookupError').textContent='';
}

// Focus input on load
document.getElementById('userLoanInput')?.focus();
