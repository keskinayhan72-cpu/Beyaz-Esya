"use client";

import { useActionState, useState } from "react";
import { addPriceObservation, createProduct, importProductsCsv, type ActionState } from "@/app/actions";

type Counted = ActionState & { n?: number };

/** Her gönderimde sayaç artar; form `key` ile yeniden kurulur ve select'ler dahil girilen değerler korunur. */
function useCountedAction(fn: (s: ActionState, f: FormData) => Promise<ActionState>) {
  return useActionState(async (prev: Counted | null, f: FormData): Promise<Counted | null> => {
    const r = await fn(prev, f);
    return r ? { ...r, n: (prev?.n ?? 0) + 1 } : r;
  }, null);
}

function Msg({ s }: { s: ActionState }) {
  if (!s) return null;
  return (
    <div className={s.ok ? "msg-ok" : "msg-bad"} style={{ marginTop: 8 }}>
      {s.message}
      {s.errors && s.errors.length > 0 && (
        <ul className="small">{s.errors.slice(0, 50).map((e) => <li key={e}>{e}</li>)}</ul>
      )}
    </div>
  );
}

export function ProductForm({ categories }: { categories: { slug: string; name: string }[] }) {
  const [state, action, pending] = useCountedAction(createProduct);
  const v = (k: string) => (state?.values?.[k] ?? undefined);
  return (
    <form action={action} key={state?.n ?? 0}>
      <div className="form">
        <label>Marka *<input name="brand" defaultValue={v("brand")} required /></label>
        <label>Model kodu *<input name="model_code" defaultValue={v("model_code")} required placeholder="Tam model kodu" /></label>
        <label>EAN / GTIN<input name="gtin" defaultValue={v("gtin")} inputMode="numeric" placeholder="13 hane" /></label>
        <label>Kategori *
          <select name="category" defaultValue={v("category")} required>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
        </label>
        <label>Enerji sınıfı<input name="energy_class" defaultValue={v("energy_class")} /></label>
        <label style={{ gridColumn: "1 / -1" }}>Ürün adı *<input name="name" defaultValue={v("name")} required /></label>
      </div>
      <button disabled={pending} style={{ marginTop: 10 }}>Kaydet</button>
      <Msg s={state} />
    </form>
  );
}

export function CsvImportForm() {
  const [state, action, pending] = useActionState(importProductsCsv, null);
  return (
    <form action={action}>
      <p className="small muted">
        Sütunlar: <code>brand;model_code;gtin;name;category;energy_class</code> (ayırıcı ; veya ,). Kategori: slug veya ad.
        Aynı marka + model kodu varsa güncellenir. GTIN kontrol hanesi doğrulanır.
      </p>
      <label>CSV dosyası<input type="file" name="file" accept=".csv,text/csv" /></label>
      <label style={{ marginTop: 8 }}>veya yapıştırın<textarea name="csv" rows={5} placeholder="brand;model_code;gtin;name;category" /></label>
      <button disabled={pending} style={{ marginTop: 10 }}>İçe aktar</button>
      <Msg s={state} />
    </form>
  );
}

type SourceOpt = { id: string; name: string; can_buy: boolean; can_sell: boolean; usak_check_hint: string | null };

export function PriceEntryForm({
  productId, sources, defaultSource,
}: { productId: number; sources: SourceOpt[]; defaultSource?: string }) {
  const [state, action, pending] = useCountedAction(addPriceObservation);
  const v = (k: string) => (state?.values?.[k] ?? undefined);
  const isMarketplace = (id?: string) => !!sources.find((x) => x.id === id && x.can_buy && x.can_sell);
  const [sel, setSel] = useState(v("source_id") ?? defaultSource ?? sources[0]?.id);
  const hint = sources.find((x) => x.id === sel)?.usak_check_hint;
  return (
    <form action={action} key={state?.n ?? 0}>
      <input type="hidden" name="product_id" value={productId} />
      <p className="small muted">
        Kaydedilen fiyat “Elle giriş” kökenli olarak saklanır. Yalnızca kendiniz gördüğünüz/teyit ettiğiniz gerçek
        fiyatları girin. Uşak teslimatını “doğrulandı” işaretlemek için doğrulama yöntemini yazmanız gerekir.
      </p>
      <div className="form">
        <label>Taraf
          <select name="side" defaultValue={v("side") ?? (isMarketplace(defaultSource) ? "both" : "buy")}>
            <option value="both">Alış + rakip satış fiyatı (pazaryeri)</option>
            <option value="buy">Yalnızca alış (tedarik)</option>
            <option value="sell">Yalnızca satış (rakip/kanal fiyatı)</option>
          </select>
        </label>
        <label>Kaynak
          <select name="source_id" defaultValue={v("source_id") ?? defaultSource} onChange={(e) => setSel(e.target.value)}>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label style={{ gridColumn: "span 2" }}>Ürün bağlantısı (URL)<input name="source_url" defaultValue={v("source_url")} type="url" placeholder="https://..." /></label>
        <label>Satıcı<input name="seller_name" defaultValue={v("seller_name")} /></label>
        <label>Fiyat (KDV dahil, ₺) *<input name="price" defaultValue={v("price")} required inputMode="decimal" /></label>
        <label>Kargo ücreti (₺, boş = bilinmiyor)<input name="shipping_fee" defaultValue={v("shipping_fee")} inputMode="decimal" /></label>
        <label>Gözlem zamanı<input name="observed_at" defaultValue={v("observed_at")} type="datetime-local" /></label>
        <label>Stok
          <select name="in_stock" defaultValue={v("in_stock")}><option value="">Bilinmiyor</option><option value="true">Stokta</option><option value="false">Stokta yok</option></select>
        </label>
        <label>Ürün durumu
          <select name="condition" defaultValue={v("condition")}><option value="unknown">Bilinmiyor</option><option value="new">Sıfır</option><option value="refurbished">Yenilenmiş</option><option value="used">İkinci el</option></select>
        </label>
        <label>Fatura
          <select name="invoice" defaultValue={v("invoice")}><option value="unknown">Bilinmiyor</option><option value="e_fatura">e-Fatura (kurumsal)</option><option value="e_arsiv">e-Arşiv</option><option value="paper">Kâğıt</option><option value="none">Fatura yok</option></select>
        </label>
        <label>Garanti
          <select name="warranty" defaultValue={v("warranty")}><option value="unknown">Bilinmiyor</option><option value="official_tr">Resmî distribütör (TR)</option><option value="importer">İthalatçı</option><option value="seller">Satıcı garantisi</option><option value="none">Garantisiz</option></select>
        </label>
        <label>Garanti (ay)<input name="warranty_months" defaultValue={v("warranty_months")} inputMode="numeric" /></label>
        <label>Uşak teslimatı
          <select name="delivery" defaultValue={v("delivery")}><option value="not_verified">Doğrulanmadı</option><option value="verified">Doğrulandı</option><option value="restricted">Gönderim yok / kısıtlı</option></select>
        </label>
        {hint && <p className="small" style={{ gridColumn: "1 / -1", margin: 0, color: "var(--warn)" }}>Uşak kontrolü: {hint}</p>}
        <label style={{ gridColumn: "span 2" }}>Nasıl doğrulandı<input name="delivery_method_note" defaultValue={v("delivery_method_note")} placeholder="Ör: sepette 64100 posta koduyla teslimat göründü" /></label>
        <label>Teslim süresi (gün)<input name="delivery_days" defaultValue={v("delivery_days")} inputMode="numeric" /></label>
        <label style={{ gridColumn: "span 2" }}>Bölgesel kısıt notu<input name="regional_restriction" defaultValue={v("regional_restriction")} placeholder="Boş bırakın; varsa ürün elenir" /></label>
      </div>
      <button disabled={pending} style={{ marginTop: 10 }}>Fiyatı kaydet</button>
      <Msg s={state} />
    </form>
  );
}
