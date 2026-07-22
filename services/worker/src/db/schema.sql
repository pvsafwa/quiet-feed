-- Quiet Feed schema. Idempotent: safe to run on every boot.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- People who have signed in with Google.
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub  TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL DEFAULT '',
  picture     TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin-curated channels everyone sees.
CREATE TABLE IF NOT EXISTS channels (
  id          TEXT PRIMARY KEY,                 -- YouTube channel id (UC...)
  title       TEXT NOT NULL,
  thumb       TEXT NOT NULL DEFAULT '',
  uploads     TEXT NOT NULL,                    -- uploads playlist id (UU...)
  added_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Generic JSON cache for YouTube responses, keyed by a stable cache key, with TTL.
CREATE TABLE IF NOT EXISTS content_cache (
  cache_key   TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_cache_expires_idx ON content_cache (expires_at);

-- Per-user progress doc (same shape the frontend already uses, stored server-side).
CREATE TABLE IF NOT EXISTS progress (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
