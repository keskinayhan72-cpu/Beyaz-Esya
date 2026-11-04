-- Beyaz Eşya Fırsat Motoru — temel şema
-- Düz PostgreSQL 15+ ile çalışır; Supabase PostgreSQL ile birebir uyumludur
-- (Supabase'e özel uzantı veya rol gerektirmez).
--
-- Temel ilke: Fiyat verisinin KAYNAĞI (origin) her gözlemde zorunludur.
-- 'test_fixture' kökenli veriler hiçbir zaman gerçek fırsat olarak işaretlenmez.

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Enum tipleri
-- ---------------------------------------------------------------------------
CREATE TYPE integration_status AS ENUM (
  'not_connected',        -- hiçbir veri bağlantısı yok
  'credentials_pending',  -- resmi API/lisans başvurusu veya anahtar bekleniyor
  'manual_only',          -- yalnızca elle giriş / CSV içe aktarma
  'sandbox',              -- test ortamında bağlı
  'live'                  -- canlı veri akışı doğrulandı
);

CREATE TYPE access_method AS ENUM (
  'official_api',     -- platformun resmî API'si
  'licensed_feed',    -- lisanslı veri sağlayıcı / affiliate ürün feed'i
  'permitted_crawl',  -- robots.txt ve kullanım koşullarının izin verdiği tarama
  'manual',           -- elle giriş veya kullanıcının yüklediği CSV
  'none'
);

CREATE TYPE price_origin AS ENUM (
  'official_api', 'licensed_feed', 'permitted_crawl', 'manual_entry', 'test_fixture'
);

CREATE TYPE offer_side AS ENUM ('buy', 'sell');

CREATE TYPE delivery_check AS ENUM (
  'verified',      -- Uşak (64xxx) teslimatı doğrulandı
  'not_verified',  -- bilgi yok / doğrulanmadı
  'restricted'     -- Uşak'a gönderim yok veya bölgesel satış kısıtı var
);

CREATE TYPE item_condition AS ENUM ('new', 'refurbished', 'used', 'unknown');

CREATE TYPE warranty_type AS ENUM ('official_tr', 'importer', 'seller', 'none', 'unknown');

CREATE TYPE invoice_type AS ENUM ('e_fatura', 'e_arsiv', 'paper', 'none', 'unknown');

CREATE TYPE match_method AS ENUM ('gtin', 'model_code', 'manual');

-- ---------------------------------------------------------------------------
-- Kaynaklar (alış ve/veya satış yapılan platformlar)
-- ---------------------------------------------------------------------------
CREATE TABLE sources (
  id                  text PRIMARY KEY,               -- 'trendyol', 'hepsiburada' ...
  name                text NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('marketplace','tech_retailer','home_improvement','brand_store','own_channel')),
  base_url            text,
  can_buy             boolean NOT NULL DEFAULT true,
  can_sell            boolean NOT NULL DEFAULT false,
  integration_status  integration_status NOT NULL DEFAULT 'not_connected',
  access_method       access_method NOT NULL DEFAULT 'none',
  access_notes        text,          -- hangi resmî yol mümkün, ne gerekiyor
  last_success_at     timestamptz,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Katalog
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id               serial PRIMARY KEY,
  slug             text NOT NULL UNIQUE,
  name             text NOT NULL,
  kdv_rate         numeric(5,4) NOT NULL DEFAULT 0.20 CHECK (kdv_rate >= 0 AND kdv_rate < 1),
  desi_default     numeric(8,2)            -- tipik hacimsel ağırlık (kargo hesabı için)
);

CREATE TABLE products (
  id               bigserial PRIMARY KEY,
  brand            text NOT NULL,
  brand_norm       text NOT NULL,
  model_code       text NOT NULL,
  model_code_norm  text NOT NULL,
  gtin             char(14) UNIQUE,         -- GTIN-14 biçiminde (EAN-13 başına 0 eklenir)
  name             text NOT NULL,
  category_id      int NOT NULL REFERENCES categories(id),
  energy_class     text,
  is_active        boolean NOT NULL DEFAULT true,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_norm, model_code_norm),
  CHECK (gtin IS NULL OR gtin ~ '^[0-9]{14}$'),
  CHECK (model_code_norm ~ '^[A-Z0-9]+$')
);
CREATE INDEX products_category_idx ON products(category_id);

-- ---------------------------------------------------------------------------
-- Kaynaktaki ilanlar ve fiyat gözlemleri
-- ---------------------------------------------------------------------------
CREATE TABLE offers (
  id               bigserial PRIMARY KEY,
  source_id        text NOT NULL REFERENCES sources(id),
  side             offer_side NOT NULL DEFAULT 'buy',
  product_id       bigint REFERENCES products(id) ON DELETE SET NULL,  -- NULL = eşleşmedi
  match_method     match_method,
  source_sku       text,               -- platformdaki ürün/ilan kimliği
  source_url       text NOT NULL,
  seller_name      text,
  title            text,
  gtin_raw         text,
  model_code_raw   text,
  brand_raw        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_url),
  CHECK (product_id IS NULL OR match_method IS NOT NULL)
);
CREATE INDEX offers_product_idx ON offers(product_id);

CREATE TABLE price_observations (
  id                    bigserial PRIMARY KEY,
  offer_id              bigint NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  observed_at           timestamptz NOT NULL DEFAULT now(),
  origin                price_origin NOT NULL,
  collected_by          text NOT NULL,             -- konnektör adı veya kullanıcı
  price                 numeric(12,2) NOT NULL CHECK (price > 0),   -- KDV dahil satış fiyatı
  currency              char(3) NOT NULL DEFAULT 'TRY',
  shipping_fee          numeric(10,2) CHECK (shipping_fee >= 0),    -- KDV dahil, NULL = bilinmiyor
  in_stock              boolean,                   -- NULL = bilinmiyor
  stock_qty             int,
  delivery              delivery_check NOT NULL DEFAULT 'not_verified',
  delivery_method_note  text,                      -- nasıl doğrulandı (ör. "64200 posta kodu ile sepette kontrol")
  delivery_days         int,
  regional_restriction  text,
  invoice               invoice_type NOT NULL DEFAULT 'unknown',
  warranty              warranty_type NOT NULL DEFAULT 'unknown',
  warranty_months       int,
  condition             item_condition NOT NULL DEFAULT 'unknown',
  raw                   jsonb
);
CREATE INDEX price_obs_offer_time_idx ON price_observations(offer_id, observed_at DESC);

-- Her ilanın en güncel gözlemi
CREATE VIEW latest_offer_prices AS
SELECT DISTINCT ON (o.id)
  o.id AS offer_id, o.source_id, o.side, o.product_id, o.match_method, o.source_url,
  o.seller_name, o.title,
  p.id AS observation_id, p.observed_at, p.origin, p.collected_by, p.price, p.currency,
  p.shipping_fee, p.in_stock, p.stock_qty, p.delivery, p.delivery_method_note,
  p.delivery_days, p.regional_restriction, p.invoice, p.warranty, p.warranty_months,
  p.condition
FROM offers o
JOIN price_observations p ON p.offer_id = o.id
ORDER BY o.id, p.observed_at DESC, p.id DESC;

-- ---------------------------------------------------------------------------
-- Satış kanalları ve maliyet parametreleri
-- ---------------------------------------------------------------------------
CREATE TABLE sales_channels (
  id                     text PRIMARY KEY,
  name                   text NOT NULL,
  source_id              text REFERENCES sources(id),  -- pazaryerinde satış ise ilgili kaynak
  kind                   text NOT NULL CHECK (kind IN ('marketplace','retail')),
  commission_rate        numeric(6,4) NOT NULL DEFAULT 0 CHECK (commission_rate >= 0 AND commission_rate < 1),
  payment_fee_rate       numeric(6,4) NOT NULL DEFAULT 0 CHECK (payment_fee_rate >= 0 AND payment_fee_rate < 1),
  fixed_fee_net          numeric(10,2) NOT NULL DEFAULT 0,  -- işlem/hizmet bedeli (KDV hariç)
  outbound_shipping_net  numeric(10,2) NOT NULL DEFAULT 0,  -- müşteriye gönderim (KDV hariç)
  return_rate            numeric(6,4) NOT NULL DEFAULT 0.03,
  withholding_rate       numeric(6,4) NOT NULL DEFAULT 0,   -- e-ticaret stopajı (mahsup edilebilir, nakit etkisi)
  params_verified        boolean NOT NULL DEFAULT false,    -- oranlar sözleşme/panelden doğrulandı mı
  notes                  text,
  is_active              boolean NOT NULL DEFAULT true
);

CREATE TABLE channel_category_commissions (
  channel_id       text NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
  category_id      int NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  commission_rate  numeric(6,4) NOT NULL CHECK (commission_rate >= 0 AND commission_rate < 1),
  PRIMARY KEY (channel_id, category_id)
);

-- Teslimat yöntemleri (perakende satışta müşteriye teslim)
CREATE TABLE fulfillment_methods (
  id             text PRIMARY KEY,   -- own_vehicle | cargo | store_pickup
  name           text NOT NULL,
  cost_net       numeric(10,2) NOT NULL DEFAULT 0,    -- birim başı sabit maliyet (KDV hariç)
  cost_per_km    numeric(10,2) NOT NULL DEFAULT 0,    -- kendi araç için km başı maliyet
  notes          text
);

-- Tek satırlık genel maliyet ayarları
CREATE TABLE cost_settings (
  id                         int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  inbound_shipping_net       numeric(10,2) NOT NULL DEFAULT 0,  -- depoya ek taşıma (KDV hariç)
  handling_net               numeric(10,2) NOT NULL DEFAULT 0,  -- ambalaj/elleçleme (KDV hariç)
  annual_capital_cost_rate   numeric(6,4)  NOT NULL DEFAULT 0.45,
  avg_days_in_stock          int           NOT NULL DEFAULT 21,
  storage_cost_month_net     numeric(10,2) NOT NULL DEFAULT 0,
  return_loss_rate           numeric(6,4)  NOT NULL DEFAULT 0.05, -- iade edilen ürünün değer kaybı
  service_kdv_rate           numeric(5,4)  NOT NULL DEFAULT 0.20, -- komisyon/kargo hizmetlerinin KDV'si
  max_price_age_hours        int           NOT NULL DEFAULT 48,
  min_profit_net             numeric(10,2) NOT NULL DEFAULT 250,
  min_margin                 numeric(6,4)  NOT NULL DEFAULT 0.05,
  warehouse_postcode         text          NOT NULL DEFAULT '64100',
  updated_at                 timestamptz   NOT NULL DEFAULT now()
);

-- Satış hızı tahminleri (adet/ay). basis: tahminin dayanağı.
CREATE TABLE sales_velocity_estimates (
  product_id      bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  channel_id      text NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
  units_per_month numeric(8,2) NOT NULL CHECK (units_per_month >= 0),
  basis           text NOT NULL,     -- 'manual', 'own_sales_history', 'api_rank' ...
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, channel_id)
);

-- ---------------------------------------------------------------------------
-- Depo ve stok (Uşak) — şema hazır, ekranı sonraki aşamada
-- ---------------------------------------------------------------------------
CREATE TABLE warehouses (
  id        serial PRIMARY KEY,
  name      text NOT NULL,
  city      text NOT NULL,
  postcode  text
);

CREATE TABLE stock_movements (
  id              bigserial PRIMARY KEY,
  warehouse_id    int NOT NULL REFERENCES warehouses(id),
  product_id      bigint NOT NULL REFERENCES products(id),
  qty             int NOT NULL CHECK (qty <> 0),          -- + giriş, - çıkış
  unit_cost_net   numeric(12,2),
  reason          text NOT NULL CHECK (reason IN ('purchase','sale','return_in','return_out','adjustment','damage')),
  reference       text,
  serial_numbers  text[],
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE VIEW stock_levels AS
SELECT warehouse_id, product_id, SUM(qty)::int AS qty_on_hand
FROM stock_movements GROUP BY warehouse_id, product_id;

-- ---------------------------------------------------------------------------
-- Satın alma listesi — otomatik satın alma YOK; her kalem onay gerektirir
-- ---------------------------------------------------------------------------
CREATE TABLE purchase_list_items (
  id                   bigserial PRIMARY KEY,
  product_id           bigint NOT NULL REFERENCES products(id),
  offer_id             bigint REFERENCES offers(id),
  observation_id       bigint REFERENCES price_observations(id),
  qty                  int NOT NULL DEFAULT 1 CHECK (qty > 0),
  expected_unit_price  numeric(12,2) NOT NULL,
  expected_profit_net  numeric(12,2),
  target_channel_id    text REFERENCES sales_channels(id),
  status               text NOT NULL DEFAULT 'proposed'
                       CHECK (status IN ('proposed','approved','rejected','ordered','received','cancelled')),
  approved_by          text,
  approved_at          timestamptz,
  note                 text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  -- onaylı/siparişli kalemde onaylayan ve zaman zorunlu
  CHECK (status NOT IN ('approved','ordered','received') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

-- Toplama çalıştırmaları (izlenebilirlik)
CREATE TABLE collector_runs (
  id            bigserial PRIMARY KEY,
  source_id     text NOT NULL REFERENCES sources(id),
  connector     text NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','failed','blocked')),
  offers_seen   int NOT NULL DEFAULT 0,
  matched       int NOT NULL DEFAULT 0,
  unmatched     int NOT NULL DEFAULT 0,
  message       text
);

INSERT INTO schema_migrations(version) VALUES ('001_init');

COMMIT;
