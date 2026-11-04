import Link from "next/link";
import { getCategories, getLatestOffers, getSettings, getSources, listProducts } from "@/lib/db/queries";
import { buildSearchUrl, CELL_LABEL, cellStatus, priorityScore, type CellStatus } from "@/lib/domain/checks";
import { displayGtin } from "@/lib/domain/identifiers";
import { fmtTL } from "@/lib/format";

export const dynamic = "force-dynamic";

const MARKETPLACES = ["trendyol", "hepsiburada", "amazon_tr", "n11", "pazarama", "pttavm"];
const CELL_CLASS: Record<CellStatus, string> = {
  missing: "", stale: "b-warn", usak_unverified: "b-warn", restricted: "b-bad", ok: "b-ok",
};

type SP = { kapsam?: string; kategori?: string; sadece?: string };

export default async function CheckMatrix({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [products, sources, offers, settings, categories] = await Promise.all([
    listProducts({ category: sp.kategori }), getSources(), getLatestOffers(), getSettings(), getCategories(),
  ]);
  const cols = sources.filter((s) =>
    s.search_url_template && (sp.kapsam === "tum" ? s.can_buy : MARKETPLACES.includes(s.id)),
  );
  cols.sort((a, b) => {
    const ia = MARKETPLACES.indexOf(a.id), ib = MARKETPLACES.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const now = new Date();

  // ürün × kaynak → en güncel alış gözlemi
  const latest = new Map<string, (typeof offers)[number]>();
  for (const o of offers) {
    if (o.side !== "buy") continue;
    const k = `${o.product_id}:${o.source_id}`;
    const cur = latest.get(k);
    // test verisi yerine gerçek gözlem tercih edilir
    const better = !cur || (cur.origin === "test_fixture" && o.origin !== "test_fixture") ||
      (cur.origin === o.origin && new Date(o.observed_at) > new Date(cur.observed_at));
    if (better) latest.set(k, o);
  }

  let rows = products.filter((p) => p.is_active).map((p) => {
    const cells = cols.map((s) => {
      const o = latest.get(`${p.id}:${s.id}`) ?? null;
      const status = cellStatus(
        o && { observedAt: new Date(o.observed_at), delivery: o.delivery, isTest: o.origin === "test_fixture" },
        now, settings.maxPriceAgeHours,
      );
      return { source: s, obs: o && o.origin !== "test_fixture" ? o : null, status };
    });
    return { p, cells, score: priorityScore(cells.map((c) => c.status)) };
  });
  if (sp.sadece === "eksik") rows = rows.filter((r) => r.cells.some((c) => c.status !== "ok" && c.status !== "restricted"));
  rows.sort((a, b) => b.score - a.score || a.p.brand.localeCompare(b.p.brand, "tr"));

  const total = rows.length * cols.length;
  const done = rows.reduce((a, r) => a + r.cells.filter((c) => c.status === "ok" || c.status === "restricted").length, 0);

  return (
    <>
      <h1>Pazaryeri kontrol listesi</h1>
      <p className="sub">
        Pazaryerlerinin API bağlantısı olmadan fiyatları siz kontrol edersiniz; bu ekran neyi, nerede kontrol edeceğinizi
        sıralar ve doğrudan arama sayfasını açar. Tamamlanan: <b>{done}/{total}</b> hücre.
      </p>

      <details className="card">
        <summary>Nasıl kullanılır?</summary>
        <ol className="small">
          <li><b>EAN</b> veya <b>Model</b> bağlantısına tıklayın — pazaryerinin arama sonucu yeni sekmede açılır.</li>
          <li>Aynı modeli (model kodu birebir aynı, <b>sıfır</b>, resmî distribütör garantili) bulun; en düşük fiyatlı satıcıyı açın.</li>
          <li>Teslimat adresi/il olarak <b>Uşak (64100)</b> seçin; ürün sayfasında ve sepette teslimat/kargo bilgisini kontrol edin.
            “Bölgenize gönderim yok” uyarısı varsa <i>Gönderim yok</i> işaretleyin.</li>
          <li><b>+ Gir</b> ile ürün sayfasındaki forma geçin: ürün bağlantısını yapıştırın, fiyatı girin. Pazaryeri fiyatları için
            taraf olarak <i>Alış + rakip satış fiyatı</i> seçin — aynı fiyat hem alış seçeneği hem o pazaryerinde satarken rakibiniz olur.</li>
        </ol>
        <p className="small muted">Bu ekran yalnızca bağlantı açar; pazaryerlerine otomatik istek gönderilmez, satın alma yapılmaz.</p>
      </details>

      <form className="filters">
        <label>Kaynaklar
          <select name="kapsam" defaultValue={sp.kapsam ?? ""}>
            <option value="">6 pazaryeri</option>
            <option value="tum">Pazaryeri + teknoloji mağazaları + marka mağazaları</option>
          </select>
        </label>
        <label>Kategori
          <select name="kategori" defaultValue={sp.kategori ?? ""}>
            <option value="">Tümü</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label>Göster
          <select name="sadece" defaultValue={sp.sadece ?? ""}>
            <option value="">Tüm ürünler</option>
            <option value="eksik">Yalnızca kontrol bekleyenler</option>
          </select>
        </label>
        <button>Uygula</button>
      </form>

      <div className="card tablewrap">
        {rows.length === 0 ? <p className="muted">Katalogda ürün yok. Önce <Link href="/urunler">Katalog</Link> ekranından ürün ekleyin.</p> : (
          <table>
            <thead>
              <tr><th>Ürün</th>{cols.map((s) => <th key={s.id}>{s.name}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(({ p, cells }) => {
                const ean = p.gtin ? displayGtin(p.gtin) : null;
                const model = `${p.brand} ${p.model_code}`;
                return (
                  <tr key={p.id}>
                    <td style={{ minWidth: 170 }}>
                      <Link href={`/urunler/${p.id}`}><b>{p.brand} {p.model_code}</b></Link>
                      <div className="small muted">{p.category_name} · EAN {ean ?? "yok"}</div>
                    </td>
                    {cells.map(({ source, obs, status }) => {
                      const eanUrl = buildSearchUrl(source.search_url_template, ean);
                      const modelUrl = buildSearchUrl(source.search_url_template, model);
                      return (
                        <td key={source.id} style={{ minWidth: 120 }}>
                          <span className={`badge ${CELL_CLASS[status]}`}>{CELL_LABEL[status]}</span>
                          {obs && <div className="small"><b>{fmtTL(obs.price)}</b></div>}
                          <div className="small" style={{ display: "flex", gap: 8, marginTop: 3 }}>
                            {eanUrl && <a href={eanUrl} target="_blank" rel="noreferrer">EAN↗</a>}
                            {modelUrl && <a href={modelUrl} target="_blank" rel="noreferrer">Model↗</a>}
                            <Link href={`/urunler/${p.id}?kaynak=${source.id}#fiyat-gir`}>+ Gir</Link>
                          </div>
                        </td>
                      );
                    })}
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
