import "server-only";
import type { PoolClient } from "pg";

export type ObservationInput = {
  productId: number | null;
  sourceId: string;
  sides: ("buy" | "sell")[];
  url: string;
  sellerName: string | null;
  title?: string | null;
  gtinRaw?: string | null;
  modelCodeRaw?: string | null;
  brandRaw?: string | null;
  matchMethod: "gtin" | "model_code" | "manual" | null;
  collectedBy: string;
  observedAt?: string | null;
  price: number;
  shippingFee: number | null;
  inStock: boolean | null;
  delivery: "verified" | "not_verified" | "restricted";
  deliveryNote: string | null;
  deliveryDays?: number | null;
  regionalRestriction?: string | null;
  invoice?: string;
  warranty?: string;
  warrantyMonths?: number | null;
  condition?: string;
  raw?: Record<string, unknown>;
};

/** İlanı (taraf başına) oluşturur/günceller ve yeni bir 'manual_entry' gözlemi ekler. Çağıran işlem (transaction) yönetir. */
export async function recordObservation(client: PoolClient, i: ObservationInput): Promise<number[]> {
  const ids: number[] = [];
  for (const side of i.sides) {
    const offerUrl = i.url || `${i.sourceId}:urun:${i.productId}:${side}`;
    const o = await client.query(
      `insert into offers (source_id, side, product_id, match_method, source_url, seller_name, title, gtin_raw, model_code_raw, brand_raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (source_id, side, source_url) do update set
         seller_name = coalesce(excluded.seller_name, offers.seller_name),
         title = coalesce(excluded.title, offers.title),
         product_id = coalesce(offers.product_id, excluded.product_id),
         match_method = coalesce(offers.match_method, excluded.match_method)
       returning id, product_id`,
      [i.sourceId, side, i.productId, i.productId ? i.matchMethod : null, offerUrl, i.sellerName, i.title ?? null,
       i.gtinRaw ?? null, i.modelCodeRaw ?? null, i.brandRaw ?? null],
    );
    if (i.productId && o.rows[0].product_id !== i.productId) throw new Error("Bu bağlantı başka bir ürüne eşlenmiş");
    await client.query(
      `insert into price_observations (offer_id, observed_at, origin, collected_by, price, shipping_fee, in_stock,
         delivery, delivery_method_note, delivery_days, regional_restriction, invoice, warranty, warranty_months, condition, raw)
       values ($1, coalesce($2::timestamptz, now()), 'manual_entry', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [o.rows[0].id, i.observedAt || null, i.collectedBy, i.price, i.shippingFee, i.inStock, i.delivery, i.deliveryNote,
       i.deliveryDays ?? null, i.regionalRestriction ?? null, i.invoice ?? "unknown", i.warranty ?? "unknown",
       i.warrantyMonths ?? null, i.condition ?? "unknown", i.raw ? JSON.stringify(i.raw) : null],
    );
    ids.push(o.rows[0].id);
  }
  return ids;
}
