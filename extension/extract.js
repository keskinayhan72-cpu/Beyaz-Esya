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

// sku bilerek kullanılmaz: gerçek sayfalarda pazaryerinin kendi stok numarası (HBCV..., 333664476).
function pickModel(p) {
  const model = typeof p.model === "object" && p.model !== null ? p.model.name : p.model;
  for (const v of [p.mpn, model]) {
    if (v === undefined || v === null || typeof v === "object") continue;
    const s = String(v).trim();
    if (s && s !== String(p.sku ?? "").trim() && !/^\d{7,}$/.test(s)) return s;
  }
  return null;
}

/** Ürün adından model kodu önerisi. Her zaman uyarıyla gösterilir; kullanıcı kontrol eder. */
export function guessModel(name, brand) {
  let rest = String(name ?? "").trim();
  if (brand && rest.toLocaleLowerCase("tr").startsWith(String(brand).toLocaleLowerCase("tr"))) rest = rest.slice(String(brand).length);
  const tokens = rest.trim().split(/\s+/).map((t) => t.replace(/^[(,]+|[),:;|]+$/g, ""));
  const isCode = (t) => t.length >= 4 && /[a-zğüşıöç]/i.test(t) && (t.match(/\d/g) ?? []).length >= 2 && !/^\d+[.,]?\d*[a-zğüşıöç]{1,4}$/i.test(t);
  const direct = tokens.find(isCode);
  if (direct) return direct;
  // "Grundig GPDF 4711", "Şenocak Vfn 7274": yalnızca markadan hemen sonra gelirse.
  if (brand && tokens.length > 1 && /^[a-z]{2,6}$/i.test(tokens[0]) && /^\d{3,}$/.test(tokens[1])) return `${tokens[0]} ${tokens[1]}`;
  return null;
}

/** Kontrol hanesi tutan, küresel barkod. Mağaza içi aralık (20-29) ve geçersizler elenir. */
export function checkGtin(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { gtin: null, warning: null };
  const digits = raw.replace(/[\s-]/g, "");
  const invalid = { gtin: null, warning: `Sayfadaki barkod geçerli bir EAN değil (${raw}); EAN boş bırakıldı` };
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(digits)) return invalid;
  const body = [...digits.slice(0, -1)].reverse();
  const sum = body.reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  if ((10 - (sum % 10)) % 10 !== Number(digits.at(-1))) return invalid;
  if (/^0*2\d{12}$/.test(digits))
    return { gtin: null, warning: `Sayfadaki barkod mağaza içi kod (${raw}), küresel EAN değil; EAN boş bırakıldı` };
  return { gtin: digits, warning: null };
}

const unescapeJson = (s) => { try { return JSON.parse(`"${s}"`); } catch { return s; } };
const decodeHtml = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
const grab = (html, re) => { const m = html.match(re); return m ? decodeHtml(unescapeJson(m[1])).trim() || null : null; };

/** akakçe: JSON-LD ilk mağazaları verir; ekrandaki satır listesi tamamıdır. */
function akakceOffers(html) {
  const out = new Map();
  for (const m of html.matchAll(/class="v_v8">(?:Satıcı:\s*)?<img[^>]*\balt="([^"]*)"[^>]*>([^<]*)/g)) {
    const before = html.slice(Math.max(0, m.index - 1500), m.index);
    const pr = [...before.matchAll(/pt_v8 ?">([\d.]+)<i>,(\d{2}) TL/g)].pop();
    if (!pr) continue; // fiyatsız satır (reklam / liste dışı)
    const seller = decodeHtml(`${m[1]}${m[2]}`).replace(/\s+/g, " ").trim();
    const price = toNumber(`${pr[1]},${pr[2]}`);
    out.set(`${price}|${seller}`, { price, seller }); // üstteki öne çıkan satır listede tekrar eder
  }
  return [...out.values()];
}

/**
 * Siteye özel okuma: yalnızca sayfada zaten bulunan veriyi kullanır (raw.html, kullanıcının açtığı sayfa).
 * Dönen alanlar JSON-LD'nin yanlış veya eksik olduğu yerleri düzeltir.
 */
function siteData(source, html, p) {
  if (!html) return {};
  switch (source) {
    case "hepsiburada":
      return {
        seller: grab(html, /"merchantName":"([^"]+)"/),
        basketPrice: toNumber(grab(html, /Sepete özel fiyat<\/span><\/div><div[^>]*>\s*([\d.,]+)\s*TL/)),
      };
    case "trendyol":
      return {
        seller: grab(html, /"merchantListing":\{"merchant":\{"id":\d+,"name":"((?:[^"\\]|\\.)+)"/) ?? grab(html, /merchant-name">([^<]+)</),
        gtinRaw: grab(html, /"barcode":"([^"]+)"/),
      };
    case "n11":
      return {
        seller: grab(html, /title="([^"]+)" class="sidebarSellerArea-top-name"/),
        condition: /"secondHand":false/.test(html) ? "new" : null,
        name: p?.name ? String(p.name).replace(/\s+Fiyatları ve Özellikleri$/, "") : null,
        gtinRaw: p?.sku ? grab(html, new RegExp(`"gtin":"(\\d+)","id":${String(p.sku).replace(/\D/g, "")}\\b`)) : null,
      };
    case "pttavm": {
      const ext = [].concat(p?.additionalProperty ?? []).find((a) => a?.name === "External ID");
      const seller = p ? [].concat(p.offers ?? [])[0]?.seller?.name : null;
      const brand = p && typeof p.brand === "object" ? p.brand?.name : p?.brand;
      // PttAVM marka alanına satıcı adını yazıyor; ürün adının ilk sözcüğü gerçek markadır.
      return { gtinRaw: ext?.value ?? null, brandFromName: !!seller && seller === brand };
    }
    case "amazon_tr":
      return {
        name: grab(html, /id="productTitle"[^>]*>\s*([^<]+?)\s*</),
        brand: grab(html, /Marka Adı\s*<\/th>\s*<td[^>]*>\s*([^<]+?)\s*</),
        modelCode: grab(html, /Model Numarası\s*<\/th>\s*<td[^>]*>\s*([^<]+?)\s*</),
        noOffer: /id="unqualifiedBuyBox"/.test(html),
        price: toNumber(grab(html, /id="corePriceDisplay_desktop_feature_div"[\s\S]{0,8000}?data-csa-c-price-to-pay="([\d.]+)"/)),
        seller: grab(html, /offer-display-feature-name="desktop-merchant-info"[\s\S]{0,4000}?offer-display-feature-text-message">\s*([^<]+?)\s*</),
        inStock: /id="add-to-cart-button"/.test(html) ? true : null,
        condition: /id="corePriceDisplay_desktop_feature_div"[\s\S]{0,8000}?data-csa-c-buying-option-type="NEW"/.test(html) ? "new" : null,
      };
    case "akakce":
      return { visibleOffers: akakceOffers(html) };
    default:
      return {};
  }
}

/**
 * raw: { url, jsonLd: string[], meta: Record<string,string>, title, html? }
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
      condition: COND(o.itemCondition ?? p?.itemCondition),
      aggregate: !!o._aggregate,
    }))
    .filter((o) => o.price !== null && String(o.currency).toUpperCase() === "TRY");
  priced.sort((a, b) => a.price - b.price);

  const source = sourceForUrl(raw.url);
  const site = siteData(source, raw.html, p);
  if (!priced.length && site.price) {
    priced.push({ price: site.price, currency: "TRY", seller: null, inStock: site.inStock ?? null, condition: "unknown", aggregate: false });
  }

  let best = priced[0] ?? null;
  if (!best) {
    const mp = toNumber(meta["product:price:amount"] ?? meta["og:price:amount"]);
    const cur = (meta["product:price:currency"] ?? meta["og:price:currency"] ?? "TRY").toUpperCase();
    if (mp && cur === "TRY") best = { price: mp, seller: null, inStock: null, condition: "unknown", aggregate: false };
  }
  if (!p && !site.name) warnings.push("Sayfada yapılandırılmış ürün verisi (JSON-LD) bulunamadı");
  if (!best) warnings.push("Fiyat okunamadı — elle girin");
  if (best?.aggregate) warnings.push("Sayfa yalnızca en düşük fiyatı veriyor; satıcıyı kontrol edin");

  const name = site.name ?? p?.name ?? meta["og:title"] ?? raw.title ?? null;

  let brand = site.brand ?? (p ? (typeof p.brand === "object" ? p.brand?.name : p.brand) ?? null : null);
  if (site.brandFromName) {
    brand = String(name ?? "").trim().split(/\s+/)[0] || null;
    warnings.push("Marka ürün adından alındı; kontrol edin");
  }

  let modelCode = site.modelCode ?? (p ? pickModel(p) : null);
  if (!modelCode && (p || site.name)) {
    modelCode = guessModel(name, brand);
    warnings.push(modelCode ? "Model kodu ürün adından tahmin edildi; kontrol edin" : "Model kodu sayfada yok; kendiniz yazın");
  }

  const checked = checkGtin(site.gtinRaw ?? (p ? p.gtin13 ?? p.gtin ?? p.gtin14 ?? p.gtin12 ?? p.gtin8 : null));
  if (checked.warning) warnings.push(checked.warning);

  if (site.noOffer && !best) warnings.push("Bu sayfada öne çıkan teklif yok; fiyatı 'Satın Alma Seçenekleri'nden görüp elle girin");

  if (site.visibleOffers?.length > priced.length) {
    const known = new Map(priced.map((o) => [o.seller, o]));
    const merged = site.visibleOffers.map((o) => ({ currency: "TRY", inStock: null, condition: "unknown", aggregate: false, ...known.get(o.seller), ...o }));
    priced.splice(0, priced.length, ...merged.sort((a, b) => a.price - b.price));
    best = priced[0];
  }
  if (best && site.condition && best.condition === "unknown") best.condition = site.condition;
  if (best && site.seller) {
    best.seller = site.seller;
  }
  if (best && site.basketPrice && site.basketPrice < best.price) {
    const list = best.price;
    warnings.push(`Sepete özel fiyat kullanıldı; sepetsiz fiyat ${list.toLocaleString("tr-TR")} ₺`);
    priced.unshift({ ...best, price: site.basketPrice, note: "sepete özel" });
    best.note = "sepetsiz";
    best = priced[0];
  }

  return {
    source,
    url: raw.url,
    name,
    brand: brand ? String(brand) : null,
    modelCode,
    gtin: checked.gtin,
    price: best?.price ?? null,
    inStock: best?.inStock ?? null,
    condition: best?.condition ?? "unknown",
    seller: best?.seller ?? null,
    offers: priced.slice(0, 20),
    warnings,
  };
}
