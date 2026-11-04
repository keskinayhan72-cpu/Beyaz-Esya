BEGIN;
INSERT INTO sources (id, name, kind, base_url, can_buy, can_sell, integration_status, access_method, search_url_template, usak_check_hint, access_notes)
VALUES ('akakce', 'Akakçe', 'aggregator', 'https://www.akakce.com', true, false, 'manual_only', 'manual',
  'https://www.akakce.com/arama/?q={q}',
  'Akakçe yalnızca fiyatı listeler; Uşak teslimatını satın alacağınız mağazanın sitesinde kontrol edin.',
  'Tarayıcı eklentisiyle, baktığınız sayfadan tek tıkla. Otomatik toplu çekim kullanım sözleşmesi (md. 5.6, 7.5) nedeniyle yapılmıyor.')
ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_migrations(version) VALUES ('seed_003_akakce');
COMMIT;
