import { getSources } from "@/lib/db/queries";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS: Record<string, [string, string]> = {
  not_connected: ["Bağlı değil", "b-bad"],
  credentials_pending: ["Erişim/anahtar bekleniyor", "b-warn"],
  manual_only: ["Yalnızca elle / CSV", "b-warn"],
  sandbox: ["Sandbox", "b-ok"],
  live: ["Canlı", "b-ok"],
};
const METHOD: Record<string, string> = {
  official_api: "Resmî API", licensed_feed: "Lisanslı feed", permitted_crawl: "İzinli tarama", manual: "Elle", none: "—",
};

export default async function Sources() {
  const sources = await getSources();
  return (
    <>
      <h1>Veri kaynakları</h1>
      <p className="sub">
        Her kaynağın gerçek bağlantı durumu. “Bağlı değil” olan kaynaktan hiçbir fiyat otomatik toplanmaz.
        CAPTCHA veya erişim kontrolü aşılmaz; tarama yalnızca robots.txt ve kullanım koşulları izin verirse yapılır.
      </p>
      <div className="card tablewrap">
        <table>
          <thead>
            <tr><th>Kaynak</th><th>Rol</th><th>Durum</th><th>Erişim yolu</th><th>Son başarılı</th><th>Not / gereken</th></tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const [l, c] = STATUS[s.integration_status] ?? [s.integration_status, ""];
              return (
                <tr key={s.id}>
                  <td><b>{s.name}</b><div className="small muted">{s.id}</div></td>
                  <td className="small">{[s.can_buy && "alış", s.can_sell && "satış"].filter(Boolean).join(" + ")}</td>
                  <td><span className={`badge ${c}`}>{l}</span></td>
                  <td className="small">{METHOD[s.access_method]}</td>
                  <td className="small">{fmtDate(s.last_success_at)}</td>
                  <td className="small" style={{ maxWidth: 520 }}>
                    {s.access_notes}
                    {s.last_error && <div className="neg">Son hata: {s.last_error}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
