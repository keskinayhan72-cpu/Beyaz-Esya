"use client";

import { useMemo, useState } from "react";
import { calculateProfit } from "@/lib/domain/profit";
import { buildProfitInput, type Channel, type CostSettings } from "@/lib/domain/opportunity";
import { fmtPct, fmtTL, parseTrNumber } from "@/lib/format";

type Fulfillment = { id: string; name: string; cost_net: number; cost_per_km: number };

export function ProfitCalculator(props: {
  kdvRate: number;
  settings: CostSettings;
  channels: Channel[];
  fulfillment: Fulfillment[];
  defaultPurchase: number | null;
  defaultPurchaseShipping: number | null;
  defaultSaleByChannel: Record<string, number>;
}) {
  const firstChannel = props.channels.find((c) => props.defaultSaleByChannel[c.id]) ?? props.channels[0];
  const [channelId, setChannelId] = useState(firstChannel?.id ?? "");
  const [purchase, setPurchase] = useState(props.defaultPurchase?.toString() ?? "");
  const [purchaseShip, setPurchaseShip] = useState(props.defaultPurchaseShipping?.toString() ?? "0");
  const [sale, setSale] = useState(props.defaultSaleByChannel[firstChannel?.id ?? ""]?.toString() ?? "");
  const [fulfillmentId, setFulfillmentId] = useState("store_pickup");
  const [km, setKm] = useState("0");

  const ch = props.channels.find((c) => c.id === channelId);
  const isRetail = ch?.sourceId === "usak_magaza";

  const result = useMemo(() => {
    const p = parseTrNumber(purchase), s = parseTrNumber(sale), ps = parseTrNumber(purchaseShip) ?? 0;
    if (!ch || p === null || s === null || p <= 0 || s <= 0) return null;
    let channel = ch;
    if (isRetail) {
      const fm = props.fulfillment.find((f) => f.id === fulfillmentId);
      const cost = fm ? fm.cost_net + fm.cost_per_km * (parseTrNumber(km) ?? 0) : 0;
      channel = { ...ch, outboundShippingNet: cost };
    }
    try {
      return calculateProfit(buildProfitInput(p, ps, s, props.kdvRate, channel, props.settings));
    } catch {
      return null;
    }
  }, [purchase, sale, purchaseShip, ch, isRetail, fulfillmentId, km, props]);

  return (
    <div>
      <div className="form">
        <label>Satış kanalı
          <select value={channelId} onChange={(e) => {
            setChannelId(e.target.value);
            const d = props.defaultSaleByChannel[e.target.value];
            if (d) setSale(d.toString());
          }}>
            {props.channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Alış fiyatı (KDV dahil)<input value={purchase} onChange={(e) => setPurchase(e.target.value)} inputMode="decimal" /></label>
        <label>Alış kargo (KDV dahil)<input value={purchaseShip} onChange={(e) => setPurchaseShip(e.target.value)} inputMode="decimal" /></label>
        <label>Satış fiyatı (KDV dahil)<input value={sale} onChange={(e) => setSale(e.target.value)} inputMode="decimal" /></label>
        {isRetail && (
          <>
            <label>Teslimat yöntemi
              <select value={fulfillmentId} onChange={(e) => setFulfillmentId(e.target.value)}>
                {props.fulfillment.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            {fulfillmentId === "own_vehicle" && (
              <label>Mesafe (km, gidiş-dönüş)<input value={km} onChange={(e) => setKm(e.target.value)} inputMode="decimal" /></label>
            )}
          </>
        )}
      </div>
      {ch && !ch.paramsVerified && (
        <p className="small" style={{ color: "var(--warn)" }}>
          {ch.name} komisyon/ücret oranları doğrulanmadı (varsayım: komisyon {fmtPct(ch.commissionRate)}). Maliyet ayarlarından güncelleyin.
        </p>
      )}
      {!result ? (
        <p className="muted small">Hesap için alış ve satış fiyatı girin.</p>
      ) : (
        <div className="two" style={{ marginTop: 12 }}>
          <div className="kv">
            <span>Satış (KDV hariç)</span><span>{fmtTL(result.saleNet)}</span>
            <span>− Alış (KDV hariç)</span><span>{fmtTL(result.purchaseNet)}</span>
            <span>− Alış kargosu</span><span>{fmtTL(result.purchaseShippingNet)}</span>
            <span>− Depoya taşıma</span><span>{fmtTL(result.inboundNet)}</span>
            <span>− Komisyon</span><span>{fmtTL(result.commissionNet)}</span>
            <span>− Ödeme/hizmet bedeli</span><span>{fmtTL(result.paymentFeeNet)}</span>
            <span>− Müşteriye gönderim</span><span>{fmtTL(result.outboundShippingNet)}</span>
            <span>− İade riski</span><span>{fmtTL(result.returnRiskNet)}</span>
            <span>− Stok maliyeti</span><span>{fmtTL(result.holdingCostNet)}</span>
            <span>− Elleçleme</span><span>{fmtTL(result.handlingNet)}</span>
            <span className="total">Net işlem kârı</span>
            <span className={`total ${result.netProfit >= 0 ? "pos" : "neg"}`}>{fmtTL(result.netProfit)}</span>
          </div>
          <div className="kv">
            <span>Marj (KDV hariç satışa göre)</span><span>{fmtPct(result.margin)}</span>
            <span>Sermaye getirisi (ROI)</span><span>{fmtPct(result.roi)}</span>
            <span>Başabaş satış fiyatı</span><span>{fmtTL(result.breakEvenSaleGross)}</span>
            <span>Hesaplanan KDV</span><span>{fmtTL(result.outputVat)}</span>
            <span>İndirilecek KDV</span><span>{fmtTL(result.inputVat)}</span>
            <span>Ödenecek KDV (− devreden)</span><span>{fmtTL(result.vatPayable)}</span>
            <span>E-ticaret stopajı (mahsup edilir)</span><span>{fmtTL(result.withholding)}</span>
            <span>Alışta nakit çıkışı</span><span>{fmtTL(result.cashOutlay)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
