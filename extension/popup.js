import { extractProduct } from "./extract.js";

const $ = (id) => document.getElementById(id);
let cfg = { server: "http://localhost:3000", token: "" };
let product = null;
let chosenProductId = null;
let activeTabId = null;

function show(id, on) { $(id).classList.toggle("hidden", !on); }
function msg(text, cls, link) {
  const el = $("msg");
  el.className = "msg " + cls;
  el.textContent = text;
  if (link) {
    const a = document.createElement("a");
    a.href = link; a.target = "_blank"; a.textContent = " Ürünü aç";
    el.append(a);
  }
}
const num = (v) => {
  const s = String(v ?? "").trim().replace(/\s|₺|TL/gi, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s);
  return Number.isFinite(n) ? n : NaN;
};

async function api(path, opts = {}) {
  const r = await fetch(cfg.server.replace(/\/$/, "") + path, {
    ...opts, headers: { "content-type": "application/json", "x-capture-token": cfg.token, ...(opts.headers ?? {}) },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// Sayfada çalışır: yalnızca okur, hiçbir şeye tıklamaz, sayfa değiştirmez.
function collectPage() {
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent);
  const meta = {};
  for (const m of document.querySelectorAll("meta[property], meta[name], meta[itemprop]")) {
    const k = m.getAttribute("property") || m.getAttribute("name") || m.getAttribute("itemprop");
    if (k && m.content && !(k in meta)) meta[k] = m.content;
  }
  return { url: location.href, jsonLd, meta, title: document.title, html: document.documentElement.outerHTML };
}

async function init() {
  const stored = await chrome.storage.local.get(["server", "token"]);
  cfg = { server: stored.server || cfg.server, token: stored.token || "" };
  $("server").value = cfg.server;
  $("token").value = cfg.token;
  if (!cfg.token) { show("settings", true); return; }
  show("main", true);

  // ?tabId= yalnızca otomatik testte kullanılır (popup ayrı sekmede açıldığında hedef sekme)
  const testTab = Number(new URLSearchParams(location.search).get("tabId"));
  const [tab] = testTab ? [{ id: testTab }] : await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab.id;
  let raw;
  try {
    [{ result: raw }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPage });
  } catch (e) {
    msg(`Bu sayfa okunamıyor. Bir ürün sayfası açıp tekrar deneyin. (${e?.message ?? e})`, "bad"); $("save").disabled = true; return;
  }
  product = extractProduct(raw);
  if (!product.source) {
    msg("Bu site tanımlı kaynaklar arasında değil.", "bad"); $("save").disabled = true;
  }
  $("detected").innerHTML = "";
  const d = $("detected");
  d.append(`${product.source ?? "?"} · ${product.name ?? "ürün adı yok"}`, document.createElement("br"),
    `Marka: ${product.brand ?? "—"} · Model: ${product.modelCode ?? "—"} · EAN: ${product.gtin ?? "—"}`);
  $("warnings").innerHTML = "";
  for (const w of product.warnings) { const p = document.createElement("div"); p.className = "msg warn"; p.textContent = w; $("warnings").append(p); }
  if (product.price) $("price").value = String(product.price).replace(".", ",");
  $("seller").value = product.seller ?? "";
  $("inStock").value = product.inStock === null ? "" : String(product.inStock);
  $("condition").value = product.condition;
  if (product.offers.length > 1) {
    show("offersBox", true);
    for (const o of product.offers) {
      const li = document.createElement("li");
      li.textContent = `${o.price.toLocaleString("tr-TR")} ₺ — ${o.seller ?? "satıcı adı yok"}${o.note ? ` (${o.note})` : ""}`;
      li.onclick = () => { $("price").value = String(o.price).replace(".", ","); $("seller").value = o.seller ?? ""; };
      $("offers").append(li);
    }
  }
}

$("delivery").onchange = () => show("noteWrap", $("delivery").value === "verified");
$("openSettings").onclick = (e) => { e.preventDefault(); show("settings", true); };
$("saveSettings").onclick = async () => {
  const server = $("server").value.trim(), token = $("token").value.trim();
  const fail = (text) => { $("settingsMsg").className = "msg bad"; $("settingsMsg").textContent = text; };
  if (!/^[\x21-\x7e]{16,}$/.test(token)) return fail("Bu bir anahtar değil. Kutuyu temizleyip anahtarı yeniden yapıştırın.");
  cfg = { server, token };
  try {
    const { status } = await api("/api/products?q=");
    if (status !== 200) return fail("Sunucu bu anahtarı kabul etmedi. Kutuyu temizleyip anahtarı yeniden yapıştırın.");
  } catch {
    return fail("Sunucuya ulaşılamadı. Web uygulaması çalışıyor mu? (" + server + ")");
  }
  await chrome.storage.local.set({ server, token });
  location.reload();
};

let searchTimer;
$("q").oninput = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const { body } = await api(`/api/products?q=${encodeURIComponent($("q").value)}`);
    $("results").innerHTML = "";
    for (const it of body.items ?? []) {
      const li = document.createElement("li");
      li.textContent = `${it.brand} ${it.model_code} — ${it.name}`;
      li.onclick = () => { chosenProductId = it.id; $("q").value = `${it.brand} ${it.model_code}`; $("results").innerHTML = ""; save(); };
      $("results").append(li);
    }
  }, 250);
};

async function save() {
  const price = num($("price").value), ship = num($("shipping").value);
  if (!price || Number.isNaN(price)) return msg("Fiyatı girin.", "bad");
  if (Number.isNaN(ship)) return msg("Kargo ücreti sayı olmalı.", "bad");
  $("save").disabled = true;
  try {
    const { status, body } = await api("/api/capture", {
      method: "POST",
      body: JSON.stringify({
        productId: chosenProductId, source: product.source, url: product.url, title: product.name,
        brand: product.brand, modelCode: product.modelCode, gtin: product.gtin, seller: $("seller").value,
        price, shippingFee: ship, inStock: $("inStock").value === "" ? null : $("inStock").value === "true",
        condition: $("condition").value, delivery: $("delivery").value, deliveryNote: $("note").value, side: $("side").value,
      }),
    });
    if (status === 200) {
      const link = `${cfg.server.replace(/\/$/, "")}/urunler/${body.productId}`;
      msg(`Kaydedildi: ${body.product} · ${body.source} (${body.sides.join(" + ")}).`, "ok", link);
    } else if (status === 409 && body.needsProduct) {
      show("pick", true);
      $("q").value = body.hint?.modelCode ?? body.hint?.brand ?? "";
      $("q").dispatchEvent(new Event("input"));
      await fillNewProduct();
      msg(`Katalogda eşleşmedi (${body.reason}). Aşağıdan ürünü seçin ya da kataloğa ekleyin.`, "warn");
    } else {
      msg(body.error ?? `Hata (${status})`, "bad");
    }
  } catch {
    msg("Sunucuya ulaşılamadı. Web uygulaması çalışıyor mu? (" + cfg.server + ")", "bad");
  } finally {
    $("save").disabled = false;
  }
}
async function fillNewProduct() {
  $("newName").value = product.name ?? "";
  $("newBrand").value = product.brand ?? "";
  $("newModel").value = product.modelCode ?? "";
  $("newGtin").value = product.gtin ?? "";
  if ($("newCategory").options.length) return;
  const { body } = await api("/api/products?categories=1");
  $("newCategory").append(new Option("Seçin", ""));
  for (const c of body.categories ?? []) $("newCategory").append(new Option(c.name, c.slug));
}

$("addProduct").onclick = async () => {
  const entry = { name: $("newName").value.trim(), brand: $("newBrand").value.trim(), modelCode: $("newModel").value.trim(), gtin: $("newGtin").value.trim() };
  if (!entry.name || !entry.brand || !entry.modelCode) return msg("Ürün adı, marka ve model kodu gerekli.", "bad");
  if (!$("newCategory").value) return msg("Kategoriyi seçin.", "bad");
  $("addProduct").disabled = true;
  try {
    const { status, body } = await api("/api/products", { method: "POST", body: JSON.stringify({ ...entry, category: $("newCategory").value }) });
    if (status !== 200) return msg(body.error ?? `Hata (${status})`, "bad");
    // Kullanıcının onayladığı değerlerle eşleşsin diye sayfadan gelenlerin yerine geçer.
    Object.assign(product, { name: entry.name, brand: entry.brand, modelCode: entry.modelCode, gtin: entry.gtin || null });
    show("pick", false);
    await save();
  } catch {
    msg("Sunucuya ulaşılamadı. Web uygulaması çalışıyor mu? (" + cfg.server + ")", "bad");
  } finally {
    $("addProduct").disabled = false;
  }
};

$("save").onclick = save;

// Yeni site kuralı yazmak için: açık sayfanın HTML'ini yalnızca yerel sunucuya kaydeder.
$("savePage").onclick = async (e) => {
  e.preventDefault();
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      func: () => ({ url: location.href, html: document.documentElement.outerHTML }),
    });
    const { status, body } = await api("/api/page-sample", { method: "POST", body: JSON.stringify(result) });
    if (status === 200) msg(`Sayfa kaydedildi: ${body.file}`, "ok");
    else msg(body.error ?? `Hata (${status})`, "bad");
  } catch (err) {
    msg(`Sayfa kaydedilemedi: ${err?.message ?? err}`, "bad");
  }
};

init();
