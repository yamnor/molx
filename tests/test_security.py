from types import SimpleNamespace
import ipaddress
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from molx.services import rate_limiter
from molx.services.rate_limiter import WindowRateLimiter, client_identity
from molx.services.structure_fetcher import normalize_url


class SecurityGuardTests(unittest.TestCase):
    def request_for(
        self,
        host: str,
        forwarded_for: str = "203.0.113.9",
        real_ip: str = "203.0.113.10",
    ) -> SimpleNamespace:
        return SimpleNamespace(
            client=SimpleNamespace(host=host),
            headers={"x-forwarded-for": forwarded_for, "x-real-ip": real_ip},
        )

    def test_source_url_length_is_limited(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            normalize_url("https://example.com/" + ("a" * 3000))

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail, "URL is too long")

    def test_forwarded_headers_are_ignored_without_trusted_proxy(self) -> None:
        with patch.object(rate_limiter, "trusted_proxy_networks", []):
            self.assertEqual(client_identity(self.request_for("127.0.0.1")), "127.0.0.1")

    def test_forwarded_headers_are_used_from_trusted_proxy(self) -> None:
        trusted_networks = [ipaddress.ip_network("127.0.0.1/32")]
        with patch.object(rate_limiter, "trusted_proxy_networks", trusted_networks):
            request = self.request_for("127.0.0.1", "203.0.113.9, 10.0.0.1")
            self.assertEqual(client_identity(request), "203.0.113.9")

    def test_rate_limiter_caps_distinct_identities(self) -> None:
        limiter = WindowRateLimiter()
        with patch.object(rate_limiter, "MAX_RATE_LIMIT_IDENTITIES", 2):
            limiter.check("fetch", "client-a", 10, 60)
            limiter.check("fetch", "client-b", 10, 60)
            with self.assertRaises(HTTPException) as raised:
                limiter.check("fetch", "client-c", 10, 60)

        self.assertEqual(raised.exception.status_code, 429)


if __name__ == "__main__":
    unittest.main()
