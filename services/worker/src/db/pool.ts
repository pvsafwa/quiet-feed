import { Pool } from 'pg';
import { env } from '../env';

// One shared connection pool for the whole process.
export const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });

pool.on('error', (err) => {
  console.error('[db] idle client error', err);
});

export async function query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
  const res = await pool.query(text, params as any[]);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}

export async function closePool(): Promise<void> {
  await pool.end();
}
