import { getChannelRows, getFulfillmentMethods, getSettingsRow } from "@/lib/db/queries";
import { updateChannel, updateFulfillment, updateSettings } from "@/app/actions";

export const dynamic = "force-dynamic";

const pct = (n: number) => +(n * 100).toFixed(4);

export default async function Settings() {
  const [channels, s, fms] = await Promise.all([getChannelRows(), getSettingsRow(), getFulfillmentMethods()]);
  return (
    <>
      <h1>Maliyet ayarları</h1>
      <p className="sub">Kâr hesabının tüm parametreleri. Oranlar yüzde (%) olarak girilir. Tutarlar KDV hariçtir.</p>

      <div className="card tablewrap">
        <h2>Satış kanalları</h2>
        {channels.some((c) => !c.params_verified) && (
          <div className="banner warn">Bazı kanalların oranları <b>varsayım</b>. Satıcı panelinizdeki güncel komisyon, hizmet bedeli ve kargo anlaşmanızı girip “doğrulandı” işaretleyin.</div>
        )}
        <table>
          <thead><tr>
            <th>Kanal</th><th>Komisyon %</th><th>Ödeme/POS %</th><th>Sabit ücret ₺</th><th>Müşteriye kargo ₺</th>
            <th>İade oranı %</th><th>Stopaj %</th><th>Doğrulandı</th><th></th>
          </tr></thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b><div className="small muted">{c.notes}</div></td>
                <td colSpan={8}>
                  <form action={updateChannel} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="commission_rate" defaultValue={pct(c.commission_rate)} size={5} />
                    <input name="payment_fee_rate" defaultValue={pct(c.payment_fee_rate)} size={5} />
                    <input name="fixed_fee_net" defaultValue={c.fixed_fee_net} size={6} />
                    <input name="outbound_shipping_net" defaultValue={c.outbound_shipping_net} size={6} />
                    <input name="return_rate" defaultValue={pct(c.return_rate)} size={5} />
                    <input name="withholding_rate" defaultValue={pct(c.withholding_rate)} size={4} />
                    <input type="checkbox" name="params_verified" defaultChecked={c.params_verified} />
                    <button className="ghost">Kaydet</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">Kategoriye özel komisyonlar <code>channel_category_commissions</code> tablosunda tutulur (ekranı sonraki aşamada).</p>
      </div>

      <div className="card">
        <h2>Genel maliyetler ve eşikler</h2>
        <form action={updateSettings}>
          <div className="form">
            <label>Depoya ek taşıma (₺/adet)<input name="inbound_shipping_net" defaultValue={s.inbound_shipping_net} /></label>
            <label>Ambalaj/elleçleme (₺/adet)<input name="handling_net" defaultValue={s.handling_net} /></label>
            <label>Yıllık sermaye maliyeti %<input name="annual_capital_cost_rate" defaultValue={pct(s.annual_capital_cost_rate)} /></label>
            <label>Ortalama stokta kalma (gün)<input name="avg_days_in_stock" defaultValue={s.avg_days_in_stock} /></label>
            <label>Depolama (₺/adet/ay)<input name="storage_cost_month_net" defaultValue={s.storage_cost_month_net} /></label>
            <label>İadede değer kaybı %<input name="return_loss_rate" defaultValue={pct(s.return_loss_rate)} /></label>
            <label>Fiyat geçerlilik süresi (saat)<input name="max_price_age_hours" defaultValue={s.max_price_age_hours} /></label>
            <label>Fırsat için min. net kâr (₺)<input name="min_profit_net" defaultValue={s.min_profit_net} /></label>
            <label>Fırsat için min. marj %<input name="min_margin" defaultValue={pct(s.min_margin)} /></label>
          </div>
          <button style={{ marginTop: 10 }}>Kaydet</button>
        </form>
      </div>

      <div className="card">
        <h2>Teslimat yöntemleri (perakende)</h2>
        <table>
          <thead><tr><th>Yöntem</th><th>Sabit maliyet ₺ / km maliyeti ₺</th></tr></thead>
          <tbody>
            {fms.map((f) => (
              <tr key={f.id}>
                <td><b>{f.name}</b><div className="small muted">{f.notes}</div></td>
                <td>
                  <form action={updateFulfillment} className="inline">
                    <input type="hidden" name="id" value={f.id} />
                    <input name="cost_net" defaultValue={f.cost_net} size={6} />
                    <input name="cost_per_km" defaultValue={f.cost_per_km} size={6} />
                    <button className="ghost">Kaydet</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
