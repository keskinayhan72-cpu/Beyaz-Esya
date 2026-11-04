import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { tokenOk } from "@/lib/capture";

export const dynamic = "force-dynamic";

const MAX_CHARS = 30_000_000;

/** Eklentinin "Tanı için sayfayı kaydet" bağlantısı: HTML yalnızca yerel, git dışı klasöre yazılır. */
export async function POST(req: Request) {
  if (!tokenOk(process.env.CAPTURE_TOKEN, req.headers.get("x-capture-token")))
    return NextResponse.json({ error: "Eklenti anahtarı hatalı" }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (typeof b?.html !== "string" || typeof b?.url !== "string" || b.html.length > MAX_CHARS)
    return NextResponse.json({ error: "Geçersiz sayfa verisi" }, { status: 400 });
  // Dosya adında yalnızca harf, rakam ve alt çizgi kalır.
  const host = URL.canParse(b.url) ? new URL(b.url).hostname.replace(/[^a-z0-9]/gi, "_") : "diger";
  const file = `${host}-${Date.now()}.html`;
  const dir = path.join(process.cwd(), ".sayfa-ornekleri");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, file), `<!-- ${b.url.replace(/--+/g, "-")} -->\n${b.html}`, "utf8");
  return NextResponse.json({ ok: true, file });
}
