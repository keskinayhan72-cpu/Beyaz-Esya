import Link from "next/link";
import { notFound } from "next/navigation";
import {
  channelsForCategory, getCategoryCommissions, getChannelRows, getFulfillmentMethods, getLatestOffers,
  getPriceHistory, getProduct, getSettings, getSources, getVelocity, toBuyOffer, toSellRefs,
} from "@/lib/db/queries";
import { evaluateProduct } from "@/lib/domain/opportunity";
import { buildSearchUrl } from "@/lib/domain/checks";
import { displayGtin } from "@/lib/domain/identifiers";
import { fmtDate, fmtPct, fmtTL } from "@/lib/format";
import { DeliveryBadge, OriginBadge, PriceChart, StatusBadge, TestDataBanner } from "@/components/ui";
import { PriceEntryForm } from "@/components/forms";
import { ProfitCalculator } from "@/components/ProfitCalculator";
import { setDeliveryStatus, setVelocity } from "@/app/actions";

export const dynamic = "force-dynamic";

const INVOICE: Record<string, string> = { e_fatura: "e-Fatura", e_arsiv: "e-Arşiv", paper: "Kâğıt", none: "Yok", unknown: "?" };
const WARRANTY: Record<string, string> = { official_tr: "Resmî TR", importer: "İthalatçı", seller: "Satıcı", none: "Yok", unknown: "?" };
const COND: Record<string, string> = { new: "Sıfır", refurbished: "Yenilenmiş", used: "2. el", unknown: "?" };

export default async function ProductPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ kaynak?: string }> }) {
  const id = Number((await params).id);
  const { kaynak } = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const product = await getProduct(id);
  if (!product) notFound();

  const [offers, history, chRows, overrides, settings, velocityRows, sources, fulfillment] = await Promise.all([
    getLatestOffers(id), getPriceHistory(id), getChannelRows(), getCategoryCommissions(), getSettings(),
    getVelocity(id), getSources(), getFulfillmentMethods(),
  ]);
  const channels = channelsForCategory(chRows, overrides, product.category_id);
  const velocity = Object.fromEntries(velocityRows.map((v) => [v.channel_id, v.units_per_month]));
  const now = new Date();
  const r = evaluateProduct({
    kdvRate: product.kdv_rate, buyOffers: offers.filter((o) => o.side === "buy").map(toBuyOffer),
    sellRefs: toSellRefs(offers, channels), channels, velocity, settings, now,
  });
  const sellOffers = offers.filter((o) => o.side === "sell").sort((a, b) => a.price - b.price);
  const hasTest = offers.some((o) => o.origin === "test_fixture");
  const sourceName = Object.fromEntries(sources.map((s) => [s.id, s.name]));

  // Fiyat geçmişi: kaynak × taraf başına seri
  const seriesMap = new Map<string, { label: string; dashed: boolean; points: { t: number; v: number }[] }>();
  for (const h of history) {
    const key = `${h.source_id}:${h.side}`;
    if (!seriesMap.has(key))
      seriesMap.set(key, { label: `${sourceName[h.source_id] ?? h.source_id} (${h.side === "buy" ? "alış" : "satış"})`, dashed: h.side === "sell", points: [] });
    seriesMap.get(key)!.points.push({ t: new Date(h.observed_at).getTime(), v: h.price });
  }

  const defaultSaleByChannel = Object.fromEntries(r.channels.map((c) => [c.channel.id, c.saleGross]));

  return (
    <>
      <p className="small"><Link href="/urunler">← Katalog</Link></p>
      <h1>{product.brand} {product.model_code}</h1>
      <p className="sub">{product.name} · {product.category_name} · EAN {displayGtin(product.gtin)} · KDV {fmtPct(product.kdv_rate)}</p>
      <TestDataBanner show={hasTest} />

      <div className="card">
        <h2>Pazaryerlerinde ara</h2>
        <div className="small" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {sources.filter((s) => s.search_url_template).map((s) => {
            const q = product.gtin ? displayGtin(product.gtin) : `${product.brand} ${product.model_code}`;
            return (
              <span key={s.id}>
                {s.name}:{" "}
                <a href={buildSearchUrl(s.search_url_template, q)!} target="_blank" rel="noreferrer">{product.gtin ? "EAN" : "model"}↗</a>
                {product.gtin && <> · <a href={buildSearchUrl(s.search_url_template, `${product.brand} ${product.model_code}`)!} target="_blank" rel="noreferrer">model↗</a></>}
              </span>
            );
          })}
        </div>
        <p className="small muted">Bulduğunuz fiyatı aşağıdaki “Fiyat gözlemi ekle” formuna girin.</p>
      </div>

      <div className="card">
        <h2>Özet <StatusBadge status={r.status} /> {r.isOpportunity && <span className="badge b-ok">FIRSAT</span>}</h2>
        {r.bestBuy ? (
          <p>
            En uygun alış: <b>{fmtTL(r.bestBuy.price)}</b> — {sourceName[r.bestBuy.sourceId]}{" "}
            {r.bestBuy.sourceUrl.startsWith("http") && <a href={r.bestBuy.sourceUrl} target="_blank" rel="noreferrer">kaynağa git ↗</a>}
            {r.best && <> · En kârlı kanal: <b>{r.best.channel.name}</b> → net <b className={r.best.profit.netProfit >= 0 ? "pos" : "neg"}>{fmtTL(r.best.profit.netProfit)}</b></>}
          </p>
        ) : <p className="muted">Kullanılabilir alış teklifi yok.</p>}
        {r.warnings.length > 0 && <ul className="reasons">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        <p className="small muted">Satın alma bu uygulamadan yapılmaz; kararı ve işlemi siz verirsiniz.</p>
      </div>

      <div className="card tablewrap">
        <h2>Alış fiyatları karşılaştırması</h2>
        {r.buyOffers.length === 0 ? <p className="muted">Bu ürün için alış fiyatı gözlemi yok.</p> : (
          <table>
            <thead><tr>
              <th>Kaynak / satıcı</th><th className="num">Fiyat</th><th className="num">Kargo</th><th>Stok</th>
              <th>Teslimat</th><th>Fatura</th><th>Garanti</th><th>Durum</th><th>Veri</th><th>Değerlendirme</th>
            </tr></thead>
            <tbody>
              {r.buyOffers.map((o) => (
                <tr key={o.offerId}>
                  <td>
                    {o.sourceUrl.startsWith("http") ? <a href={o.sourceUrl} target="_blank" rel="noreferrer">{sourceName[o.sourceId]} ↗</a> : sourceName[o.sourceId]}
                    {o.sellerName && <div className="small muted">{o.sellerName}</div>}
                  </td>
                  <td className="num"><b>{fmtTL(o.price)}</b></td>
                  <td className="num">{o.shippingFee === null ? "?" : fmtTL(o.shippingFee)}</td>
                  <td>{o.inStock === null ? "?" : o.inStock ? "Var" : "Yok"}</td>
                  <td>
                    <DeliveryBadge d={o.delivery} />
                    <form action={setDeliveryStatus} className="inline" style={{ marginTop: 4 }}>
                      <input type="hidden" name="observation_id" value={o.observationId} />
                      <input type="hidden" name="product_id" value={id} />
                      <select name="delivery" defaultValue={o.delivery}>
                        <option value="verified">Doğrulandı</option><option value="not_verified">Doğrulanmadı</option><option value="restricted">Gönderim yok</option>
                      </select>
                      <input name="note" placeholder="Nasıl doğrulandı" size={14} />
                      <button className="ghost">Güncelle</button>
                    </form>
                  </td>
                  <td>{INVOICE[o.invoice]}</td>
                  <td>{WARRANTY[o.warranty]}</td>
                  <td>{COND[o.condition]}</td>
                  <td><OriginBadge origin={o.origin} /><div className="small muted">{fmtDate(o.observedAt)}</div></td>
                  <td>
                    <StatusBadge status={o.eligibility.status} />
                    <ul className="reasons">{[...o.eligibility.excludeReasons, ...o.eligibility.pendingChecks].map((x) => <li key={x}>{x}</li>)}</ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card tablewrap">
        <h2>Satış kanalları</h2>
        <table>
          <thead><tr>
            <th>Kanal</th><th className="num">Referans satış fiyatı</th><th className="num">Net kâr</th><th className="num">Marj</th>
            <th className="num">ROI</th><th>Satış hızı (adet/ay)</th><th className="num">Aylık kâr</th>
          </tr></thead>
          <tbody>
            {channels.map((ch) => {
              const c = r.channels.find((x) => x.channel.id === ch.id);
              return (
                <tr key={ch.id}>
                  <td>{ch.name} {!ch.paramsVerified && <span className="badge b-warn" title="Komisyon/ücretler varsayım">oran varsayım</span>}</td>
                  <td className="num">{c ? <>{fmtTL(c.saleGross)} {c.saleIsTest && <span className="badge b-test">TEST</span>}</> : <span className="muted">güncel fiyat yok</span>}</td>
                  <td className={`num ${c && c.profit.netProfit >= 0 ? "pos" : "neg"}`}>{c ? fmtTL(c.profit.netProfit) : "—"}</td>
                  <td className="num">{c ? fmtPct(c.profit.margin) : "—"}</td>
                  <td className="num">{c ? fmtPct(c.profit.roi) : "—"}</td>
                  <td>
                    <form action={setVelocity} className="inline">
                      <input type="hidden" name="product_id" value={id} />
                      <input type="hidden" name="channel_id" value={ch.id} />
                      <input name="units_per_month" defaultValue={velocity[ch.id] ?? ""} size={5} placeholder="?" />
                      <button className="ghost">Kaydet</button>
                    </form>
                  </td>
                  <td className="num">{c?.monthlyProfit != null ? fmtTL(c.monthlyProfit) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="small muted">Referans satış fiyatı: kanalda son {settings.maxPriceAgeHours} saatte gözlenen en düşük rakip fiyatı. Satış hızı şu an elle girilen tahmindir.</p>
        {sellOffers.length > 0 && (
          <details>
            <summary className="small">Tüm satış tarafı gözlemleri ({sellOffers.length})</summary>
            <table>
              <tbody>
                {sellOffers.map((o) => (
                  <tr key={o.offer_id}>
                    <td>{o.source_name}</td><td>{o.seller_name}</td><td className="num">{fmtTL(o.price)}</td>
                    <td><OriginBadge origin={o.origin} /></td><td className="small">{fmtDate(o.observed_at)}</td>
                    <td>{o.source_url.startsWith("http") && <a href={o.source_url} target="_blank" rel="noreferrer">↗</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      <div className="card">
        <h2>Kâr hesaplayıcı</h2>
        <ProfitCalculator
          kdvRate={product.kdv_rate} settings={settings} channels={channels} fulfillment={fulfillment}
          defaultPurchase={r.bestBuy?.price ?? null} defaultPurchaseShipping={r.bestBuy?.shippingFee ?? null}
          defaultSaleByChannel={defaultSaleByChannel}
        />
      </div>

      <div className="card">
        <h2>Fiyat geçmişi</h2>
        <PriceChart series={[...seriesMap.values()]} />
      </div>

      <div className="card" id="fiyat-gir">
        <h2>Fiyat gözlemi ekle (elle)</h2>
        <PriceEntryForm productId={id} sources={sources} defaultSource={kaynak} />
      </div>
    </>
  );
}
