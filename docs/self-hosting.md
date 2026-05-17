# Self hosting

molx can be self-hosted with Docker Compose. The stack is intentionally small:

- `app`: FastAPI/Uvicorn application
- `caddy`: public HTTP/HTTPS reverse proxy
- `docs/`: docsify documentation served statically by Caddy
- `molx-data`: persistent SQLite volume mounted at `/data`

The examples below use placeholder domains. Replace them with domains you own.

## Requirements

Prepare a server with:

- Docker
- Docker Compose
- Git
- public DNS records for the app and docs domains
- inbound HTTP/HTTPS access to the selected ports

For the standard setup, ports `80` and `443` should be reachable from the internet so Caddy can issue and renew TLS certificates.

## Clone the repository

Clone molx on the server:

```bash
git clone https://github.com/yamnor/molx.git
cd molx
```

If you use a fork, clone your fork instead. The remaining commands are the same.

## Configure the environment

Create `.env` from the template:

```bash
cp .env.example .env
```

Edit the public domains:

```env
MOLX_DOMAIN=molx.example.com
MOLX_DOCS_DOMAIN=docs.molx.example.com
HTTP_PORT=80
HTTPS_PORT=443
```

`MOLX_DOMAIN` serves the app. `MOLX_DOCS_DOMAIN` serves this documentation from the local `docs/` directory.

## DNS

Point both hostnames to the server:

```text
molx.example.com       A/AAAA  your-server
docs.molx.example.com  A/AAAA  your-server
```

The two domains can point to the same machine. Caddy routes them by hostname.

### Cloudflare DNS

If you use Cloudflare, the simplest first setup is:

1. Create `A` or `AAAA` records for both hostnames.
2. Set both records to **DNS only** while Caddy obtains certificates.
3. Confirm that `https://molx.example.com` and `https://docs.molx.example.com` work directly.
4. Then switch the records to **Proxied** if you want Cloudflare in front.

When Cloudflare is proxied, use **Full (strict)** SSL/TLS mode after Caddy has a valid certificate. Avoid **Flexible** mode for this app.

## Start the stack

Build and start the containers:

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
```

Follow logs:

```bash
docker compose logs -f
```

Once DNS points to the server, open:

```text
https://molx.example.com
https://docs.molx.example.com
```

## Custom ports

If another reverse proxy is already using ports `80` and `443`, map Caddy to different host ports:

```env
MOLX_DOMAIN=molx.example.com
MOLX_DOCS_DOMAIN=docs.molx.example.com
HTTP_PORT=8080
HTTPS_PORT=8443
```

Then point the outer proxy to:

```text
http://127.0.0.1:8080
https://127.0.0.1:8443
```

In that setup, the outer proxy is responsible for public routing. Keep `TRUSTED_PROXY_CIDRS` aligned with the proxy network if rate limiting should use the original client IP.

## Environment reference

| Variable | Purpose |
| --- | --- |
| `MOLX_DOMAIN` | App domain served by Caddy |
| `MOLX_DOCS_DOMAIN` | Documentation domain served by Caddy |
| `HTTP_PORT` | Host HTTP port mapped to Caddy |
| `HTTPS_PORT` | Host HTTPS port mapped to Caddy |
| `MAX_STRUCTURE_BYTES` | Maximum fetched structure file size |
| `MAX_FETCH_REDIRECTS` | Maximum HTTPS redirects to follow |
| `FETCH_TIMEOUT_SECONDS` | Fetch timeout for source URLs |
| `MAX_SOURCE_URL_LENGTH` | Maximum source URL length |
| `MAX_TITLE_LENGTH` | Maximum custom title length |
| `MAX_REQUEST_BODY_BYTES` | Maximum API request body size |
| `MAX_STRUCTURE_LINES` | Maximum text lines in a structure file |
| `MAX_ATOMS` | Maximum atoms in one model/structure |
| `MAX_MODELS` | Maximum models, frames, or records |
| `MAX_CUBE_GRID_POINTS` | Maximum CUBE grid points |
| `REGISTER_RATE_LIMIT_PER_HOUR` | Per-IP registration limit |
| `FETCH_RATE_LIMIT_PER_MINUTE` | Per-IP structure fetch limit |
| `OG_RATE_LIMIT_PER_MINUTE` | Per-IP OGP image generation limit |
| `MAX_RATE_LIMIT_IDENTITIES` | Maximum tracked rate-limit identities |
| `TRUSTED_PROXY_CIDRS` | Proxy CIDRs trusted for `X-Forwarded-For` / `X-Real-IP` |
| `MOLX_ALLOWED_ORIGINS` | Optional comma-separated CORS allowlist |

The default values in `.env.example` are a reasonable starting point for a small public deployment.

## Data and backups

The SQLite database is stored inside the `molx-data` Docker volume:

```text
/data/main.db
```

Create a manual backup:

```bash
docker compose exec app python - <<'PY'
import shutil
from datetime import datetime
from pathlib import Path

source = Path("/data/main.db")
target = Path("/data") / f"main-{datetime.utcnow():%Y%m%d%H%M%S}.db"
shutil.copy2(source, target)
print(target)
PY
```

For production, add automated backups for `/data/main.db`. A scheduled SQLite copy or a tool such as Litestream works well.

## Update molx

From the cloned repository on the server:

```bash
git pull
docker compose up -d --build
```

For a cautious update:

```bash
docker compose exec app python - <<'PY'
import shutil
from datetime import datetime
from pathlib import Path

source = Path("/data/main.db")
target = Path("/data") / f"main-{datetime.utcnow():%Y%m%d%H%M%S}.db"
shutil.copy2(source, target)
print(target)
PY

git pull
docker compose up -d --build
docker compose ps
docker compose logs -f
```

If you changed `.env.example` in your deployment, compare it with your local `.env` after pulling changes and add any new variables you need.

## Restart and logs

Restart only the app:

```bash
docker compose restart app
```

Restart the full stack:

```bash
docker compose restart
```

Inspect logs:

```bash
docker compose logs app
docker compose logs caddy
docker compose logs -f
```

## Troubleshooting

If the app does not open:

1. Check `docker compose ps`.
2. Check `docker compose logs app`.
3. Check `docker compose logs caddy`.
4. Confirm DNS points to the server.
5. Confirm ports `80` and `443` are reachable, or that your custom port mapping is correct.

If HTTPS certificates are not issued, the most common causes are incorrect DNS, blocked ports, or using placeholder domains.

If Cloudflare shows `525 SSL handshake failed`, Cloudflare can reach the origin but cannot complete TLS with it. Check:

1. Cloudflare SSL/TLS mode is `Full` or `Full (strict)`.
2. Port `443` on the server is open to the internet.
3. Caddy has obtained a certificate for `MOLX_DOMAIN`.
4. The Cloudflare DNS record points to the correct server IP.
5. The Caddy logs do not show ACME or TLS errors.

Useful checks on the server:

```bash
docker compose ps
docker compose logs caddy
curl -I http://127.0.0.1
curl -kI https://127.0.0.1
```

Useful checks from your local machine:

```bash
curl -I http://molx.example.com
curl -I https://molx.example.com
```

If certificate issuance is failing behind Cloudflare, temporarily set the DNS records to **DNS only**, wait for DNS to update, restart Caddy, and try again:

```bash
docker compose restart caddy
docker compose logs -f caddy
```

If source URL fetching fails, confirm that the source URL is public HTTPS on port `443` and points to a supported text-based structure file.

## Security notes

molx fetches user-provided public URLs. The app includes several guardrails:

- HTTPS-only source URLs on port `443`
- public-host checks before fetches and redirects
- file size, line count, atom count, model count, and CUBE grid limits
- registration, fetch, and OGP rate limits
- edit tokens stored as hashes
- security headers from FastAPI and Caddy

For stronger SSRF protection in production, also block private-network egress from the app container or host firewall. Application-level checks are useful, but network-level egress rules are the most reliable defense against DNS rebinding and infrastructure-specific edge cases.
