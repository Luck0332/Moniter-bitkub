import { d1Query, d1Run } from './db';

export interface Holding {
  asset_type: string;
  amount: number;
  updated_at: string;
}

export async function getAllHoldings(): Promise<Holding[]> {
  return d1Query<Holding>('SELECT * FROM holdings ORDER BY asset_type');
}

export async function getHolding(assetType: string): Promise<Holding | null> {
  const rows = await d1Query<Holding>('SELECT * FROM holdings WHERE asset_type = ?', [assetType]);
  return rows[0] ?? null;
}

export async function upsertHolding(assetType: string, amount: number): Promise<void> {
  await d1Run(
    `INSERT INTO holdings (asset_type, amount, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(asset_type) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`,
    [assetType, amount, new Date().toISOString()]
  );
}

export async function bulkUpsertHoldings(entries: { asset_type: string; amount: number }[]): Promise<void> {
  await Promise.all(entries.map(e => upsertHolding(e.asset_type, e.amount)));
}
