"""CSV/feeds konnektörü.

Kullanım alanları (hepsi gerçek, izinli yollar):
  - Kullanıcının elle derlediği ve doğruladığı fiyat listesi  → origin=manual_entry
  - Distribütör/bayi fiyat listesi, lisanslı veri sağlayıcı dökümü → origin=licensed_feed
  - Geliştirme testleri için hayali ürün verisi                → origin=test_fixture

Sütunlar (başlık satırı zorunlu, ayırıcı ; veya ,):
  side, source_url, seller, title, brand, model_code, gtin, sku, price, shipping_fee,
  in_stock, stock_qty, delivery, delivery_note, delivery_days, regional_restriction,
  invoice, warranty, warranty_months, condition, observed_at
"""
from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from .base import ORIGINS, Connector, RawOffer


def parse_tr_number(raw: str | None) -> float | None:
    """'18.999,90' / '18999,90' / '18999.90' / '18.999' → float. web/src/lib/format.ts ile aynı."""
    if raw is None:
        return None
    s = re.sub(r"\s|₺|TL|tl", "", str(raw))
    if not s:
        return None
    has_dot, has_comma = "." in s, "," in s
    if has_dot and has_comma:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif has_comma:
        if re.fullmatch(r"\d{1,3}(,\d{3})+", s) and not re.fullmatch(r"\d+,\d{1,2}", s):
            s = s.replace(",", "")
        else:
            s = s.replace(",", ".", 1)
    elif has_dot and re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "")
    if not re.fullmatch(r"-?\d+(\.\d+)?", s):
        return None
    return float(s)


def _bool(v: str | None) -> bool | None:
    v = (v or "").strip().lower()
    if v in ("1", "true", "evet", "var", "yes"):
        return True
    if v in ("0", "false", "hayir", "hayır", "yok", "no"):
        return False
    return None


def _int(v: str | None) -> int | None:
    n = parse_tr_number(v)
    return int(n) if n is not None else None


def _dt(v: str | None) -> datetime | None:
    v = (v or "").strip()
    if not v:
        return None
    d = datetime.fromisoformat(v)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


class CsvFeedConnector(Connector):
    def __init__(self, source_id: str, origin: str, path: str | Path | None = None, text: str | None = None):
        if origin not in ORIGINS:
            raise ValueError(f"origin geçersiz: {origin}")
        if origin in ("official_api", "permitted_crawl"):
            raise ValueError("CSV dosyası resmî API veya tarama kökenli olarak işaretlenemez")
        self.source_id, self.origin, self.name = source_id, origin, f"csv:{origin}"
        self._text = text if text is not None else Path(path).read_text(encoding="utf-8-sig")  # type: ignore[arg-type]
        self.errors: list[str] = []

    def fetch(self) -> Iterable[RawOffer]:
        text = self._text.lstrip("﻿")
        first = text.split("\n", 1)[0]
        delim = ";" if first.count(";") > first.count(",") else ","
        reader = csv.DictReader(io.StringIO(text), delimiter=delim)
        for lineno, row in enumerate(reader, start=2):
            r = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            if not any(r.values()):
                continue
            try:
                price = parse_tr_number(r.get("price"))
                if price is None:
                    raise ValueError("fiyat okunamadı")
                offer = RawOffer(
                    side=r.get("side") or "buy", source_url=r.get("source_url", ""), price=price,
                    title=r.get("title") or None, seller_name=r.get("seller") or None,
                    brand=r.get("brand") or None, model_code=r.get("model_code") or None,
                    gtin=r.get("gtin") or None, source_sku=r.get("sku") or None,
                    shipping_fee=parse_tr_number(r.get("shipping_fee")),
                    in_stock=_bool(r.get("in_stock")), stock_qty=_int(r.get("stock_qty")),
                    delivery=r.get("delivery") or "not_verified",
                    delivery_method_note=r.get("delivery_note") or None,
                    delivery_days=_int(r.get("delivery_days")),
                    regional_restriction=r.get("regional_restriction") or None,
                    invoice=r.get("invoice") or "unknown", warranty=r.get("warranty") or "unknown",
                    warranty_months=_int(r.get("warranty_months")),
                    condition=r.get("condition") or "unknown", observed_at=_dt(r.get("observed_at")),
                    raw={"csv_line": lineno},
                )
                offer.validate()
            except ValueError as e:
                self.errors.append(f"satır {lineno}: {e}")
                continue
            yield offer
