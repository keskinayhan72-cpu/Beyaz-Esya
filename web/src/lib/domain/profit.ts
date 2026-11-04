/**
 * İşlem kârı hesabı. Python motorundaki `fiyat_motoru/profit.py` ile aynı
 * formülü uygular (ortak test vektörleri: shared/profit_vectors.json).
 *
 * Varsayımlar (README'de ayrıntılı):
 *  - Alış ve satış fiyatları KDV DAHİL girilir; kâr KDV HARİÇ hesaplanır
 *    (KDV, indirim mekanizmasıyla devlete aktarılan geçiş kalemidir).
 *  - Pazaryeri komisyonu, kanala göre KDV dahil ('gross', varsayılan) veya KDV hariç
 *    ('net') satış fiyatı üzerinden hesaplanır; komisyon faturasındaki KDV indirilebilir.
 *  - İade riski = iade oranı × (gidiş + dönüş kargo + iade edilen ürünün değer kaybı).
 *  - Stok maliyeti = sermaye maliyeti (yıllık oran × gün/365) + aylık depolama.
 *  - E-ticaret stopajı kâr kalemi değildir (gelir vergisinden mahsup edilir);
 *    yalnızca nakit akışı etkisi olarak raporlanır.
 */

export type ProfitInput = {
  purchaseGross: number;          // KDV dahil alış fiyatı
  purchaseShippingGross: number;  // satıcının Uşak'a kargo ücreti (KDV dahil)
  kdvRate: number;                // ürün KDV oranı (beyaz eşya: 0.20)
  serviceKdvRate: number;         // hizmet faturalarının KDV oranı
  inboundNet: number;             // depoya ek taşıma (KDV hariç)
  saleGross: number;              // KDV dahil satış fiyatı
  commissionRate: number;
  commissionBase?: "gross" | "net"; // varsayılan: gross
  paymentFeeRate: number;
  fixedFeeNet: number;
  outboundShippingNet: number;    // müşteriye gönderim veya teslimat maliyeti (KDV hariç)
  returnRate: number;
  returnLossRate: number;
  annualCapitalCostRate: number;
  daysInStock: number;
  storageCostMonthNet: number;
  handlingNet: number;
  withholdingRate: number;
};

export type ProfitBreakdown = {
  saleNet: number;
  purchaseNet: number;
  purchaseShippingNet: number;
  inboundNet: number;
  commissionNet: number;
  paymentFeeNet: number;
  outboundShippingNet: number;
  returnRiskNet: number;
  holdingCostNet: number;
  handlingNet: number;
  totalCostNet: number;
  netProfit: number;
  margin: number;        // netProfit / saleNet
  roi: number;           // netProfit / bağlanan sermaye (KDV hariç)
  outputVat: number;
  inputVat: number;
  vatPayable: number;    // negatifse devreden KDV
  withholding: number;   // stopaj nakit etkisi
  cashOutlay: number;    // alışta ödenen toplam (KDV dahil)
  breakEvenSaleGross: number | null;
};

export function calculateProfit(i: ProfitInput): ProfitBreakdown {
  for (const [k, v] of Object.entries(i)) {
    if (k === "commissionBase") continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error(`Geçersiz değer: ${k}=${v}`);
  }
  const k = i.kdvRate;
  const sk = i.serviceKdvRate;
  const saleNet = i.saleGross / (1 + k);
  const purchaseNet = i.purchaseGross / (1 + k);
  const purchaseShippingNet = i.purchaseShippingGross / (1 + sk);
  const onNet = i.commissionBase === "net";
  const commissionNet = (onNet ? saleNet : i.saleGross) * i.commissionRate;
  const paymentFeeNet = i.saleGross * i.paymentFeeRate + i.fixedFeeNet;
  const returnRiskNet = i.returnRate * (2 * i.outboundShippingNet + i.returnLossRate * purchaseNet);
  const holdingCostNet =
    purchaseNet * i.annualCapitalCostRate * (i.daysInStock / 365) +
    i.storageCostMonthNet * (i.daysInStock / 30);

  // Satış fiyatından bağımsız maliyetler
  const fixedCosts =
    purchaseNet + purchaseShippingNet + i.inboundNet + i.fixedFeeNet + i.outboundShippingNet +
    returnRiskNet + holdingCostNet + i.handlingNet;
  const totalCostNet = fixedCosts + commissionNet + i.saleGross * i.paymentFeeRate;
  const netProfit = saleNet - totalCostNet;

  const capital = purchaseNet + purchaseShippingNet + i.inboundNet;
  const outputVat = i.saleGross - saleNet;
  const inputVat =
    (i.purchaseGross - purchaseNet) +
    (i.purchaseShippingGross - purchaseShippingNet) +
    sk * (commissionNet + paymentFeeNet + i.outboundShippingNet + i.inboundNet);

  const perUnitSale = 1 / (1 + k) - (onNet ? i.commissionRate / (1 + k) : i.commissionRate) - i.paymentFeeRate;
  const breakEvenSaleGross = perUnitSale > 0 ? fixedCosts / perUnitSale : null;

  return {
    saleNet,
    purchaseNet,
    purchaseShippingNet,
    inboundNet: i.inboundNet,
    commissionNet,
    paymentFeeNet,
    outboundShippingNet: i.outboundShippingNet,
    returnRiskNet,
    holdingCostNet,
    handlingNet: i.handlingNet,
    totalCostNet,
    netProfit,
    margin: saleNet > 0 ? netProfit / saleNet : 0,
    roi: capital > 0 ? netProfit / capital : 0,
    outputVat,
    inputVat,
    vatPayable: outputVat - inputVat,
    withholding: saleNet * i.withholdingRate,
    cashOutlay: i.purchaseGross + i.purchaseShippingGross,
    breakEvenSaleGross,
  };
}
