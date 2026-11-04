import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { upsertProduct } from "@/lib/db/products";
import { tokenOk } from "@/lib/capture";

export const dynamic = "force-dynamic";

const denied = () => NextResponse.json({ error: "Eklenti anahtarı hatalı" }, { status: 401 });

/** Eklentideki "katalogdan seç" kutusu için arama; ?categories=1 ile kategori listesi. */
export async function GET(req: Request) {
  if (!tokenOk(process.env.CAPTURE_TOKEN, req.headers.get("x-capture-token"))) return denied();
  const params = new URL(req.url).searchParams;
  if (params.get("categories")) {
    const c = await db().query("select slug, name from categories order by name");
    return NextResponse.json({ categories: c.rows });
  }
  const q = params.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ items: [] });
  const r = await db().query(
    `select id, brand, model_code, name from products
     where is_active and (brand ilike $1 or model_code ilike $1 or name ilike $1 or gtin like $1)
     order by brand, model_code limit 20`,
    [`%${q}%`],
  );
  return NextResponse.json({ items: r.rows });
}

/** Eklentiden kataloğa ürün ekleme: değerleri kullanıcı popup'ta görüp onaylar. */
export async function POST(req: Request) {
  if (!tokenOk(process.env.CAPTURE_TOKEN, req.headers.get("x-capture-token"))) return denied();
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const err = await upsertProduct({
    brand: text(b.brand), model_code: text(b.modelCode), gtin: text(b.gtin), name: text(b.name), category: text(b.category),
  });
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  revalidatePath("/urunler");
  revalidatePath("/kontrol");
  return NextResponse.json({ ok: true });
}
