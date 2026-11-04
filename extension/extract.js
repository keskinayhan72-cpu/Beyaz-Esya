// Sayfadan toplanan ham verilerden (JSON-LD metinleri, meta etiketleri) ürün bilgisi çıkarır.
// Saf fonksiyonlar: DOM'a dokunmaz; web/src/lib/extract.test.ts ile test edilir.

export const HOST_SOURCES = [
  ["trendyol.com", "trendyol"], ["hepsiburada.com", "hepsiburada"], ["amazon.com.tr", "amazon_tr"],
  ["n11.com", "n11"], ["pazarama.com", "pazarama"], ["pttavm.com", "pttavm"],
  ["mediamarkt.com.tr", "mediamarkt"], ["teknosa.com", "teknosa"], ["vatanbilgisayar.com", "vatan"],
  ["koctas.com.tr", "koctas"], ["arcelik.com.tr", "arcelik"], ["vestel.com.tr", "vestel"],
  ["bosch-home.com.tr", "bosch"], ["akakce.com", "akakce"],
];

export function sourceForUrl(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  const hit = HOST_SOURCES.find(([h]) => host === h || host.endsWith("." + h));
  return hit ? hit[1] : null;
}

function flatten(node, out) {
  if (Array.isArray(node)) { node.forEach((n) => flatten(n, out)); return; }
  if (!node || typeof node !== "object") return;
  out.push(node);
  if (node["@graph"]) flatten(node["@graph"], out);
}

const isType = (n, t) => [].concat(n["@type"] ?? []).some((x) => String(x).toLowerCase() === t);

function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function offerList(p) {
  const out = [];
  for (const o of [].concat(p.offers ?? [])) {
    if (!o || typeof o !== "object") continue;
    if (isType(o, "aggregateoffer")) {
      if (o.offers) out.push(...[].concat(o.offers));
      else out.push({ price: o.lowPrice ?? o.price, priceCurrency: o.priceCurrency, availability: o.availability, _aggregate: true });
    } else out.push(o);
  }
  return out;
}

const AVAIL = (a) => {
  const s = String(a ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("instock") || s.includes("limitedavailability") || s.includes("onlineonly")) return true;
  if (s.includes("outofstock") || s.includes("soldout") || s.includes("discontinued")) return false;
  return null;
};
const COND = (c) => {
  const s = String(c ?? "").toLowerCase();
  if (s.includes("new")) return "new";
  if (s.includes("refurbished")) return "refurbished";
  if (s.includes("used") || s.includes("damaged")) return "used";
  return "unknown";
};

function pickModel(p) {
  const model = typeof p.model === "object" && p.model !== null ? p.model.name : p.model;
  for (const v of [p.mpn, model, p.sku]) {
    if (v !== undefined && v !== null && typeof v !== "object" && String(v).trim()) return String(v).trim();
  }
  return null;
}

/**
 * raw: { url, jsonLd: string[], meta: Record<string,string>, title }
 * Dönüş: { source, url, name, brand, modelCode, gtin, price, inStock, condition, seller, offers[], warnings[] }
 */
export function extractProduct(raw) {
  const nodes = [];
  const warnings = [];
  for (const txt of raw.jsonLd ?? []) {
    try { flatten(JSON.parse(txt), nodes); } catch { /* bozuk JSON-LD yok sayılır */ }
  }
  const p = nodes.find((n) => isType(n, "product")) ?? null;
  const meta = raw.meta ?? {};
  const offers = p ? offerList(p) : [];
  const priced = offers
    .map((o) => ({
      price: toNumber(o.price ?? o.lowPrice),
      currency: o.priceCurrency ?? "TRY",
      seller: typeof o.seller === "object" ? o.seller?.name ?? null : o.seller ?? null,
      inStock: AVAIL(o.availability),
      condition: COND(o.itemCondition),
      aggregate: !!o._aggregate,
    }))
    .filter((o) => o.price !== null && String(o.currency).toUpperCase() === "TRY");
  priced.sort((a, b) => a.price - b.price);

  let best = priced[0] ?? null;
  if (!best) {
    const mp = toNumber(meta["product:price:amount"] ?? meta["og:price:amount"]);
    const cur = (meta["product:price:currency"] ?? meta["og:price:currency"] ?? "TRY").toUpperCase();
    if (mp && cur === "TRY") best = { price: mp, seller: null, inStock: null, condition: "unknown", aggregate: false };
  }
  if (!p) warnings.push("Sayfada yapılandırılmış ürün verisi (JSON-LD) bulunamadı");
  if (!best) warnings.push("Fiyat okunamadı — elle girin");
  if (best?.aggregate) warnings.push("Sayfa yalnızca en düşük fiyatı veriyor; satıcıyı kontrol edin");

  const brand = p ? (typeof p.brand === "object" ? p.brand?.name : p.brand) ?? null : null;
  const gtin = p ? String(p.gtin13 ?? p.gtin ?? p.gtin14 ?? p.gtin12 ?? p.gtin8 ?? "").replace(/\D/g, "") || null : null;
  return {
    source: sourceForUrl(raw.url),
    url: raw.url,
    name: p?.name ?? meta["og:title"] ?? raw.title ?? null,
    brand: brand ? String(brand) : null,
    modelCode: p ? pickModel(p) : null,
    gtin,
    price: best?.price ?? null,
    inStock: best?.inStock ?? null,
    condition: best?.condition ?? "unknown",
    seller: best?.seller ?? null,
    offers: priced.slice(0, 20),
    warnings,
  };
}
