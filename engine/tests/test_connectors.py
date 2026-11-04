import pytest

from fiyat_motoru.connectors.base import AccessBlocked, NotConfigured
from fiyat_motoru.connectors.csv_feed import CsvFeedConnector
from fiyat_motoru.connectors.http_policy import PoliteFetcher, Response
from fiyat_motoru.connectors.registry import PLANS

HEADER = "side;source_url;brand;model_code;gtin;price;shipping_fee;in_stock;delivery;delivery_note;invoice;warranty;condition\n"


def test_csv_parses_valid_and_reports_invalid_rows():
    text = HEADER + (
        "buy;https://a/1;Bosch;WAN1;4006381333931;18.999,90;0;evet;verified;64100 sepette görüldü;e_fatura;official_tr;new\n"
        "buy;https://a/2;Bosch;WAN2;;abc;;;;;;;\n"                                   # fiyat hatalı
        "buy;https://a/3;Bosch;WAN3;;1000;;;verified;;;;\n"                         # doğrulama notu yok
        "buy;https://a/4;Bosch;WAN4;;1000;;;teleport;;;;\n"                         # geçersiz enum
    )
    c = CsvFeedConnector("manuel", "manual_entry", text=text)
    offers = list(c.fetch())
    assert len(offers) == 1
    o = offers[0]
    assert (o.price, o.in_stock, o.delivery, o.invoice) == (18999.9, True, "verified", "e_fatura")
    assert len(c.errors) == 3 and "satır 3" in c.errors[0]


def test_csv_cannot_claim_api_or_crawl_origin():
    for origin in ("official_api", "permitted_crawl"):
        with pytest.raises(ValueError):
            CsvFeedConnector("trendyol", origin, text=HEADER)


def test_registry_is_honest():
    implemented = {p.source_id for p in PLANS if p.implemented}
    assert implemented == {"manuel", "usak_magaza"}  # pazaryeri konnektörleri henüz yok


class FakeNet:
    def __init__(self, routes):
        self.routes, self.calls = routes, []

    def __call__(self, url, headers):
        self.calls.append(url)
        return self.routes.get(url, Response(404, ""))


def make(routes, permitted=True):
    net = FakeNet(routes)
    t = [0.0]
    f = PoliteFetcher("x", permitted=permitted, min_delay_s=5, transport=net, clock=lambda: t[0],
                      sleep=lambda s: t.__setitem__(0, t[0] + s))
    return f, net, t


def test_fetcher_requires_explicit_permission():
    f, net, _ = make({})
    f.permitted = False
    with pytest.raises(NotConfigured):
        f.get("https://shop.example/p/1")
    assert net.calls == []


def test_fetcher_respects_robots():
    f, net, _ = make({"https://shop.example/robots.txt": Response(200, "User-agent: *\nDisallow: /p/\n")})
    with pytest.raises(AccessBlocked):
        f.get("https://shop.example/p/1")
    assert net.calls == ["https://shop.example/robots.txt"]  # ürün sayfasına istek atılmadı


@pytest.mark.parametrize("resp", [Response(200, "<div class='g-recaptcha'></div>"), Response(429, ""), Response(403, "")])
def test_fetcher_stops_on_captcha_or_block(resp):
    f, net, _ = make({"https://shop.example/robots.txt": Response(404, ""), "https://shop.example/p/1": resp})
    with pytest.raises(AccessBlocked):
        f.get("https://shop.example/p/1")
    assert net.calls.count("https://shop.example/p/1") == 1  # yeniden deneme yok


def test_fetcher_rate_limits_per_host():
    ok = Response(200, "<html>fiyat</html>")
    f, _, t = make({"https://shop.example/robots.txt": Response(404, ""),
                    "https://shop.example/a": ok, "https://shop.example/b": ok})
    f.get("https://shop.example/a")
    before = t[0]
    f.get("https://shop.example/b")
    assert t[0] - before >= 5


def test_robots_wildcards_groups_and_precedence():
    from fiyat_motoru.connectors.robots import Robots
    r = Robots.parse("﻿User-agent: *\nUser-agent: Googlebot\nDisallow: /*?q=\nDisallow: /arama\n"
                     "Disallow: /*.pdf$\nAllow: /arama/izinli\n\nUser-agent: KotuBot\nDisallow: /\n")
    ok = lambda p: r.can_fetch("BeyazEsyaFirsatMotoru", "https://s.invalid" + p)  # noqa: E731
    assert not ok("/sr?q=WAN28281TR")          # urllib.robotparser bunu izinli sanır
    assert not ok("/arama?x=1") and ok("/arama/izinli/1")   # en uzun kural kazanır
    assert not ok("/dosya.pdf") and ok("/dosya.pdf?v=1")    # '$' satır sonu
    assert ok("/bosch/wan28281tr-p-123")
    assert ok("/x")
