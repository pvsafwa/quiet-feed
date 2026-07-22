#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "quietfeed_auth" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
EOSQL
