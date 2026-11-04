import Link from "next/link";
import { evaluateAll, getCategories } from "@/lib/db/queries";
import { fmtPct, fmtTL } from "@/lib/format";
import { StatusBadge, TestDataBanner } from "@/components/ui";

export const dynamic = "force-dynamic";

type SP = { durum?: string; kategori?: string; sirala?: string; kar?: string };

export default async function Opportunities({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const durum = sp.durum ?? "usak_dogrulanmis";
  const sirala = sp.sirala ?? "aylik";
  const minKar = Number(sp.kar ?? "") || null;
  const [all, categories] = await Promise.all([evaluateAll(), getCategories()]);

  let rows = all.filter((e) => e.result.best); // satış fiyatı ve elenmemiş alış teklifi olanlar
  if (durum === "usak_dogrulanmis") rows = rows.filter((e) => e.result.status === "eligible");
  else if (durum === "firsat") rows = rows.filter((e) => e.result.isOpportunity);
  if (sp.kategori) {
    const cat = categories.find((c) => c.slug === sp.kategori);
    rows = rows.filter((e) => e.product.category_id === cat?.id);
  }
  if (minKar !== null) rows = rows.filter((e) => e.result.best!.profit.netProfit >= minKar);

  const key = (e: (typeof rows)[number]) => {
    const b = e.result.best!;
    switch (sirala) {
      case "birim": return b.profit.netProfit;
      case "marj": return b.profit.margin;
      case "roi": return b.profit.roi;
      default: return b.monthlyProfit ?? Number.NEGATIVE_INFINITY; // satış hızı bilinmeyenler sona
    }
  };
  rows.sort((a, b) => key(b) - key(a) || b.result.best!.profit.netProfit - a.result.best!.profit.netProfit);

  const hidden = all.filter((e) => e.result.status === "excluded").length;
  const pendingCount = all.filter((e) => e.result.best && e.result.status === "needs_verification").length;
  const hasTest = rows.some((e) => e.result.bestBuy?.origin === "test_fixture" || e.result.best?.saleIsTest);

  return (
    <>
      <h1>Fırsat sıralaması</h1>
      <p className="sub">
        Her ürün için en uygun alış teklifi × en kârlı satış kanalı. “FIRSAT” etiketi yalnızca Uşak teslimatı doğrulanmış,
        stokta, faturalı, resmî garantili, güncel ve eşik üstü kârlı tekliflere verilir.
      </p>
      <TestDataBanner show={hasTest} />

      <form className="filters">
        <label>Bölgesel filtre / durum
          <select name="durum" defaultValue={durum}>
            <option value="usak_dogrulanmis">Yalnızca Uşak teslimatı doğrulanmış (uygun)</option>
            <option value="firsat">Yalnızca FIRSAT etiketli</option>
            <option value="hepsi">Doğrulama bekleyenler dahil</option>
          </select>
        </label>
        <label>Kategori
          <select name="kategori" defaultValue={sp.kategori ?? ""}>
            <option value="">Tümü</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label>Sırala
          <select name="sirala" defaultValue={sirala}>
            <option value="aylik">Tahmini aylık kâr (kâr × satış hızı)</option>
            <option value="birim">Birim net kâr</option>
            <option value="marj">Marj</option>
            <option value="roi">ROI</option>
          </select>
        </label>
        <label>Min. birim kâr (₺)<input name="kar" defaultValue={sp.kar} size={8} /></label>
        <button>Uygula</button>
      </form>
      <p className="small muted">
        Elenen (Uşak'a gönderim yok, stok yok, garantisiz vb.) {hidden} ürün gösterilmiyor.
        {durum === "usak_dogrulanmis" && pendingCount > 0 && <> Doğrulama bekleyen {pendingCount} ürün gizli — “Doğrulama bekleyenler dahil” seçin.</>}
      </p>

      <div className="card tablewrap">
        {rows.length === 0 ? <p className="muted">Bu filtrelerle sonuç yok.</p> : (
          <table>
            <thead><tr>
              <th>#</th><th>Ürün</th><th>Durum</th><th className="num">Alış</th><th>Alış kaynağı</th><th>En iyi kanal</th>
              <th className="num">Satış</th><th className="num">Net kâr</th><th className="num">Marj</th><th className="num">ROI</th>
              <th className="num">Adet/ay</th><th className="num">Aylık kâr</th><th>Uyarılar</th>
            </tr></thead>
            <tbody>
              {rows.map((e, i) => {
                const b = e.result.best!, buy = e.result.bestBuy!;
                return (
                  <tr key={e.product.id}>
                    <td>{i + 1}</td>
                    <td><Link href={`/urunler/${e.product.id}`}><b>{e.product.brand} {e.product.model_code}</b></Link><div className="small muted">{e.product.category_name}</div></td>
                    <td><StatusBadge status={e.result.status} /> {e.result.isOpportunity && <span className="badge b-ok">FIRSAT</span>}</td>
                    <td className="num">{fmtTL(buy.price)} {buy.origin === "test_fixture" && <span className="badge b-test">TEST</span>}</td>
                    <td>{buy.sourceUrl.startsWith("http") ? <a href={buy.sourceUrl} target="_blank" rel="noreferrer">{buy.sourceId} ↗</a> : buy.sourceId}</td>
                    <td>{b.channel.name}</td>
                    <td className="num">{fmtTL(b.saleGross)}</td>
                    <td className={`num ${b.profit.netProfit >= 0 ? "pos" : "neg"}`}><b>{fmtTL(b.profit.netProfit)}</b></td>
                    <td className="num">{fmtPct(b.profit.margin)}</td>
                    <td className="num">{fmtPct(b.profit.roi)}</td>
                    <td className="num">{b.unitsPerMonth ?? "?"}</td>
                    <td className="num">{fmtTL(b.monthlyProfit)}</td>
                    <td><ul className="reasons">{[...buy.eligibility.pendingChecks, ...e.result.warnings].map((w) => <li key={w}>{w}</li>)}</ul></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
