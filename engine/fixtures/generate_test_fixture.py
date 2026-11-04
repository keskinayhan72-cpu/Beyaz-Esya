"""HAYALİ test verisi üretir (gerçek ürün/fiyat DEĞİLDİR).

- Marka: "TESTMARKA" (var olmayan marka)
- GTIN: GS1 '200' öneki — mağaza içi/kısıtlı dolaşım aralığı; perakende ürünlerle çakışmaz
- URL'ler: RFC 2606 '.invalid' alan adı — hiçbir yere gitmez
- İçe aktarılırken origin='test_fixture' olarak işaretlenir; arayüzde mor "TEST VERİSİ"
  etiketiyle gösterilir ve hiçbir zaman fırsat olarak işaretlenmez.

Kullanım: python generate_test_fixture.py ÇIKTI_DİZİNİ
"""
from __future__ import annotations

import csv
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def gtin13(n: int) -> str:
    body = f"200{n:09d}"
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return body + str((10 - total % 10) % 10)


PRODUCTS = [
    ("TST-BZ-001", "Test Buzdolabı No-Frost 500 L", "buzdolabi", 32000),
    ("TST-BZ-002", "Test Buzdolabı Kombi 400 L", "buzdolabi", 24000),
    ("TST-CM-001", "Test Çamaşır Makinesi 9 kg", "camasir_makinesi", 17000),
    ("TST-CM-002", "Test Çamaşır Makinesi 10 kg", "camasir_makinesi", 21000),
    ("TST-BL-001", "Test Bulaşık Makinesi 5 Programlı", "bulasik_makinesi", 15000),
    ("TST-KR-001", "Test Kurutma Makinesi 9 kg", "kurutma_makinesi", 23000),
    ("TST-DD-001", "Test Derin Dondurucu 300 L", "derin_dondurucu", 16000),
    ("TST-FR-001", "Test Ankastre Fırın 72 L", "firin", 11000),
]

# (kaynak, Uşak teslimat, stok, fatura, garanti, durum, kısıt)
BUY_PROFILES = [
    ("manuel",     "verified",     "true",  "e_fatura", "official_tr", "new", ""),
    ("mediamarkt", "not_verified", "true",  "e_fatura", "official_tr", "new", ""),
    ("teknosa",    "restricted",   "true",  "e_fatura", "official_tr", "new", ""),
    ("koctas",     "verified",     "false", "e_arsiv",  "official_tr", "new", ""),
    ("vatan",      "not_verified", "",      "unknown",  "unknown",     "unknown", "Yalnızca İstanbul, Ankara, İzmir"),
]
SELL_SOURCES = ["trendyol", "hepsiburada", "amazon_tr", "usak_magaza"]


def main(out: Path) -> None:
    rnd = random.Random(42)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "test_products.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["brand", "model_code", "gtin", "name", "category"])
        for i, (model, name, cat, _) in enumerate(PRODUCTS, start=1):
            w.writerow(["TESTMARKA", model, gtin13(i), name, cat])

    cols = ["side", "source_url", "seller", "title", "brand", "model_code", "gtin", "price", "shipping_fee",
            "in_stock", "delivery", "delivery_note", "regional_restriction", "invoice", "warranty", "condition",
            "observed_at"]
    by_source: dict[str, list[list[str]]] = {}
    for i, (model, name, _, base) in enumerate(PRODUCTS, start=1):
        for day in range(14, -1, -1):  # 15 günlük geçmiş
            t = (now - timedelta(days=day, hours=rnd.randint(0, 3))).isoformat()
            if day == 0:
                t = (now - timedelta(minutes=30)).isoformat()
            drift = 1 + 0.04 * ((day % 5) - 2) / 2
            for src, deliv, stock, inv, war, cond, restr in BUY_PROFILES:
                if (i + len(src)) % 4 == 0 and src != "manuel":
                    continue
                price = round(base * drift * rnd.uniform(0.93, 1.05), -1)
                by_source.setdefault(src, []).append([
                    "buy", f"https://{src}.example.invalid/urun/{model}", f"{src} test satıcı", name, "TESTMARKA",
                    model, gtin13(i) if src != "vatan" else "", f"{price:.2f}", "0" if src != "vatan" else "",
                    stock, deliv, "test verisi — doğrulama simülasyonu" if deliv == "verified" else "",
                    restr, inv, war, cond, t])
            for src in SELL_SOURCES:
                mult = 1.20 if src == "usak_magaza" else rnd.uniform(1.18, 1.38)
                price = round(base * drift * mult, -1)
                by_source.setdefault(src, []).append([
                    "sell", f"https://{src}.example.invalid/rakip/{model}", f"{src} rakip", name, "TESTMARKA",
                    model, gtin13(i), f"{price:.2f}", "", "true", "not_verified", "", "", "unknown", "unknown",
                    "new", t])
    # eşleşmeyen ilan örneği (katalogda olmayan model)
    by_source["mediamarkt"].append(["buy", "https://mediamarkt.example.invalid/urun/TST-XX-999", "", "Test bilinmeyen model",
                                    "TESTMARKA", "TST-XX-999", "", "9999.00", "", "", "not_verified", "", "", "unknown",
                                    "unknown", "unknown", now.isoformat()])
    for src, rows in by_source.items():
        with open(out / f"test_offers_{src}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(cols)
            w.writerows(rows)
    print(f"{len(PRODUCTS)} hayali ürün, {sum(map(len, by_source.values()))} hayali gözlem → {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
