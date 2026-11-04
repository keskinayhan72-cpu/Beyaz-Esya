-- Aşama 2: pazaryeri kontrol akışı ve kamuya açık komisyon oranları
BEGIN;

-- Komisyon hangi tutar üzerinden: 'gross' = KDV dahil satış fiyatı, 'net' = KDV hariç
ALTER TABLE sales_channels
  ADD COLUMN commission_base text NOT NULL DEFAULT 'gross' CHECK (commission_base IN ('gross','net')),
  ADD COLUMN params_source text;

-- Elle kontrol için pazaryeri arama bağlantısı şablonu ({q} = EAN veya model kodu)
ALTER TABLE sources
  ADD COLUMN search_url_template text,
  ADD COLUMN usak_check_hint text;

-- Aynı pazaryeri ilanı hem alış seçeneği hem rakip satış fiyatı olabilir
ALTER TABLE offers DROP CONSTRAINT offers_source_id_source_url_key;
ALTER TABLE offers ADD CONSTRAINT offers_source_side_url_key UNIQUE (source_id, side, source_url);

INSERT INTO schema_migrations(version) VALUES ('002_marketplace_checks');
COMMIT;
