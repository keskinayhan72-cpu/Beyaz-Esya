/**
 * Pazaryeri kontrol matrisi: API bağlantısı yokken her ürün × kaynak için
 * elle kontrol edilmesi gerekenleri ve arama bağlantılarını üretir.
 */

export type CellStatus = "missing" | "stale" | "usak_unverified" | "restricted" | "ok";

export const CELL_LABEL: Record<CellStatus, string> = {
  missing: "Kontrol edilmedi",
  stale: "Fiyat eski",
  usak_unverified: "Uşak ?",
  restricted: "Gönderim yok",
  ok: "Güncel",
};

/** Arama şablonuna sorguyu güvenli biçimde yerleştirir. */
export function buildSearchUrl(template: string | null, query: string | null): string | null {
  if (!template || !query?.trim()) return null;
  return template.replace("{q}", encodeURIComponent(query.trim()));
}

export function cellStatus(
  obs: { observedAt: Date; delivery: "verified" | "not_verified" | "restricted"; isTest: boolean } | null,
  now: Date,
  maxAgeHours: number,
): CellStatus {
  if (!obs || obs.isTest) return "missing"; // test verisi gerçek kontrol sayılmaz
  if (now.getTime() - obs.observedAt.getTime() > maxAgeHours * 3_600_000) return "stale";
  if (obs.delivery === "restricted") return "restricted";
  if (obs.delivery === "not_verified") return "usak_unverified";
  return "ok";
}

/** Öncelik: hiç kontrol edilmemiş hücresi çok olan ürün önce. */
export function priorityScore(cells: CellStatus[]): number {
  const w: Record<CellStatus, number> = { missing: 3, stale: 2, usak_unverified: 1, restricted: 0, ok: 0 };
  return cells.reduce((a, c) => a + w[c], 0);
}
