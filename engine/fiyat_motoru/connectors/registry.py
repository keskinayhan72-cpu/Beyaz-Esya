"""Kaynak → konnektör eşlemesi ve GERÇEK entegrasyon durumu.

Burada 'implemented=False' olan kaynak için hiçbir otomatik veri toplanmaz.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SourcePlan:
    source_id: str
    implemented: bool
    planned_method: str
    requirement: str


PLANS: list[SourcePlan] = [
    SourcePlan("trendyol", False, "official_api (satış tarafı) / licensed_feed (alış tarafı)",
               "Satıcı API anahtarı (kendi mağaza fiyatlarınız). Genel fiyat için lisanslı veri sağlayıcı veya yazılı izin."),
    SourcePlan("hepsiburada", False, "official_api / licensed_feed", "Merchant API erişimi; genel fiyat için lisans/izin."),
    SourcePlan("amazon_tr", False, "official_api", "Amazon Associates ürün API'si (onaylı ortak hesabı) veya SP-API (satıcı)."),
    SourcePlan("n11", False, "official_api / licensed_feed", "Satıcı API anahtarı; genel fiyat için lisans/izin."),
    SourcePlan("pazarama", False, "official_api", "Satıcı API anahtarı."),
    SourcePlan("pttavm", False, "official_api", "Satıcı entegrasyon bilgileri."),
    SourcePlan("mediamarkt", False, "licensed_feed / permitted_crawl", "Affiliate feed veya yazılı izin; tarama için ToS incelemesi."),
    SourcePlan("teknosa", False, "licensed_feed / permitted_crawl", "Affiliate feed veya yazılı izin."),
    SourcePlan("vatan", False, "licensed_feed / permitted_crawl", "Affiliate feed veya yazılı izin."),
    SourcePlan("koctas", False, "licensed_feed / permitted_crawl", "Affiliate feed veya yazılı izin."),
    SourcePlan("arcelik", False, "licensed_feed (bayi listesi CSV)", "Bayi/distribütör fiyat listesi."),
    SourcePlan("vestel", False, "licensed_feed (bayi listesi CSV)", "Bayi/distribütör fiyat listesi."),
    SourcePlan("bosch", False, "licensed_feed (bayi listesi CSV)", "Bayi/distribütör fiyat listesi."),
    SourcePlan("manuel", True, "manual (CSV konnektörü)", "Çalışıyor: `fiyat-motoru import-csv`."),
    SourcePlan("usak_magaza", True, "manual (CSV konnektörü)", "Çalışıyor: kendi perakende fiyatlarınız."),
]
