from collections import defaultdict, deque
from time import monotonic
from threading import Lock
import ipaddress

from fastapi import HTTPException, Request

from molx.config import (
    FETCH_RATE_LIMIT_PER_MINUTE,
    MAX_RATE_LIMIT_IDENTITIES,
    OG_RATE_LIMIT_PER_MINUTE,
    REGISTER_RATE_LIMIT_PER_HOUR,
    TRUSTED_PROXY_CIDRS,
)

MAX_RATE_LIMIT_WINDOW_SECONDS = 3600
PRUNE_INTERVAL_SECONDS = 60


class WindowRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = Lock()
        self._last_prune = 0.0

    def _prune(self, now: float) -> None:
        if now - self._last_prune < PRUNE_INTERVAL_SECONDS:
            return
        cutoff = now - MAX_RATE_LIMIT_WINDOW_SECONDS
        empty_keys = []
        for key, hits in self._hits.items():
            while hits and hits[0] < cutoff:
                hits.popleft()
            if not hits:
                empty_keys.append(key)
        for key in empty_keys:
            self._hits.pop(key, None)
        self._last_prune = now

    def check(self, name: str, identity: str, limit: int, window_seconds: int) -> None:
        if limit <= 0:
            return

        now = monotonic()
        cutoff = now - window_seconds
        key = (name, identity)
        with self._lock:
            self._prune(now)
            hits = self._hits.get(key)
            if hits is None:
                if MAX_RATE_LIMIT_IDENTITIES > 0 and len(self._hits) >= MAX_RATE_LIMIT_IDENTITIES:
                    raise HTTPException(status_code=429, detail="Too many requests")
                hits = deque()
                self._hits[key] = hits
            while hits and hits[0] < cutoff:
                hits.popleft()
            if len(hits) >= limit:
                raise HTTPException(status_code=429, detail="Too many requests")
            hits.append(now)


limiter = WindowRateLimiter()

trusted_proxy_networks = []
for cidr in TRUSTED_PROXY_CIDRS:
    try:
        trusted_proxy_networks.append(ipaddress.ip_network(cidr, strict=False))
    except ValueError:
        pass


def is_trusted_proxy(host: str | None) -> bool:
    if not host or not trusted_proxy_networks:
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return any(address in network for network in trusted_proxy_networks)


def client_identity(request: Request) -> str:
    direct_host = request.client.host if request.client else None
    forwarded_for = request.headers.get("x-forwarded-for", "")
    real_ip = request.headers.get("x-real-ip", "")
    if is_trusted_proxy(direct_host) and forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    if is_trusted_proxy(direct_host) and real_ip:
        return real_ip.strip()
    if direct_host:
        return direct_host
    return "unknown"


def check_request_rate_limit(request: Request) -> None:
    path = request.url.path
    method = request.method.upper()
    identity = client_identity(request)

    if method == "POST" and path == "/api/links/":
        limiter.check("register", identity, REGISTER_RATE_LIMIT_PER_HOUR, 3600)
    elif method == "GET" and path in {"/api/structure-url"}:
        limiter.check("fetch", identity, FETCH_RATE_LIMIT_PER_MINUTE, 60)
    elif method == "GET" and path.startswith("/api/structure/"):
        limiter.check("fetch", identity, FETCH_RATE_LIMIT_PER_MINUTE, 60)
    elif method == "GET" and path.startswith("/og/"):
        limiter.check("og", identity, OG_RATE_LIMIT_PER_MINUTE, 60)
