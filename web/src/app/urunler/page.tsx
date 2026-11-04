import Link from "next/link";
import { getCategories, getUnmatchedOffers, listProducts } from "@/lib/db/queries";
import { displayGtin } from "@/lib/domain/identifiers";
import { fmtTL } from "@/lib/format";
import { CsvImportForm, ProductForm } from "@/components/forms";

export const dynamic = "force-dynamic";

export default async function Catalog({ searchParams }: { searchParams: Promise<{ q?: string; kategori?: string }> }) {
  const sp = await searchParams;
  const [products, categories, unmatched] = await Promise.all([
    listProducts({ q: sp.q, category: sp.kategori }),
    getCategories(),
    getUnmatchedOffers(),
  ]);
  return (
    <>
      <h1>Ürün kataloğu</h1>
      <p className="sub">Eşleştirme anahtarı: EAN/GTIN, yoksa marka + tam model kodu. Benzer ama farklı model kodları otomatik eşleşmez.</p>

      <form className="filters">
        <label>Ara<input name="q" defaultValue={sp.q} placeholder="Marka, model, EAN" /></label>
        <label>Kategori
          <select name="kategori" defaultValue={sp.kategori ?? ""}>
            <option value="">Tümü</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <button>Filtrele</button>
      </form>

      <div className="card tablewrap">
        <h2>{products.length} model</h2>
        {products.length === 0 ? (
          <p className="muted">Katalog boş. Aşağıdan ürün ekleyin veya CSV içe aktarın.</p>
        ) : (
          <table>
            <thead><tr><th>Marka</th><th>Model kodu</th><th>Ad</th><th>Kategori</th><th>EAN</th><th className="num">Alış teklifi</th><th className="num">En düşük alış (ham)</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.brand}</td>
                  <td><Link href={`/urunler/${p.id}`}><b>{p.model_code}</b></Link></td>
                  <td>{p.name}</td>
                  <td>{p.category_name}</td>
                  <td className="small">{displayGtin(p.gtin)}</td>
                  <td className="num">{p.buy_offers}</td>
                  <td className="num">
                    {fmtTL(p.min_buy)} {p.has_test && <span className="badge b-test">TEST</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="two">
        <div className="card"><h2>Ürün ekle</h2><ProductForm categories={categories} /></div>
        <div className="card"><h2>CSV ile toplu içe aktar</h2><CsvImportForm /></div>
      </div>

      {unmatched.length > 0 && (
        <div className="card tablewrap">
          <h2>Eşleşmeyen ilanlar ({unmatched.length})</h2>
          <p className="small muted">Toplama motorunun katalogla eşleştiremediği ilanlar. GTIN veya model kodunu kataloğa ekleyip motoru yeniden çalıştırın.</p>
          <table>
            <thead><tr><th>Kaynak</th><th>Başlık</th><th>Marka</th><th>Model</th><th>GTIN</th></tr></thead>
            <tbody>
              {unmatched.map((u) => (
                <tr key={u.id}>
                  <td>{u.source_id}</td>
                  <td><a href={u.source_url} target="_blank" rel="noreferrer">{u.title ?? u.source_url}</a></td>
                  <td>{u.brand_raw}</td><td>{u.model_code_raw}</td><td>{u.gtin_raw}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
