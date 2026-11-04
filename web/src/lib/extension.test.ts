// Eklentinin sayfa okuma mantığı ve yakalama API doğrulaması.
// "JSON-LD okuma" örnekleri elle yazılmıştır. "Gerçek site yapıları" örnekleri 4 Kasım 2026'da kullanıcının açtığı
// sayfalardan küçültülmüştür; kişisel veri içermez.
import { describe, expect, it } from "vitest";
import { checkGtin, extractProduct, guessModel, sourceForUrl } from "../../../extension/extract.js";
import { sidesFor, tokenOk, validateCapture } from "./capture";

describe("kaynak tanıma", () => {
  it.each([
    ["https://www.trendyol.com/x/y-p-123", "trendyol"],
    ["https://m.hepsiburada.com/x-p-HB1", "hepsiburada"],
    ["https://www.akakce.com/buzdolabi/en-ucuz-x-fiyati,1.html", "akakce"],
    ["https://trendyol.com.evil.example/x", null],
    ["notaurl", null],
  ])("%s → %s", (u, s) => expect(sourceForUrl(u)).toBe(s));
});

describe("JSON-LD okuma", () => {
  const product = {
    "@context": "https://schema.org", "@type": "Product", name: "Örnek Buzdolabı", brand: { "@type": "Brand", name: "Örnek" },
    mpn: "ABC 123", gtin13: "4006381333931",
    offers: { "@type": "Offer", price: "24999.90", priceCurrency: "TRY", availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition", seller: { "@type": "Organization", name: "Satıcı A" } },
  };
  it("tek teklif", () => {
    const r = extractProduct({ url: "https://www.trendyol.com/a-p-1", jsonLd: [JSON.stringify(product)] });
    expect(r).toMatchObject({ source: "trendyol", brand: "Örnek", modelCode: "ABC 123", gtin: "4006381333931",
      price: 24999.9, inStock: true, condition: "new", seller: "Satıcı A", warnings: [] });
  });
  it("@graph içinde, çok teklif → en ucuz TRY teklifi; yabancı para birimi atlanır", () => {
    const g = { "@graph": [{ "@type": "WebPage" }, { ...product, offers: [
      { "@type": "Offer", price: 26000, priceCurrency: "TRY", seller: { name: "B" } },
      { "@type": "Offer", price: 100, priceCurrency: "USD", seller: { name: "C" } },
      { "@type": "Offer", price: "25.500,00", priceCurrency: "TRY", seller: { name: "D" } },
    ] }] };
    const r = extractProduct({ url: "https://www.hepsiburada.com/x", jsonLd: ["bozuk{", JSON.stringify(g)] });
    expect(r.price).toBe(25500);
    expect(r.seller).toBe("D");
    expect(r.offers.map((o) => o.seller)).toEqual(["D", "B"]);
  });
  it("AggregateOffer → en düşük fiyat + uyarı", () => {
    const r = extractProduct({ url: "https://www.akakce.com/x,1.html", jsonLd: [JSON.stringify({ ...product,
      offers: { "@type": "AggregateOffer", lowPrice: 23000, highPrice: 27000, priceCurrency: "TRY" } })] });
    expect(r.price).toBe(23000);
    expect(r.warnings.join()).toContain("en düşük");
  });
  it("sku model kodu sayılmaz: pazaryerinin stok numarasıdır", () => {
    const r = extractProduct({ url: "https://www.n11.com/x", jsonLd: [JSON.stringify({ ...product, mpn: undefined, model: { "@type": "ProductModel" }, sku: "SKU-9" })] });
    expect(r.modelCode).toBeNull();
    expect(r.warnings.join()).toContain("Model kodu sayfada yok");
  });
  it("mpn stok numarasının kopyasıysa model kodu sayılmaz", () => {
    const r = extractProduct({ url: "https://www.n11.com/x", jsonLd: [JSON.stringify({ ...product, mpn: "1573483120", sku: "1573483120" })] });
    expect(r.modelCode).toBeNull();
  });
  it("JSON-LD yoksa meta etiketi, o da yoksa uyarı", () => {
    expect(extractProduct({ url: "https://www.n11.com/x", meta: { "product:price:amount": "1.299,00", "product:price:currency": "TRY" } }).price).toBe(1299);
    const r = extractProduct({ url: "https://www.n11.com/x", title: "Sayfa" });
    expect(r.price).toBeNull();
    expect(r.warnings.length).toBe(2);
  });
});

describe("barkod ve model kodu önerisi", () => {
  it.each([
    ["4006381333931", "4006381333931"], ["6934177775345", "6934177775345"], ["8801643654825", "8801643654825"],
    ["41405883", null], ["2050015153695", null], ["M230361155", null], ["", null], [null, null],
  ])("checkGtin(%s) → %s", (v, g) => expect(checkGtin(v).gtin).toBe(g));
  it("hatalı barkod uyarı üretir, boş barkod üretmez", () => {
    expect(checkGtin("2050015153695").warning).toContain("mağaza içi");
    expect(checkGtin("41405883").warning).toContain("geçerli");
    expect(checkGtin("").warning).toBeNull();
  });
  it.each([
    ["Samsung AE160RXYDEG/EU 16 kW EHS Monoblok Isı Pompası", "Samsung", "AE160RXYDEG/EU"],
    ["SINGER M2505 Dikiş Makinası Özel Üretim", "SINGER", "M2505"],
    ["Bosch WQA24201TR 9 Kg Uyumlu Beyaz Kurutma Makinesi", "Bosch", "WQA24201TR"],
    ["Grundig GPDF 4711 4 Programlı Bulaşık Makinesi", "Grundig", "GPDF 4711"],
    ["Şenocak Vfn 7274 No Frost Dondurucu 275 lt", "Şenocak", "Vfn 7274"],
    ["Xiaomi Smart Air Purifier 4 Compact EU Hava Temizleyici", "Xiaomi", null],
    ["Örnek Dondurucu 275 lt 1200W", "Örnek", null],
  ])("guessModel(%s) → %s", (n, b, m) => expect(guessModel(n, b)).toBe(m));
});

describe("Gerçek site yapıları", () => {
  const ld = (o: object) => [JSON.stringify({ "@context": "https://schema.org", "@type": "Product", ...o })];
  it("Hepsiburada: satıcı sayfa verisinden, sepet fiyatı öncelikli, stok kodu ve mağaza içi barkod alınmaz", () => {
    const r = extractProduct({
      url: "https://www.hepsiburada.com/senocak-vfn-7274-pm-HBC000095HAQF",
      jsonLd: ld({ name: "Şenocak Vfn 7274 No Frost Dondurucu", sku: "HBCV000095HAQG", gtin: "2050015153695", brand: { name: "Şenocak" },
        offers: { "@type": "Offer", price: "34998.00", priceCurrency: "TRY", availability: "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition", seller: { "@type": "Organization", name: "Şenocak" } } }),
      html: '<script>x={"merchantName":"REPA DTM","minimumPrice":31498.2}</script><span class="a">Sepete özel fiyat</span></div><div class="b">31.498,20 TL</div>',
    });
    expect(r).toMatchObject({ seller: "REPA DTM", price: 31498.2, modelCode: "Vfn 7274", gtin: null, inStock: true, condition: "new" });
    expect(r.offers.map((o) => [o.price, o.note])).toEqual([[31498.2, "sepete özel"], [34998, "sepetsiz"]]);
    expect(r.warnings.join()).toContain("Sepete özel");
  });
  it("Trendyol: satıcı merchantListing'den, satıcı kodu EAN sayılmaz", () => {
    const r = extractProduct({
      url: "https://www.trendyol.com/singer/m2505-p-333664476?merchantId=117697",
      jsonLd: ld({ name: "SINGER M2505 Dikiş Makinası", sku: "333664476", brand: { name: "SINGER" }, offers: { "@type": "Offer", price: "6727.55", priceCurrency: "TRY", availability: "https://schema.org/InStock" } }),
      html: '"merchantListing":{"merchant":{"id":117697,"name":"YUNUSO\\u011eLU HOME","officialName":"X"}} "barcode":"M230361155"',
    });
    expect(r).toMatchObject({ seller: "YUNUSOĞLU HOME", price: 6727.55, modelCode: "M2505", gtin: null });
  });
  it("n11: satıcı ve EAN sayfa verisinden, ad son eki temizlenir", () => {
    const r = extractProduct({
      url: "https://www.n11.com/urun/xiaomi-hava-temizleyici-28227299?magaza=mediamarkt",
      jsonLd: ld({ name: "Xiaomi Smart Air Purifier 4 Compact EU Hava Temizleyici Fiyatları ve Özellikleri", sku: "127256551796", brand: { name: "Xiaomi" }, offers: { "@type": "Offer", price: "5289.00", priceCurrency: "TRY", availability: "https://schema.org/InStock" } }),
      html: '<a href="/magaza/mediamarkt" title="MEDIAMARKT" class="sidebarSellerArea-top-name"> MEDIAMARKT </a> "secondHand":false "gtin":"1111111111111","id":999 "gtin":"6934177775345","id":127256551796,"oem":null',
    });
    expect(r).toMatchObject({ seller: "MEDIAMARKT", gtin: "6934177775345", condition: "new", name: "Xiaomi Smart Air Purifier 4 Compact EU Hava Temizleyici", modelCode: null });
  });
  it("PttAVM: marka alanındaki satıcı adı marka sayılmaz, EAN External ID'den", () => {
    const r = extractProduct({
      url: "https://www.pttavm.com/samsung-ae160rxydeg-p-1573483120",
      jsonLd: ld({ name: "Samsung AE160RXYDEG/EU 16 kW EHS Monoblok Isı Pompası", sku: "1573483120", mpn: "1573483120", brand: { "@type": "Brand", name: "TURAN MÜHENDİSLİK" }, itemCondition: "https://schema.org/NewCondition",
        additionalProperty: [{ "@type": "PropertyValue", name: "External ID", value: "8801643654825" }],
        offers: { "@type": "Offer", price: 179797.98, priceCurrency: "TRY", availability: "https://schema.org/InStock", seller: { "@type": "Organization", name: "TURAN MÜHENDİSLİK" } } }),
      html: "<html></html>",
    });
    expect(r).toMatchObject({ brand: "Samsung", modelCode: "AE160RXYDEG/EU", gtin: "8801643654825", seller: "TURAN MÜHENDİSLİK", condition: "new", price: 179797.98 });
  });
  it("akakçe: görünen mağaza listesi satıcı seçimine aktarılır; öne çıkan satır ve fiyatsız satır tekrar etmez", () => {
    const row = (p: string, k: string, alt: string, tail: string) => `<span class="pt_v8">${p}<i>,${k} TL</i></span><span class="v_v8"><img alt="${alt}" src="x.svg">${tail}</span>`;
    const r = extractProduct({
      url: "https://www.akakce.com/bulasik-makinesi/en-ucuz-grundig-gpdf-4711-fiyati,639006143.html",
      jsonLd: ld({ name: "Grundig GPDF 4711 4 Programlı Bulaşık Makinesi", sku: "639006143", brand: { name: "Grundig" },
        offers: { "@type": "AggregateOffer", lowPrice: "16909.11", priceCurrency: "TRY", offers: [{ "@type": "Offer", price: "16909.11", priceCurrency: "TRY", availability: "https://schema.org/InStock", seller: { name: "idefix/fix" } }] } }),
      html: `<span class="pt_v8 ">16.909<i>,11 TL</i></span><span class="v_v8">Satıcı: <img class="v1" src="y.svg" alt="idefix">/fix</span>`
        + `${"x".repeat(1600)}<span class="v_v8"><img src="z.svg" class="v2" alt="Koçtaş"></span>`
        + row("16.909", "11", "idefix", "/fix") + row("17.844", "00", "Trendyol", "/MAĞAZA") + row("17.998", "20", "Hepsiburada", "/DİĞER"),
    });
    expect(r.modelCode).toBe("GPDF 4711");
    expect(r.price).toBe(16909.11);
    expect(r.offers.map((o) => [o.price, o.seller])).toEqual([[16909.11, "idefix/fix"], [17844, "Trendyol/MAĞAZA"], [17998.2, "Hepsiburada/DİĞER"]]);
    expect(r.offers[0].inStock).toBe(true);
  });
  it("Amazon: öne çıkan teklif varsa fiyat, satıcı, stok ve durum sayfadan", () => {
    const r = extractProduct({
      url: "https://www.amazon.com.tr/dp/B07YNYSW5M",
      html: '<span id="productTitle"> Philips Marathon Ultimate Süpürge, XB9125/07 </span>'
        + '<div id="corePriceDisplay_desktop_feature_div" class="c"><div data-csa-c-buying-option-type="NEW" data-csa-c-price-to-pay="11960.0" data-csa-c-shipping-charge="0.0"></div></div>'
        + '<div offer-display-feature-name="desktop-merchant-info" data-x="y"><a href="/x" id="sellerProfileTriggerId" class="a-size-small offer-display-feature-text-message">PEYStech</a></div>'
        + '<input id="add-to-cart-button"><th> Marka Adı </th> <td> PHILIPS </td><th> Model Numarası </th> <td> XB9125/07 </td>',
    });
    expect(r).toMatchObject({ price: 11960, seller: "PEYStech", inStock: true, condition: "new", brand: "PHILIPS", modelCode: "XB9125/07", warnings: [] });
  });
  it("Amazon: JSON-LD olmadan ad, marka, model tablodan; öne çıkan teklif yoksa fiyat uydurulmaz", () => {
    const r = extractProduct({
      url: "https://www.amazon.com.tr/dp/B07YNZWR56",
      html: '<span id="productTitle" class="a"> Philips Marathon Ultimate Süpürge, XB9155/07 </span><div id="unqualifiedBuyBox"></div>'
        + '<th class="p"> Marka Adı </th> <td class="v"> PHILIPS </td><th class="p"> Model Numarası </th> <td class="v"> XB9155/07 </td>',
    });
    expect(r).toMatchObject({ name: "Philips Marathon Ultimate Süpürge, XB9155/07", brand: "PHILIPS", modelCode: "XB9155/07", price: null });
    expect(r.warnings.join()).toContain("öne çıkan teklif yok");
  });
});

describe("yakalama isteği doğrulama", () => {
  const base = { url: "https://www.trendyol.com/a-p-1", source: "trendyol", price: 1000 };
  it("geçerli istek", () => expect(validateCapture(base).ok).toBe(true));
  it.each([
    [{ ...base, url: "http://x" }], [{ ...base, price: 0 }], [{ ...base, price: "abc" }], [{ ...base, shippingFee: -1 }],
    [{ ...base, delivery: "verified" }], [{ ...base, productId: 1.5 }], [null],
  ])("reddedilir: %j", (b) => expect(validateCapture(b).ok).toBe(false));
  it("Uşak doğrulaması notla kabul", () =>
    expect(validateCapture({ ...base, delivery: "verified", deliveryNote: "adres Uşak" }).ok).toBe(true));
  it("taraf seçimi", () => {
    expect(sidesFor("auto", { can_buy: true, can_sell: true })).toEqual(["buy", "sell"]);
    expect(sidesFor("auto", { can_buy: true, can_sell: false })).toEqual(["buy"]);
    expect(sidesFor("sell", { can_buy: true, can_sell: true })).toEqual(["sell"]);
  });
  it("anahtar kontrolü", () => {
    expect(tokenOk(undefined, "x")).toBe(false);
    expect(tokenOk("kisa", "kisa")).toBe(false);
    expect(tokenOk("0123456789abcdef0123", "0123456789abcdef0123")).toBe(true);
    expect(tokenOk("0123456789abcdef0123", "0123456789abcdef0124")).toBe(false);
  });
});
