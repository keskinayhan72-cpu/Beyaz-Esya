-- 4 Kasım 2026 izinli tarama incelemesi (BeyazEsyaFirsatMotoru User-Agent'ı ile, en az 5 sn bekleme).
-- Hiçbir kaynak 'permitted_crawl' yapılmadı. Engel ve yasak gerekçeleri last_error / access_notes alanında.
BEGIN;
INSERT INTO sources (id, name, kind, base_url, can_buy, can_sell, integration_status, access_method, search_url_template)
VALUES ('cimri', 'Cimri', 'aggregator', 'https://www.cimri.com', true, false, 'not_connected', 'none', NULL)
ON CONFLICT (id) DO NOTHING;

UPDATE sources SET last_error = '2026-11-04 inceleme: robots.txt isteğine bile bot koruması 403 döndü (Akamai/Cloudflare). Aşılmaz; otomatik okuma yok.'
 WHERE id IN ('hepsiburada', 'n11', 'pazarama', 'pttavm', 'teknosa', 'koctas');

UPDATE sources SET last_error = '2026-11-04 inceleme: robots.txt ürün sayfalarına izin veriyor, ancak ana sayfa CAPTCHA gösterdi. Amazon kullanım koşullarının veri madenciliği/robot araçlarını yasakladığı biliniyor (metin CAPTCHA nedeniyle bu incelemede okunamadı); resmî yol ürün API''si.'
 WHERE id = 'amazon_tr';

UPDATE sources SET last_error = '2026-11-04 inceleme: robots.txt ürün sayfalarına izin veriyor, arama sayfaları (/*/search.html, /*query=) yasak; ana sayfa bu User-Agent''a 403 döndü. Aşılmaz.'
 WHERE id = 'mediamarkt';

UPDATE sources SET last_error = '2026-11-04 inceleme: robots.txt ürün sayfalarına izin veriyor, arama (/arama/*) yasak; ana sayfa bu User-Agent''a 403 döndü. Aşılmaz.'
 WHERE id = 'vatan';

UPDATE sources SET last_error = '2026-11-04 inceleme: robots.txt arama sayfalarını (/arama, /*?q=) yasaklıyor; ana sayfa bu User-Agent''a 403 döndü. Aşılmaz.'
 WHERE id = 'cimri';

UPDATE sources SET access_notes = coalesce(access_notes || ' ', '') ||
  '2026-11-04 inceleme: robots.txt ürün sayfalarına izin veriyor, arama (/*?q=) yasak. Resmî kullanım koşulları metni okunamadı (JavaScript ile yükleniyor); kamuya açık alıntılara göre robot/veri madenciliği yasak. Doğrulanana kadar otomatik okuma kapalı; resmî yol satıcı API''si.'
 WHERE id = 'trendyol';

UPDATE sources SET access_notes = coalesce(access_notes || ' ', '') ||
  '2026-11-04 inceleme: robots.txt aramaya ve ürün sayfalarına izin veriyor; kullanım sözleşmesi veritabanı/katalog/listelerin izinsiz çoğaltılmasını yasaklıyor. Otomatik okuma kapalı.'
 WHERE id = 'akakce';

INSERT INTO schema_migrations(version) VALUES ('seed_004_crawl_review');
COMMIT;
