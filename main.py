"""Bitkub Liquidity Monitoring Dashboard - FastAPI Application."""

from datetime import datetime

from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from bitkub_client import fetch_order_book, fetch_all_order_books
from calculator import calculate_liquidity
from config import COINS, DEFAULT_DEPTH_PERCENT, DEFAULT_THRESHOLD

app = FastAPI(title="Bitkub Liquidity Monitor")
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", response_class=HTMLResponse)
async def dashboard():
    with open("templates/index.html", "r") as f:
        return f.read()


@app.get("/api/summary")
async def get_summary(
    depth: float = Query(DEFAULT_DEPTH_PERCENT, ge=0.01, le=1.0),
    threshold: float = Query(DEFAULT_THRESHOLD, le=0),
):
    """Get liquidity summary for all monitored coins."""
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
            },
            "scenario_5pct": {
                "test_value": calc["scenario"]["test_value"],
                "has_enough": calc["scenario"]["has_enough_liquidity"],
                "slippage_pct": calc["scenario"]["slippage"] * 100,
                "slippage_display": calc["scenario"]["slippage_pct"],
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
    """Get detailed order book and liquidity data for a specific coin."""
    bitkub_sym = f"THB_{symbol.upper()}"
    book = await fetch_order_book(bitkub_sym)
    calc = calculate_liquidity(
        book["bids"],
        depth_percent=depth,
        custom_vol=custom_vol,
        threshold=threshold,
    )

    display_levels = []
    for level in calc["levels"]:
        display_levels.append({
            "amount": level["amount"],
            "price": level["price"],
            "bid_size": level["bid_size"],
            "accru_amount": level["accru_amount"],
            "amount_match": level["amount_match"],
            "sales_matched": level["sales_matched"],
            "accru_matched": level["accru_matched"],
        })

    scenario_levels = []
    for level in calc["scenario"]["levels"]:
        scenario_levels.append({
            "amount": level["amount"],
            "price": level["price"],
            "bid_size": level["bid_size"],
            "accru_amount": level["accru_amount"],
            "amount_match": level["amount_match"],
            "sales_matched": level["sales_matched"],
        })

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
        "scenario": {
            "expected_size": calc["scenario"]["expected_size"],
            "min_size": calc["scenario"]["min_size"],
            "test_value": calc["scenario"]["test_value"],
            "vol_needed": calc["scenario"]["vol_needed"],
            "vol_received": calc["scenario"]["vol_received"],
            "has_enough": calc["scenario"]["has_enough_liquidity"],
            "slippage": calc["scenario"]["slippage"] * 100,
            "slippage_display": calc["scenario"]["slippage_pct"],
            "levels": scenario_levels,
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
