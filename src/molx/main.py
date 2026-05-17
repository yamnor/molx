import json
from html import escape
from re import sub
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from molx.config import CORS_ALLOWED_ORIGINS, MAX_REQUEST_BODY_BYTES, MAX_SOURCE_URL_LENGTH, STATIC_DIR
from molx.db import (
    clear_link_display,
    create_link_record,
    lookup_link,
    update_link_display,
    update_link_format,
    update_link_metadata,
    verify_edit_token,
)
from molx.schemas import DisplaySettingsInput, LinkInput, LinkMetadataInput
from molx.services.display_settings import (
    normalize_display_settings,
    parse_display_settings,
)
from molx.services.og_image import generate_og_image
from molx.services.rate_limiter import check_request_rate_limit
from molx.services.structure_fetcher import (
    assert_public_host,
    fetch_structure,
    normalize_url,
)
from molx.services.structure_title import (
    infer_structure_title,
    normalize_custom_title,
    title_from_url,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def set_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' https://plausible.io; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self' https://plausible.io; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    method = request.method.upper()
    if method in {"POST", "PUT", "PATCH"}:
        content_length = request.headers.get("content-length")
        try:
            if content_length and int(content_length) > MAX_REQUEST_BODY_BYTES:
                response = JSONResponse(
                    status_code=413,
                    content={"detail": "Request body is too large"},
                )
                set_security_headers(response)
                return response
        except ValueError:
            pass

        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_REQUEST_BODY_BYTES:
                response = JSONResponse(
                    status_code=413,
                    content={"detail": "Request body is too large"},
                )
                set_security_headers(response)
                return response

        request._body = bytes(body)

    try:
        check_request_rate_limit(request)
    except HTTPException as error:
        response = JSONResponse(
            status_code=error.status_code,
            content={"detail": error.detail},
        )
        set_security_headers(response)
        return response
    response = await call_next(request)
    set_security_headers(response)
    return response


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


def has_edit_access(row, edit: str | None) -> bool:
    edit_token_hash = row[4]
    return verify_edit_token(edit_token_hash, edit)


def require_edit_access(row, edit: str | None) -> None:
    if not has_edit_access(row, edit):
        raise HTTPException(status_code=403, detail="Edit URL is required")


@app.post("/api/links/")
def create_link(data: LinkInput):
    url = normalize_url(data.url)
    assert_public_host(url)
    structure_data, format_name = fetch_structure(url)
    title = normalize_custom_title(data.title) or infer_structure_title(
        structure_data, format_name, url
    )
    source_visibility = "public" if data.show_source else "hidden"
    return create_link_record(url, format_name, title, source_visibility)


@app.patch("/api/links/{key}/display")
def update_link_display_settings(key: str, settings: DisplaySettingsInput, edit: str | None = None):
    row = lookup_link(key)
    if not row:
        raise HTTPException(status_code=404, detail="Key not found")
    require_edit_access(row, edit)

    normalized = normalize_display_settings(settings.model_dump())
    raw_settings = json.dumps(normalized, separators=(",", ":"))
    update_link_display(key, raw_settings)

    return {"key": key, "display_settings": normalized}


@app.delete("/api/links/{key}/display")
def delete_link_display_settings(key: str, edit: str | None = None):
    row = lookup_link(key)
    if not row:
        raise HTTPException(status_code=404, detail="Key not found")
    require_edit_access(row, edit)

    clear_link_display(key)
    return {"key": key, "display_settings": None}


@app.patch("/api/links/{key}")
def update_link_metadata_settings(
    key: str,
    settings: LinkMetadataInput,
    edit: str | None = None,
):
    row = lookup_link(key)
    if not row:
        raise HTTPException(status_code=404, detail="Key not found")
    require_edit_access(row, edit)

    title = normalize_custom_title(settings.title)
    source_visibility = "public" if settings.show_source else "hidden"
    update_link_metadata(key, title, source_visibility)

    return {
        "key": key,
        "title": title,
        "source_visibility": source_visibility,
        "show_source": source_visibility == "public",
        "can_edit": True,
    }


@app.get("/api/structure/{key}")
def get_structure(key: str, edit: str | None = None):
    row = lookup_link(key)
    if not row:
        raise HTTPException(status_code=404, detail="Key not found")

    url, stored_format, raw_display_settings, title, _edit_token, source_visibility, created_at = row
    can_edit = has_edit_access(row, edit)
    show_source = can_edit or source_visibility == "public"
    assert_public_host(url)
    structure_data, detected_format = fetch_structure(url)
    if stored_format != detected_format:
        update_link_format(key, detected_format)
    if not title:
        title = infer_structure_title(structure_data, detected_format, url)

    return {
        "key": key,
        "url": url if show_source else None,
        "format": detected_format,
        "title": title,
        "source_visibility": source_visibility,
        "show_source": source_visibility == "public",
        "can_edit": can_edit,
        "display_settings": parse_display_settings(raw_display_settings),
        "data": structure_data,
        "created_at": created_at,
    }


@app.get("/api/structure-url")
def get_structure_url(url: Annotated[str, Query(min_length=1, max_length=MAX_SOURCE_URL_LENGTH)]):
    normalized_url = normalize_url(url)
    assert_public_host(normalized_url)
    structure_data, format_name = fetch_structure(normalized_url)
    title = infer_structure_title(structure_data, format_name, normalized_url)

    return {
        "key": "",
        "url": normalized_url,
        "format": format_name,
        "title": title,
        "source_visibility": "hidden",
        "show_source": False,
        "can_edit": False,
        "display_settings": None,
        "data": structure_data,
        "created_at": None,
    }


@app.get("/api/xyz/{key}")
def get_xyz(key: str):
    structure = get_structure(key)
    return {**structure, "xyz": structure["data"]}


def replace_meta(html: str, property_name: str, content: str) -> str:
    content = escape(content, quote=True)
    pattern = rf'(<meta\s+property="{property_name}"\s+content=")[^"]*("\s*/?>)'
    return sub(pattern, rf"\g<1>{content}\2", html, count=1)


def replace_name_meta(html: str, name: str, content: str) -> str:
    content = escape(content, quote=True)
    pattern = rf'(<meta\s+name="{name}"\s+content=")[^"]*("\s*/?>)'
    return sub(pattern, rf"\g<1>{content}\2", html, count=1)


def render_index_html(request: Request, key: str | None = None) -> str:
    html = (STATIC_DIR / "main.html").read_text(encoding="utf-8")
    if not key:
        return html

    row = lookup_link(key)
    if not row:
        return html

    url, format_name, _raw_display_settings, title, _edit_token, _source_visibility, _created_at = row
    page_url = str(request.url.replace(query=""))
    og_image_url = str(request.url_for("og_image", key=key))
    structure_title = title or title_from_url(url) or f"{format_name.upper()} {key}"
    page_title = f"molx | {structure_title}"
    description = f"View {structure_title}, a {format_name.upper()} molecular structure on molx."

    html = html.replace("<title>molx</title>", f"<title>{escape(page_title)}</title>", 1)
    html = replace_name_meta(html, "title", page_title)
    html = replace_meta(html, "og:title", page_title)
    html = replace_name_meta(html, "description", description)
    html = replace_meta(html, "og:description", description)
    html = replace_name_meta(html, "twitter:description", description)
    html = replace_meta(html, "og:url", page_url)
    html = replace_meta(html, "og:image", og_image_url)
    html = replace_name_meta(html, "twitter:image", og_image_url)
    html = html.replace(
        '<meta property="og:type" content="website" />',
        '<meta property="og:image:width" content="1200" />\n'
        '  <meta property="og:image:height" content="630" />\n'
        '  <meta property="og:type" content="website" />',
        1,
    )
    html = html.replace(
        '<meta name="twitter:card" content="summary" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        1,
    )
    return html


@app.get("/og/{key}.png", name="og_image")
def og_image(key: str):
    row = lookup_link(key)
    if not row:
        raise HTTPException(status_code=404, detail="Key not found")

    url, format_name, _raw_display_settings, title, _edit_token, _source_visibility, _created_at = row
    image = generate_og_image(key, url, format_name, title or title_from_url(url))
    return Response(
        content=image,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/favicon.ico")
async def favicon():
    return FileResponse(STATIC_DIR / "favicon.ico")


@app.get("/")
async def read_root(request: Request):
    return HTMLResponse(render_index_html(request))


@app.get("/{key}")
async def read_key(request: Request, key: str):
    return HTMLResponse(render_index_html(request, key))
