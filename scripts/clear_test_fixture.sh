#!/usr/bin/env bash
# origin=test_fixture olan tüm gözlemleri, yalnızca bunlara sahip ilanları ve TESTMARKA ürünlerini siler.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL tanımlı olmalı}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
begin;
delete from price_observations where origin = 'test_fixture';
delete from offers o where not exists (select 1 from price_observations p where p.offer_id = o.id);
delete from sales_velocity_estimates where product_id in (select id from products where brand_norm = 'TESTMARKA');
delete from products p where brand_norm = 'TESTMARKA' and not exists (select 1 from offers o where o.product_id = p.id);
commit;
SQL
