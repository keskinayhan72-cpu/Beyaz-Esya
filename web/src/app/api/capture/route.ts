import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { recordObservation } from "@/lib/db/observations";
import { sidesFor, tokenOk, validateCapture } from "@/lib/capture";
import { matchOffer, normalizeCode, normalizeGtin } from "@/lib/domain/identifiers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!tokenOk(process.env.CAPTURE_TOKEN, req.headers.get("x-capture-token")))
    return NextResponse.json({ error: "Eklenti anahtarı hatalı veya sunucuda CAPTURE_TOKEN tanımlı değil" }, { status: 401 });
  const v = validateCapture(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const c = v.value;

  const src = (await db().query("select id, name, can_buy, can_sell from sources where id = $1", [c.source])).rows[0];
  if (!src) return NextResponse.json({ error: `Bilinmeyen kaynak: ${c.source}` }, { status: 400 });

  let productId = c.productId;
  let method: "gtin" | "model_code" | "manual" = "manual";
  if (productId) {
    const ok = await db().query("select 1 from products where id = $1", [productId]);
    if (!ok.rowCount) return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 400 });
  } else {
    const catalog = (await db().query("select id, gtin, brand_norm, model_code_norm from products where is_active")).rows
      .map((r) => ({ id: r.id, gtin: r.gtin, brandNorm: r.brand_norm, modelCodeNorm: r.model_code_norm }));
    const m = matchOffer({ gtin: c.gtin, brand: c.brand, modelCode: c.modelCode }, catalog);
    if (m.productId === null) {
      return NextResponse.json({
        needsProduct: true, reason: m.reason,
        hint: { brand: c.brand, modelCode: normalizeCode(c.modelCode) ? c.modelCode : null, gtin: normalizeGtin(c.gtin) ? c.gtin : null },
      }, { status: 409 });
    }
    productId = m.productId;
    method = m.method;
  }

  const sides = sidesFor(c.side, src);
  const client = await db().connect();
  try {
    await client.query("begin");
    await recordObservation(client, {
      productId, sourceId: c.source, sides, url: c.url, sellerName: c.seller, title: c.title, gtinRaw: c.gtin,
      modelCodeRaw: c.modelCode, brandRaw: c.brand, matchMethod: method, collectedBy: "eklenti", price: c.price,
      shippingFee: c.shippingFee, inStock: c.inStock, delivery: c.delivery, deliveryNote: c.deliveryNote,
      condition: c.condition,
    });
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  } finally {
    client.release();
  }
  for (const p of [`/urunler/${productId}`, "/firsatlar", "/kontrol", "/"]) revalidatePath(p);
  const prod = (await db().query("select brand, model_code from products where id = $1", [productId])).rows[0];
  return NextResponse.json({ ok: true, productId, product: `${prod.brand} ${prod.model_code}`, source: src.name, sides, matchedBy: method });
}
