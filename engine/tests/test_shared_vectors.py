import pytest

from fiyat_motoru.connectors.csv_feed import parse_tr_number
from fiyat_motoru.matching import CatalogEntry, is_valid_gtin, match_offer, normalize_code, normalize_gtin
from fiyat_motoru.profit import calculate_profit


def test_profit_vectors(shared):
    for case in shared["profit"]["cases"]:
        r = calculate_profit(case["input"])
        for k, v in case["expected"].items():
            assert r[k] == pytest.approx(v, abs=1e-4), (case["name"], k)


def test_break_even(shared):
    inp = shared["profit"]["cases"][0]["input"]
    be = calculate_profit(inp)["breakEvenSaleGross"]
    assert calculate_profit({**inp, "saleGross": be})["netProfit"] == pytest.approx(0, abs=1e-6)


def test_profit_rejects_negative(shared):
    with pytest.raises(ValueError):
        calculate_profit({**shared["profit"]["cases"][0]["input"], "purchaseGross": -5})


def test_gtin_vectors(shared):
    for v in shared["ids"]["gtin"]:
        assert is_valid_gtin(v["raw"].replace("-", "")) is v["valid"], v
        assert normalize_gtin(v["raw"]) == v["normalized"], v


def test_code_vectors(shared):
    for v in shared["ids"]["code"]:
        assert normalize_code(v["raw"]) == v["normalized"], v


def test_strict_matching():
    cat = [CatalogEntry(1, "04006381333931", "BOSCH", "WAN28281TR"), CatalogEntry(2, None, "ARCELIK", "9120NFI")]
    assert match_offer("4006381333931", None, None, cat).product_id == 1
    assert match_offer(None, "Arçelik", "9120 NFI", cat).method == "model_code"
    assert match_offer(None, "Bosch", "WAN28281", cat).product_id is None          # varyant: otomatik eşleşmez
    assert match_offer("73513537", "Bosch", "WAN28281TR", cat).product_id is None  # GTIN çelişkisi


@pytest.mark.parametrize("raw,n", [("18.999,90", 18999.9), ("18999,90", 18999.9), ("18999.90", 18999.9),
                                   ("18.999", 18999), ("1,234.50", 1234.5), ("₺ 21.500", 21500), ("abc", None), ("", None)])
def test_parse_tr_number(raw, n):
    assert parse_tr_number(raw) == n
