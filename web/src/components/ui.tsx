import type { EligibilityStatus } from "@/lib/domain/eligibility";
import { STATUS_LABEL } from "@/lib/domain/eligibility";

export function StatusBadge({ status }: { status: EligibilityStatus | "no_buy_offer" }) {
  if (status === "no_buy_offer") return <span className="badge">Fiyat verisi yok</span>;
  const cls = status === "eligible" ? "b-ok" : status === "needs_verification" ? "b-warn" : "b-bad";
  return <span className={`badge ${cls}`}>{STATUS_LABEL[status]}</span>;
}

const ORIGIN_LABEL: Record<string, string> = {
  official_api: "Resmî API",
  licensed_feed: "Lisanslı feed",
  permitted_crawl: "İzinli tarama",
  manual_entry: "Elle giriş",
  test_fixture: "TEST VERİSİ",
};

export function OriginBadge({ origin }: { origin: string }) {
  return <span className={`badge ${origin === "test_fixture" ? "b-test" : ""}`}>{ORIGIN_LABEL[origin] ?? origin}</span>;
}

const DELIVERY: Record<string, [string, string]> = {
  verified: ["Uşak ✓", "b-ok"],
  not_verified: ["Uşak ?", "b-warn"],
  restricted: ["Uşak ✗", "b-bad"],
};
export function DeliveryBadge({ d }: { d: string }) {
  const [l, c] = DELIVERY[d] ?? [d, ""];
  return <span className={`badge ${c}`}>{l}</span>;
}

export function TestDataBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="banner test">
      <b>Bu ekranda TEST VERİSİ var.</b> Mor “TEST VERİSİ” etiketli fiyatlar hayalî ürünler için üretilmiş
      deneme kayıtlarıdır; gerçek piyasa fiyatı değildir ve hiçbir zaman fırsat olarak işaretlenmez.
    </div>
  );
}

const PALETTE = ["#1f5fbf", "#d1495b", "#2a9d8f", "#e9a03b", "#7b5ea7", "#4f772d", "#c06c84", "#3d5a80"];

/** Basit SVG fiyat geçmişi grafiği (bağımlılıksız). */
export function PriceChart({
  series,
}: {
  series: { label: string; dashed?: boolean; points: { t: number; v: number }[] }[];
}) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return <p className="muted small">Grafik için en az iki fiyat gözlemi gerekli.</p>;
  const W = 760, H = 240, P = { l: 70, r: 12, t: 10, b: 28 };
  const t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t));
  let v0 = Math.min(...all.map((p) => p.v)), v1 = Math.max(...all.map((p) => p.v));
  const pad = (v1 - v0) * 0.08 || v1 * 0.05; v0 -= pad; v1 += pad;
  const x = (t: number) => P.l + ((t - t0) / (t1 - t0 || 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - v0) / (v1 - v0)) * (H - P.t - P.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => v0 + f * (v1 - v0));
  const fmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
  const dfmt = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Istanbul" });
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Fiyat geçmişi">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={P.l - 6} y={y(v) + 4} fontSize={11} textAnchor="end" fill="currentColor" opacity={0.6}>{fmt.format(v)} ₺</text>
          </g>
        ))}
        {[t0, (t0 + t1) / 2, t1].map((t) => (
          <text key={t} x={x(t)} y={H - 8} fontSize={11} textAnchor="middle" fill="currentColor" opacity={0.6}>{dfmt.format(new Date(t))}</text>
        ))}
        {series.map((s, i) => {
          const pts = [...s.points].sort((a, b) => a.t - b.t);
          const c = PALETTE[i % PALETTE.length];
          return (
            <g key={s.label}>
              <polyline fill="none" stroke={c} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined}
                points={pts.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")} />
              {pts.map((p) => <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={2.5} fill={c} />)}
            </g>
          );
        })}
      </svg>
      <div className="small" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {series.map((s, i) => (
          <span key={s.label}>
            <span style={{ display: "inline-block", width: 12, height: 3, background: PALETTE[i % PALETTE.length], verticalAlign: "middle", marginRight: 4 }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
