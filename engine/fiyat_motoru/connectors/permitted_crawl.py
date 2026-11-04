"""İzinli tarama okuyucusu (tüm kaynaklar için ortak).

Akış (her katalog ürünü için):
  1. Arama: EAN varsa EAN ile, yoksa "marka model" ile kaynağın search_url_template adresi.
  2. Arama sayfasındaki schema.org ItemList bağlantılarından ilk birkaç ürün sayfası.
  3. Ürün sayfasındaki schema.org Product/Offer verisi → fiyat, stok, satıcı.
  4. Yalnızca EAN'ı ya da model kodu katalogla uyuşan teklifler alınır.
Tüm istekler PoliteFetcher'dan geçer (izin, robots.txt, ≥5 sn bekleme, CAPTCHA/403/429 → dur).
Uşak teslimatı sayfadan doğrulanamaz → delivery='not_verified'.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable
from urllib.parse import quote_plus, urlsplit

from .base import AccessBlocked, Connector, NotConfigured, RawOffer
from .http_policy import PoliteFetcher
from .jsonld import item_list_urls, product_offers
from ..matching import normalize_code, normalize_gtin

MIN_DELAY_S = 5.0


@dataclass
class Target:
    brand: str
    model_code: str
    gtin: str | None = None


def _relevant(o, t: Target) -> bool:
    tg = normalize_gtin(t.gtin) if t.gtin else None
    og = normalize_gtin(o.gtin) if o.gtin else None
    if tg and og:
        return tg == og
    want = normalize_code(t.model_code)
    if not want:
        return False
    codes = [normalize_code(x) for x in (o.model_code, o.sku) if x]
    if codes:                                  # yapılandırılmış kod varsa birebir eşitlik (varyantlar elenir)
        return want in codes
    return want in {normalize_code(w) for w in (o.name or "").split()}


@dataclass
class PermittedCrawlConnector(Connector):
    source_id: str
    fetcher: PoliteFetcher
    search_url_template: str | None = None
    targets: list[Target] = field(default_factory=list)
    urls: list[str] = field(default_factory=list)        # doğrudan ürün sayfaları
    max_pages_per_target: int = 3
    origin: str = "permitted_crawl"
    errors: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.name = f"permitted_crawl:{self.source_id}"
        if self.fetcher.min_delay_s < MIN_DELAY_S:
            raise ValueError(f"min_delay_s en az {MIN_DELAY_S} sn olmalı")

    def _host_ok(self, url: str) -> bool:
        if not self.search_url_template:
            return True
        return urlsplit(url).netloc == urlsplit(self.search_url_template).netloc

    def _offers_from(self, url: str, target: Target | None) -> Iterable[RawOffer]:
        page = self.fetcher.get(url)
        found = product_offers(page, url)
        if not found:
            self.errors.append(f"yapılandırılmış fiyat verisi yok: {url}")
        for o in found:
            if target and not _relevant(o, target):
                continue
            yield RawOffer(
                source_url=o.url, price=o.price, title=o.name, seller_name=o.seller,
                brand=o.brand or (target.brand if target else None),
                model_code=o.model_code or (target.model_code if target and not o.gtin else None),
                gtin=o.gtin, source_sku=o.sku, in_stock=o.in_stock, condition=o.condition,
                delivery="not_verified", raw={"via": "schema.org JSON-LD", "page": url, "currency": o.currency})

    def fetch(self) -> Iterable[RawOffer]:
        # AccessBlocked / NotConfigured yukarı fırlar: o kaynak için çalıştırma durur.
        for u in self.urls:
            if not self._host_ok(u):
                self.errors.append(f"başka siteye ait adres atlandı: {u}")
                continue
            yield from self._offers_from(u, None)
        for t in self.targets:
            if not self.search_url_template:
                raise NotConfigured(f"{self.source_id}: arama adresi şablonu tanımlı değil")
            q = t.gtin or f"{t.brand} {t.model_code}"
            search = self.search_url_template.replace("{q}", quote_plus(q))
            page = self.fetcher.get(search)
            direct = [o for o in product_offers(page, search) if _relevant(o, t)]
            links = [u for u in item_list_urls(page, search) if self._host_ok(u)][: self.max_pages_per_target]
            if not direct and not links:
                self.errors.append(f"aramada yapılandırılmış sonuç yok: {q}")
            for o in direct:   # bazı siteler (ör. karşılaştırma) arama sayfasında Product yayımlar
                yield RawOffer(source_url=o.url, price=o.price, title=o.name, seller_name=o.seller,
                               brand=o.brand or t.brand, model_code=o.model_code, gtin=o.gtin,
                               source_sku=o.sku, in_stock=o.in_stock, condition=o.condition,
                               delivery="not_verified", raw={"via": "schema.org JSON-LD", "page": search})
            for u in links:
                yield from self._offers_from(u, t)


__all__ = ["PermittedCrawlConnector", "Target", "AccessBlocked", "MIN_DELAY_S"]
