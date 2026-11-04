-- Pazaryeri arama şablonları ve kamuya açık komisyon oranları (resmî değil, params_verified=false)
BEGIN;

UPDATE sources SET search_url_template = v.t FROM (VALUES
  ('trendyol',    'https://www.trendyol.com/sr?q={q}'),
  ('hepsiburada', 'https://www.hepsiburada.com/ara?q={q}'),
  ('amazon_tr',   'https://www.amazon.com.tr/s?k={q}'),
  ('n11',         'https://www.n11.com/arama?q={q}'),
  ('mediamarkt',  'https://www.mediamarkt.com.tr/tr/search.html?query={q}'),
  ('teknosa',     'https://www.teknosa.com/arama/?s={q}'),
  ('vatan',       'https://www.vatanbilgisayar.com/arama/{q}/'),
  -- site içi arama adresi doğrulanamayan kaynaklar için Google site: araması
  ('pazarama',    'https://www.google.com/search?q=site%3Apazarama.com+{q}'),
  ('pttavm',      'https://www.google.com/search?q=site%3Apttavm.com+{q}'),
  ('koctas',      'https://www.google.com/search?q=site%3Akoctas.com.tr+{q}'),
  ('arcelik',     'https://www.google.com/search?q=site%3Aarcelik.com.tr+{q}'),
  ('vestel',      'https://www.google.com/search?q=site%3Avestel.com.tr+{q}'),
  ('bosch',       'https://www.google.com/search?q=site%3Abosch-home.com.tr+{q}')
) AS v(id, t) WHERE sources.id = v.id;

UPDATE sources SET usak_check_hint =
  'Sitede teslimat adresi/il olarak Uşak (64100) seçin; ürün sayfasındaki teslimat bilgisini ve sepette kargo/teslimat adımını kontrol edin. "Bölgenize gönderim yapılmamaktadır" benzeri uyarı varsa "Gönderim yok" işaretleyin.'
WHERE can_buy AND kind <> 'own_channel';

-- Kamuya açık üçüncü taraf rehberlerinden (Kasım 2026 araması) en sık tekrarlanan beyaz eşya oranları.
-- Resmî değildir; params_verified=false kalır.
UPDATE sales_channels SET commission_rate = v.c, payment_fee_rate = v.p, params_source = v.s FROM (VALUES
  ('trendyol',    0.11, 0.0,    'Üçüncü taraf rehberler: beyaz eşya %9–12 (alt kategoriye göre değişir). Satıcı paneli > Anlaşma/Komisyon ekranından teyit edin.'),
  ('hepsiburada', 0.12, 0.0,    'Üçüncü taraf rehberler: beyaz eşya %8,5–15, en sık %12. Hepsiburada komisyon listesinden teyit edin.'),
  ('n11',         0.13, 0.0167, 'Üçüncü taraf rehberler: beyaz eşya %12–13 + %1,67 hizmet bedeli (ödeme/hizmet oranına yazıldı). Teyit edin.'),
  ('amazon_tr',   0.10, 0.0,    'Üçüncü taraf rehberler: beyaz eşya ~%10; aylık üyelik ücreti ve FBA ücretleri dahil değil. Teyit edin.'),
  ('pttavm',      0.12, 0.0,    'Üçüncü taraf rehberler: beyaz eşya %10–12. Teyit edin.'),
  ('pazarama',    0.15, 0.0,    'Güvenilir kamuya açık oran BULUNAMADI; temkinli yer tutucu. Satıcı panelinden girin.')
) AS v(id, c, p, s) WHERE sales_channels.id = v.id;

UPDATE sales_channels SET notes = NULL WHERE kind = 'marketplace';
UPDATE sales_channels SET params_source = 'POS komisyonu varsayım; bankanızın oranını girin.' WHERE id = 'usak_perakende';

UPDATE sources SET access_notes = v.n FROM (VALUES
  ('trendyol',    'ŞU AN: “Pazaryeri kontrolü” ekranından elle. API: Trendyol’da satıcı hesabı açtığınızda satıcı panelinin entegrasyon/API bilgileri bölümünde satıcı ID + API anahtarı verilir. Bu API yalnızca kendi ürün/sipariş/komisyon verinizi verir, rakip fiyat listesi vermez.'),
  ('hepsiburada', 'ŞU AN: elle. API: satıcı (merchant) hesabıyla panelden/destek talebiyle entegrasyon erişimi istenir; yalnızca kendi listelemeleriniz.'),
  ('amazon_tr',   'ŞU AN: elle. API: satıcı hesabı (Seller Central) ile SP-API; ürün/fiyat sorgusu için onaylı Amazon Ortaklık hesabı gerekir.'),
  ('n11',         'ŞU AN: elle. API: n11 satıcı panelinin API hesapları bölümünden anahtar; yalnızca kendi mağazanız.'),
  ('pazarama',    'ŞU AN: elle (arama Google site: üzerinden). API: satıcı hesabıyla entegrasyon bilgileri.'),
  ('pttavm',      'ŞU AN: elle (arama Google site: üzerinden). API: satıcı hesabıyla entegrasyon bilgileri.')
) AS v(id, n) WHERE sources.id = v.id;

INSERT INTO schema_migrations(version) VALUES ('seed_002_marketplace_params');
COMMIT;
