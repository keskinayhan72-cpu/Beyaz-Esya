import Link from "next/link";
import { getDashboardStats, getSources, evaluateAll } from "@/lib/db/queries";
import { fmtDate, fmtTL } from "@/lib/format";
import { StatusBadge, TestDataBanner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [stats, sources, evals] = await Promise.all([getDashboardStats(), getSources(), evaluateAll()]);
  const opps = evals.filter((e) => e.result.isOpportunity);
  const counts = { eligible: 0, needs_verification: 0, excluded: 0, no_buy_offer: 0 };
  for (const e of evals) counts[e.result.status]++;
  const notConnected = sources.filter((s) => s.integration_status === "not_connected");

  return (
    <>
      <h1>Panel</h1>
      <p className="sub">Pilot hedefi: 300 model · 5 kaynak → 15–20 kaynak</p>
      <TestDataBanner show={stats.test_observations > 0} />
      {stats.connected_sources === 0 && (
        <div className="banner warn">
          <b>Henüz canlı veri bağlantısı olan kaynak yok.</b> Fiyatlar şu an yalnızca elle giriş ve CSV içe aktarma ile
          gelir. {notConnected.length} kaynak “bağlı değil” durumunda — ayrıntı için <Link href="/kaynaklar">Kaynaklar</Link>.
        </div>
      )}
      <div className="grid">
        <Stat v={stats.products} l="Katalogdaki model" />
        <Stat v={stats.matched_offers} l="Eşleşmiş ilan" />
        <Stat v={stats.unmatched_offers} l="Eşleşmeyen ilan (inceleme)" />
        <Stat v={stats.observations} l={`Fiyat gözlemi (${stats.test_observations} test)`} />
        <Stat v={`${stats.connected_sources}/${stats.sources}`} l="Canlı/sandbox bağlı kaynak" />
        <Stat v={fmtDate(stats.last_real_observation)} l="Son gerçek fiyat gözlemi" />
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Ürün durumu</h2>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span><StatusBadge status="eligible" /> {counts.eligible}</span>
          <span><StatusBadge status="needs_verification" /> {counts.needs_verification}</span>
          <span><StatusBadge status="excluded" /> {counts.excluded}</span>
          <span><StatusBadge status="no_buy_offer" /> {counts.no_buy_offer}</span>
        </div>
      </div>
      <div className="card">
        <h2>Onaylı fırsatlar ({opps.length})</h2>
        {opps.length === 0 ? (
          <p className="muted">
            Şu an tüm kontrolleri (Uşak teslimatı doğrulanmış, stokta, faturalı, resmî garantili, güncel fiyat, minimum kâr)
            geçen fırsat yok.
          </p>
        ) : (
          <table>
            <tbody>
              {opps.slice(0, 10).map((e) => (
                <tr key={e.product.id}>
                  <td><Link href={`/urunler/${e.product.id}`}>{e.product.brand} {e.product.model_code}</Link></td>
                  <td>{e.result.best?.channel.name}</td>
                  <td className="num pos">{fmtTL(e.result.best?.profit.netProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({ v, l }: { v: string | number; l: string }) {
  return (
    <div className="card stat" style={{ margin: 0 }}>
      <div className="v">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}
