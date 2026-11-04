# Beyaz Eşya Fırsat Motoru

Türkiye genelinde sıfır beyaz eşya alım-satım fırsatlarını tespit eden web uygulaması ve bağımsız fiyat toplama motoru.
Alış → Uşak depo → perakende / pazaryeri satışı iş modeli için kurgulanmıştır.

> **Durum: MVP (aşama 1), bağımsız test ortamı.** Henüz hiçbir pazaryeri veya mağazaya canlı veri bağlantısı yoktur.
> Fiyatlar şu an yalnızca **elle giriş** ve **CSV / lisanslı feed içe aktarma** yoluyla gelir. Ayrıntı: [Özellik durumu](#özellik-durumu).

## Temel kurallar (kodda zorunlu)

| Kural | Nasıl uygulanıyor |
|---|---|
| Sahte fiyat gerçek gibi gösterilmez | Her fiyat gözleminde `origin` zorunlu (`official_api`, `licensed_feed`, `permitted_crawl`, `manual_entry`, `test_fixture`). Test verisi arayüzde mor **TEST VERİSİ** etiketi ve sayfa uyarısıyla gösterilir; hiçbir zaman “Uygun” veya “FIRSAT” olamaz. |
| Bağlı olmayan kaynaklar açıkça belirtilir | `sources.integration_status` + **Kaynaklar** ekranı + `fiyat-motoru sources`. Panelde “canlı bağlantı yok” uyarısı. |
| Resmî API / lisanslı veri / izinli tarama | CSV konnektörü kendini `official_api` veya `permitted_crawl` olarak işaretleyemez. Tarama için tek geçiş noktası `PoliteFetcher`: açık izin bayrağı, robots.txt, kimlikli User-Agent, host başı bekleme. |
| CAPTCHA / erişim kısıtı aşılmaz | CAPTCHA, bot doğrulaması, 403/429/503 → `AccessBlocked`; yeniden deneme, proxy, tarayıcı taklidi yok. Testli. |
| Uşak teslimatı doğrulanmamış ürün fırsat olamaz | `evaluateBuyOffer`: `delivery != verified` → en iyi ihtimalle “Doğrulama bekliyor”. “Doğrulandı” işaretlemek için doğrulama yöntemi notu zorunlu. |
| Onaysız satın alma yok | Uygulamada satın alma işlevi yoktur. `purchase_list_items` tablosunda onaylı/siparişli durum, veritabanı kısıtıyla onaylayan + zaman gerektirir. |
| Mevcut sistemlere bağlanmaz | Yalnızca kendi PostgreSQL veritabanına yazar; dış sistemlere yazan hiçbir kod yok. |

## Mimari

```
web/      Next.js 16 (App Router, React 19, TypeScript) — ekranlar, kâr hesabı, uygunluk değerlendirmesi
engine/   Python 3.11+ fiyat toplama motoru — konnektörler, GTIN/model eşleştirme, DB'ye yazım (psycopg 3)
db/       PostgreSQL şeması (Supabase uyumlu düz SQL) + referans verisi + migrate.sh
shared/   Web ve motorun ortak test vektörleri (kâr hesabı, GTIN/model kodu)
scripts/  Test verisi yükleme/temizleme
templates/ Katalog ve fiyat CSV şablonları
```

**Neden bu mimari:** İstenen yığın (Next.js + Supabase PostgreSQL + bağımsız Python motoru) korunmuştur; iki bilinçli tercih var:

1. **Supabase istemci SDK'sı yerine doğrudan PostgreSQL bağlantısı (`DATABASE_URL`).** Şema Supabase'e özgü hiçbir şey kullanmaz.
   Aynı kod yerelde düz PostgreSQL ile, üretimde Supabase'in bağlantı dizesiyle çalışır — test ortamı tamamen bağımsız kalır.
   Kimlik doğrulama (Supabase Auth + RLS) çok kullanıcılı aşamada eklenecek.
2. **Kâr ve uygunluk hesabı uygulama katmanında (TypeScript), motor tarafında Python ikizi var.** İki uygulama aynı
   `shared/*.json` vektörleriyle test edilir; formül farklılaşırsa testler kırılır. Pilot ölçeği (300 model × 20 kaynak)
   için bellek içi değerlendirme yeterli; ölçek büyürse SQL görünümüne / önhesaplamaya taşınabilir.

## Kurulum (yerel test ortamı)

Gereksinimler: Node 20+, Python 3.11+, PostgreSQL 15+ (`psql` dahil).

```bash
createdb beyaz_esya_dev
export DATABASE_URL=postgres://postgres@127.0.0.1:5432/beyaz_esya_dev
./db/migrate.sh                       # şema + referans verisi (fiyat içermez)

# Motor
python3 -m venv engine/.venv && engine/.venv/bin/pip install -e "engine[dev]"

# İsteğe bağlı: HAYALİ test verisi (TESTMARKA, GS1 '200' iç kullanım GTIN'leri, .invalid URL'ler)
./scripts/load_test_fixture.sh        # kaldırmak için: ./scripts/clear_test_fixture.sh

# Web
cd web && npm install && cp .env.example .env.local && npm run build && npm start   # http://localhost:3000
```

Supabase'e geçiş: Supabase projesinde `DATABASE_URL=<Supabase connection string> ./db/migrate.sh`, ardından
`web/.env.local` içindeki `DATABASE_URL`'i aynı değerle değiştirin.

### Testler

```bash
cd web && npx vitest run && npx tsc --noEmit
createdb beyaz_esya_test
cd engine && TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/beyaz_esya_test .venv/bin/pytest -q
```

Motor entegrasyon testleri, adı `test` içermeyen veritabanında çalışmayı reddeder (şemayı sıfırladığı için).

## Veri girişi

**Katalog (300 model):** Katalog ekranından tek tek veya CSV ile (`templates/katalog_sablonu.csv`), ya da
`fiyat-motoru import-products katalog.csv`. EAN kontrol hanesi doğrulanır; aynı marka + model kodu güncellenir.

**Fiyatlar:**
- **Chrome eklentisi** (`extension/`, kurulum: `extension/README.md`): baktığınız ürün sayfasında tek tıkla fiyat, EAN,
  model, satıcı, stok sisteme düşer ve katalogla eşleşir. Sayfaları kendiliğinden gezmez. Web tarafı: `POST /api/capture`
  (`CAPTURE_TOKEN` başlığı zorunlu).
- **Pazaryeri kontrolü ekranı** (`/kontrol`): ürün × pazaryeri matrisi. Her hücrede durum (kontrol edilmedi / eski /
  Uşak ? / gönderim yok / güncel), pazaryerinin EAN ve model araması için doğrudan bağlantı ve “+ Gir” ile önseçimli fiyat
  formu. API olmadan çalışmanın ana yolu budur. Pazaryeri fiyatları “Alış + rakip satış fiyatı” olarak tek seferde iki
  tarafa kaydedilir. Pazarama, PttAVM, Koçtaş ve marka mağazalarının site içi arama adresi doğrulanamadığı için
  Google `site:` araması kullanılır.
- Ürün sayfasındaki form → `manual_entry` (kendi gördüğünüz/teyit ettiğiniz fiyatlar).
- `fiyat-motoru import-csv --source <kaynak> --origin manual_entry|licensed_feed dosya.csv` (`templates/fiyat_sablonu.csv`).
  Distribütör/bayi listeleri ve lisanslı veri sağlayıcı dökümleri için `licensed_feed`.
- Eşleşmeyen ilanlar Katalog ekranının altında listelenir; katalog güncellenince `fiyat-motoru rematch`.

**Eşleştirme:** Önce GTIN (14 haneye normalize), sonra marka + **tam** model kodu (büyük harf, yalnızca A-Z0-9,
Türkçe karakter dönüşümü). Bulanık eşleştirme yoktur: `WAN28281TR` ≠ `WAN28281`. Model kodu tutup GTIN çelişirse reddedilir.

## Kâr hesabı

Girdiler KDV dahil fiyatlardır; kâr **KDV hariç** hesaplanır.

```
Net kâr = Satış/(1+KDV)
        − Alış/(1+KDV) − Alış kargosu/(1+hizmet KDV) − Depoya taşıma
        − Komisyon (KDV dahil satış × oran) − Ödeme/POS (KDV dahil satış × oran) − Sabit ücret
        − Müşteriye gönderim (perakendede seçilen teslimat yöntemi: kendi araç [km], nakliye, mağazadan teslim)
        − İade riski   = iade oranı × (2 × gönderim + değer kaybı oranı × alış net)
        − Stok maliyeti = alış net × yıllık sermaye maliyeti × gün/365 + aylık depolama × gün/30
        − Elleçleme
```

Ayrıca: marj, ROI (bağlanan sermayeye göre), başabaş satış fiyatı, hesaplanan/indirilecek/ödenecek KDV ve
e-ticaret stopajının nakit etkisi (kâr kalemi değildir; mahsup edilir) raporlanır.

**Komisyon oranları:** Kasım 2026'da kamuya açık üçüncü taraf rehberlerinde beyaz eşya için en sık tekrarlanan oranlar
girildi: Trendyol %11, Hepsiburada %12, n11 %13 + %1,67 hizmet bedeli, Amazon TR %10, PttAVM %12. Pazarama için
güvenilir oran bulunamadı; %15 temkinli yer tutucu. **Bu oranlar resmî değildir** ve kaynaklar birbiriyle çelişir
(`params_verified=false`, arayüzde “teyit edilmedi”). Kaynaklar komisyonun hesaplandığı tutar konusunda da ayrışıyor;
komisyon tabanı (KDV dahil / hariç) kanal bazında seçilebilir, varsayılan KDV dahildir (daha temkinli). Kategori bazlı
oranlar *Maliyet ayarları* ekranından girilir.

**Fırsat (FIRSAT etiketi)** = en iyi alış teklifi “Uygun” (Uşak teslimatı doğrulanmış, stokta, sıfır, faturalı,
resmî/ithalatçı garantili, fiyat ≤ 48 saat) **ve** satış fiyatı test verisi değil **ve** net kâr ≥ eşik **ve** marj ≥ eşik.

## Özellik durumu

| # | Özellik | Durum |
|---|---|---|
| 1 | Kaynak fiyat karşılaştırma | ✅ Ekran, veri modeli ve **pazaryeri kontrol matrisi** çalışıyor. 🟡 İzinli tarama okuyucusu (`crawl`) yazıldı ve testli, ama ⛔ **hiçbir kaynakta açık değil**: 12 sitenin izin incelemesinde uygun kaynak çıkmadı (aşağıdaki tablo). Fiyatı şimdilik siz kontrol edip girersiniz. |
| 2 | EAN/GTIN + tam model kodu eşleştirme | ✅ Çalışıyor, testli (TS + Python). |
| 3 | En düşük alış fiyatı + kaynak bağlantısı | ✅ Çalışıyor (uygunluk önceliğiyle). |
| 4 | Uşak'a gönderilemeyen / bölgesel kısıtlı ürünleri eleme | ✅ Çalışıyor. ⚠️ Teslimat doğrulaması şu an **elle** (otomatik posta kodu sorgusu kaynak API'lerine bağlı). |
| 5 | Stok, fatura, garanti, teslimat uygunluğu | ✅ Kurallar çalışıyor; veri elle/CSV. |
| 6 | Pazaryerlerinde satış fiyatı karşılaştırma | ✅ Ekran çalışıyor; satış fiyatları elle/CSV. Satıcı API'leri bağlanınca otomatikleşir. |
| 7 | KDV, komisyon, nakliye, iade, stok maliyetli kâr | ✅ Çalışıyor, testli; kategori bazlı komisyon ve KDV dahil/hariç komisyon tabanı. ⚠️ Oranlar kamuya açık rehberlerden — panelden teyit gerekli. |
| 8 | Kârlılık ve satış hızına göre sıralama | ✅ Çalışıyor. ⚠️ Satış hızı şu an elle tahmin. |
| 9 | Fiyat geçmişi grafikleri | ✅ Temel grafik (ürün sayfası). |
| 10 | Bildirim ve satın alma listesi | 🟡 Şema hazır (`purchase_list_items`, onay kısıtı). Ekran ve bildirim kanalı **sonraki aşama**. |
| 11 | Uşak depo stok yönetimi | 🟡 Şema hazır (`warehouses`, `stock_movements`, `stock_levels`). Ekran **sonraki aşama**. |
| 12 | Kendi araç / nakliye / mağazadan teslim | ✅ Perakende kâr hesabında seçilebilir; maliyetler ayarlardan. Sipariş/teslimat takibi sonraki aşama. |

### Kaynak entegrasyonları (gerçek durum)

| Kaynak | Durum | Gerekli olan |
|---|---|---|
| Trendyol, Hepsiburada, n11, Pazarama, PttAVM | ⛔ Bağlı değil | Satıcı API anahtarları (kendi mağaza fiyatlarınız/komisyonlarınız). Bu API'ler **rakip/genel fiyat listesi vermez**; alış tarafı fiyat izleme için lisanslı veri sağlayıcı veya platformun yazılı izni gerekir. |
| Amazon Türkiye | ⛔ Bağlı değil | Onaylı Amazon Associates hesabıyla ürün API'si (alış) / SP-API (satış). |
| MediaMarkt, Teknosa, Vatan, Koçtaş | ⛔ Bağlı değil | Bilinen herkese açık API yok. Affiliate ağı feed'i veya yazılı izin; tarama ancak robots.txt + kullanım koşulları izin verirse. |
| Arçelik, Vestel, Bosch (marka/bayi) | ⛔ Bağlı değil | Bayi/distribütör fiyat listesi → `licensed_feed` CSV ile hemen kullanılabilir. |
| Elle giriş, Uşak perakende | ✅ Çalışıyor | — |
| akakçe | 🟡 Eklentiyle tek tıkla | robots.txt ürün sayfalarına izin veriyor, ancak kullanım sözleşmesi (md. 5.6, 7.5/b) listelerin izinsiz kopyalanmasını yasaklıyor; otomatik toplu çekim yapılmıyor. |
| Tüm siteler | 🟡 Eklentiyle tek tıkla | Okuma schema.org JSON-LD üzerinden; gerçek sitelerde henüz denenmedi. |
| Tüm siteler (otomatik) | 🟡 Okuyucu hazır, hiçbir kaynakta açık değil | `fiyat-motoru crawl --source <id>` (aşağıya bakın). 4 Kasım 2026 incelemesinde 12 sitenin hiçbiri uygun çıkmadı: 6'sı bot korumasıyla engelledi, diğerleri arama sayfalarını yasaklıyor, 403/CAPTCHA döndürüyor veya kullanım koşulları izin vermiyor. Ayrıntı aşağıdaki tabloda. |

### İzin incelemesi (4 Kasım 2026)

Kendi User-Agent'ımızla (`BeyazEsyaFirsatMotoru/0.1`), istekler arası en az 5 sn bekleyerek okundu. Bot koruması
görülen hiçbir yerde aşma denenmedi. Sonuçlar `db/seed/004_crawl_review.sql` ile `sources.last_error` /
`access_notes` alanlarına yazıldı (Kaynaklar ekranında görünür).

| Site | robots.txt | Ürün sayfası | Arama sayfası | Kullanım koşulları | Sonuç |
|---|---|---|---|---|---|
| trendyol.com | okundu | ✅ izinli | ⛔ `/*?q=` yasak | Resmî metin okunamadı (JavaScript); kamuya açık alıntılara göre robot/veri madenciliği yasak | ⛔ Kapalı (doğrulanamadı) |
| akakce.com | okundu | ✅ izinli | ✅ izinli | ⛔ Veritabanı/katalog/listelerin izinsiz çoğaltılması yasak | ⛔ Kapalı (eklentiyle elle) |
| amazon.com.tr | okundu | ✅ izinli | ✅ izinli | Metin okunamadı; veri madenciliği/robot araçlarını yasakladığı biliniyor | ⛔ Ana sayfada CAPTCHA |
| cimri.com | okundu | ✅ izinli | ⛔ `/arama`, `/*?q=` yasak | Okunamadı | ⛔ Ana sayfa 403 |
| mediamarkt.com.tr | okundu | ✅ izinli | ⛔ `/*/search.html`, `/*query=` yasak | Okunamadı | ⛔ Ana sayfa 403 |
| vatanbilgisayar.com | okundu | ✅ izinli | ⛔ `/arama/*` yasak | Okunamadı | ⛔ Ana sayfa 403 |
| hepsiburada.com | 403 (Akamai) | — | — | — | ⛔ Bot koruması |
| n11.com | 403 (Cloudflare) | — | — | — | ⛔ Bot koruması |
| pazarama.com | 403 | — | — | — | ⛔ Bot koruması |
| pttavm.com | 403 | — | — | — | ⛔ Bot koruması |
| teknosa.com | 403 | — | — | — | ⛔ Bot koruması |
| koctas.com.tr | 403 (Akamai) | — | — | — | ⛔ Bot koruması |

**Sonuç: Hiçbir kaynak otomatik okumaya uygun değil, gerçek fiyat okunmadı.** Okuyucu hazır ama hiçbir kaynakta açık
değil. Gerçekçi yollar: satıcı API'leri (Trendyol, Hepsiburada, n11, Amazon SP-API), affiliate/lisanslı feed'ler
(`import-csv --origin licensed_feed`) ve baktığınız sayfadan tek tıkla okuyan tarayıcı eklentisi (`extension/`).

İnceleme sırasında bulunan hata: Python'un `urllib.robotparser` modülü `*`/`$` jokerlerini desteklemediği için
`/*?q=` gibi yasakları görmüyordu. `connectors/robots.py` (RFC 9309) ile değiştirildi ve testlendi.

### Otomatik okuyucu: `crawl`

```bash
fiyat-motoru crawl --source teknosa                    # katalogdaki tüm ürünler (EAN, yoksa marka + model ile arama)
fiyat-motoru crawl --source teknosa --product-id 3     # tek ürün
fiyat-motoru crawl --source teknosa --url https://...  # doğrudan ürün sayfası
```

- Fiyat, stok, satıcı ve durum yalnızca sayfadaki **schema.org JSON-LD** verisinden okunur. Yapılandırılmış veri yoksa
  hiçbir şey tahmin edilmez, ürün atlanır ve hata listesine yazılır.
- EAN farklıysa ya da model kodu birebir aynı değilse (ör. `WAN28281` ≠ `WAN28281TR`) teklif alınmaz.
- Uşak teslimatı sayfadan doğrulanamaz, bu yüzden her zaman `delivery='not_verified'` kaydedilir.
- `PoliteFetcher` üzerinden çalışır: izin bayrağı, robots.txt, en az 5 sn bekleme. CAPTCHA, 403/429/503 ya da bağlantı
  hatasında kaynak durur ve sebebi `sources.last_error` alanına yazılır (Kaynaklar ekranında görünür).
- Kaynağın arama şablonu kendi sitesinde değilse (ör. Google araması) arama yapılmaz; yalnızca `--url` kullanılabilir.
- Başarılı bir okumadan sonra kaynak `integration_status='live'` olur. Kayıtlar `origin='permitted_crawl'` ile işaretlenir.

## Sonraki aşamalar

1. **Kaynak bağlantıları (5 pilot kaynak):** Hangi API anahtarlarına / lisanslara sahip olduğunuza göre önce satıcı
   API'leri (satış fiyatı, gerçek komisyon) ve bir lisanslı fiyat feed'i (alış). Konnektör sözleşmesi hazır (`engine/fiyat_motoru/connectors/base.py`).
2. Satın alma listesi + onay akışı ekranı, bildirimler (e-posta/Telegram), zamanlanmış toplama.
3. Uşak depo stok ekranı (giriş/çıkış, seri no, stoktaki ürünün güncel kâr potansiyeli).
4. Supabase Auth + RLS, satış hızının kendi satış geçmişinden hesaplanması.
