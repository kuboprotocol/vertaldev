#!/usr/bin/env python3
"""scraped — coletor web do Vertal (F5) com o Scrapling 0.5.1 (BSD-3-Clause,
https://github.com/D4Vinci/Scrapling), usado como dependência num venv próprio
(/opt/scrapling): os fetchers do Scrapling pedem anyio>=4.14 e o browser-use do navd
fixa anyio==4.12.1. O navd chama este script como subprocesso:

    stdin : {"mode","urls"|"crawl","selectors","adaptive","fingerprints","includeText","useSession"}
    stdout: {"ok":true,"pages":[...],"truncated":bool}   (última linha)

Regras duras: robots.txt respeitado (5xx/erro = bloqueado), intervalo mínimo por
domínio e crawl-delay, teto de páginas/profundidade, só http/https públicos, NUNCA
resolver captcha (solve_cloudflare=False; captcha = bloqueio "captcha"), sem contornar
login/paywall (bloqueio, sem nova tentativa), User-Agent honesto no modo fetch.
"""
import asyncio
import ipaddress
import json
import logging
import os
import re
import sys
import time
import unicodedata
from typing import Any
from urllib.parse import urlsplit

logging.disable(logging.CRITICAL)
CHROME = os.environ.get("VERTAL_CHROME", "/usr/local/bin/vertal-chromium")
CDP_PORT = int(os.environ.get("CDP_PORT", "9222"))
_BLOCKED_SUFFIXES = (".local", ".internal", ".localhost", ".lan", ".home", ".corp", ".intranet")


def is_public_url(raw: str) -> bool:
    """Espelho de navd.is_public_url (guarda SSRF)."""
    try:
        parts = urlsplit(str(raw or "").strip())
    except ValueError:
        return False
    if parts.scheme not in ("http", "https") or parts.username or parts.password:
        return False
    try:
        port = parts.port
    except ValueError:
        return False
    if port not in (None, 80, 443):
        return False
    host = (parts.hostname or "").rstrip(".").lower()
    if not host or host == "localhost" or host.endswith(_BLOCKED_SUFFIXES):
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return "." in host
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


# Espelho de supabase/functions/_shared/scrapeCore.ts (CAPTCHA_MARKERS e limites).
# Regras duras: robots.txt respeitado, intervalo mínimo por domínio, teto de páginas
# e de profundidade, só http/https públicos, NUNCA resolver captcha (solve_cloudflare
# sempre False; captcha = bloqueio "captcha" e a tarefa pausa para o usuário), sem
# contornar paywall/login (página de login/paywall = bloqueio, sem nova tentativa).
CAPTCHA_MARKERS = [
    "g-recaptcha", "recaptcha/api", "hcaptcha.com", "h-captcha", "challenges.cloudflare.com", "cf-turnstile",
    "cf-chl-", "/cdn-cgi/challenge-platform", "verify you are human", "verifique que voce e humano",
    "i'm not a robot", "nao sou um robo", "attention required! | cloudflare", "just a moment...",
    "px-captcha", "datadome", "arkoselabs", "funcaptcha",
]
PAYWALL_MARKERS = ["paywall", "assine para continuar", "assine para ler", "conteudo exclusivo para assinantes",
                   "subscribe to continue", "subscribe to read", "already a subscriber", "ja e assinante"]
SCRAPE_USER_AGENT = "VertalBot/1.0 (+https://vertal.dev/docs/scrapling; Scrapling)"
SCRAPE_ROBOTS_AGENT = "vertalbot"
SCRAPE_MAX_PAGES = 25
SCRAPE_MAX_DEPTH = 3
SCRAPE_MAX_URLS = 5
SCRAPE_MAX_ITEMS = 50
SCRAPE_MAX_VALUE = 500
SCRAPE_MAX_TEXT = 4000
SCRAPE_DOMAIN_INTERVAL_S = 1.5
SCRAPE_MAX_CRAWL_DELAY_S = 10
SCRAPE_TASK_TIMEOUT_S = 95
_SKIP_EXT = re.compile(r"\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|rar|7z|mp4|mp3|avi|mov|woff2?|ttf|css|js|xml|json)$", re.I)


def detect_captcha(html: str, title: str = "") -> str | None:
    hay = unicodedata.normalize("NFD", f"{title}\n{(html or '')[:400000]}".lower()).encode("ascii", "ignore").decode("ascii")
    for m in CAPTCHA_MARKERS:
        if m in hay:
            return m
    return None


def detect_wall(status: int, html: str, title: str = "") -> str | None:
    """captcha | login | paywall | http_error — nunca tenta passar."""
    if detect_captcha(html, title):
        return "captcha"
    if status in (401, 407):
        return "login"
    if status == 402:
        return "paywall"
    low = unicodedata.normalize("NFD", (html or "")[:200000].lower()).encode("ascii", "ignore").decode("ascii")
    if any(m in low for m in PAYWALL_MARKERS):
        return "paywall"
    if status >= 400:
        return "http_error"
    # Página que é só um formulário de login (pouco conteúdo + campo de senha).
    if 'type="password"' in low or "type='password'" in low or "type=password" in low:
        text_len = len(re.sub(r"<[^>]+>", " ", low))
        if text_len < 6000:
            return "login"
    return None


class ScrapeState:
    def __init__(self) -> None:
        self.robots: dict[str, tuple[float, Any]] = {}
        self.last_hit: dict[str, float] = {}
        self.lock = asyncio.Lock()


SC = ScrapeState()


async def _robots_for(origin: str):
    """Política do robots.txt (protego). 4xx = livre; 5xx/erro = tudo bloqueado (conservador)."""
    cached = SC.robots.get(origin)
    if cached and time.time() - cached[0] < 3600:
        return cached[1]
    from protego import Protego
    from scrapling.fetchers import AsyncFetcher

    policy: Any
    try:
        r = await AsyncFetcher.get(f"{origin}/robots.txt", timeout=8, retries=1, follow_redirects=True,
                                   headers={"User-Agent": SCRAPE_USER_AGENT}, stealthy_headers=False)
        status = int(getattr(r, "status", 0) or 0)
        if status >= 500 or status == 0:
            policy = "deny"
        elif status >= 400:
            policy = None
        else:
            body = r.body.decode("utf-8", "ignore") if isinstance(getattr(r, "body", b""), (bytes, bytearray)) else str(getattr(r, "text", ""))
            policy = Protego.parse(body[:500000])
    except Exception:
        policy = "deny"
    SC.robots[origin] = (time.time(), policy)
    return policy


async def robots_check(url: str) -> tuple[bool, float]:
    parts = urlsplit(url)
    policy = await _robots_for(f"{parts.scheme}://{parts.netloc}")
    if policy == "deny":
        return False, 0.0
    if policy is None:
        return True, 0.0
    allowed = policy.can_fetch(url, SCRAPE_ROBOTS_AGENT)
    delay = policy.crawl_delay(SCRAPE_ROBOTS_AGENT) or 0.0
    return bool(allowed), float(delay or 0.0)


async def polite_wait(host: str, delay: float) -> None:
    gap = max(SCRAPE_DOMAIN_INTERVAL_S, delay)
    async with SC.lock:
        last = SC.last_hit.get(host, 0.0)
        wait = last + gap - time.time()
        SC.last_hit[host] = max(time.time(), last + gap)
    if wait > 0:
        await asyncio.sleep(wait)


async def fetch_page(url: str, mode: str, use_session: bool):
    """Busca uma página com o Scrapling. Captcha: nunca resolvido (solve_cloudflare=False)."""
    if mode == "fetch":
        from scrapling.fetchers import AsyncFetcher

        return await AsyncFetcher.get(url, timeout=20, retries=1, follow_redirects=True, stealthy_headers=False,
                                      headers={"User-Agent": SCRAPE_USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"})
    if mode == "dynamic":
        from scrapling.fetchers import AsyncRemoteSession

        # O navd já subiu o Chromium (CDP em 127.0.0.1:CDP_PORT) antes de chamar este script.
        # new_context=True: contexto limpo, sem os cookies do usuário. Só depois de o usuário
        # resolver um captcha na tela ao vivo (use_session) a coleta usa a sessão dele.
        async with AsyncRemoteSession(f"http://127.0.0.1:{CDP_PORT}", new_context=not use_session, timeout=30000,
                                      disable_resources=True, retries=1, solve_cloudflare=False) as s:
            return await s.fetch(url)
    from scrapling.fetchers import StealthyFetcher

    return await StealthyFetcher.async_fetch(url, headless=True, executable_path=CHROME, solve_cloudflare=False,
                                             timeout=30000, disable_resources=True, retries=1, block_ads=True)


def _clean(v: Any) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()[:SCRAPE_MAX_VALUE]


def extract(page: Any, selectors: list[dict], adaptive: bool, fingerprints: dict) -> tuple[dict, list, dict]:
    from scrapling.core.utils import _StorageTools

    items: dict[str, list[str]] = {}
    relocated: list[str] = []
    fps: dict[str, Any] = {}
    for sel in selectors[:10]:
        name = str(sel.get("name") or "campo")[:40]
        try:
            found = page.xpath(sel["xpath"]) if sel.get("xpath") else page.css(sel.get("css") or "")
        except Exception:
            items[name] = []
            continue
        if (not found) and adaptive and isinstance(fingerprints.get(name), dict):
            try:
                found = page.relocate(fingerprints[name], percentage=40, selector_type=True)
                if found:
                    relocated.append(name)
            except Exception:
                found = []
        values: list[str] = []
        for el in list(found)[: (SCRAPE_MAX_ITEMS if sel.get("all") else 1)]:
            attr = sel.get("attr")
            if isinstance(el, str):
                values.append(_clean(el))
            elif attr:
                values.append(_clean((getattr(el, "attrib", {}) or {}).get(attr, "")))
            else:
                values.append(_clean(el.get_all_text() if hasattr(el, "get_all_text") else getattr(el, "text", "")))
        items[name] = [v for v in values if v]
        if found and not isinstance(found[0], str) and getattr(found[0], "_root", None) is not None:
            try:
                fps[name] = _StorageTools.element_to_dict(found[0]._root)
                fps[name] = json.loads(json.dumps(fps[name], default=list))
            except Exception:
                pass
    return items, relocated, fps


def same_site(a: str, b: str) -> bool:
    ha = (urlsplit(a).hostname or "").lower().removeprefix("www.")
    hb = (urlsplit(b).hostname or "").lower().removeprefix("www.")
    return ha == hb


async def scrape_one(url: str, req: dict, depth: int = 0) -> tuple[dict, list[str]]:
    out: dict[str, Any] = {"url": url, "items": {}, "depth": depth}
    if not is_public_url(url):
        out["blocked"] = "not_public"
        return out, []
    allowed, delay = await robots_check(url)
    if not allowed:
        out["blocked"] = "robots"
        return out, []
    if delay > SCRAPE_MAX_CRAWL_DELAY_S:
        out["blocked"] = "crawl_delay"
        return out, []
    host = (urlsplit(url).hostname or "").lower()
    await polite_wait(host, delay)
    try:
        page = await asyncio.wait_for(fetch_page(url, req["mode"], bool(req.get("useSession"))), 60)
    except asyncio.TimeoutError:
        out["blocked"] = "timeout"
        return out, []
    except Exception as e:
        out["blocked"] = "error"
        out["error"] = type(e).__name__
        return out, []
    final = str(getattr(page, "url", "") or url)
    if not is_public_url(final):
        out["blocked"] = "not_public"
        return out, []
    status = int(getattr(page, "status", 0) or 0)
    html = ""
    try:
        html = str(page.html_content)
    except Exception:
        pass
    title = ""
    try:
        title = _clean(page.css("title::text").get() or "")[:200]
    except Exception:
        pass
    out.update({"finalUrl": final, "status": status, "title": title})
    wall = detect_wall(status, html, title)
    if wall:
        out["blocked"] = wall
        return out, []
    items, relocated, fps = extract(page, req.get("selectors") or [], bool(req.get("adaptive", True)), req.get("fingerprints") or {})
    out["items"] = items
    if relocated:
        out["relocated"] = relocated
    if fps:
        out["fingerprints"] = fps
    if req.get("includeText"):
        try:
            out["text"] = re.sub(r"\n{3,}", "\n\n", str(page.get_all_text(ignore_tags=("script", "style", "noscript"))))[:SCRAPE_MAX_TEXT]
        except Exception:
            pass
    links: list[str] = []
    if req.get("crawl"):
        try:
            for href in page.css("a::attr(href)").getall()[:500]:
                absu = page.urljoin(str(href)).split("#")[0]
                if absu.startswith(("http://", "https://")) and not _SKIP_EXT.search(urlsplit(absu).path):
                    links.append(absu)
        except Exception:
            pass
    return out, links


async def run_scrape(req: dict) -> dict:
    started = time.time()
    pages: list[dict] = []
    crawl = req.get("crawl")
    if not crawl:
        for u in (req.get("urls") or [])[:SCRAPE_MAX_URLS]:
            if time.time() - started > SCRAPE_TASK_TIMEOUT_S:
                pages.append({"url": u, "items": {}, "blocked": "timeout"})
                continue
            page, _ = await scrape_one(str(u), req)
            pages.append(page)
        return {"pages": pages}
    seed = str(crawl.get("url") or "")
    max_pages = max(1, min(int(crawl.get("maxPages") or 10), SCRAPE_MAX_PAGES))
    max_depth = max(0, min(int(crawl.get("maxDepth") or 1), SCRAPE_MAX_DEPTH))
    prefix = str(crawl.get("pathPrefix") or "")
    queue: list[tuple[str, int]] = [(seed, 0)]
    seen = {seed}
    while queue and len(pages) < max_pages and time.time() - started < SCRAPE_TASK_TIMEOUT_S:
        url, depth = queue.pop(0)
        page, links = await scrape_one(url, {**req, "crawl": depth < max_depth}, depth)
        pages.append(page)
        for link in links:
            if link in seen or not same_site(seed, link) or (prefix and not urlsplit(link).path.startswith(prefix)):
                continue
            seen.add(link)
            queue.append((link, depth + 1))
    return {"pages": pages, "truncated": bool(queue)}


def main() -> None:
    try:
        req = json.loads(sys.stdin.read() or "{}")
        res = asyncio.run(run_scrape(req))
        print(json.dumps({"ok": True, **res}, ensure_ascii=False, default=str))
    except Exception as e:  # nunca imprime stack (pode ter URL/conteúdo); só o tipo
        print(json.dumps({"ok": False, "error": type(e).__name__}))


if __name__ == "__main__":
    main()
