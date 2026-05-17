from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
import ipaddress
import socket

from fastapi import HTTPException

from molx.config import (
    FETCH_TIMEOUT_SECONDS,
    MAX_FETCH_REDIRECTS,
    MAX_SOURCE_URL_LENGTH,
    MAX_STRUCTURE_BYTES,
    SUPPORTED_FORMATS,
)
from molx.services.structure_detector import detect_structure_format
from molx.services.structure_limits import enforce_structure_limits


class NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


opener = build_opener(NoRedirectHandler)


def normalize_url(url: str) -> str:
    normalized = url.strip()
    if len(normalized) > MAX_SOURCE_URL_LENGTH:
        raise HTTPException(status_code=400, detail="URL is too long")

    parsed = urlparse(normalized)
    if parsed.scheme != "https" or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Only HTTPS URLs are supported")

    if parsed.netloc == "github.com":
        parts = parsed.path.strip("/").split("/")
        if len(parts) >= 5 and parts[2] == "blob":
            owner, repo, _blob, branch = parts[:4]
            path = "/".join(parts[4:])
            normalized = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
            if len(normalized) > MAX_SOURCE_URL_LENGTH:
                raise HTTPException(status_code=400, detail="URL is too long")
            return normalized

    return normalized


def iter_resolved_ips(hostname: str) -> Iterable[ipaddress._BaseAddress]:
    try:
        for family, _type, _proto, _canonname, sockaddr in socket.getaddrinfo(
            hostname, None
        ):
            if family in (socket.AF_INET, socket.AF_INET6):
                yield ipaddress.ip_address(sockaddr[0])
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="Could not resolve URL hostname")


def assert_public_host(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="Only HTTPS URLs are supported")
    if parsed.port not in (None, 443):
        raise HTTPException(status_code=400, detail="Only HTTPS port 443 is supported")

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid URL")

    for address in iter_resolved_ips(hostname):
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_multicast
            or address.is_reserved
            or address.is_unspecified
        ):
            raise HTTPException(status_code=400, detail="URL host is not allowed")


def redirect_location(error: HTTPError, current_url: str) -> str | None:
    if error.code not in {301, 302, 303, 307, 308}:
        return None
    location = error.headers.get("Location")
    if not location:
        raise HTTPException(status_code=400, detail="Redirect response is missing Location")
    return urljoin(current_url, location)


def fetch_url_bytes(url: str) -> tuple[str, bytes]:
    current_url = normalize_url(url)
    for redirect_count in range(MAX_FETCH_REDIRECTS + 1):
        assert_public_host(current_url)
        request = Request(current_url, headers={"User-Agent": "molx/1.0"})
        try:
            with opener.open(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
                content = response.read(MAX_STRUCTURE_BYTES + 1)
                final_url = normalize_url(response.geturl())
                assert_public_host(final_url)
                return final_url, content
        except HTTPError as error:
            next_url = redirect_location(error, current_url)
            if not next_url:
                raise HTTPException(
                    status_code=400, detail=f"Could not fetch URL: HTTP {error.code}"
                )
            if redirect_count >= MAX_FETCH_REDIRECTS:
                raise HTTPException(status_code=400, detail="Too many redirects")
            current_url = normalize_url(next_url)
        except URLError as error:
            raise HTTPException(status_code=400, detail=f"Could not fetch URL: {error.reason}")

    raise HTTPException(status_code=400, detail="Too many redirects")


def fetch_structure(url: str) -> tuple[str, str]:
    try:
        final_url, content = fetch_url_bytes(url)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid URL")

    if len(content) > MAX_STRUCTURE_BYTES:
        raise HTTPException(status_code=400, detail="Structure file is too large")

    try:
        structure_data = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Structure file must be UTF-8 text")

    format_name = detect_structure_format(structure_data, final_url)
    if not format_name:
        formats = ", ".join(SUPPORTED_FORMATS)
        raise HTTPException(
            status_code=400,
            detail=f"URL does not point to a supported structure file ({formats})",
        )

    enforce_structure_limits(structure_data, format_name)
    return structure_data, format_name
