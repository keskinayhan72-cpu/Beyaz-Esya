import { extractProduct } from "./extract.js";

const $ = (id) => document.getElementById(id);
let cfg = { server: "http://localhost:3000", token: "" };
let product = null;
let chosenProductId = null;

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
  return { url: location.href, jsonLd, meta, title: document.title };
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
  let raw;
  try {
    [{ result: raw }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPage });
  } catch {
    msg("Bu sayfa okunamıyor. Bir ürün sayfası açıp tekrar deneyin.", "bad"); $("save").disabled = true; return;
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
      li.textContent = `${o.price.toLocaleString("tr-TR")} ₺ — ${o.seller ?? "satıcı adı yok"}`;
      li.onclick = () => { $("price").value = String(o.price).replace(".", ","); $("seller").value = o.seller ?? ""; };
      $("offers").append(li);
    }
  }
}

$("delivery").onchange = () => show("noteWrap", $("delivery").value === "verified");
$("openSettings").onclick = (e) => { e.preventDefault(); show("settings", true); };
$("saveSettings").onclick = async () => {
  await chrome.storage.local.set({ server: $("server").value.trim(), token: $("token").value.trim() });
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
      msg(`Katalogda eşleşmedi (${body.reason}). Aşağıdan ürünü seçin; katalogda yoksa önce web uygulamasında ekleyin.`, "warn");
    } else {
      msg(body.error ?? `Hata (${status})`, "bad");
    }
  } catch {
    msg("Sunucuya ulaşılamadı. Web uygulaması çalışıyor mu? (" + cfg.server + ")", "bad");
  } finally {
    $("save").disabled = false;
  }
}
$("save").onclick = save;

init();
