"""Veritabanı yazımı: eşleştirme + ilan/gözlem kaydı + çalıştırma kaydı."""
from __future__ import annotations

import json
from dataclasses import dataclass, field

import psycopg

from .connectors.base import AccessBlocked, Connector, NotConfigured
from .matching import CatalogEntry, match_offer, normalize_code, normalize_gtin

REAL_AUTOMATED = {"official_api", "licensed_feed", "permitted_crawl"}


def load_catalog(conn: psycopg.Connection) -> list[CatalogEntry]:
    rows = conn.execute("select id, gtin, brand_norm, model_code_norm from products where is_active").fetchall()
    return [CatalogEntry(*r) for r in rows]


@dataclass
class IngestResult:
    run_id: int
    status: str
    seen: int = 0
    matched: int = 0
    unmatched: int = 0
    errors: list[str] = field(default_factory=list)


def ingest(conn: psycopg.Connection, connector: Connector) -> IngestResult:
    if not conn.execute("select 1 from sources where id=%s", (connector.source_id,)).fetchone():
        raise ValueError(f"bilinmeyen kaynak: {connector.source_id}")
    run_id = conn.execute(
        "insert into collector_runs (source_id, connector) values (%s,%s) returning id",
        (connector.source_id, connector.name)).fetchone()[0]
    conn.commit()
    catalog = load_catalog(conn)
    res = IngestResult(run_id=run_id, status="ok")
    try:
        with conn.transaction():
            for o in connector.fetch():
                res.seen += 1
                m = match_offer(o.gtin, o.brand, o.model_code, catalog)
                offer_id, product_id = conn.execute(
                    """insert into offers (source_id, side, product_id, match_method, source_sku, source_url,
                                          seller_name, title, gtin_raw, model_code_raw, brand_raw)
                       values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       on conflict (source_id, side, source_url) do update set
                         product_id = coalesce(offers.product_id, excluded.product_id),
                         match_method = case when offers.product_id is null then excluded.match_method else offers.match_method end,
                         seller_name = excluded.seller_name, title = excluded.title, gtin_raw = excluded.gtin_raw,
                         model_code_raw = excluded.model_code_raw, brand_raw = excluded.brand_raw
                       returning id, product_id""",
                    (connector.source_id, o.side, m.product_id, m.method, o.source_sku, o.source_url,
                     o.seller_name, o.title, o.gtin, o.model_code, o.brand)).fetchone()
                if product_id:
                    res.matched += 1
                else:
                    res.unmatched += 1
                conn.execute(
                    """insert into price_observations (offer_id, observed_at, origin, collected_by, price, shipping_fee,
                         in_stock, stock_qty, delivery, delivery_method_note, delivery_days, regional_restriction,
                         invoice, warranty, warranty_months, condition, raw)
                       values (%s, coalesce(%s, now()), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (offer_id, o.observed_at, connector.origin, connector.name, o.price, o.shipping_fee, o.in_stock,
                     o.stock_qty, o.delivery, o.delivery_method_note, o.delivery_days, o.regional_restriction,
                     o.invoice, o.warranty, o.warranty_months, o.condition,
                     json.dumps({**o.raw, "match_reason": m.reason}, ensure_ascii=False)))
        res.errors = list(getattr(connector, "errors", []))
        if res.errors:
            res.status = "partial"
        if connector.origin in REAL_AUTOMATED:
            conn.execute("update sources set last_success_at = now(), last_error = null where id=%s",
                         (connector.source_id,))
    except (AccessBlocked, NotConfigured) as e:
        res.status = "blocked"
        res.errors.append(str(e))
        conn.execute("update sources set last_error=%s where id=%s", (str(e), connector.source_id))
    except Exception as e:  # noqa: BLE001 — çalıştırma kaydına düşür, sonra yeniden fırlat
        conn.rollback()
        conn.execute("update collector_runs set status='failed', finished_at=now(), message=%s where id=%s",
                     (str(e), run_id))
        conn.commit()
        raise
    conn.execute(
        """update collector_runs set status=%s, finished_at=now(), offers_seen=%s, matched=%s, unmatched=%s,
           message=%s where id=%s""",
        (res.status, res.seen, res.matched, res.unmatched, "\n".join(res.errors)[:4000] or None, run_id))
    conn.commit()
    return res


def rematch(conn: psycopg.Connection) -> int:
    """Eşleşmemiş ilanları güncel katalogla yeniden eşleştirir."""
    catalog = load_catalog(conn)
    n = 0
    for oid, gtin, brand, model in conn.execute(
            "select id, gtin_raw, brand_raw, model_code_raw from offers where product_id is null").fetchall():
        m = match_offer(gtin, brand, model, catalog)
        if m.product_id:
            conn.execute("update offers set product_id=%s, match_method=%s where id=%s", (m.product_id, m.method, oid))
            n += 1
    conn.commit()
    return n


def upsert_product(conn: psycopg.Connection, brand: str, model_code: str, name: str, category: str,
                   gtin: str | None = None, energy_class: str | None = None) -> None:
    bn, mn = normalize_code(brand), normalize_code(model_code)
    if not (bn and mn and name):
        raise ValueError("marka, model kodu ve ad zorunlu")
    g = None
    if gtin:
        g = normalize_gtin(gtin)
        if not g:
            raise ValueError(f"geçersiz GTIN: {gtin}")
    cat = conn.execute("select id from categories where slug=%s or lower(name)=lower(%s)", (category, category)).fetchone()
    if not cat:
        raise ValueError(f"bilinmeyen kategori: {category}")
    conn.execute(
        """insert into products (brand, brand_norm, model_code, model_code_norm, gtin, name, category_id, energy_class)
           values (%s,%s,%s,%s,%s,%s,%s,%s)
           on conflict (brand_norm, model_code_norm) do update set gtin = coalesce(excluded.gtin, products.gtin),
             name = excluded.name, category_id = excluded.category_id, updated_at = now()""",
        (brand, bn, model_code, mn, g, name, cat[0], energy_class))
