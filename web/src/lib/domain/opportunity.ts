/**
 * Fırsat değerlendirme: bir ürün için en uygun alış teklifi × her satış kanalı.
 */
import { calculateProfit, type ProfitBreakdown, type ProfitInput } from "./profit";
import { evaluateBuyOffer, type BuyObservation, type Eligibility, type EligibilityStatus } from "./eligibility";

export type CostSettings = {
  inboundShippingNet: number;
  handlingNet: number;
  annualCapitalCostRate: number;
  avgDaysInStock: number;
  storageCostMonthNet: number;
  returnLossRate: number;
  serviceKdvRate: number;
  maxPriceAgeHours: number;
  minProfitNet: number;
  minMargin: number;
};

export type Channel = {
  id: string;
  name: string;
  sourceId: string | null;
  commissionRate: number;      // kategori özel oran varsa o uygulanmış hâli
  commissionBase: "gross" | "net";
  paymentFeeRate: number;
  fixedFeeNet: number;
  outboundShippingNet: number;
  returnRate: number;
  withholdingRate: number;
  paramsVerified: boolean;
};

export type BuyOffer = BuyObservation & {
  offerId: number;
  observationId: number;
  sourceId: string;
  sourceUrl: string;
  sellerName: string | null;
  shippingFee: number | null;
};

export type SellReference = { channelId: string; price: number; observedAt: Date; isTest: boolean };

export type ChannelResult = {
  channel: Channel;
  saleGross: number;
  saleIsTest: boolean;
  profit: ProfitBreakdown;
  unitsPerMonth: number | null;
  monthlyProfit: number | null;
};

export type ProductOpportunity = {
  bestBuy: (BuyOffer & { eligibility: Eligibility }) | null;
  buyOffers: (BuyOffer & { eligibility: Eligibility })[];
  channels: ChannelResult[];
  best: ChannelResult | null;
  status: EligibilityStatus | "no_buy_offer";
  isOpportunity: boolean;
  warnings: string[];
};

const STATUS_RANK: Record<EligibilityStatus, number> = { eligible: 0, needs_verification: 1, excluded: 2 };

/** Alış maliyeti: fiyat + bilinmeyen kargo için 0 değil, uyarı. */
function landedGross(o: BuyOffer): number {
  return o.price + (o.shippingFee ?? 0);
}

export function buildProfitInput(
  purchaseGross: number,
  purchaseShippingGross: number,
  saleGross: number,
  kdvRate: number,
  ch: Channel,
  s: CostSettings,
): ProfitInput {
  return {
    purchaseGross,
    purchaseShippingGross,
    kdvRate,
    serviceKdvRate: s.serviceKdvRate,
    inboundNet: s.inboundShippingNet,
    saleGross,
    commissionRate: ch.commissionRate,
    commissionBase: ch.commissionBase,
    paymentFeeRate: ch.paymentFeeRate,
    fixedFeeNet: ch.fixedFeeNet,
    outboundShippingNet: ch.outboundShippingNet,
    returnRate: ch.returnRate,
    returnLossRate: s.returnLossRate,
    annualCapitalCostRate: s.annualCapitalCostRate,
    daysInStock: s.avgDaysInStock,
    storageCostMonthNet: s.storageCostMonthNet,
    handlingNet: s.handlingNet,
    withholdingRate: ch.withholdingRate,
  };
}

export function evaluateProduct(args: {
  kdvRate: number;
  buyOffers: BuyOffer[];
  sellRefs: SellReference[];
  channels: Channel[];
  velocity: Record<string, number>;
  settings: CostSettings;
  now: Date;
}): ProductOpportunity {
  const { settings: s, now } = args;
  const warnings: string[] = [];

  const buyOffers = args.buyOffers
    .map((o) => ({ ...o, eligibility: evaluateBuyOffer(o, { now, maxPriceAgeHours: s.maxPriceAgeHours }) }))
    .sort(
      (a, b) =>
        STATUS_RANK[a.eligibility.status] - STATUS_RANK[b.eligibility.status] || landedGross(a) - landedGross(b),
    );

  // Elenmemiş teklifler arasında en iyi (önce uygunluk, sonra fiyat)
  const bestBuy = buyOffers.find((o) => o.eligibility.status !== "excluded") ?? null;
  if (!bestBuy) {
    return {
      bestBuy: null, buyOffers, channels: [], best: null, isOpportunity: false,
      status: buyOffers.length ? "excluded" : "no_buy_offer",
      warnings: buyOffers.length ? ["Tüm alış teklifleri elendi"] : ["Alış fiyatı verisi yok"],
    };
  }
  if (bestBuy.shippingFee === null) warnings.push("Alış kargo ücreti bilinmiyor — 0 kabul edildi");

  // Kanal başına referans satış fiyatı: en güncel ve tazelik sınırı içindeki en düşük rakip fiyatı
  const maxAgeMs = s.maxPriceAgeHours * 3_600_000;
  const channels: ChannelResult[] = [];
  for (const ch of args.channels) {
    const refs = args.sellRefs.filter(
      (r) => r.channelId === ch.id && now.getTime() - r.observedAt.getTime() <= maxAgeMs,
    );
    if (!refs.length) continue;
    const ref = refs.reduce((a, b) => (b.price < a.price ? b : a));
    const profit = calculateProfit(
      buildProfitInput(bestBuy.price, bestBuy.shippingFee ?? 0, ref.price, args.kdvRate, ch, s),
    );
    const units = args.velocity[ch.id] ?? null;
    channels.push({
      channel: ch,
      saleGross: ref.price,
      saleIsTest: ref.isTest,
      profit,
      unitsPerMonth: units,
      monthlyProfit: units === null ? null : profit.netProfit * units,
    });
  }
  channels.sort((a, b) => b.profit.netProfit - a.profit.netProfit);
  const best = channels[0] ?? null;
  if (!best) warnings.push("Satış kanallarında güncel satış fiyatı yok");
  if (best && !best.channel.paramsVerified) warnings.push(`${best.channel.name} komisyon/ücret oranları doğrulanmadı (varsayım)`);
  if (best?.saleIsTest) warnings.push("Satış fiyatı TEST VERİSİ");

  const status = bestBuy.eligibility.status;
  const isOpportunity =
    status === "eligible" &&
    !!best &&
    !best.saleIsTest &&
    best.profit.netProfit >= s.minProfitNet &&
    best.profit.margin >= s.minMargin;

  return { bestBuy, buyOffers, channels, best, status, isOpportunity, warnings };
}
