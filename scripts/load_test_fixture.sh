#!/usr/bin/env bash
# Geliştirme veritabanına HAYALİ test verisini yükler (origin=test_fixture).
# Gerçek bir veritabanında ÇALIŞTIRMAYIN. Temizlemek için: scripts/clear_test_fixture.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL tanımlı olmalı}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="${PYTHON:-$ROOT/engine/.venv/bin/python}"
TMP="$(mktemp -d)"
"$PY" "$ROOT/engine/fixtures/generate_test_fixture.py" "$TMP"
cd "$ROOT/engine"
"$PY" -m fiyat_motoru import-products "$TMP/test_products.csv"
for f in "$TMP"/test_offers_*.csv; do
  src="$(basename "$f" .csv)"; src="${src#test_offers_}"
  "$PY" -m fiyat_motoru import-csv --source "$src" --origin test_fixture "$f" || true
done
rm -rf "$TMP"
