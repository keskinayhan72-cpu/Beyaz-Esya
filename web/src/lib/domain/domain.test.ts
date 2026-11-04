import { describe, expect, it } from "vitest";
import profitVectors from "../../../../shared/profit_vectors.json";
import idVectors from "../../../../shared/identifier_vectors.json";
import { calculateProfit, type ProfitInput } from "./profit";
import { isValidGtin, matchOffer, normalizeCode, normalizeGtin, displayGtin } from "./identifiers";
import { evaluateBuyOffer, type BuyObservation } from "./eligibility";
import { evaluateProduct, type BuyOffer, type Channel, type CostSettings } from "./opportunity";

describe("kâr hesabı (ortak vektörler)", () => {
  for (const c of profitVectors.cases) {
    it(c.name, () => {
      const r = calculateProfit(c.input as ProfitInput) as unknown as Record<string, number>;
      for (const [k, v] of Object.entries(c.expected)) {
        expect(r[k], k).toBeCloseTo(v as number, 4);
      }
    });
  }

  it("başabaş satış fiyatında net kâr ≈ 0", () => {
    const input = profitVectors.cases[0].input as ProfitInput;
    const be = calculateProfit(input).breakEvenSaleGross!;
    expect(calculateProfit({ ...input, saleGross: be }).netProfit).toBeCloseTo(0, 6);
  });

  it("negatif veya sayısal olmayan girdi reddedilir", () => {
    const input = profitVectors.cases[0].input as ProfitInput;
    expect(() => calculateProfit({ ...input, purchaseGross: -1 })).toThrow();
    expect(() => calculateProfit({ ...input, saleGross: Number.NaN })).toThrow();
  });
});

describe("kimliklendirme (ortak vektörler)", () => {
  for (const v of idVectors.gtin) {
    it(`GTIN ${v.raw}`, () => {
      expect(isValidGtin(v.raw.replace(/-/g, ""))).toBe(v.valid);
      expect(normalizeGtin(v.raw)).toBe(v.normalized);
    });
  }
  for (const v of idVectors.code) {
    it(`kod "${v.raw}"`, () => expect(normalizeCode(v.raw)).toBe(v.normalized));
  }
  it("EAN-13 gösterimi", () => expect(displayGtin("04006381333931")).toBe("4006381333931"));
});

describe("eşleştirme", () => {
  const catalog = [
    { id: 1, gtin: "04006381333931", brandNorm: "BOSCH", modelCodeNorm: "WAN28281TR" },
    { id: 2, gtin: null, brandNorm: "ARCELIK", modelCodeNorm: "9120NFI" },
  ];
  it("GTIN ile", () => expect(matchOffer({ gtin: "4006381333931" }, catalog)).toEqual({ productId: 1, method: "gtin" }));
  it("marka + tam model kodu ile", () =>
    expect(matchOffer({ brand: "Arçelik", modelCode: "9120 NFI" }, catalog)).toEqual({ productId: 2, method: "model_code" }));
  it("model kodu varyantı otomatik eşleşmez", () =>
    expect(matchOffer({ brand: "Bosch", modelCode: "WAN28281" }, catalog).productId).toBeNull());
  it("model kodu eşleşse de GTIN çelişirse reddedilir", () =>
    expect(matchOffer({ brand: "Bosch", modelCode: "WAN28281TR", gtin: "73513537" }, catalog).productId).toBeNull());
});

const now = new Date("2026-11-04T12:00:00Z");
const base: BuyObservation = {
  origin: "manual_entry", observedAt: new Date("2026-11-04T10:00:00Z"), price: 18000, inStock: true,
  delivery: "verified", regionalRestriction: null, invoice: "e_fatura", warranty: "official_tr", condition: "new",
};
const opts = { now, maxPriceAgeHours: 48 };

describe("uygunluk / bölgesel filtre", () => {
  it("tüm kontroller tamam → uygun", () => expect(evaluateBuyOffer(base, opts).status).toBe("eligible"));
  it("Uşak teslimatı doğrulanmamış → asla uygun değil", () =>
    expect(evaluateBuyOffer({ ...base, delivery: "not_verified" }, opts).status).toBe("needs_verification"));
  it("Uşak'a gönderim yok → elenir", () =>
    expect(evaluateBuyOffer({ ...base, delivery: "restricted" }, opts).status).toBe("excluded"));
  it("bölgesel kısıt metni → elenir", () =>
    expect(evaluateBuyOffer({ ...base, regionalRestriction: "Yalnızca İstanbul" }, opts).status).toBe("excluded"));
  it("stokta yok / ikinci el / garantisiz / faturasız → elenir", () => {
    for (const patch of [{ inStock: false }, { condition: "used" }, { warranty: "none" }, { invoice: "none" }] as const)
      expect(evaluateBuyOffer({ ...base, ...patch } as BuyObservation, opts).status).toBe("excluded");
  });
  it("test verisi → asla uygun değil", () =>
    expect(evaluateBuyOffer({ ...base, origin: "test_fixture" }, opts).status).toBe("needs_verification"));
  it("eski fiyat → doğrulama bekler", () =>
    expect(evaluateBuyOffer({ ...base, observedAt: new Date("2026-11-01T00:00:00Z") }, opts).status).toBe("needs_verification"));
});

describe("ürün fırsat değerlendirmesi", () => {
  const settings: CostSettings = {
    inboundShippingNet: 300, handlingNet: 50, annualCapitalCostRate: 0.45, avgDaysInStock: 21,
    storageCostMonthNet: 30, returnLossRate: 0.05, serviceKdvRate: 0.2, maxPriceAgeHours: 48,
    minProfitNet: 250, minMargin: 0.05,
  };
  const ch = (id: string, commissionRate: number): Channel => ({
    id, name: id, sourceId: id, commissionRate, commissionBase: "gross", paymentFeeRate: 0, fixedFeeNet: 10, outboundShippingNet: 400,
    returnRate: 0.04, withholdingRate: 0.01, paramsVerified: true,
  });
  const offer = (id: number, price: number, patch: Partial<BuyOffer> = {}): BuyOffer => ({
    ...base, offerId: id, observationId: id, sourceId: "manuel", sourceUrl: `https://x/${id}`,
    sellerName: null, shippingFee: 0, price, ...patch,
  });
  const sellRefs = [
    { channelId: "a", price: 30000, observedAt: now, isTest: false },
    { channelId: "a", price: 31000, observedAt: now, isTest: false },
    { channelId: "b", price: 30000, observedAt: now, isTest: false },
  ];

  it("en ucuz UYGUN teklifi seçer, elenenleri atlar; en kârlı kanalı bulur", () => {
    const r = evaluateProduct({
      kdvRate: 0.2, settings, now, velocity: { a: 10 },
      channels: [ch("a", 0.15), ch("b", 0.2)],
      buyOffers: [offer(1, 15000, { delivery: "restricted" }), offer(2, 18000), offer(3, 17500, { delivery: "not_verified" })],
      sellRefs,
    });
    expect(r.bestBuy?.offerId).toBe(2);
    expect(r.best?.channel.id).toBe("a");
    expect(r.best?.saleGross).toBe(30000); // kanalın en düşük rakip fiyatı
    expect(r.best?.profit.netProfit).toBeCloseTo(4268.643836, 4);
    expect(r.best?.monthlyProfit).toBeCloseTo(42686.43836, 3);
    expect(r.isOpportunity).toBe(true);
  });

  it("yalnızca doğrulanmamış teklif varsa fırsat olarak işaretlenmez", () => {
    const r = evaluateProduct({
      kdvRate: 0.2, settings, now, velocity: {}, channels: [ch("a", 0.15)],
      buyOffers: [offer(1, 15000, { delivery: "not_verified" })], sellRefs,
    });
    expect(r.status).toBe("needs_verification");
    expect(r.best!.profit.netProfit).toBeGreaterThan(0);
    expect(r.isOpportunity).toBe(false);
  });

  it("test satış fiyatıyla fırsat işaretlenmez", () => {
    const r = evaluateProduct({
      kdvRate: 0.2, settings, now, velocity: {}, channels: [ch("a", 0.15)],
      buyOffers: [offer(1, 15000)], sellRefs: [{ channelId: "a", price: 30000, observedAt: now, isTest: true }],
    });
    expect(r.isOpportunity).toBe(false);
  });

  it("alış teklifi yoksa durum no_buy_offer", () => {
    const r = evaluateProduct({ kdvRate: 0.2, settings, now, velocity: {}, channels: [], buyOffers: [], sellRefs: [] });
    expect(r.status).toBe("no_buy_offer");
  });
});
