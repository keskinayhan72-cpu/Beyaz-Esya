/** Tarayıcı eklentisinden gelen yakalama isteğinin doğrulanması (saf, testli). */
import { timingSafeEqual } from "node:crypto";

export type CapturePayload = {
  productId: number | null;
  source: string;
  url: string;
  title: string | null;
  brand: string | null;
  modelCode: string | null;
  gtin: string | null;
  seller: string | null;
  price: number;
  shippingFee: number | null;
  inStock: boolean | null;
  condition: "new" | "refurbished" | "used" | "unknown";
  delivery: "verified" | "not_verified" | "restricted";
  deliveryNote: string | null;
  side: "auto" | "buy" | "sell" | "both";
};

const s = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function validateCapture(body: unknown): { ok: true; value: CapturePayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Geçersiz istek" };
  const b = body as Record<string, unknown>;
  const url = s(b.url, 2000);
  if (!url || !/^https:\/\//.test(url)) return { ok: false, error: "Sayfa adresi https olmalı" };
  const source = s(b.source, 50);
  if (!source) return { ok: false, error: "Kaynak tanınmadı" };
  const price = typeof b.price === "number" ? b.price : Number(b.price);
  if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) return { ok: false, error: "Geçerli bir fiyat gerekli" };
  const ship = b.shippingFee === null || b.shippingFee === undefined || b.shippingFee === "" ? null : Number(b.shippingFee);
  if (ship !== null && (!Number.isFinite(ship) || ship < 0)) return { ok: false, error: "Kargo ücreti geçersiz" };
  const delivery = b.delivery === "verified" || b.delivery === "restricted" ? b.delivery : "not_verified";
  const deliveryNote = s(b.deliveryNote);
  if (delivery === "verified" && !deliveryNote) return { ok: false, error: "Uşak teslimatı doğrulandıysa nasıl doğrulandığını yazın" };
  const condition = ["new", "refurbished", "used"].includes(b.condition as string) ? (b.condition as CapturePayload["condition"]) : "unknown";
  const side = ["buy", "sell", "both"].includes(b.side as string) ? (b.side as CapturePayload["side"]) : "auto";
  const pid = b.productId === null || b.productId === undefined || b.productId === "" ? null : Number(b.productId);
  if (pid !== null && (!Number.isInteger(pid) || pid <= 0)) return { ok: false, error: "Ürün kimliği geçersiz" };
  return {
    ok: true,
    value: {
      productId: pid, source, url, title: s(b.title), brand: s(b.brand, 100), modelCode: s(b.modelCode, 100),
      gtin: s(b.gtin, 20), seller: s(b.seller, 200), price: Math.round(price * 100) / 100, shippingFee: ship,
      inStock: typeof b.inStock === "boolean" ? b.inStock : null, condition, delivery, deliveryNote, side,
    },
  };
}

/** Pazaryerinde görülen fiyat hem alış seçeneği hem rakip satış fiyatıdır. */
export function sidesFor(side: CapturePayload["side"], src: { can_buy: boolean; can_sell: boolean }): ("buy" | "sell")[] {
  if (side === "both") return ["buy", "sell"];
  if (side === "buy" || side === "sell") return [side];
  if (src.can_buy && src.can_sell) return ["buy", "sell"];
  return src.can_sell ? ["sell"] : ["buy"];
}

/** Yerel sunucuya başka sitelerin istek atamaması için paylaşılan anahtar kontrolü. */
export function tokenOk(expected: string | undefined, given: string | null): boolean {
  if (!expected || expected.length < 16 || !given) return false;
  const a = Buffer.from(expected), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
