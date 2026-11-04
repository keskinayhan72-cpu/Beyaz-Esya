#!/usr/bin/env bash
# Kullanım: DATABASE_URL=postgres://... ./db/migrate.sh
# Uygulanmamış migration ve seed dosyalarını sırayla uygular.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL tanımlı olmalı}"
DIR="$(cd "$(dirname "$0")" && pwd)"

applied() {
  psql -d "$DATABASE_URL" -tAc "select 1 from information_schema.tables where table_name='schema_migrations'" | grep -q 1 \
    && psql -d "$DATABASE_URL" -tAc "select 1 from schema_migrations where version='$1'" | grep -q 1
}

for f in "$DIR"/migrations/*.sql; do
  v="$(basename "$f" .sql)"
  if applied "$v"; then echo "atlandı: $v"; else echo "uygulanıyor: $v"; psql -d "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"; fi
done
for f in "$DIR"/seed/*.sql; do
  v="seed_$(basename "$f" .sql)"
  if applied "$v"; then echo "atlandı: $v"; else echo "uygulanıyor: $v"; psql -d "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"; fi
done
