#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "quietfeed_content" <<-EOSQL
  CREATE TABLE IF NOT EXISTS channels (
    id          TEXT PRIMARY KEY,                 -- YouTube channel id (UC...)
    title       TEXT NOT NULL,
    thumb       TEXT NOT NULL DEFAULT '',
    uploads     TEXT NOT NULL,                    -- uploads playlist id (UU...)
    added_by    UUID,                             -- No strict FK to users since they are in diff DBs
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS content_cache (
    cache_key   TEXT PRIMARY KEY,
    data        JSONB NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS content_cache_expires_idx ON content_cache (expires_at);
EOSQL
