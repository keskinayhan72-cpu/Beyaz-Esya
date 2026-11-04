"""İzinli HTTP erişim politikası.

Bu modül, ileride eklenecek tarama konnektörlerinin TEK geçiş noktasıdır ve şu
kuralları zorunlu kılar:
  1. Kaynak, veritabanında access_method='permitted_crawl' olarak ve kullanım
     koşullarının incelendiği teyit edilerek etkinleştirilmeden istek atılmaz.
  2. robots.txt izin vermiyorsa istek atılmaz.
  3. Kimliği belli User-Agent ve host başına asgari bekleme süresi.
  4. CAPTCHA / bot-challenge / 403 / 429 görülürse AccessBlocked fırlatılır;
     yeniden deneme, proxy/IP değiştirme, tarayıcı taklidi YAPILMAZ.
"""
from __future__ import annotations

import time
import urllib.request
import urllib.robotparser
from dataclasses import dataclass, field
from typing import Callable
from urllib.parse import urlsplit

from .base import AccessBlocked, NotConfigured

USER_AGENT = "BeyazEsyaFirsatMotoru/0.1 (+fiyat karsilastirma; iletisim icin site sahibine yazin)"

CHALLENGE_MARKERS = (
    "captcha", "g-recaptcha", "hcaptcha", "cf-challenge", "challenge-platform",
    "are you a robot", "robot olmadığınızı", "access denied", "erişim engellendi",
)


@dataclass
class Response:
    status: int
    text: str


Transport = Callable[[str, dict], Response]


def _urllib_transport(url: str, headers: dict) -> Response:
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:  # noqa: S310 (yalnızca http/https; aşağıda kontrol)
            return Response(r.status, r.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        return Response(e.code, e.read().decode("utf-8", errors="replace") if e.fp else "")


@dataclass
class PoliteFetcher:
    source_id: str
    permitted: bool                     # sources.access_method == 'permitted_crawl' ve ToS teyitli
    min_delay_s: float = 5.0
    transport: Transport = _urllib_transport
    clock: Callable[[], float] = time.monotonic
    sleep: Callable[[float], None] = time.sleep
    _robots: dict[str, urllib.robotparser.RobotFileParser] = field(default_factory=dict)
    _last: dict[str, float] = field(default_factory=dict)

    def _robots_for(self, url: str) -> urllib.robotparser.RobotFileParser:
        parts = urlsplit(url)
        base = f"{parts.scheme}://{parts.netloc}"
        if base not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            resp = self.transport(f"{base}/robots.txt", {"User-Agent": USER_AGENT})
            if resp.status in (401, 403):
                rp.disallow_all = True       # robots.txt'e bile erişim yoksa: izin yok say
            elif resp.status >= 400:
                rp.allow_all = True          # robots.txt yok (404): standart gereği kısıt yok
            else:
                rp.parse(resp.text.splitlines())
            self._robots[base] = rp
        return self._robots[base]

    def get(self, url: str) -> str:
        if not self.permitted:
            raise NotConfigured(f"{self.source_id}: izinli tarama etkin değil (kullanım koşulları teyidi gerekli)")
        if urlsplit(url).scheme not in ("http", "https"):
            raise ValueError("yalnızca http/https")
        if not self._robots_for(url).can_fetch(USER_AGENT, url):
            raise AccessBlocked(f"robots.txt izin vermiyor: {url}")
        host = urlsplit(url).netloc
        wait = self.min_delay_s - (self.clock() - self._last.get(host, -1e9))
        if wait > 0:
            self.sleep(wait)
        resp = self.transport(url, {"User-Agent": USER_AGENT, "Accept-Language": "tr-TR"})
        self._last[host] = self.clock()
        if resp.status in (403, 429, 503):
            raise AccessBlocked(f"HTTP {resp.status} — erişim kısıtı; çalıştırma durduruldu")
        low = resp.text[:200_000].lower()
        if any(m in low for m in CHALLENGE_MARKERS):
            raise AccessBlocked("CAPTCHA/bot doğrulaması algılandı — aşılmaz; çalıştırma durduruldu")
        if resp.status >= 400:
            raise AccessBlocked(f"HTTP {resp.status}")
        return resp.text
