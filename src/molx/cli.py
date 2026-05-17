from pathlib import Path
import argparse
import json
import sys

from fastapi import HTTPException

from molx.config import DB_PATH


def print_json(data) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2, default=str))


def http_exception_message(error: HTTPException) -> str:
    return str(error.detail or error)


def command_serve(args: argparse.Namespace) -> int:
    import uvicorn

    uvicorn.run(
        "molx.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        proxy_headers=args.proxy_headers,
        access_log=args.access_log,
    )
    return 0


def command_check_url(args: argparse.Namespace) -> int:
    from molx.services.structure_fetcher import (
        assert_public_host,
        fetch_structure,
        normalize_url,
    )

    try:
        url = normalize_url(args.url)
        assert_public_host(url)
        structure_data, format_name = fetch_structure(url)
    except HTTPException as error:
        print(f"Error: {http_exception_message(error)}", file=sys.stderr)
        return 1

    print_json(
        {
            "url": url,
            "format": format_name,
            "bytes": len(structure_data.encode("utf-8")),
        }
    )
    return 0


def command_register(args: argparse.Namespace) -> int:
    from molx.db import create_link_record
    from molx.services.structure_fetcher import (
        assert_public_host,
        fetch_structure,
        normalize_url,
    )
    from molx.services.structure_title import infer_structure_title, normalize_custom_title

    try:
        url = normalize_url(args.url)
        assert_public_host(url)
        structure_data, format_name = fetch_structure(url)
        title = normalize_custom_title(args.title) or infer_structure_title(
            structure_data, format_name, url
        )
        source_visibility = "public" if args.show_source else "hidden"
        record = create_link_record(url, format_name, title, source_visibility)
    except HTTPException as error:
        print(f"Error: {http_exception_message(error)}", file=sys.stderr)
        return 1

    print_json(record)
    return 0


def command_db_stats(_args: argparse.Namespace) -> int:
    from molx.db import count_links, count_links_by_format, main_conn

    print_json(
        {
            "db_path": str(DB_PATH),
            "journal_mode": main_conn.execute("PRAGMA journal_mode").fetchone()[0],
            "busy_timeout_ms": main_conn.execute("PRAGMA busy_timeout").fetchone()[0],
            "links": count_links(),
            "formats": {format_name: count for format_name, count in count_links_by_format()},
        }
    )
    return 0


def command_db_backup(args: argparse.Namespace) -> int:
    from molx.db import backup_database

    target_path = Path(args.path).expanduser()
    backup_database(target_path)
    print(str(target_path))
    return 0


def link_row_to_dict(row) -> dict:
    return {
        "key": row[0],
        "url": row[1],
        "format": row[2],
        "display_settings": row[3],
        "title": row[4],
        "source_visibility": row[5],
        "created_at": row[6],
    }


def command_links_list(args: argparse.Namespace) -> int:
    from molx.db import list_links

    rows = [link_row_to_dict(row) for row in list_links(args.limit)]
    if args.json:
        print_json(rows)
        return 0

    if not rows:
        print("No links.")
        return 0

    for row in rows:
        title = row["title"] or "-"
        print(
            f"{row['key']}  {row['format']:<4}  {row['source_visibility']:<6}  "
            f"{row['created_at']}  {title}  {row['url']}"
        )
    return 0


def command_links_show(args: argparse.Namespace) -> int:
    from molx.db import lookup_link
    from molx.services.display_settings import parse_display_settings

    row = lookup_link(args.key)
    if not row:
        print("Error: Key not found", file=sys.stderr)
        return 1

    url, format_name, raw_display_settings, title, _edit_token, source_visibility, created_at = row
    print_json(
        {
            "key": args.key,
            "url": url,
            "format": format_name,
            "title": title,
            "source_visibility": source_visibility,
            "display_settings": parse_display_settings(raw_display_settings),
            "created_at": created_at,
        }
    )
    return 0


def command_links_delete(args: argparse.Namespace) -> int:
    from molx.db import delete_link

    if not args.yes:
        print("Error: pass --yes to delete a link", file=sys.stderr)
        return 2

    if not delete_link(args.key):
        print("Error: Key not found", file=sys.stderr)
        return 1

    print(args.key)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="molx")
    subparsers = parser.add_subparsers(dest="command", required=True)

    serve = subparsers.add_parser("serve", help="Run the molx web server")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--reload", action="store_true")
    serve.add_argument("--proxy-headers", action="store_true")
    serve.add_argument("--access-log", action="store_true")
    serve.set_defaults(func=command_serve)

    check_url = subparsers.add_parser("check-url", help="Validate and detect a structure URL")
    check_url.add_argument("url")
    check_url.set_defaults(func=command_check_url)

    register = subparsers.add_parser("register", help="Register a public structure URL")
    register.add_argument("url")
    register.add_argument("--title", help="Optional title to store with the link")
    register.add_argument(
        "--show-source",
        action="store_true",
        help="Make the source URL visible to public viewers",
    )
    register.set_defaults(func=command_register)

    db = subparsers.add_parser("db", help="Database tools")
    db_subparsers = db.add_subparsers(dest="db_command", required=True)

    db_stats = db_subparsers.add_parser("stats", help="Show database statistics")
    db_stats.set_defaults(func=command_db_stats)

    db_backup = db_subparsers.add_parser("backup", help="Create a SQLite backup")
    db_backup.add_argument("path")
    db_backup.set_defaults(func=command_db_backup)

    links = subparsers.add_parser("links", help="Link management tools")
    links_subparsers = links.add_subparsers(dest="links_command", required=True)

    links_list = links_subparsers.add_parser("list", help="List recent links")
    links_list.add_argument("--limit", type=int, default=50)
    links_list.add_argument("--json", action="store_true")
    links_list.set_defaults(func=command_links_list)

    links_show = links_subparsers.add_parser("show", help="Show a link")
    links_show.add_argument("key")
    links_show.set_defaults(func=command_links_show)

    links_delete = links_subparsers.add_parser("delete", help="Delete a link")
    links_delete.add_argument("key")
    links_delete.add_argument("--yes", action="store_true")
    links_delete.set_defaults(func=command_links_delete)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
