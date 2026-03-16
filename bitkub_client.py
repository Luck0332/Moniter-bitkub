"""Bitkub API client for fetching order book data."""

import httpx
from config import BITKUB_API_BASE, ORDER_BOOK_LIMIT


async def fetch_order_book(symbol: str, limit: int = ORDER_BOOK_LIMIT) -> dict:
    """Fetch order book for a given symbol from Bitkub API.

    Returns dict with 'bids' and 'asks', each a list of:
        {'price': float, 'amount': float, 'volume_thb': float}
    sorted by price descending (bids) / ascending (asks).
    """
    url = f"{BITKUB_API_BASE}/market/books"
    params = {"sym": symbol, "lmt": limit}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    if data.get("error") != 0:
        raise ValueError(f"Bitkub API error for {symbol}: {data}")

    result = data["result"]

    bids = []
    for entry in result.get("bids", []):
        # Format: [order_id, timestamp, volume_thb, rate, amount_crypto]
        bids.append({
            "price": float(entry[3]),
            "amount": float(entry[4]),
            "volume_thb": float(entry[2]),
        })

    asks = []
    for entry in result.get("asks", []):
        asks.append({
            "price": float(entry[3]),
            "amount": float(entry[4]),
            "volume_thb": float(entry[2]),
        })

    return {"bids": bids, "asks": asks}


async def fetch_all_order_books(symbols: list[str]) -> dict:
    """Fetch order books for multiple symbols concurrently."""
    import asyncio

    async def _fetch(sym):
        try:
            book = await fetch_order_book(sym)
            return sym, book
        except Exception as e:
            return sym, {"bids": [], "asks": [], "error": str(e)}

    tasks = [_fetch(sym) for sym in symbols]
    results = await asyncio.gather(*tasks)
    return dict(results)
