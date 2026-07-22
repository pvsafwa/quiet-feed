#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "quietfeed_progress" <<-EOSQL
  CREATE TABLE IF NOT EXISTS progress (
    user_id     UUID PRIMARY KEY,                 -- No strict FK since users table is in auth DB
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EOSQL
