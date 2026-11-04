-- Aşama 3: tarayıcı eklentisiyle fiyat yakalama; fiyat karşılaştırma siteleri (akakçe vb.) kaynak türü
BEGIN;
ALTER TABLE sources DROP CONSTRAINT sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check
  CHECK (kind IN ('marketplace','tech_retailer','home_improvement','brand_store','own_channel','aggregator'));
INSERT INTO schema_migrations(version) VALUES ('003_capture');
COMMIT;
