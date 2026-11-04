/**
 * Ürün kimliklendirme: GTIN/EAN doğrulama ve model kodu normalizasyonu.
 * Python motorundaki `fiyat_motoru/matching.py` ile aynı kuralları uygular
 * (ortak test vektörleri: shared/identifier_vectors.json).
 */

/** GS1 kontrol hanesini doğrular. Kabul edilen uzunluklar: 8, 12, 13, 14. */
export function isValidGtin(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return false;
  if (/^0+$/.test(digits)) return false;
  const body = digits.slice(0, -1);
  const check = Number(digits[digits.length - 1]);
  let sum = 0;
  // Sağdan sola: kontrol hanesinden önceki ilk hane x3, sonraki x1 ...
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** Geçerli GTIN'i 14 haneli kanonik forma getirir; geçersizse null. */
export function normalizeGtin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[\s-]/g, "");
  if (!isValidGtin(digits)) return null;
  return digits.padStart(14, "0");
}

/** 14 haneli GTIN'i gösterim için EAN-13'e kısaltır (başta 0 varsa). */
export function displayGtin(gtin14: string | null): string {
  if (!gtin14) return "—";
  return gtin14.startsWith("0") ? gtin14.slice(1) : gtin14;
}

const TR_MAP: Record<string, string> = {
  ı: "I", i: "I", İ: "I", ş: "S", Ş: "S", ğ: "G", Ğ: "G",
  ü: "U", Ü: "U", ö: "O", Ö: "O", ç: "C", Ç: "C",
};

/** Model kodu / marka normalizasyonu: büyük harf, yalnızca A-Z0-9. */
export function normalizeCode(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[ıiİşŞğĞüÜöÖçÇ]/g, (c) => TR_MAP[c] ?? c)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export type MatchCandidate = { id: number; gtin: string | null; brandNorm: string; modelCodeNorm: string };
export type MatchResult =
  | { productId: number; method: "gtin" | "model_code" }
  | { productId: null; method: null; reason: string };

/**
 * Sıkı eşleştirme: önce GTIN, sonra marka + tam model kodu.
 * Bulanık (fuzzy) eşleştirme bilerek YAPILMAZ: "WAN28281TR" ile "WAN28281"
 * farklı varyantlar olabilir; belirsiz kayıtlar elle incelemeye düşer.
 */
export function matchOffer(
  offer: { gtin?: string | null; brand?: string | null; modelCode?: string | null },
  catalog: MatchCandidate[],
): MatchResult {
  const g = normalizeGtin(offer.gtin ?? null);
  if (g) {
    const hit = catalog.find((p) => p.gtin === g);
    if (hit) return { productId: hit.id, method: "gtin" };
  }
  const b = normalizeCode(offer.brand);
  const m = normalizeCode(offer.modelCode);
  if (b && m) {
    const hits = catalog.filter((p) => p.brandNorm === b && p.modelCodeNorm === m);
    if (hits.length === 1) {
      // GTIN her iki tarafta varsa ve farklıysa eşleştirme reddedilir
      if (g && hits[0].gtin && hits[0].gtin !== g) {
        return { productId: null, method: null, reason: "Model kodu eşleşti fakat GTIN farklı — elle inceleyin" };
      }
      return { productId: hits[0].id, method: "model_code" };
    }
  }
  return { productId: null, method: null, reason: g ? "GTIN katalogda yok" : "GTIN yok/geçersiz ve model kodu eşleşmedi" };
}
