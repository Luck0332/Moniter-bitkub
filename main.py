"""Bitkub Liquidity Monitoring Dashboard + Open-End Loan Monitor."""

from datetime import datetime

import httpx
from fastapi import FastAPI, Query, Body
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from bitkub_client import fetch_order_book, fetch_all_order_books
from calculator import calculate_liquidity
from config import COINS, DEFAULT_DEPTH_PERCENT, DEFAULT_THRESHOLD, ASSET_TYPES, BITKUB_API_BASE
from loans import (
    get_all_loans, get_active_loans, get_closed_loans,
    get_loan_by_id, create_loan, update_loan, close_loan, delete_loan,
    calculate_loan_metrics, LTV_OPTIONS,
)

app = FastAPI(title="Liberix Monitor")
app.mount("/static", StaticFiles(directory="static"), name="static")


# ── Pages ──

@app.get("/", response_class=HTMLResponse)
async def index():
    with open("templates/index.html", "r") as f:
        return f.read()


# ── Liquidity API ──

@app.get("/api/summary")
async def get_summary(
    depth: float = Query(DEFAULT_DEPTH_PERCENT, ge=0.01, le=1.0),
    threshold: float = Query(DEFAULT_THRESHOLD, le=0),
):
    books = await fetch_all_order_books(COINS)
    results = {}

    for symbol, book in books.items():
        if "error" in book:
            results[symbol] = {"error": book["error"]}
            continue

        coin_name = symbol.replace("THB_", "")
        calc = calculate_liquidity(book["bids"], depth_percent=depth, threshold=threshold)

        results[coin_name] = {
            "best_bid": calc["best_bid"],
            "total_amount": calc["total_amount"],
            "liquidity_depth": calc["vol_received"],
            "slippage_pct": calc["slippage"] * 100,
            "slippage_display": calc["slippage_pct"],
            "vol_used": calc["vol_used"],
            "threshold": threshold * 100,
            "threshold_breached": calc["threshold_breached"],
            "safety": {
                "safe_vol": calc["safety"]["safe_vol"],
                "safe_thb": calc["safety"]["safe_thb"],
                "is_safe": calc["safety"]["is_safe"],
            },
        }

    return {
        "timestamp": datetime.now().isoformat(),
        "depth_percent": depth,
        "threshold": threshold * 100,
        "coins": results,
    }


@app.get("/api/orderbook/{symbol}")
async def get_orderbook_detail(
    symbol: str,
    depth: float = Query(DEFAULT_DEPTH_PERCENT, ge=0.01, le=1.0),
    custom_vol: float | None = Query(None, gt=0),
    threshold: float = Query(DEFAULT_THRESHOLD, le=0),
):
    bitkub_sym = f"THB_{symbol.upper()}"
    book = await fetch_order_book(bitkub_sym)
    calc = calculate_liquidity(
        book["bids"], depth_percent=depth,
        custom_vol=custom_vol, threshold=threshold,
    )

    display_levels = [{
        "amount": l["amount"], "price": l["price"],
        "bid_size": l["bid_size"], "accru_amount": l["accru_amount"],
        "amount_match": l["amount_match"], "sales_matched": l["sales_matched"],
        "accru_matched": l["accru_matched"],
    } for l in calc["levels"]]

    return {
        "symbol": symbol.upper(),
        "timestamp": datetime.now().isoformat(),
        "best_bid": calc["best_bid"],
        "worst_bid": calc["worst_bid"],
        "total_amount": calc["total_amount"],
        "total_thb": calc["total_thb"],
        "vol_used": calc["vol_used"],
        "vol_received": calc["vol_received"],
        "diff": calc["diff"],
        "slippage": calc["slippage"] * 100,
        "slippage_display": calc["slippage_pct"],
        "threshold": threshold * 100,
        "threshold_breached": calc["threshold_breached"],
        "safety": calc["safety"],
        "levels": display_levels,
    }


# ── Prices API ──

@app.get("/api/prices")
async def get_prices():
    """Get current prices for all supported assets from Bitkub."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{BITKUB_API_BASE}/market/ticker")
        resp.raise_for_status()
        data = resp.json()

    prices = {}
    for asset in ASSET_TYPES:
        key = f"THB_{asset}"
        if key in data:
            prices[asset] = data[key].get("last", 0)
        else:
            prices[asset] = 0
    return prices


# ── Loan API ──

@app.get("/api/loans")
async def api_get_loans(status: str = Query("active")):
    if status == "closed":
        loans = get_closed_loans()
    elif status == "all":
        loans = get_all_loans()
    else:
        loans = get_active_loans()

    # Enrich with current prices
    prices = await get_prices()
    enriched = []
    for loan in loans:
        price = prices.get(loan["asset_type"], 0)
        enriched.append(calculate_loan_metrics(loan, price))

    return {"loans": enriched}


@app.get("/api/loans/{loan_id}")
async def api_get_loan(loan_id: str):
    loan = get_loan_by_id(loan_id)
    if not loan:
        return {"error": "Loan not found"}

    prices = await get_prices()
    price = prices.get(loan["asset_type"], 0)
    return calculate_loan_metrics(loan, price)


@app.post("/api/loans")
async def api_create_loan(loan_data: dict = Body(...)):
    loan = create_loan(loan_data)
    return {"ok": True, "loan": loan}


@app.put("/api/loans/{loan_id}")
async def api_update_loan(loan_id: str, updates: dict = Body(...)):
    loan = update_loan(loan_id, updates)
    if not loan:
        return {"error": "Loan not found"}
    return {"ok": True, "loan": loan}


@app.post("/api/loans/{loan_id}/close")
async def api_close_loan(loan_id: str, body: dict = Body(default={})):
    loan = close_loan(loan_id, body.get("end_date"))
    if not loan:
        return {"error": "Loan not found"}
    return {"ok": True, "loan": loan}


@app.delete("/api/loans/{loan_id}")
async def api_delete_loan(loan_id: str):
    ok = delete_loan(loan_id)
    if not ok:
        return {"error": "Loan not found"}
    return {"ok": True}


@app.get("/api/loan-config")
async def api_loan_config():
    return {
        "asset_types": ASSET_TYPES,
        "ltv_options": LTV_OPTIONS,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
