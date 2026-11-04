"""GTIN doğrulama, model kodu normalizasyonu ve sıkı eşleştirme.

web/src/lib/domain/identifiers.ts ile aynı kurallar (shared/identifier_vectors.json).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_TR = str.maketrans({"ı": "I", "i": "I", "İ": "I", "ş": "S", "Ş": "S", "ğ": "G", "Ğ": "G",
                     "ü": "U", "Ü": "U", "ö": "O", "Ö": "O", "ç": "C", "Ç": "C"})


def is_valid_gtin(raw: str) -> bool:
    digits = re.sub(r"[\s-]", "", raw or "")
    if not digits.isdigit() or not digits.isascii() or len(digits) not in (8, 12, 13, 14):
        return False
    if set(digits) == {"0"}:
        return False
    body, check = digits[:-1], int(digits[-1])
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def normalize_gtin(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = re.sub(r"[\s-]", "", raw)
    return digits.zfill(14) if is_valid_gtin(digits) else None


def normalize_code(raw: str | None) -> str:
    if not raw:
        return ""
    return re.sub(r"[^A-Z0-9]", "", raw.translate(_TR).upper())


@dataclass(frozen=True)
class CatalogEntry:
    id: int
    gtin: str | None
    brand_norm: str
    model_code_norm: str


@dataclass(frozen=True)
class Match:
    product_id: int | None
    method: str | None  # 'gtin' | 'model_code' | None
    reason: str | None = None


def match_offer(gtin: str | None, brand: str | None, model_code: str | None,
                catalog: list[CatalogEntry]) -> Match:
    g = normalize_gtin(gtin)
    if g:
        for p in catalog:
            if p.gtin == g:
                return Match(p.id, "gtin")
    b, m = normalize_code(brand), normalize_code(model_code)
    if b and m:
        hits = [p for p in catalog if p.brand_norm == b and p.model_code_norm == m]
        if len(hits) == 1:
            if g and hits[0].gtin and hits[0].gtin != g:
                return Match(None, None, "Model kodu eşleşti fakat GTIN farklı — elle inceleyin")
            return Match(hits[0].id, "model_code")
    return Match(None, None, "GTIN katalogda yok" if g else "GTIN yok/geçersiz ve model kodu eşleşmedi")
