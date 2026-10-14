#!/usr/bin/env bash
# 権限ルールのテストを、使い捨てのローカルPostgresで実行する。
# 使い方: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql -q -v ON_ERROR_STOP=1"
DB=club_app_rls_test
$P -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
$P -d $DB -f tests/supabase_stub.sql >/dev/null
for f in migrations/*.sql; do $P -d $DB -f "$f" >/dev/null; done
set +e
$P -d $DB -f tests/rls_test.sql 2>&1 >/dev/null | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  //'
status=${PIPESTATUS[0]}
$P -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
exit $status
