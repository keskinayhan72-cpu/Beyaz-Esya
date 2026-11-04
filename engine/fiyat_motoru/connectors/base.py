"""Konnektör sözleşmesi.

Her konnektör, kaynağın HANGİ yolla erişildiğini (origin) açıkça bildirir.
Konnektörler satın alma yapmaz; yalnızca fiyat/stok/teslimat bilgisini okur.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable

ORIGINS = {"official_api", "licensed_feed", "permitted_crawl", "manual_entry", "test_fixture"}
DELIVERY = {"verified", "not_verified", "restricted"}
INVOICE = {"e_fatura", "e_arsiv", "paper", "none", "unknown"}
WARRANTY = {"official_tr", "importer", "seller", "none", "unknown"}
CONDITION = {"new", "refurbished", "used", "unknown"}


class ConnectorError(Exception):
    pass


class NotConfigured(ConnectorError):
    """Kaynak için resmî/lisanslı erişim henüz yapılandırılmadı."""


class AccessBlocked(ConnectorError):
    """Kaynak erişimi engelledi (robots.txt, CAPTCHA, 403/429). Aşılmaz; çalıştırma durur."""


@dataclass
class RawOffer:
    source_url: str
    price: float
    side: str = "buy"
    title: str | None = None
    seller_name: str | None = None
    brand: str | None = None
    model_code: str | None = None
    gtin: str | None = None
    source_sku: str | None = None
    shipping_fee: float | None = None
    in_stock: bool | None = None
    stock_qty: int | None = None
    delivery: str = "not_verified"
    delivery_method_note: str | None = None
    delivery_days: int | None = None
    regional_restriction: str | None = None
    invoice: str = "unknown"
    warranty: str = "unknown"
    warranty_months: int | None = None
    condition: str = "unknown"
    observed_at: datetime | None = None
    raw: dict = field(default_factory=dict)

    def validate(self) -> None:
        if self.side not in ("buy", "sell"):
            raise ValueError(f"side geçersiz: {self.side}")
        if not (self.price > 0):
            raise ValueError("fiyat pozitif olmalı")
        if self.shipping_fee is not None and self.shipping_fee < 0:
            raise ValueError("kargo ücreti negatif olamaz")
        for name, allowed in (("delivery", DELIVERY), ("invoice", INVOICE),
                              ("warranty", WARRANTY), ("condition", CONDITION)):
            if getattr(self, name) not in allowed:
                raise ValueError(f"{name} geçersiz: {getattr(self, name)}")
        if self.delivery == "verified" and not self.delivery_method_note:
            raise ValueError("Uşak teslimatı 'verified' ise doğrulama yöntemi (delivery_note) zorunlu")
        if not self.source_url:
            raise ValueError("source_url zorunlu")


class Connector(ABC):
    source_id: str
    origin: str
    name: str

    @abstractmethod
    def fetch(self) -> Iterable[RawOffer]:
        ...
