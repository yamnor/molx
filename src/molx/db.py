from datetime import datetime
import hashlib
from pathlib import Path
import secrets
import sqlite3
import string
import threading

from fastapi import HTTPException

from molx.config import DB_PATH

db_lock = threading.Lock()


def connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, check_same_thread=False, timeout=30)
    connection.execute("PRAGMA busy_timeout = 5000")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


main_conn = connect()


def init_db() -> None:
    with db_lock:
        main_conn.execute(
            """
            CREATE TABLE IF NOT EXISTS links (
                key TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        main_conn.commit()

        link_columns = {
            row[1] for row in main_conn.execute("PRAGMA table_info(links)").fetchall()
        }
        if "format" not in link_columns:
            main_conn.execute("ALTER TABLE links ADD COLUMN format TEXT NOT NULL DEFAULT 'xyz'")
            main_conn.commit()
        if "display_settings" not in link_columns:
            main_conn.execute("ALTER TABLE links ADD COLUMN display_settings TEXT")
            main_conn.commit()
        if "title" not in link_columns:
            main_conn.execute("ALTER TABLE links ADD COLUMN title TEXT")
            main_conn.commit()
        if "edit_token" not in link_columns:
            main_conn.execute("ALTER TABLE links ADD COLUMN edit_token TEXT")
            main_conn.commit()
        if "edit_token_hash" not in link_columns:
            main_conn.execute("ALTER TABLE links ADD COLUMN edit_token_hash TEXT")
            main_conn.commit()
            main_conn.execute(
                "UPDATE links SET edit_token_hash = edit_token WHERE edit_token IS NOT NULL AND edit_token_hash IS NULL"
            )
            rows = main_conn.execute(
                "SELECT key, edit_token_hash FROM links WHERE edit_token_hash IS NOT NULL"
            ).fetchall()
            for key, token_or_hash in rows:
                if len(token_or_hash) != 64:
                    main_conn.execute(
                        "UPDATE links SET edit_token_hash = ? WHERE key = ?",
                        (hash_edit_token(token_or_hash), key),
                    )
            main_conn.commit()
        link_columns = {
            row[1] for row in main_conn.execute("PRAGMA table_info(links)").fetchall()
        }
        if "edit_token" in link_columns and "edit_token_hash" in link_columns:
            main_conn.execute(
                "UPDATE links SET edit_token = NULL WHERE edit_token IS NOT NULL AND edit_token_hash IS NOT NULL"
            )
            main_conn.commit()
        if "source_visibility" not in link_columns:
            main_conn.execute(
                "ALTER TABLE links ADD COLUMN source_visibility TEXT NOT NULL DEFAULT 'hidden'"
            )
            main_conn.commit()


def generate_key() -> str:
    alphabet = string.ascii_letters + string.digits
    for _ in range(20):
        key = "".join(secrets.choice(alphabet) for _ in range(6))
        with db_lock:
            row = main_conn.execute("SELECT 1 FROM links WHERE key = ?", (key,)).fetchone()
        if not row:
            return key
    raise HTTPException(status_code=500, detail="Failed to generate a unique key")


def generate_edit_token() -> str:
    return secrets.token_urlsafe(24)


def hash_edit_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_edit_token(token_hash: str | None, token: str | None) -> bool:
    if not token_hash or not token:
        return False
    return secrets.compare_digest(token_hash, hash_edit_token(token))


def lookup_link(key: str):
    with db_lock:
        return main_conn.execute(
            """
            SELECT url, format, display_settings, title, edit_token_hash, source_visibility, created_at
            FROM links
            WHERE key = ?
            """,
            (key,),
        ).fetchone()


def list_links(limit: int = 50) -> list[sqlite3.Row]:
    with db_lock:
        return main_conn.execute(
            """
            SELECT key, url, format, display_settings, title, source_visibility, created_at
            FROM links
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()


def count_links() -> int:
    with db_lock:
        row = main_conn.execute("SELECT COUNT(*) FROM links").fetchone()
    return int(row[0])


def count_links_by_format() -> list[tuple[str, int]]:
    with db_lock:
        return main_conn.execute(
            "SELECT format, COUNT(*) FROM links GROUP BY format ORDER BY format"
        ).fetchall()


def delete_link(key: str) -> bool:
    with db_lock:
        cursor = main_conn.execute("DELETE FROM links WHERE key = ?", (key,))
        main_conn.commit()
    return cursor.rowcount > 0


def backup_database(target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with db_lock:
        target = sqlite3.connect(target_path)
        try:
            main_conn.backup(target)
        finally:
            target.close()


def create_link_record(
    url: str,
    format_name: str,
    title: str | None = None,
    source_visibility: str = "hidden",
) -> dict:
    key = generate_key()
    edit_token = generate_edit_token()
    edit_token_hash = hash_edit_token(edit_token)
    created_at = datetime.now()
    normalized_source_visibility = (
        "public" if source_visibility == "public" else "hidden"
    )

    with db_lock:
        main_conn.execute(
            """
            INSERT INTO links
                (key, url, format, title, edit_token_hash, source_visibility, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                key,
                url,
                format_name,
                title,
                edit_token_hash,
                normalized_source_visibility,
                created_at,
            ),
        )
        main_conn.commit()

    return {
        "key": key,
        "url": url,
        "format": format_name,
        "title": title,
        "edit_token": edit_token,
        "source_visibility": normalized_source_visibility,
        "display_settings": None,
        "created_at": created_at,
    }


def update_link_display(key: str, raw_settings: str) -> None:
    with db_lock:
        main_conn.execute(
            "UPDATE links SET display_settings = ? WHERE key = ?",
            (raw_settings, key),
        )
        main_conn.commit()


def clear_link_display(key: str) -> None:
    with db_lock:
        main_conn.execute("UPDATE links SET display_settings = NULL WHERE key = ?", (key,))
        main_conn.commit()


def update_link_metadata(
    key: str,
    title: str | None,
    source_visibility: str,
) -> None:
    normalized_source_visibility = "public" if source_visibility == "public" else "hidden"
    with db_lock:
        main_conn.execute(
            "UPDATE links SET title = ?, source_visibility = ? WHERE key = ?",
            (title, normalized_source_visibility, key),
        )
        main_conn.commit()


def update_link_format(key: str, format_name: str) -> None:
    with db_lock:
        main_conn.execute("UPDATE links SET format = ? WHERE key = ?", (format_name, key))
        main_conn.commit()


init_db()
