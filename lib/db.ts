import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ...
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function d1Query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await pool.query(toPg(sql), params);
  return rows as T[];
}

export async function d1Run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  const { rowCount } = await pool.query(toPg(sql), params);
  return { changes: rowCount ?? 0 };
}
