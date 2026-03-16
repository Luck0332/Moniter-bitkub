"""Liquidity calculation engine matching the spreadsheet logic."""

from config import DEFAULT_DEPTH_PERCENT, DEFAULT_THRESHOLD, SCENARIO_SLIPPAGE


def calculate_liquidity(bids: list[dict], depth_percent: float = DEFAULT_DEPTH_PERCENT,
                        custom_vol: float | None = None,
                        threshold: float = DEFAULT_THRESHOLD) -> dict:
    """Calculate liquidity metrics from bid-side order book.

    Args:
        bids: List of {'price': float, 'amount': float, 'volume_thb': float}
              sorted by price descending (best bid first).
        depth_percent: Fraction of total order book depth to use (default 0.90).
        custom_vol: Optional custom volume to use instead of depth_percent.
        threshold: Slippage threshold for safety line (default -3.5%).

    Returns:
        Dictionary with all liquidity metrics.
    """
    if not bids:
        return _empty_result(threshold)

    # Build order book table with accumulated values
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

    # Calculate accumulated matched THB
    accru_matched = 0.0
    for ml in matched_levels:
        accru_matched += ml["sales_matched"]
        ml["accru_matched"] = accru_matched

    # Slippage calculation
    expected_thb = vol_used * best_bid
    diff = vol_received - expected_thb
    slippage = diff / expected_thb if expected_thb > 0 else 0.0

    # Safety line: find where slippage crosses threshold
    safety = _calculate_safety_line(levels, best_bid, threshold)

    # Scenario -5% calculation
    scenario = _calculate_scenario(levels, best_bid, worst_bid, total_amount)

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
        "scenario": scenario,
    }


def _fill_orders(levels: list[dict], vol_target: float) -> list[dict]:
    """Walk through order book levels filling vol_target amount."""
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
    """Find the point where cumulative slippage crosses the threshold.

    Returns the max safe volume and THB receivable within threshold.
    """
    if best_bid <= 0 or not levels:
        return {"safe_vol": 0, "safe_thb": 0, "crossed_at_level": -1,
                "within_threshold": False}

    accru_vol = 0.0
    accru_thb = 0.0
    prev_vol = 0.0
    prev_thb = 0.0
    crossed_at = -1

    for i, level in enumerate(levels):
        price = level["price"]
        amount = level["amount"]

        # Check slippage at the END of this full level
        next_vol = accru_vol + amount
        next_thb = accru_thb + amount * price
        expected = next_vol * best_bid
        slip = (next_thb - expected) / expected if expected > 0 else 0

        if slip < threshold:
            # Threshold crossed within this level - interpolate
            # We need to find exact amount within this level where threshold is hit
            # slip(x) = (accru_thb + x*price - (accru_vol + x)*best_bid) / ((accru_vol + x)*best_bid) = threshold
            # accru_thb + x*price = (1 + threshold) * (accru_vol + x) * best_bid
            # accru_thb + x*price = (1+t)*accru_vol*best_bid + (1+t)*x*best_bid
            # x*price - (1+t)*x*best_bid = (1+t)*accru_vol*best_bid - accru_thb
            # x * (price - (1+t)*best_bid) = (1+t)*accru_vol*best_bid - accru_thb
            t = threshold
            numerator = (1 + t) * accru_vol * best_bid - accru_thb
            denominator = price - (1 + t) * best_bid
            if denominator != 0:
                x = numerator / denominator
                x = max(0, min(x, amount))
            else:
                x = 0
            crossed_at = i
            safe_vol = accru_vol + x
            safe_thb = accru_thb + x * price
            return {
                "safe_vol": safe_vol,
                "safe_thb": safe_thb,
                "crossed_at_level": crossed_at,
                "within_threshold": True,
            }

        prev_vol = accru_vol
        prev_thb = accru_thb
        accru_vol = next_vol
        accru_thb = next_thb

    # Never crossed threshold - entire book is within safety
    return {
        "safe_vol": accru_vol,
        "safe_thb": accru_thb,
        "crossed_at_level": -1,
        "within_threshold": True,
    }


def _calculate_scenario(levels: list[dict], best_bid: float,
                        worst_bid: float, total_amount: float) -> dict:
    """Calculate the -5% slippage scenario test."""
    expected_size = total_amount * best_bid
    min_size = total_amount * worst_bid
    slippage_target = SCENARIO_SLIPPAGE
    test_value = expected_size * (1 + slippage_target)

    vol_needed = test_value / best_bid if best_bid > 0 else 0

    matched = _fill_orders(levels, vol_needed)
    scenario_received = sum(m["sales_matched"] for m in matched)
    remaining = vol_needed - sum(m["amount_match"] for m in matched)

    has_enough = remaining <= 1e-10
    scenario_expected = vol_needed * best_bid
    scenario_slippage = ((scenario_received / scenario_expected) - 1) if scenario_expected > 0 else 0

    return {
        "expected_size": expected_size,
        "min_size": min_size,
        "test_value": test_value,
        "vol_needed": vol_needed,
        "vol_received": scenario_received,
        "has_enough_liquidity": has_enough,
        "slippage": scenario_slippage,
        "slippage_pct": f"{scenario_slippage * 100:.3f}%",
        "levels": matched,
    }


def _empty_result(threshold: float = DEFAULT_THRESHOLD) -> dict:
    return {
        "best_bid": 0, "worst_bid": 0, "total_amount": 0, "total_thb": 0,
        "vol_used": 0, "vol_received": 0, "diff": 0, "slippage": 0,
        "slippage_pct": "N/A", "threshold": threshold,
        "threshold_breached": False,
        "safety": {"safe_vol": 0, "safe_thb": 0, "crossed_at_level": -1, "within_threshold": False},
        "levels": [],
        "scenario": {
            "expected_size": 0, "min_size": 0, "test_value": 0,
            "vol_needed": 0, "vol_received": 0,
            "has_enough_liquidity": False, "slippage": 0,
            "slippage_pct": "N/A", "levels": [],
        },
    }
