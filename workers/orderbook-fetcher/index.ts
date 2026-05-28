// Bitkub WebSocket order book fetcher
// Connects to wss://api.bitkub.com/websocket-api/orderbook/[pairingId]
// Events: { data: [volume, rate, amount, 0, isNew, isUser][], event: "bidschanged"|"askschanged", pairing_id: N }

const PAIRING_IDS: Record<string, number> = {
  THB_BTC: 1, THB_ETH: 2, THB_ADA: 4, THB_XRP: 10, THB_JFIN: 31,
  THB_BNB: 33, THB_DOGE: 35, THB_TRX: 37, THB_DOT: 68, THB_KUB: 92,
  THB_SOL: 118, THB_AVAX: 119, THB_WLD: 162, THB_TON: 219, THB_POL: 223, THB_SUI: 235,
};

const COINS = Object.keys(PAIRING_IDS);
const ORDER_BOOK_LIMIT = 200;
const WS_TIMEOUT_MS = 20_000;
const BATCH_SIZE = 4;

interface Env {
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_D1_DATABASE_ID: string;
  CLOUDFLARE_API_TOKEN: string;
}

interface Bid { price: number; amount: number; volume_thb: number }

// ── D1 REST client ────────────────────────────────────────────────────────────

function d1Url(env: Env) {
  return `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${env.CLOUDFLARE_D1_DATABASE_ID}/query`;
}

async function d1Exec(env: Env, sql: string, params: unknown[] = []) {
  const res = await fetch(d1Url(env), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  if (!res.ok) throw new Error(`D1 HTTP ${res.status}`);
  const data = await res.json() as { success: boolean; errors: { message: string }[] };
  if (!data.success) throw new Error(data.errors.map((e) => e.message).join(', '));
  return data;
}

// ── Bitkub WebSocket order book ───────────────────────────────────────────────
// Message format: { data: [[volume, rate, amount, 0, isNew, isUser], ...], event: "bidschanged", pairing_id: N }

function parseBitkubWsEntry(raw: number[][]): Bid[] {
  return raw
    .map((b) => ({
      price: Number(b[1]),       // rate (THB)
      amount: Number(b[2]),      // coin quantity
      volume_thb: Number(b[0]),  // pre-computed volume
    }))
    .filter((b) => b.price > 0 && b.amount > 0)
    .sort((a, b) => b.price - a.price) // descending price (best bid first)
    .slice(0, ORDER_BOOK_LIMIT);
}

async function fetchViaWebSocket(symbol: string): Promise<{ bids: Bid[]; result: string }> {
  const pairingId = PAIRING_IDS[symbol];
  if (!pairingId) return { bids: [], result: 'unknown symbol' };

  const url = `wss://api.bitkub.com/websocket-api/orderbook/${pairingId}`;

  return new Promise<{ bids: Bid[]; result: string }>((resolve) => {
    let settled = false;
    const done = (bids: Bid[], result: string) => {
      if (settled) return;
      settled = true;
      resolve({ bids, result });
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      resolve({ bids: [], result: `WebSocket() threw: ${(e as Error).message}` });
      return;
    }

    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      done([], 'timeout (20s) — no bidschanged message received');
    }, WS_TIMEOUT_MS);

    ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const msg = JSON.parse(typeof event.data === 'string' ? event.data : '{}');

        // We only want bids; wait for bidschanged event
        if (msg.event === 'bidschanged' && Array.isArray(msg.data)) {
          clearTimeout(timeout);
          try { ws.close(); } catch { /* ignore */ }
          const bids = parseBitkubWsEntry(msg.data as number[][]);
          done(bids, bids.length > 0 ? `ok (${bids.length} levels)` : 'bidschanged but empty data');
          return;
        }

        // Unknown message type — log but keep waiting
        // (may receive askschanged first, or a ping/heartbeat)
      } catch { /* ignore parse errors */ }
    });

    ws.addEventListener('error', (e) => {
      clearTimeout(timeout);
      done([], `WS error: ${JSON.stringify(e)}`);
    });

    ws.addEventListener('close', (e: CloseEvent) => {
      clearTimeout(timeout);
      if (!settled) done([], `WS closed early: code=${e.code} reason=${e.reason}`);
    });
  });
}

// ── Store to D1 ───────────────────────────────────────────────────────────────

async function storeOrderBook(symbol: string, bids: Bid[], env: Env) {
  await d1Exec(env,
    `INSERT INTO order_book_cache (symbol, bids_json, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET bids_json = excluded.bids_json, fetched_at = excluded.fetched_at`,
    [symbol, JSON.stringify(bids), new Date().toISOString()],
  );
}

// ── Main run ──────────────────────────────────────────────────────────────────

async function run(env: Env): Promise<string[]> {
  // Ensure table exists (idempotent)
  await d1Exec(env, `CREATE TABLE IF NOT EXISTS order_book_cache (
    symbol TEXT PRIMARY KEY, bids_json TEXT NOT NULL, fetched_at TEXT NOT NULL
  )`);

  const log: string[] = [];

  for (let i = 0; i < COINS.length; i += BATCH_SIZE) {
    const batch = COINS.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (sym) => {
      try {
        const { bids, result } = await fetchViaWebSocket(sym);
        if (bids.length) {
          await storeOrderBook(sym, bids, env);
          log.push(`✓ ${sym} (id:${PAIRING_IDS[sym]}): ${result} @ ${bids[0]?.price}`);
        } else {
          log.push(`✗ ${sym} (id:${PAIRING_IDS[sym]}): ${result}`);
        }
      } catch (e) {
        log.push(`✗ ${sym}: exception — ${(e as Error).message}`);
      }
    }));
  }

  return log;
}

// ── Worker entrypoint ─────────────────────────────────────────────────────────

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env));
  },

  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/status') {
      try {
        const res = await fetch(d1Url(env), {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: 'SELECT symbol, fetched_at, length(bids_json) as bytes FROM order_book_cache ORDER BY symbol' }),
        });
        const data = await res.json() as { result: [{ results: unknown[] }] };
        return Response.json(data.result?.[0]?.results ?? []);
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 500 });
      }
    }

    const results = await run(env);
    return Response.json({ ok: true, timestamp: new Date().toISOString(), results });
  },
};
