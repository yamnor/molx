# molx

molx is a lightweight web app for viewing, styling, and sharing molecular
structures from public structure file URLs.

It stores a source URL and link metadata, not the structure file contents.

Supported formats: XYZ, PDB, SDF, MOL2, CIF, CUBE.

## Quick Start

```bash
uv sync
uv run molx serve --reload
```

Open:

```text
http://127.0.0.1:8000
```

Open a public structure file directly:

```text
http://127.0.0.1:8000/?url=https%3A%2F%2Fgithub.com%2Fuser%2Frepo%2Fblob%2Fmain%2Fexample.xyz
```

## Docker

```bash
cp .env.example .env
docker compose up -d --build --remove-orphans
```

By default the container is published only on `127.0.0.1:8001`. Put molx behind
your existing reverse proxy for public HTTPS.

## CLI

```bash
molx serve --reload
molx check-url https://github.com/user/repo/blob/main/example.xyz
molx register https://github.com/user/repo/blob/main/example.xyz --title "My molecule"
molx db stats
molx links list
```

## Documentation

The docsify documentation lives in `docs/`.

For production, serve `docs/` as static files from your existing reverse proxy.

Preview locally:

```bash
python3 -m http.server 8010 --directory docs
```

Then open:

```text
http://127.0.0.1:8010/
```

## License

MIT License. See [LICENSE](LICENSE).
