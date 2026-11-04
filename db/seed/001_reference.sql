-- Referans verisi: kaynaklar, kategoriler, satış kanalları, ayarlar.
-- BU DOSYADA FİYAT VERİSİ YOKTUR.
-- Komisyon/ücret oranları VARSAYIMDIR (params_verified = false); arayüzde uyarı ile
-- gösterilir ve satıcı panelinizdeki güncel oranlarla değiştirilmelidir.

BEGIN;

INSERT INTO sources (id, name, kind, base_url, can_buy, can_sell, integration_status, access_method, access_notes) VALUES
('trendyol',    'Trendyol',        'marketplace',  'https://www.trendyol.com',        true,  true,  'not_connected', 'none',
 'Satıcı (Partner) API yalnızca kendi mağazanızın ürün/sipariş/komisyon verisini verir; genel/rakip fiyat listesi sunmaz. Alış fiyatı izlemek için lisanslı veri sağlayıcı veya platformun yazılı izni gerekir. Satış tarafı için satıcı API anahtarı gerekli.'),
('hepsiburada', 'Hepsiburada',     'marketplace',  'https://www.hepsiburada.com',     true,  true,  'not_connected', 'none',
 'Satıcı (Merchant) API kendi listelemeleriniz içindir. Genel fiyat verisi için lisanslı feed veya yazılı izin gerekir.'),
('amazon_tr',   'Amazon Türkiye',  'marketplace',  'https://www.amazon.com.tr',       true,  true,  'not_connected', 'none',
 'Ürün/fiyat sorgusu için Amazon Associates (ortaklık) ürün API''si — onaylı ortak hesabı ve kullanım şartları gerekir. Satış tarafı için SP-API (satıcı hesabı) gerekir.'),
('n11',         'n11',             'marketplace',  'https://www.n11.com',             true,  true,  'not_connected', 'none',
 'Satıcı API''si kendi mağazanız için. Genel fiyat verisi için izin/lisans gerekir.'),
('pazarama',    'Pazarama',        'marketplace',  'https://www.pazarama.com',        true,  true,  'not_connected', 'none',
 'Satıcı entegrasyon API''si kendi mağazanız için.'),
('pttavm',      'PttAVM',          'marketplace',  'https://www.pttavm.com',          true,  true,  'not_connected', 'none',
 'Satıcı entegrasyonu kendi mağazanız için.'),
('mediamarkt',  'MediaMarkt',      'tech_retailer','https://www.mediamarkt.com.tr',   true,  false, 'not_connected', 'none',
 'Bilinen herkese açık fiyat API''si yok. Affiliate ağı ürün feed''i veya yazılı izin araştırılmalı; tarama yalnızca robots.txt ve kullanım koşulları izin verirse.'),
('teknosa',     'Teknosa',         'tech_retailer','https://www.teknosa.com',         true,  false, 'not_connected', 'none',
 'Bilinen herkese açık fiyat API''si yok. Affiliate feed veya yazılı izin araştırılmalı.'),
('vatan',       'Vatan Bilgisayar','tech_retailer','https://www.vatanbilgisayar.com', true,  false, 'not_connected', 'none',
 'Bilinen herkese açık fiyat API''si yok. Affiliate feed veya yazılı izin araştırılmalı.'),
('koctas',      'Koçtaş',          'home_improvement','https://www.koctas.com.tr',    true,  false, 'not_connected', 'none',
 'Bilinen herkese açık fiyat API''si yok. Affiliate feed veya yazılı izin araştırılmalı.'),
('arcelik',     'Arçelik (resmî mağaza)', 'brand_store', 'https://www.arcelik.com.tr', true, false, 'not_connected', 'none',
 'Bayi/distribütör fiyat listesi doğrudan anlaşma ile CSV olarak alınabilir.'),
('vestel',      'Vestel (resmî mağaza)',  'brand_store', 'https://www.vestel.com.tr',  true, false, 'not_connected', 'none',
 'Bayi/distribütör fiyat listesi doğrudan anlaşma ile CSV olarak alınabilir.'),
('bosch',       'Bosch Ev Aletleri (resmî mağaza)', 'brand_store', 'https://www.bosch-home.com.tr', true, false, 'not_connected', 'none',
 'Bayi/distribütör fiyat listesi doğrudan anlaşma ile CSV olarak alınabilir.'),
('manuel',      'Elle giriş / tedarikçi teklifi', 'own_channel', NULL, true, false, 'manual_only', 'manual',
 'Telefonla/e-postayla alınan teklifler ve sizin doğruladığınız fiyatlar.'),
('usak_magaza', 'Uşak perakende',  'own_channel',  NULL,                              false, true,  'manual_only', 'manual',
 'Kendi mağaza/depodan perakende satış.');

INSERT INTO categories (slug, name, kdv_rate, desi_default) VALUES
('buzdolabi',          'Buzdolabı',             0.20, 350),
('camasir_makinesi',   'Çamaşır Makinesi',      0.20, 200),
('bulasik_makinesi',   'Bulaşık Makinesi',      0.20, 160),
('kurutma_makinesi',   'Kurutma Makinesi',      0.20, 200),
('derin_dondurucu',    'Derin Dondurucu',       0.20, 250),
('firin',              'Fırın / Ankastre',      0.20, 120),
('ocak',               'Ocak',                  0.20, 40),
('aspirator',          'Davlumbaz / Aspiratör', 0.20, 60),
('mikrodalga',         'Mikrodalga Fırın',      0.20, 40),
('klima',              'Klima',                 0.20, 150);

INSERT INTO sales_channels (id, name, source_id, kind, commission_rate, payment_fee_rate, fixed_fee_net, outbound_shipping_net, return_rate, withholding_rate, params_verified, notes) VALUES
('trendyol',    'Trendyol',        'trendyol',    'marketplace', 0.15, 0, 0, 0, 0.04, 0.01, false, 'VARSAYIM — kategori komisyonu ve kargo anlaşmanızla güncelleyin.'),
('hepsiburada', 'Hepsiburada',     'hepsiburada', 'marketplace', 0.15, 0, 0, 0, 0.04, 0.01, false, 'VARSAYIM — güncelleyin.'),
('amazon_tr',   'Amazon Türkiye',  'amazon_tr',   'marketplace', 0.15, 0, 0, 0, 0.05, 0.01, false, 'VARSAYIM — güncelleyin.'),
('n11',         'n11',             'n11',         'marketplace', 0.15, 0, 0, 0, 0.04, 0.01, false, 'VARSAYIM — güncelleyin.'),
('pazarama',    'Pazarama',        'pazarama',    'marketplace', 0.15, 0, 0, 0, 0.04, 0.01, false, 'VARSAYIM — güncelleyin.'),
('pttavm',      'PttAVM',          'pttavm',      'marketplace', 0.15, 0, 0, 0, 0.04, 0.01, false, 'VARSAYIM — güncelleyin.'),
('usak_perakende','Uşak perakende','usak_magaza', 'retail',      0,    0.02, 0, 0, 0.01, 0, false, 'POS komisyonu VARSAYIM; teslimat maliyeti seçilen teslimat yönteminden gelir.');

INSERT INTO fulfillment_methods (id, name, cost_net, cost_per_km, notes) VALUES
('own_vehicle',  'Kendi aracımla teslimat',     0, 0, 'Araç km maliyetinizi girin (yakıt + amortisman + personel).'),
('cargo',        'Nakliye firmasıyla gönderim', 0, 0, 'Anlaşmalı nakliye/kargo birim fiyatını girin.'),
('store_pickup', 'Mağazadan teslim',            0, 0, 'Müşteri depodan/mağazadan teslim alır.');

INSERT INTO cost_settings (id) VALUES (1);

INSERT INTO warehouses (name, city, postcode) VALUES ('Uşak Ana Depo', 'Uşak', '64100');

INSERT INTO schema_migrations(version) VALUES ('seed_001_reference');

COMMIT;
