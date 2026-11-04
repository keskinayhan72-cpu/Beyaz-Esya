/**
 * Alış teklifinin uygunluk değerlendirmesi: bölgesel teslimat (Uşak), stok,
 * fatura, garanti, ürün durumu, veri tazeliği ve veri kökeni.
 *
 * Kural: Uşak teslimatı DOĞRULANMAMIŞ hiçbir teklif "eligible" olamaz.
 * 'test_fixture' kökenli veri hiçbir zaman "eligible" olamaz.
 */

export type BuyObservation = {
  origin: "official_api" | "licensed_feed" | "permitted_crawl" | "manual_entry" | "test_fixture";
  observedAt: Date;
  price: number;
  inStock: boolean | null;
  delivery: "verified" | "not_verified" | "restricted";
  regionalRestriction: string | null;
  invoice: "e_fatura" | "e_arsiv" | "paper" | "none" | "unknown";
  warranty: "official_tr" | "importer" | "seller" | "none" | "unknown";
  condition: "new" | "refurbished" | "used" | "unknown";
};

export type EligibilityStatus = "eligible" | "needs_verification" | "excluded";

export type Eligibility = {
  status: EligibilityStatus;
  excludeReasons: string[];
  pendingChecks: string[];
};

export type EligibilityOptions = { now: Date; maxPriceAgeHours: number };

export function evaluateBuyOffer(o: BuyObservation, opts: EligibilityOptions): Eligibility {
  const excludeReasons: string[] = [];
  const pendingChecks: string[] = [];

  // Kesin eleme
  if (o.delivery === "restricted") excludeReasons.push("Uşak'a gönderim yok / bölgesel kısıt");
  if (o.regionalRestriction && o.regionalRestriction.trim()) {
    excludeReasons.push(`Bölgesel kısıt: ${o.regionalRestriction.trim()}`);
  }
  if (o.inStock === false) excludeReasons.push("Stokta yok");
  if (o.condition === "used" || o.condition === "refurbished") excludeReasons.push("Sıfır ürün değil");
  if (o.warranty === "none") excludeReasons.push("Garantisiz");
  if (o.invoice === "none") excludeReasons.push("Fatura verilmiyor");

  // Doğrulama bekleyenler
  if (o.origin === "test_fixture") pendingChecks.push("TEST VERİSİ — gerçek fiyat değil");
  if (o.delivery === "not_verified") pendingChecks.push("Uşak teslimatı doğrulanmadı");
  if (o.inStock === null) pendingChecks.push("Stok durumu bilinmiyor");
  if (o.condition === "unknown") pendingChecks.push("Ürün durumu (sıfır) doğrulanmadı");
  if (o.warranty === "unknown") pendingChecks.push("Garanti türü bilinmiyor");
  if (o.warranty === "seller") pendingChecks.push("Yalnızca satıcı garantisi — resmî garanti değil");
  if (o.invoice === "unknown") pendingChecks.push("Fatura türü bilinmiyor");
  const ageHours = (opts.now.getTime() - o.observedAt.getTime()) / 3_600_000;
  if (ageHours > opts.maxPriceAgeHours) pendingChecks.push(`Fiyat ${Math.floor(ageHours)} saat önce gözlendi (eski)`);

  const status: EligibilityStatus =
    excludeReasons.length > 0 ? "excluded" : pendingChecks.length > 0 ? "needs_verification" : "eligible";
  return { status, excludeReasons, pendingChecks };
}

export const STATUS_LABEL: Record<EligibilityStatus, string> = {
  eligible: "Uygun",
  needs_verification: "Doğrulama bekliyor",
  excluded: "Elendi",
};
