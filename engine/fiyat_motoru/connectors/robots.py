"""robots.txt yorumlayıcısı (RFC 9309).

Python'un urllib.robotparser modülü '*' ve '$' joker karakterlerini desteklemez; örneğin
'Disallow: /*?q=' kuralını hiç eşleşmeyen düz bir önek sanır ve yasak sayfayı izinli gösterir.
Bu modül:
  - User-agent gruplarını (art arda birden çok User-agent satırı tek grup) okur,
  - ürün adımıza özel grup yoksa '*' grubunu kullanır,
  - '*' ve '$' jokerlerini destekler,
  - en uzun eşleşen kural kazanır; eşitlikte Allow kazanır.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import unquote, urlsplit


def _compile(path: str) -> re.Pattern:
    anchored = path.endswith("$")
    body = path[:-1] if anchored else path
    rx = "".join(".*" if ch == "*" else re.escape(ch) for ch in body)
    return re.compile(rx + ("$" if anchored else ""))


@dataclass
class _Rule:
    allow: bool
    path: str
    rx: re.Pattern


@dataclass
class Robots:
    groups: list[tuple[list[str], list[_Rule]]] = field(default_factory=list)
    allow_all: bool = False
    disallow_all: bool = False

    @classmethod
    def parse(cls, text: str) -> "Robots":
        r = cls()
        agents: list[str] = []
        rules: list[_Rule] = []
        last_was_agent = False
        for line in text.lstrip("﻿").splitlines():
            line = line.split("#", 1)[0].strip()
            if ":" not in line:
                continue
            key, val = (x.strip() for x in line.split(":", 1))
            key = key.lower()
            if key == "user-agent":
                if not last_was_agent and agents:
                    r.groups.append((agents, rules))
                    agents, rules = [], []
                agents.append(val.lower())
                last_was_agent = True
                continue
            last_was_agent = False
            if key in ("allow", "disallow") and agents:
                if val == "":
                    continue                       # boş Disallow = kısıt yok
                if not val.startswith("/") and not val.startswith("*"):
                    val = "/" + val
                rules.append(_Rule(key == "allow", val, _compile(val)))
        if agents:
            r.groups.append((agents, rules))
        return r

    def _rules_for(self, product_token: str) -> list[_Rule]:
        tok = product_token.lower()
        specific = [rules for agents, rules in self.groups if any(a != "*" and a in tok for a in agents)]
        if specific:
            return [x for rs in specific for x in rs]
        return [x for agents, rules in self.groups if "*" in agents for x in rules]

    def can_fetch(self, product_token: str, url: str) -> bool:
        if self.disallow_all:
            return False
        if self.allow_all:
            return True
        parts = urlsplit(url)
        target = unquote(parts.path or "/") + (f"?{unquote(parts.query)}" if parts.query else "")
        best: _Rule | None = None
        for rule in self._rules_for(product_token):
            if rule.rx.match(target):
                if best is None or len(rule.path) > len(best.path) or (
                        len(rule.path) == len(best.path) and rule.allow and not best.allow):
                    best = rule
        return True if best is None else best.allow
