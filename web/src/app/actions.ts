"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { recordObservation } from "@/lib/db/observations";
import { upsertProduct } from "@/lib/db/products";
import { parseCsv, parseTrNumber } from "@/lib/format";

export type ActionState = { ok: boolean; message: string; errors?: string[]; values?: Record<string, string> } | null;

/** Form değerlerini geri döndürür (React form sıfırlamasında kullanıcı girdisi kaybolmasın). */
const echo = (f: FormData) =>
  Object.fromEntries([...f.entries()].filter((e): e is [string, string] => typeof e[1] === "string"));

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const num = (f: FormData, k: string) => parseTrNumber(str(f, k));
const rate = (f: FormData, k: string) => {
  const n = num(f, k);
  return n === null ? null : n / 100; // formlarda yüzde olarak girilir
};
const triBool = (f: FormData, k: string): boolean | null =>
  str(f, k) === "true" ? true : str(f, k) === "false" ? false : null;

// ---------------------------------------------------------------------------
// Katalog
// ---------------------------------------------------------------------------
export async function createProduct(_: ActionState, f: FormData): Promise<ActionState> {
  const err = await upsertProduct({
    brand: str(f, "brand"), model_code: str(f, "model_code"), gtin: str(f, "gtin"),
    name: str(f, "name"), category: str(f, "category"), energy_class: str(f, "energy_class"),
  });
  if (err) return { ok: false, message: err, values: echo(f) };
  revalidatePath("/urunler");
  return { ok: true, message: "Ürün kaydedildi" };
}

export async function importProductsCsv(_: ActionState, f: FormData): Promise<ActionState> {
  const file = f.get("file");
  let text = str(f, "csv");
  if (file instanceof File && file.size > 0) text = await file.text();
  if (!text) return { ok: false, message: "CSV içeriği boş" };
  const rows = parseCsv(text);
  const errors: string[] = [];
  let ok = 0;
  for (const [i, r] of rows.entries()) {
    const err = await upsertProduct({
      brand: r.brand ?? r.marka, model_code: r.model_code ?? r.model, gtin: r.gtin ?? r.ean,
      name: r.name ?? r.ad ?? r.urun_adi, category: r.category ?? r.kategori, energy_class: r.energy_class,
    });
    if (err) errors.push(`Satır ${i + 2}: ${err}`);
    else ok++;
  }
  revalidatePath("/urunler");
  return { ok: errors.length === 0, message: `${ok} ürün kaydedildi, ${errors.length} satır hatalı`, errors };
}

// ---------------------------------------------------------------------------
// Fiyat gözlemi (elle giriş) — origin her zaman 'manual_entry'
// ---------------------------------------------------------------------------
export async function addPriceObservation(_: ActionState, f: FormData): Promise<ActionState> {
  const productId = Number(str(f, "product_id"));
  const sourceId = str(f, "source_id");
  const sideRaw = str(f, "side");
  const sides = sideRaw === "both" ? ["buy", "sell"] : sideRaw === "sell" ? ["sell"] : ["buy"];
  const url = str(f, "source_url");
  const price = num(f, "price");
  if (!productId || !sourceId) return { ok: false, message: "Ürün ve kaynak zorunlu", values: echo(f) };
  if (!/^https?:\/\//.test(url) && sourceId !== "manuel" && sourceId !== "usak_magaza")
    return { ok: false, message: "Kaynak bağlantısı (http/https) zorunlu", values: echo(f) };
  if (price === null || price <= 0) return { ok: false, message: "Geçerli bir fiyat girin", values: echo(f) };
  const shipping = str(f, "shipping_fee") === "" ? null : num(f, "shipping_fee");
  const delivery = ["verified", "restricted"].includes(str(f, "delivery")) ? str(f, "delivery") : "not_verified";
  const note = str(f, "delivery_method_note");
  if (delivery === "verified" && !note)
    return { ok: false, message: "Uşak teslimatı 'doğrulandı' ise nasıl doğrulandığını yazın", values: echo(f) };

  const client = await db().connect();
  try {
    await client.query("begin");
    await recordObservation(client, {
      productId, sourceId, sides: sides as ("buy" | "sell")[], url, sellerName: str(f, "seller_name") || null,
      matchMethod: "manual", collectedBy: "web:elle", observedAt: str(f, "observed_at") || null, price,
      shippingFee: shipping, inStock: triBool(f, "in_stock"), delivery: delivery as "verified" | "not_verified" | "restricted",
      deliveryNote: note || null, deliveryDays: num(f, "delivery_days"),
      regionalRestriction: str(f, "regional_restriction") || null, invoice: str(f, "invoice") || "unknown",
      warranty: str(f, "warranty") || "unknown", warrantyMonths: num(f, "warranty_months"),
      condition: str(f, "condition") || "unknown",
    });
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    return { ok: false, message: (e as Error).message, values: echo(f) };
  } finally {
    client.release();
  }
  revalidatePath(`/urunler/${productId}`);
  revalidatePath("/firsatlar");
  revalidatePath("/kontrol");
  return { ok: true, message: sides.length === 2 ? "Alış + rakip satış fiyatı olarak kaydedildi" : "Fiyat gözlemi kaydedildi", values: echo(f) };
}

/** Son gözlemi kopyalayıp teslimat durumunu günceller (geçmiş korunur). */
export async function setDeliveryStatus(f: FormData) {
  const obsId = Number(str(f, "observation_id"));
  const productId = Number(str(f, "product_id"));
  const status = str(f, "delivery");
  const note = str(f, "note");
  if (!["verified", "restricted", "not_verified"].includes(status)) throw new Error("geçersiz durum");
  if (status === "verified" && !note) throw new Error("Doğrulama yöntemi zorunlu");
  await db().query(
    `insert into price_observations (offer_id, observed_at, origin, collected_by, price, currency, shipping_fee, in_stock,
       stock_qty, delivery, delivery_method_note, delivery_days, regional_restriction, invoice, warranty, warranty_months,
       condition, raw)
     select offer_id, observed_at, origin, 'web:teslimat-guncelleme', price, currency, shipping_fee, in_stock, stock_qty,
       $2::delivery_check, $3, delivery_days, regional_restriction, invoice, warranty, warranty_months, condition,
       jsonb_build_object('copied_from', id)
     from price_observations where id = $1`,
    [obsId, status, note || null],
  );
  revalidatePath(`/urunler/${productId}`);
  revalidatePath("/firsatlar");
}

export async function setVelocity(f: FormData) {
  const productId = Number(str(f, "product_id"));
  const channelId = str(f, "channel_id");
  const units = num(f, "units_per_month");
  if (units === null) {
    await db().query("delete from sales_velocity_estimates where product_id=$1 and channel_id=$2", [productId, channelId]);
  } else {
    await db().query(
      `insert into sales_velocity_estimates (product_id, channel_id, units_per_month, basis) values ($1,$2,$3,'manual')
       on conflict (product_id, channel_id) do update set units_per_month = excluded.units_per_month, basis = 'manual', updated_at = now()`,
      [productId, channelId, units],
    );
  }
  revalidatePath(`/urunler/${productId}`);
  revalidatePath("/firsatlar");
}

// ---------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------
export async function updateChannel(f: FormData) {
  const id = str(f, "id");
  const vals = [
    rate(f, "commission_rate"), rate(f, "payment_fee_rate"), num(f, "fixed_fee_net"),
    num(f, "outbound_shipping_net"), rate(f, "return_rate"), rate(f, "withholding_rate"),
  ];
  if (vals.some((v) => v === null || v < 0)) throw new Error("Tüm alanlar sayı olmalı");
  await db().query(
    `update sales_channels set commission_rate=$2, payment_fee_rate=$3, fixed_fee_net=$4, outbound_shipping_net=$5,
       return_rate=$6, withholding_rate=$7, params_verified=$8, commission_base=$9 where id=$1`,
    [id, ...vals, str(f, "params_verified") === "on", str(f, "commission_base") === "net" ? "net" : "gross"],
  );
  revalidatePath("/ayarlar");
  revalidatePath("/firsatlar");
}

export async function updateSettings(f: FormData) {
  const fields: [string, number | null][] = [
    ["inbound_shipping_net", num(f, "inbound_shipping_net")],
    ["handling_net", num(f, "handling_net")],
    ["annual_capital_cost_rate", rate(f, "annual_capital_cost_rate")],
    ["avg_days_in_stock", num(f, "avg_days_in_stock")],
    ["storage_cost_month_net", num(f, "storage_cost_month_net")],
    ["return_loss_rate", rate(f, "return_loss_rate")],
    ["max_price_age_hours", num(f, "max_price_age_hours")],
    ["min_profit_net", num(f, "min_profit_net")],
    ["min_margin", rate(f, "min_margin")],
  ];
  if (fields.some(([, v]) => v === null || v < 0)) throw new Error("Tüm alanlar sayı olmalı");
  const set = fields.map(([k], i) => `${k} = $${i + 1}`).join(", ");
  await db().query(`update cost_settings set ${set}, updated_at = now() where id = 1`, fields.map(([, v]) => v));
  revalidatePath("/ayarlar");
  revalidatePath("/firsatlar");
}

export async function updateFulfillment(f: FormData) {
  const cost = num(f, "cost_net"), perKm = num(f, "cost_per_km");
  if (cost === null || perKm === null) throw new Error("Sayı girin");
  await db().query("update fulfillment_methods set cost_net=$2, cost_per_km=$3 where id=$1", [str(f, "id"), cost, perKm]);
  revalidatePath("/ayarlar");
}

export async function setCategoryCommission(f: FormData) {
  const channelId = str(f, "channel_id");
  const categoryId = Number(str(f, "category_id"));
  const r = rate(f, "commission_rate");
  if (r === null) {
    await db().query("delete from channel_category_commissions where channel_id=$1 and category_id=$2", [channelId, categoryId]);
  } else {
    if (r < 0 || r >= 1) throw new Error("Oran %0–%100 arası olmalı");
    await db().query(
      `insert into channel_category_commissions (channel_id, category_id, commission_rate) values ($1,$2,$3)
       on conflict (channel_id, category_id) do update set commission_rate = excluded.commission_rate`,
      [channelId, categoryId, r],
    );
  }
  revalidatePath("/ayarlar");
  revalidatePath("/firsatlar");
}
