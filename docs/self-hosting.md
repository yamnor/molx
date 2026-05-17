# Self hosting

molx is designed to run behind an existing server-wide reverse proxy.

The Docker Compose stack contains only the application container:

- `app`: FastAPI/Uvicorn application
- `molx-data`: persistent SQLite volume mounted at `/data`

Your existing reverse proxy handles public hostnames, HTTPS certificates, and routing to molx.

## Requirements

Prepare a server with:

- Docker
- Docker Compose
- Git
- an existing reverse proxy such as Caddy, nginx, Traefik, or Apache
- public DNS records pointing to the server

The examples below use placeholder domains. Replace them with domains you own.

## Clone the repository

Clone molx on the server:

```bash
git clone https://github.com/yamnor/molx.git
cd molx
```

If you use a fork, clone your fork instead. The remaining commands are the same.

## Configure the app

Create `.env` from the template:

```bash
cp .env.example .env
```

By default, molx binds to localhost on port `8001`:

```env
APP_BIND=127.0.0.1
APP_PORT=8001
```

Keep `APP_BIND=127.0.0.1` unless you intentionally want the app to be reachable directly from outside the server.

## Start molx

Build and start the app container:

```bash
docker compose up -d --build --remove-orphans
```

Check status:

```bash
docker compose ps
```

Follow logs:

```bash
docker compose logs -f
```

Confirm the app responds locally:

```bash
curl -I http://127.0.0.1:8001/api/health
```

## Reverse proxy

Configure your existing reverse proxy to forward the public app hostname to:

```text
http://127.0.0.1:8001
```

### Caddy example

```caddyfile
molx.example.com {
  reverse_proxy 127.0.0.1:8001
}
```

### nginx example

```nginx
server {
    listen 80;
    server_name molx.example.com;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

If your reverse proxy forwards client IP headers, keep `TRUSTED_PROXY_CIDRS` aligned with the proxy address that reaches the container. The default is suitable for Docker bridge networks in many deployments.

## Documentation site

The documentation is a static docsify site in `docs/`. Serve this directory with your existing reverse proxy.

### Caddy example

```caddyfile
docs.molx.example.com {
  root * /path/to/molx/docs
  try_files {path} /index.html
  file_server
}
```

### nginx example

```nginx
server {
    listen 80;
    server_name docs.molx.example.com;
    root /path/to/molx/docs;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

To preview docs locally on the server:

```bash
python3 -m http.server 8010 --directory docs
```

## Environment reference

| Variable | Purpose |
| --- | --- |
| `APP_BIND` | Host address used for the local app port |
| `APP_PORT` | Host port mapped to the app container |
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

When the source code changes upstream, update the server from the cloned repository.

First, create a database backup:

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

Then pull the latest source and rebuild:

```bash
git pull
docker compose up -d --build --remove-orphans
```

`--remove-orphans` is useful when the Compose file changes and removes an old service. For example, older molx deployments included a Caddy service; the current standard deployment does not.

Check the result:

```bash
docker compose ps
docker compose logs app
curl -I http://127.0.0.1:8001/api/health
```

If `.env.example` changed, compare it with your local `.env` and add any new variables you need:

```bash
git diff HEAD@{1} -- .env.example
```

If the update fails, inspect logs and either fix the configuration or roll back to the previous Git revision:

```bash
git log --oneline -5
git checkout <previous-commit>
docker compose up -d --build --remove-orphans
```

## Restart and logs

Restart the app:

```bash
docker compose restart app
```

Inspect logs:

```bash
docker compose logs app
docker compose logs -f
```

## Troubleshooting

If the app does not open:

1. Check `docker compose ps`.
2. Check `docker compose logs app`.
3. Confirm the local app responds with `curl -I http://127.0.0.1:8001/api/health`.
4. Confirm your reverse proxy points to `127.0.0.1:8001`.
5. Confirm DNS points to the server.

If source URL fetching fails, confirm that the source URL is public HTTPS on port `443` and points to a supported text-based structure file.

## Security notes

molx fetches user-provided public URLs. The app includes several guardrails:

- HTTPS-only source URLs on port `443`
- public-host checks before fetches and redirects
- file size, line count, atom count, model count, and CUBE grid limits
- registration, fetch, and OGP rate limits
- edit tokens stored as hashes
- security headers from FastAPI

For stronger SSRF protection in production, also block private-network egress from the app container or host firewall. Application-level checks are useful, but network-level egress rules are the most reliable defense against DNS rebinding and infrastructure-specific edge cases.
