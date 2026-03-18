"""Open-End Loan data model and storage (Firebase Realtime DB + JSON fallback)."""

import json
import os
from datetime import date, datetime

import httpx

from config import LOANS_FILE

LTV_OPTIONS = [30, 40, 50, 60, 70, 80]

# Firebase config from environment
FIREBASE_URL = os.environ.get("FIREBASE_URL", "").rstrip("/")  # e.g. https://xxx.firebaseio.com
FIREBASE_COLLECTION = "loans"

_use_firebase = bool(FIREBASE_URL)


# ══════════════════════════════════════
#  Storage layer (Firebase or JSON file)
# ══════════════════════════════════════

def _fb_url(path: str = "") -> str:
    return f"{FIREBASE_URL}/{FIREBASE_COLLECTION}{path}.json"


def _load_loans() -> dict:
    if _use_firebase:
        try:
            resp = httpx.get(_fb_url(), timeout=10)
            resp.raise_for_status()
            data = resp.json()
            if data is None:
                return {"loans": []}
            # Firebase stores as dict {key: loan}, convert to list
            if isinstance(data, dict):
                loans = list(data.values())
            else:
                loans = data
            return {"loans": loans}
        except Exception as e:
            print(f"[Firebase] Load failed: {e}, falling back to local")

    # Fallback: local JSON
    if not os.path.exists(LOANS_FILE):
        return {"loans": []}
    with open(LOANS_FILE, "r") as f:
        return json.load(f)


def _save_loan_to_firebase(loan: dict):
    """Save a single loan to Firebase using loan ID as key."""
    if not _use_firebase:
        return
    try:
        key = loan["id"].replace("/", "_").replace(".", "_")
        httpx.put(_fb_url(f"/{key}"), json=loan, timeout=10)
    except Exception as e:
        print(f"[Firebase] Save failed: {e}")


def _delete_from_firebase(loan_id: str):
    if not _use_firebase:
        return
    try:
        key = loan_id.replace("/", "_").replace(".", "_")
        httpx.delete(_fb_url(f"/{key}"), timeout=10)
    except Exception as e:
        print(f"[Firebase] Delete failed: {e}")


def _save_loans_local(data: dict):
    """Save to local JSON as backup."""
    os.makedirs(os.path.dirname(LOANS_FILE), exist_ok=True)
    with open(LOANS_FILE, "w") as f:
        json.dump(data, f, indent=2, default=str)


# ══════════════════════════════════════
#  Public API
# ══════════════════════════════════════

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

    _save_loan_to_firebase(loan)

    # Also save locally
    data = _load_loans()
    data["loans"].append(loan)
    _save_loans_local(data)

    return loan


def update_loan(loan_id: str, updates: dict) -> dict | None:
    data = _load_loans()
    for i, loan in enumerate(data["loans"]):
        if loan["id"] == loan_id:
            data["loans"][i].update(updates)
            _save_loan_to_firebase(data["loans"][i])
            _save_loans_local(data)
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
        _delete_from_firebase(loan_id)
        _save_loans_local(data)
        return True
    return False


def calculate_loan_metrics(loan: dict, current_price: float) -> dict:
    start = datetime.strptime(loan["start_date"], "%Y-%m-%d").date()

    if loan.get("end_date"):
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
