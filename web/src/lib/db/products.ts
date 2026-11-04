import { db } from "@/lib/db";
import { normalizeCode, normalizeGtin } from "@/lib/domain/identifiers";

export type ProductRow = { brand: string; model_code: string; gtin?: string | null; name: string; category: string; energy_class?: string };

/** Ürünü ekler; aynı marka + model kodu varsa günceller. Hata varsa açıklamasını döndürür. */
export async function upsertProduct(r: ProductRow): Promise<string | null> {
  const brand = r.brand?.trim(), model = r.model_code?.trim(), name = r.name?.trim();
  if (!brand || !model || !name) return "marka, model_code ve name zorunlu";
  const brandNorm = normalizeCode(brand), modelNorm = normalizeCode(model);
  if (!brandNorm || !modelNorm) return "marka/model kodu harf veya rakam içermeli";
  let gtin: string | null = null;
  if (r.gtin?.trim()) {
    gtin = normalizeGtin(r.gtin);
    if (!gtin) return `geçersiz GTIN/EAN (kontrol hanesi tutmuyor): ${r.gtin}`;
  }
  const cat = await db().query("select id from categories where slug = $1 or lower(name) = lower($1)", [r.category?.trim()]);
  if (!cat.rows[0]) return `bilinmeyen kategori: ${r.category}`;
  try {
    await db().query(
      `insert into products (brand, brand_norm, model_code, model_code_norm, gtin, name, category_id, energy_class)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (brand_norm, model_code_norm) do update set
         brand = excluded.brand, model_code = excluded.model_code, gtin = coalesce(excluded.gtin, products.gtin),
         name = excluded.name, category_id = excluded.category_id,
         energy_class = coalesce(excluded.energy_class, products.energy_class), updated_at = now()`,
      [brand, brandNorm, model, modelNorm, gtin, name, cat.rows[0].id, r.energy_class?.trim() || null],
    );
  } catch (e) {
    const err = e as { code?: string; constraint?: string };
    if (err.code === "23505" && err.constraint === "products_gtin_key") return `GTIN başka bir modelde kayıtlı: ${r.gtin}`;
    throw e;
  }
  return null;
}
