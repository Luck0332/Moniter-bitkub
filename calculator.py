"""Liquidity calculation engine matching the spreadsheet logic."""

from config import DEFAULT_DEPTH_PERCENT, DEFAULT_THRESHOLD


def calculate_liquidity(bids: list[dict], depth_percent: float = DEFAULT_DEPTH_PERCENT,
                        custom_vol: float | None = None,
                        threshold: float = DEFAULT_THRESHOLD) -> dict:
    if not bids:
        return _empty_result(threshold)

    # Build order book table
    levels = []
    accru_amount = 0.0
    accru_thb = 0.0

    for bid in bids:
        price = bid["price"]
        amount = bid["amount"]
        bid_size = amount * price
        accru_amount += amount
        accru_thb += bid_size
        levels.append({
            "price": price,
            "amount": amount,
            "bid_size": bid_size,
            "accru_amount": accru_amount,
            "accru_thb": accru_thb,
        })

    total_amount = accru_amount
    best_bid = levels[0]["price"]
    worst_bid = levels[-1]["price"]

    # Determine vol_used
    if custom_vol is not None:
        vol_used = min(custom_vol, total_amount)
    else:
        vol_used = total_amount * depth_percent

    # Walk through bids to fill vol_used
    matched_levels = _fill_orders(levels, vol_used)
    vol_received = sum(ml["sales_matched"] for ml in matched_levels)

    # Accumulated matched THB
    accru_matched = 0.0
    for ml in matched_levels:
        accru_matched += ml["sales_matched"]
        ml["accru_matched"] = accru_matched

    # Slippage
    expected_thb = vol_used * best_bid
    diff = vol_received - expected_thb
    slippage = diff / expected_thb if expected_thb > 0 else 0.0

    # Safety line
    safety = _calculate_safety_line(levels, best_bid, threshold)

    return {
        "best_bid": best_bid,
        "worst_bid": worst_bid,
        "total_amount": total_amount,
        "total_thb": levels[-1]["accru_thb"] if levels else 0.0,
        "vol_used": vol_used,
        "vol_received": vol_received,
        "diff": diff,
        "slippage": slippage,
        "slippage_pct": f"{slippage * 100:.3f}%",
        "threshold": threshold,
        "threshold_breached": slippage < threshold,
        "safety": safety,
        "levels": matched_levels,
    }


def _fill_orders(levels: list[dict], vol_target: float) -> list[dict]:
    matched = []
    remaining = vol_target
    for level in levels:
        if remaining <= 0:
            matched.append({**level, "amount_match": 0.0, "sales_matched": 0.0})
            continue
        match_amount = min(remaining, level["amount"])
        match_thb = match_amount * level["price"]
        remaining -= match_amount
        matched.append({**level, "amount_match": match_amount, "sales_matched": match_thb})
    return matched


def _calculate_safety_line(levels: list[dict], best_bid: float,
                           threshold: float) -> dict:
    if best_bid <= 0 or not levels:
        return {"safe_vol": 0, "safe_thb": 0, "crossed_at_level": -1,
                "is_safe": False}

    accru_vol = 0.0
    accru_thb = 0.0

    for i, level in enumerate(levels):
        price = level["price"]
        amount = level["amount"]

        next_vol = accru_vol + amount
        next_thb = accru_thb + amount * price
        expected = next_vol * best_bid
        slip = (next_thb - expected) / expected if expected > 0 else 0

        if slip < threshold:
            # Interpolate exact crossing point
            t = threshold
            numerator = (1 + t) * accru_vol * best_bid - accru_thb
            denominator = price - (1 + t) * best_bid
            if denominator != 0:
                x = max(0, min(numerator / denominator, amount))
            else:
                x = 0
            safe_vol = accru_vol + x
            safe_thb = accru_thb + x * price
            return {
                "safe_vol": safe_vol,
                "safe_thb": safe_thb,
                "crossed_at_level": i,
                "is_safe": False,
            }

        accru_vol = next_vol
        accru_thb = next_thb

    # Never crossed threshold - entire book is safe
    return {
        "safe_vol": accru_vol,
        "safe_thb": accru_thb,
        "crossed_at_level": -1,
        "is_safe": True,
    }


def _empty_result(threshold: float = DEFAULT_THRESHOLD) -> dict:
    return {
        "best_bid": 0, "worst_bid": 0, "total_amount": 0, "total_thb": 0,
        "vol_used": 0, "vol_received": 0, "diff": 0, "slippage": 0,
        "slippage_pct": "N/A", "threshold": threshold,
        "threshold_breached": False,
        "safety": {"safe_vol": 0, "safe_thb": 0, "crossed_at_level": -1, "is_safe": False},
        "levels": [],
    }
