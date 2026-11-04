import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tokenOk } from "@/lib/capture";

export const dynamic = "force-dynamic";

/** Eklentideki "katalogdan seç" kutusu için arama. */
export async function GET(req: Request) {
  if (!tokenOk(process.env.CAPTURE_TOKEN, req.headers.get("x-capture-token")))
    return NextResponse.json({ error: "Eklenti anahtarı hatalı" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ items: [] });
  const r = await db().query(
    `select id, brand, model_code, name from products
     where is_active and (brand ilike $1 or model_code ilike $1 or name ilike $1 or gtin like $1)
     order by brand, model_code limit 20`,
    [`%${q}%`],
  );
  return NextResponse.json({ items: r.rows });
}
