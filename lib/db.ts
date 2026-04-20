// Cloudflare D1 HTTP API client
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const DATABASE_ID = process.env.CLOUDFLARE_D1_DATABASE_ID!;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;

function baseUrl() {
  return `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;
}

interface D1Response<T> {
  success: boolean;
  errors: { message: string }[];
  result: [{ results: T[]; meta: { changes: number; last_row_id: number } }];
}

async function d1Fetch<T>(sql: string, params: unknown[] = []): Promise<D1Response<T>> {
  const res = await fetch(baseUrl(), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`D1 HTTP error: ${res.status}`);
  return res.json();
}

export async function d1Query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const data = await d1Fetch<T>(sql, params);
  if (!data.success) throw new Error(data.errors.map(e => e.message).join(', '));
  return data.result[0].results;
}

export async function d1Run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  const data = await d1Fetch(sql, params);
  if (!data.success) throw new Error(data.errors.map(e => e.message).join(', '));
  return { changes: data.result[0].meta?.changes ?? 0 };
}
