import { query } from '../db/pool';
import { env } from '../env';

// Postgres-backed cache for YouTube responses. This is what keeps quota flat:
// every user reads shared cached content instead of hitting the API.

export async function cacheGet<T>(key: string): Promise<T | null> {
  const { rows } = await query<{ data: T }>('SELECT data FROM content_cache WHERE cache_key = $1 AND expires_at > now()', [key]);
  return rows.length ? rows[0].data : null;
}

export async function cacheSet(key: string, data: unknown, ttlMinutes = env.CACHE_TTL_MINUTES): Promise<void> {
  await query(
    `INSERT INTO content_cache (cache_key, data, expires_at, updated_at)
     VALUES ($1, $2::jsonb, now() + ($3 || ' minutes')::interval, now())
     ON CONFLICT (cache_key) DO UPDATE
       SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at, updated_at = now()`,
    [key, JSON.stringify(data), String(ttlMinutes)],
  );
}

// Get from cache, or run loader, store, and return. Coalesces cost across all users.
export async function cached<T>(key: string, loader: () => Promise<T>, ttlMinutes?: number): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const fresh = await loader();
  await cacheSet(key, fresh, ttlMinutes);
  return fresh;
}

export async function cacheInvalidatePrefix(prefix: string): Promise<void> {
  await query('DELETE FROM content_cache WHERE cache_key LIKE $1', [prefix + '%']);
}

export async function cachePurgeExpired(): Promise<void> {
  await query('DELETE FROM content_cache WHERE expires_at <= now()');
}
