"""Configuration for the Bitkub Liquidity Monitor."""

# Bitkub API
BITKUB_API_BASE = "https://api.bitkub.com/api"
ORDER_BOOK_LIMIT = 200  # Number of order book levels to fetch

# Coins to monitor (Bitkub symbol format)
COINS = [
    "THB_BTC", "THB_ETH", "THB_SOL", "THB_BNB",
    "THB_ADA", "THB_DOT", "THB_POL", "THB_TRX",
    "THB_TON", "THB_XRP", "THB_SUI", "THB_AVAX",
    "THB_DOGE", "THB_WLD",
]

# Supported asset types for loans
ASSET_TYPES = ["BTC", "ETH", "SOL", "BNB", "ADA", "DOT", "POL", "TRX",
               "TON", "XRP", "SUI", "AVAX", "DOGE", "WLD", "USDT"]

# Liquidity calculation defaults
DEFAULT_DEPTH_PERCENT = 0.90  # 90% of displayed order book
DEFAULT_THRESHOLD = -0.035    # -3.5% slippage threshold (safety line)

# Loan data file
LOANS_FILE = "data/loans.json"
