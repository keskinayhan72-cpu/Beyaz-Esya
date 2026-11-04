// Eklentinin sayfa okuma mantığı ve yakalama API doğrulaması.
// Örnek JSON-LD'ler schema.org biçiminde ELLE yazılmıştır; gerçek sitelerden alınmış değildir.
import { describe, expect, it } from "vitest";
import { extractProduct, sourceForUrl } from "../../../extension/extract.js";
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
  it("model nesnesi ve sku yedeği", () => {
    const r = extractProduct({ url: "https://www.n11.com/x", jsonLd: [JSON.stringify({ ...product, mpn: undefined, model: { "@type": "ProductModel" }, sku: "SKU-9" })] });
    expect(r.modelCode).toBe("SKU-9");
  });
  it("JSON-LD yoksa meta etiketi, o da yoksa uyarı", () => {
    expect(extractProduct({ url: "https://www.n11.com/x", meta: { "product:price:amount": "1.299,00", "product:price:currency": "TRY" } }).price).toBe(1299);
    const r = extractProduct({ url: "https://www.n11.com/x", title: "Sayfa" });
    expect(r.price).toBeNull();
    expect(r.warnings.length).toBe(2);
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
