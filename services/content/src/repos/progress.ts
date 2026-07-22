import { query } from '../db/pool';

// Per-user progress is stored as one JSON document (same shape the frontend uses).
export async function getProgress(userId: string): Promise<unknown> {
  const { rows } = await query<{ data: unknown }>('SELECT data FROM progress WHERE user_id = $1', [userId]);
  return rows.length ? rows[0].data : { v: {}, day: {}, pl: {}, mon: {} };
}

export async function saveProgress(userId: string, data: unknown): Promise<void> {
  await query(
    `INSERT INTO progress (user_id, data, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [userId, JSON.stringify(data)],
  );
}
