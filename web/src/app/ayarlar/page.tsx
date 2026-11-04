import { getCategories, getCategoryCommissions, getChannelRows, getFulfillmentMethods, getSettingsRow } from "@/lib/db/queries";
import { setCategoryCommission, updateChannel, updateFulfillment, updateSettings } from "@/app/actions";

export const dynamic = "force-dynamic";

const pct = (n: number) => +(n * 100).toFixed(4);

export default async function Settings() {
  const [channels, s, fms, categories, catComm] = await Promise.all([
    getChannelRows(), getSettingsRow(), getFulfillmentMethods(), getCategories(), getCategoryCommissions(),
  ]);
  const marketplaces = channels.filter((c) => c.kind === "marketplace");
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
            <th>Kanal</th><th>Komisyon %</th><th>Komisyon tabanı</th><th>Ödeme/POS %</th><th>Sabit ücret ₺</th><th>Müşteriye kargo ₺</th>
            <th>İade oranı %</th><th>Stopaj %</th><th>Doğrulandı</th><th></th>
          </tr></thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id}>
                <td style={{ maxWidth: 320 }}><b>{c.name}</b>{c.params_verified ? <span className="badge b-ok" style={{ marginLeft: 6 }}>doğrulandı</span> : <span className="badge b-warn" style={{ marginLeft: 6 }}>teyit edilmedi</span>}<div className="small muted">{c.params_source ?? c.notes}</div></td>
                <td colSpan={9}>
                  <form action={updateChannel} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="commission_rate" defaultValue={pct(c.commission_rate)} size={5} />
                    <select name="commission_base" defaultValue={c.commission_base}>
                      <option value="gross">KDV dahil fiyat</option><option value="net">KDV hariç fiyat</option>
                    </select>
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
      </div>

      <div className="card tablewrap">
        <h2>Kategori bazlı komisyon (%)</h2>
        <p className="small muted">
          Boş = kanalın genel oranı kullanılır. Pazaryerleri beyaz eşya alt kategorilerinde (buzdolabı, çamaşır makinesi vb.)
          farklı oran uygulayabilir; satıcı panelinizdeki oranı girip Enter'a basın. Silmek için alanı boşaltıp kaydedin.
        </p>
        <table>
          <thead><tr><th>Kategori</th>{marketplaces.map((c) => <th key={c.id}>{c.name}<div className="small muted">genel %{pct(c.commission_rate)}</div></th>)}</tr></thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id}>
                <td>{cat.name}</td>
                {marketplaces.map((c) => {
                  const o = catComm.find((x) => x.channel_id === c.id && x.category_id === cat.id);
                  return (
                    <td key={c.id}>
                      <form action={setCategoryCommission} className="inline">
                        <input type="hidden" name="channel_id" value={c.id} />
                        <input type="hidden" name="category_id" value={cat.id} />
                        <input name="commission_rate" defaultValue={o ? pct(o.commission_rate) : ""} size={4} placeholder="—" aria-label={`${c.name} ${cat.name}`} />
                      </form>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
