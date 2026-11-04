"""Komut satırı.

  fiyat-motoru sources
  fiyat-motoru import-products katalog.csv
  fiyat-motoru import-csv --source manuel --origin manual_entry fiyatlar.csv
  fiyat-motoru rematch
  fiyat-motoru crawl --source teknosa [--product-id 3] [--url https://...]

DATABASE_URL ortam değişkeni zorunlu.
"""
from __future__ import annotations

import argparse
import csv
import io
import os
import sys
from pathlib import Path

import psycopg

from .connectors.csv_feed import CsvFeedConnector
from .connectors.http_policy import PoliteFetcher
from .connectors.permitted_crawl import MIN_DELAY_S, PermittedCrawlConnector, Target
from .connectors.registry import PLANS
from .db import ingest, rematch, upsert_product


def _conn() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL tanımlı değil")
    return psycopg.connect(url)


def cmd_sources(_: argparse.Namespace) -> int:
    with _conn() as c:
        status = dict(c.execute("select id, integration_status::text from sources").fetchall())
    for p in PLANS:
        flag = "ÇALIŞIYOR " if p.implemented else "BAĞLI DEĞİL"
        print(f"{flag:11} {p.source_id:12} db={status.get(p.source_id, '?'):14} {p.planned_method}\n            → {p.requirement}")
    return 0


def cmd_import_products(a: argparse.Namespace) -> int:
    text = Path(a.file).read_text(encoding="utf-8-sig")
    delim = ";" if text.split("\n", 1)[0].count(";") > text.split("\n", 1)[0].count(",") else ","
    ok, errs = 0, []
    with _conn() as c:
        for i, r in enumerate(csv.DictReader(io.StringIO(text), delimiter=delim), start=2):
            r = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
            try:
                with c.transaction():
                    upsert_product(c, r.get("brand", ""), r.get("model_code", ""), r.get("name", ""),
                                   r.get("category", ""), r.get("gtin") or None, r.get("energy_class") or None)
                ok += 1
            except (ValueError, psycopg.errors.UniqueViolation) as e:
                errs.append(f"satır {i}: {e}")
    print(f"{ok} ürün kaydedildi, {len(errs)} hata")
    for e in errs:
        print("  " + e)
    return 1 if errs else 0


def cmd_import_csv(a: argparse.Namespace) -> int:
    conn_ = CsvFeedConnector(a.source, a.origin, path=a.file)
    with _conn() as c:
        r = ingest(c, conn_)
    print(f"çalıştırma #{r.run_id} [{r.status}] görülen={r.seen} eşleşen={r.matched} eşleşmeyen={r.unmatched}")
    for e in r.errors:
        print("  " + e)
    return 0 if r.status == "ok" else 1


def cmd_rematch(_: argparse.Namespace) -> int:
    with _conn() as c:
        print(f"{rematch(c)} ilan yeniden eşleştirildi")
    return 0


def same_host(a: str | None, b: str | None) -> bool:
    from urllib.parse import urlsplit
    if not (a and b):
        return False
    ha, hb = (urlsplit(x).netloc.lower().removeprefix("www.") for x in (a, b))
    return ha == hb


def cmd_crawl(a: argparse.Namespace) -> int:
    with _conn() as c:
        row = c.execute("select access_method::text, base_url, search_url_template from sources where id=%s",
                        (a.source,)).fetchone()
        if not row:
            sys.exit(f"bilinmeyen kaynak: {a.source}")
        method, base_url, template = row
        # Arama şablonu kaynağın kendi sitesinde değilse (ör. Google araması) kullanılmaz.
        if not same_host(template, base_url):
            template = None
        q = "select brand, model_code, gtin from products where is_active"
        params: tuple = ()
        if a.product_id:
            q += " and id = any(%s)"
            params = (a.product_id,)
        targets = [] if a.url and not a.product_id else [Target(*r) for r in c.execute(q, params).fetchall()]
        fetcher = PoliteFetcher(a.source, permitted=(method == "permitted_crawl"), min_delay_s=max(a.delay, MIN_DELAY_S))
        conn_ = PermittedCrawlConnector(a.source, fetcher, search_url_template=template, targets=targets,
                                        urls=a.url or [])
        r = ingest(c, conn_)
        if r.status in ("ok", "partial") and r.seen > 0:
            c.execute("update sources set integration_status='live' where id=%s", (a.source,))
            c.commit()
    print(f"çalıştırma #{r.run_id} [{r.status}] görülen={r.seen} eşleşen={r.matched} eşleşmeyen={r.unmatched}")
    for e in r.errors:
        print("  " + e)
    return 0 if r.status in ("ok", "partial") else 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="fiyat-motoru")
    sub = p.add_subparsers(required=True)
    sub.add_parser("sources", help="Kaynakların gerçek entegrasyon durumu").set_defaults(fn=cmd_sources)
    s = sub.add_parser("import-products", help="Katalog CSV içe aktar")
    s.add_argument("file")
    s.set_defaults(fn=cmd_import_products)
    s = sub.add_parser("import-csv", help="Fiyat CSV/feed içe aktar")
    s.add_argument("--source", required=True)
    s.add_argument("--origin", required=True, choices=["manual_entry", "licensed_feed", "test_fixture"])
    s.add_argument("file")
    s.set_defaults(fn=cmd_import_csv)
    sub.add_parser("rematch", help="Eşleşmeyen ilanları yeniden eşleştir").set_defaults(fn=cmd_rematch)
    s = sub.add_parser("crawl", help="İzinli kaynaktan fiyat oku (robots.txt + izin + ≥5 sn bekleme)")
    s.add_argument("--source", required=True)
    s.add_argument("--product-id", type=int, action="append", help="yalnızca bu katalog ürünleri (tekrarlanabilir)")
    s.add_argument("--url", action="append", help="doğrudan ürün sayfası adresi (tekrarlanabilir)")
    s.add_argument("--delay", type=float, default=MIN_DELAY_S, help="istekler arası bekleme (en az 5 sn)")
    s.set_defaults(fn=cmd_crawl)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    raise SystemExit(main())
