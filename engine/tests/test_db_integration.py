from fiyat_motoru.connectors.csv_feed import CsvFeedConnector
from fiyat_motoru.db import ingest, rematch, upsert_product

HEADER = "side;source_url;brand;model_code;gtin;price;delivery;delivery_note\n"


def test_ingest_matches_and_records(db):
    upsert_product(db, "Bosch", "WAN28281TR", "Çamaşır Makinesi", "camasir_makinesi", gtin="4006381333931")
    db.commit()
    text = HEADER + (
        "buy;https://m/1;;;4006381333931;18000;verified;sepette 64100\n"   # GTIN ile
        "buy;https://m/2;BOSCH;wan 28281 tr;;18500;not_verified;\n"       # model kodu ile
        "buy;https://m/3;Bosch;WAN28281;;17000;not_verified;\n"           # varyant → eşleşmez
    )
    r = ingest(db, CsvFeedConnector("mediamarkt", "licensed_feed", text=text))
    assert (r.status, r.seen, r.matched, r.unmatched) == ("ok", 3, 2, 1)
    rows = db.execute("select source_url, match_method::text from offers order by source_url").fetchall()
    assert rows == [("https://m/1", "gtin"), ("https://m/2", "model_code"), ("https://m/3", None)]
    origin = db.execute("select distinct origin::text from price_observations").fetchall()
    assert origin == [("licensed_feed",)]
    assert db.execute("select last_success_at is not null from sources where id='mediamarkt'").fetchone()[0]

    # ikinci içe aktarma: aynı ilan için yeni gözlem eklenir (geçmiş korunur)
    ingest(db, CsvFeedConnector("mediamarkt", "licensed_feed", text=HEADER + "buy;https://m/1;;;4006381333931;17500;not_verified;\n"))
    assert db.execute("select count(*) from price_observations p join offers o on o.id=p.offer_id where o.source_url='https://m/1'").fetchone()[0] == 2
    latest = db.execute("select price from latest_offer_prices where source_url='https://m/1'").fetchone()[0]
    assert float(latest) == 17500


def test_rematch_after_catalog_grows(db):
    ingest(db, CsvFeedConnector("manuel", "manual_entry", text=HEADER + "buy;https://x/1;Vestel;ABC 123;;9000;not_verified;\n"))
    assert rematch(db) == 0
    upsert_product(db, "Vestel", "ABC-123", "Buzdolabı", "buzdolabi")
    db.commit()
    assert rematch(db) == 1


def test_purchase_requires_approver(db):
    import psycopg
    import pytest
    upsert_product(db, "Vestel", "ABC-123", "Buzdolabı", "buzdolabi")
    pid = db.execute("select id from products").fetchone()[0]
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("insert into purchase_list_items (product_id, expected_unit_price, status) values (%s, 100, 'approved')", (pid,))
    db.rollback()


def test_schema_rejects_bad_data(db):
    import psycopg
    import pytest
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("insert into products (brand, brand_norm, model_code, model_code_norm, gtin, name, category_id) "
                   "values ('a','A','b','B','123','x',1)")
    db.rollback()
