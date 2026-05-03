#!/bin/bash
set -e

# Bootstrap a Postgres instance shared by:
#   - the prayer app (public schema in prayer_dev)
#   - tests (separate prayer_test database)
#   - GoTrue auth service (auth schema in prayer_dev, created here)
#
# GoTrue creates its own tables in `auth` on first start; we just
# create the schema so its connection-string search_path is valid.

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE prayer_test;
  \c prayer_dev
  CREATE SCHEMA IF NOT EXISTS auth;
EOSQL
