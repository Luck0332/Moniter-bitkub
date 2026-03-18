"""Open-End Loan data model and storage."""

import json
import os
from datetime import date, datetime

from config import LOANS_FILE

# LTV ratio options
LTV_OPTIONS = [30, 40, 50, 60, 70, 80]


def _load_loans() -> dict:
    if not os.path.exists(LOANS_FILE):
        return {"loans": []}
    with open(LOANS_FILE, "r") as f:
        return json.load(f)


def _save_loans(data: dict):
    os.makedirs(os.path.dirname(LOANS_FILE), exist_ok=True)
    with open(LOANS_FILE, "w") as f:
        json.dump(data, f, indent=2, default=str)


def get_all_loans() -> list[dict]:
    return _load_loans()["loans"]


def get_active_loans() -> list[dict]:
    return [l for l in get_all_loans() if l["status"] != "closed"]


def get_closed_loans() -> list[dict]:
    return [l for l in get_all_loans() if l["status"] == "closed"]


def get_loan_by_id(loan_id: str) -> dict | None:
    for loan in get_all_loans():
        if loan["id"] == loan_id:
            return loan
    return None


def create_loan(loan_data: dict) -> dict:
    data = _load_loans()

    loan = {
        "id": loan_data["id"],
        "asset_type": loan_data["asset_type"],
        "collateral_amount": float(loan_data["collateral_amount"]),
        "initial_collateral_value": float(loan_data["initial_collateral_value"]),
        "loan_amount": float(loan_data["loan_amount"]),
        "ltv_ratio": int(loan_data["ltv_ratio"]),
        "daily_interest_rate": float(loan_data["daily_interest_rate"]),
        "start_date": loan_data["start_date"],
        "end_date": None,
        "status": loan_data.get("status", "active"),
        "created_at": datetime.now().isoformat(),
    }

    data["loans"].append(loan)
    _save_loans(data)
    return loan


def update_loan(loan_id: str, updates: dict) -> dict | None:
    data = _load_loans()
    for i, loan in enumerate(data["loans"]):
        if loan["id"] == loan_id:
            data["loans"][i].update(updates)
            _save_loans(data)
            return data["loans"][i]
    return None


def close_loan(loan_id: str, end_date: str | None = None) -> dict | None:
    return update_loan(loan_id, {
        "status": "closed",
        "end_date": end_date or date.today().isoformat(),
    })


def delete_loan(loan_id: str) -> bool:
    data = _load_loans()
    original_len = len(data["loans"])
    data["loans"] = [l for l in data["loans"] if l["id"] != loan_id]
    if len(data["loans"]) < original_len:
        _save_loans(data)
        return True
    return False


def calculate_loan_metrics(loan: dict, current_price: float) -> dict:
    """Calculate real-time metrics for a loan given current asset price."""
    start = datetime.strptime(loan["start_date"], "%Y-%m-%d").date()

    if loan["end_date"]:
        end = datetime.strptime(loan["end_date"], "%Y-%m-%d").date()
    else:
        end = date.today()

    duration_days = max((end - start).days, 0)

    loan_amount = loan["loan_amount"]
    daily_rate = loan["daily_interest_rate"] / 100
    accrued_interest = loan_amount * daily_rate * duration_days
    total_repayment = loan_amount + accrued_interest

    current_collateral_value = loan["collateral_amount"] * current_price
    current_ltv = (total_repayment / current_collateral_value * 100) if current_collateral_value > 0 else 0

    return {
        **loan,
        "duration_days": duration_days,
        "accrued_interest": round(accrued_interest, 2),
        "total_repayment": round(total_repayment, 2),
        "current_price": current_price,
        "current_collateral_value": round(current_collateral_value, 2),
        "current_ltv": round(current_ltv, 2),
    }
