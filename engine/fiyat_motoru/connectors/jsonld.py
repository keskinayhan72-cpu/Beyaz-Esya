"""Sayfadaki schema.org (JSON-LD) yapılandırılmış verisinden ürün/fiyat okuma.

Site HTML düzenine değil, sitenin arama motorları için yayımladığı standart veriye dayanır.
Fiyat sayfada yapılandırılmış olarak yoksa HİÇBİR şey tahmin edilmez; ürün atlanır.
"""
from __future__ import annotations

import html as htmllib
import json
import re
from dataclasses import dataclass
from urllib.parse import urljoin

_SCRIPT = re.compile(r"<script[^>]*type\s*=\s*[\"']application/ld\+json[\"'][^>]*>(.*?)</script>", re.S | re.I)


def _blocks(page: str) -> list:
    out = []
    for raw in _SCRIPT.findall(page):
        txt = htmllib.unescape(raw.strip())
        try:
            data = json.loads(txt)
        except json.JSONDecodeError:
            continue
        stack = [data]
        while stack:
            d = stack.pop()
            if isinstance(d, list):
                stack.extend(d)
            elif isinstance(d, dict):
                out.append(d)
                if "@graph" in d:
                    stack.append(d["@graph"])
    return out


def _types(d: dict) -> set[str]:
    t = d.get("@type")
    return {str(x) for x in (t if isinstance(t, list) else [t]) if x}


def _text(v) -> str | None:
    if isinstance(v, dict):
        v = v.get("name")
    if isinstance(v, list):
        v = v[0] if v else None
    return str(v).strip() if v not in (None, "") else None


def parse_price(v) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v) if v > 0 else None
    s = str(v).strip().replace("TL", "").replace("₺", "").replace(" ", "")
    if "," in s and "." in s:                       # 18.999,90
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        p = float(s)
    except ValueError:
        return None
    return p if p > 0 else None


def _avail(v) -> bool | None:
    s = str(v or "").lower()
    if not s:
        return None
    if any(k in s for k in ("instock", "limitedavailability", "onlineonly", "instoreonly")):
        return True
    if any(k in s for k in ("outofstock", "soldout", "discontinued")):
        return False
    return None


def _condition(v) -> str:
    s = str(v or "").lower()
    for key, val in (("refurbished", "refurbished"), ("used", "used"), ("new", "new")):
        if key in s:
            return val
    return "unknown"


@dataclass
class JsonLdOffer:
    name: str | None
    brand: str | None
    model_code: str | None
    gtin: str | None
    sku: str | None
    price: float
    currency: str | None
    in_stock: bool | None
    seller: str | None
    condition: str
    url: str


def product_offers(page: str, page_url: str) -> list[JsonLdOffer]:
    """Sayfadaki her schema.org Product için TRY fiyatlı teklifleri döndürür."""
    res: list[JsonLdOffer] = []
    for d in _blocks(page):
        if "Product" not in _types(d):
            continue
        gtin = next((_text(d.get(k)) for k in ("gtin13", "gtin", "gtin14", "gtin12", "gtin8", "ean") if d.get(k)), None)
        offers = d.get("offers") or []
        offers = offers if isinstance(offers, list) else [offers]
        flat = []
        for o in offers:
            if not isinstance(o, dict):
                continue
            if "AggregateOffer" in _types(o) and o.get("offers"):
                inner = o["offers"]
                flat.extend(x for x in (inner if isinstance(inner, list) else [inner]) if isinstance(x, dict))
            else:
                flat.append(o)
        for o in flat:
            spec = o.get("priceSpecification")
            spec = spec[0] if isinstance(spec, list) and spec else spec
            price = parse_price(o.get("price") if o.get("price") is not None
                                else (spec or {}).get("price") if isinstance(spec, dict) else None)
            if price is None and "AggregateOffer" in _types(o):
                price = parse_price(o.get("lowPrice"))   # en düşük ilan fiyatı (satıcı belirsiz)
            if price is None:
                continue
            cur = _text(o.get("priceCurrency") or ((spec or {}).get("priceCurrency") if isinstance(spec, dict) else None))
            if cur and cur.upper() not in ("TRY", "TL"):
                continue
            res.append(JsonLdOffer(
                name=_text(d.get("name")), brand=_text(d.get("brand")),
                model_code=_text(d.get("mpn")) or _text(d.get("model")), gtin=gtin, sku=_text(d.get("sku")),
                price=price, currency=cur, in_stock=_avail(o.get("availability")),
                seller=_text(o.get("seller")), condition=_condition(o.get("itemCondition")),
                url=urljoin(page_url, _text(o.get("url")) or _text(d.get("url")) or page_url)))
    return res


def item_list_urls(page: str, page_url: str) -> list[str]:
    """Arama/liste sayfasındaki schema.org ItemList öğelerinin bağlantıları (sıralı, tekrarsız)."""
    urls: list[str] = []
    for d in _blocks(page):
        if "ItemList" not in _types(d):
            continue
        for el in d.get("itemListElement") or []:
            if not isinstance(el, dict):
                continue
            item = el.get("item")
            u = el.get("url") or (item.get("url") if isinstance(item, dict) else item if isinstance(item, str) else None)
            if u:
                full = urljoin(page_url, str(u))
                if full not in urls:
                    urls.append(full)
    return urls
