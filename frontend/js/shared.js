// Shared utilities used by both viewer and admin
const ASSET_COLORS = {BTC:'#f7931a',USDT:'#26a17b',ETH:'#627eea',BNB:'#f3ba2f',SOL:'#9945ff',ADA:'#3366ff',DOT:'#e6007a',TRX:'#ef0027',XRP:'#8b949e',DOGE:'#c2a633',WLD:'#8b949e',TON:'#0098ea',SUI:'#4da2ff',AVAX:'#e84142',POL:'#8247e5'};
let prices = {};
let lastPriceFetch = null;

function fmtThb(n){return '฿'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtNum(n,d=2){return Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})}
function fmtPct(n){return n==null||isNaN(n)?'-':n.toFixed(3)+'%'}
function ltvColor(v){return v<60?'var(--green)':v<80?'var(--orange)':'var(--red)'}
function ltvClass(v){return v<60?'ltv-safe':v<80?'ltv-warn':'ltv-danger'}

async function fetchPrices(){
  try{
    const r=await fetch('/api/prices');prices=await r.json();lastPriceFetch=new Date();
    if(typeof renderPricePanel==='function') renderPricePanel();
    renderPriceStatus();
  }catch(e){console.error('Price fetch:',e)}
}

function renderPriceStatus(){
  ['priceStatus','userPriceStatus'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    if(lastPriceFetch){
      const s=Math.round((Date.now()-lastPriceFetch)/1000);
      const t=s<60?'just now':Math.floor(s/60)+'m ago';
      el.innerHTML='<span style="color:var(--green)">● Live</span> · '+t;
    }else{el.innerHTML='<span style="color:var(--text-3)">loading...</span>'}
  });
}

// Init prices
fetchPrices();
setInterval(fetchPrices,60000);
setInterval(renderPriceStatus,30000);
