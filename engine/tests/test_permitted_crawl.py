"""İzinli tarama okuyucusu testleri. Sayfalar tests/html altındaki HAYALİ örneklerdir."""
from pathlib import Path

import pytest

from fiyat_motoru.connectors.base import AccessBlocked, NotConfigured
from fiyat_motoru.connectors.http_policy import PoliteFetcher, Response
from fiyat_motoru.connectors.jsonld import item_list_urls, parse_price, product_offers
from fiyat_motoru.connectors.permitted_crawl import PermittedCrawlConnector, Target
from fiyat_motoru.cli import same_host

H = Path(__file__).parent / "html"
SEARCH = "https://shop.invalid/ara?q={q}"


def page(name):
    return Response(200, (H / name).read_text(encoding="utf-8"))


class Net:
    def __init__(self, routes):
        self.routes, self.calls = routes, []

    def __call__(self, url, headers):
        self.calls.append(url)
        return self.routes.get(url, Response(404, ""))


def connector(routes, permitted=True, **kw):
    net, t = Net(routes), [0.0]
    f = PoliteFetcher("teknosa", permitted=permitted, min_delay_s=5, transport=net, clock=lambda: t[0],
                      sleep=lambda s: t.__setitem__(0, t[0] + s))
    return PermittedCrawlConnector("teknosa", f, search_url_template=SEARCH, **kw), net


ROUTES = {
    "https://shop.invalid/robots.txt": Response(200, "User-agent: *\nDisallow: /hesabim/\n"),
    "https://shop.invalid/ara?q=2000000000015": page("arama.html"),
    "https://shop.invalid/p/tst-cm-001": page("urun.html"),
    "https://shop.invalid/p/tst-cm-001-x": page("urun_baska_varyant.html"),
}


@pytest.mark.parametrize("raw,val", [("12.345,60", 12345.6), ("12,345.60", 12345.6), ("18999", 18999.0),
                                     ("₺ 1.250,00", 1250.0), (0, None), ("yok", None)])
def test_parse_price(raw, val):
    assert parse_price(raw) == val


def test_jsonld_product_and_itemlist():
    o, = product_offers(page("urun.html").text, "https://shop.invalid/p/tst-cm-001")
    assert (o.price, o.gtin, o.model_code, o.brand, o.seller, o.in_stock, o.condition) == (
        12345.6, "2000000000015", "TST-CM-001", "TESTMARKA", "Test Satıcı A", True, "new")
    assert item_list_urls(page("arama.html").text, "https://shop.invalid/ara?q=x") == [
        "https://shop.invalid/p/tst-cm-001", "https://shop.invalid/p/tst-cm-001-x", "https://baska-site.invalid/p/9"]
    assert product_offers(page("fiyatsiz.html").text, "https://x.invalid/") == []   # tahmin yok


def test_crawl_by_gtin_keeps_only_matching_offer_and_never_verifies_delivery():
    c, net = connector(ROUTES, targets=[Target("TESTMARKA", "TST-CM-001", "2000000000015")])
    offers = list(c.fetch())
    assert len(offers) == 1                                    # varyant (farklı EAN) elendi
    o = offers[0]
    o.validate()
    assert (o.price, o.gtin, o.delivery, c.origin) == (12345.6, "2000000000015", "not_verified", "permitted_crawl")
    assert not any("baska-site" in u for u in net.calls)       # başka siteye istek yok


def test_crawl_falls_back_to_brand_model_query():
    routes = {**ROUTES, "https://shop.invalid/ara?q=TESTMARKA+TST-CM-001": page("arama.html")}
    c, net = connector(routes, targets=[Target("TESTMARKA", "TST-CM-001")])
    offers = list(c.fetch())
    assert "https://shop.invalid/ara?q=TESTMARKA+TST-CM-001" in net.calls
    assert [o.model_code for o in offers] == ["TST-CM-001"]   # 'TST-CM-001X' eşleşme sayılmadı


def test_crawl_stops_on_captcha_without_retry():
    routes = {**ROUTES, "https://shop.invalid/p/tst-cm-001": Response(200, "<div class=g-recaptcha></div>")}
    c, net = connector(routes, targets=[Target("TESTMARKA", "TST-CM-001", "2000000000015")])
    with pytest.raises(AccessBlocked):
        list(c.fetch())
    assert net.calls.count("https://shop.invalid/p/tst-cm-001") == 1
    assert "https://shop.invalid/p/tst-cm-001-x" not in net.calls   # durdu, devam etmedi


def test_crawl_respects_robots_for_search():
    routes = {**ROUTES, "https://shop.invalid/robots.txt": Response(200, "User-agent: *\nDisallow: /ara\n")}
    c, net = connector(routes, targets=[Target("TESTMARKA", "TST-CM-001", "2000000000015")])
    with pytest.raises(AccessBlocked):
        list(c.fetch())
    assert net.calls == ["https://shop.invalid/robots.txt"]


def test_crawl_requires_permission_and_min_delay():
    c, net = connector(ROUTES, permitted=False, targets=[Target("TESTMARKA", "TST-CM-001")])
    with pytest.raises(NotConfigured):
        list(c.fetch())
    assert net.calls == []
    with pytest.raises(ValueError):
        PermittedCrawlConnector("x", PoliteFetcher("x", permitted=True, min_delay_s=1))


def test_direct_url_and_missing_structured_data_reported():
    routes = {**ROUTES, "https://shop.invalid/p/bos": page("fiyatsiz.html")}
    c, _ = connector(routes, urls=["https://shop.invalid/p/tst-cm-001", "https://shop.invalid/p/bos",
                                   "https://baska-site.invalid/p/1"])
    assert [o.price for o in c.fetch()] == [12345.6]
    assert any("yapılandırılmış fiyat verisi yok" in e for e in c.errors)
    assert any("başka siteye" in e for e in c.errors)


def test_search_template_must_be_on_source_site():
    assert same_host("https://www.teknosa.com/arama/?s={q}", "https://www.teknosa.com")
    assert not same_host("https://www.google.com/search?q=site%3Akoctas.com.tr+{q}", "https://www.koctas.com.tr")


def test_ingest_records_real_origin_and_blocked_error(db):
    from fiyat_motoru.db import ingest, upsert_product
    upsert_product(db, "TESTMARKA", "TST-CM-001", "Test Çamaşır Makinesi", "camasir_makinesi", gtin="2000000000015")
    db.commit()
    c, _ = connector(ROUTES, targets=[Target("TESTMARKA", "TST-CM-001", "2000000000015")])
    r = ingest(db, c)
    assert (r.status, r.seen, r.matched) == ("ok", 1, 1)
    assert db.execute("select origin::text, delivery::text from price_observations").fetchall() == [
        ("permitted_crawl", "not_verified")]

    blocked = {**ROUTES, "https://shop.invalid/p/tst-cm-001": Response(429, "")}
    c, _ = connector(blocked, targets=[Target("TESTMARKA", "TST-CM-001", "2000000000015")])
    r = ingest(db, c)
    assert r.status == "blocked"
    assert "429" in db.execute("select last_error from sources where id='teknosa'").fetchone()[0]
