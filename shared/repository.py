"""Данные магазина: товары, заказы, промокоды (SQLite)."""

from __future__ import annotations

import os
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from shared.catalog import (
    BOOST_PRODUCTS,
    CATEGORIES,
    ESCORT_PRODUCTS,
    GEAR_PRODUCTS,
    Product,
)

_ROOT = Path(__file__).resolve().parent.parent
_DATA_DIR = Path(os.environ.get("DATA_DIR", str(_ROOT / "data")))
DB_PATH = _DATA_DIR / "shop.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                amount REAL NOT NULL DEFAULT 0,
                currency TEXT NOT NULL DEFAULT 'RUB',
                category TEXT NOT NULL,
                popular INTEGER NOT NULL DEFAULT 0,
                extra_hint TEXT NOT NULL DEFAULT '',
                button_style TEXT NOT NULL DEFAULT 'primary',
                active INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS category_settings (
                category TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL DEFAULT 1,
                title TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS promocodes (
                code TEXT PRIMARY KEY,
                discount_percent REAL NOT NULL,
                use_limit INTEGER NOT NULL DEFAULT 0,
                uses_left INTEGER NOT NULL DEFAULT 0,
                one_per_user INTEGER NOT NULL DEFAULT 1,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                username TEXT,
                product_id TEXT NOT NULL,
                product_title TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                pubg_id TEXT,
                comment TEXT,
                paycore_url TEXT,
                status TEXT NOT NULL DEFAULT 'new',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS bot_users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                orders_count INTEGER NOT NULL DEFAULT 0,
                total_spent REAL NOT NULL DEFAULT 0,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL
            );
            """,
        )
        conn.commit()
    _seed_if_empty()


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return s[:48] or "item"


def _seed_if_empty() -> None:
    with _connect() as conn:
        n = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        if n > 0:
            return
        all_products = ESCORT_PRODUCTS + BOOST_PRODUCTS + GEAR_PRODUCTS
        for i, p in enumerate(all_products):
            conn.execute(
                """
                INSERT INTO products (
                    id, title, description, amount, currency, category,
                    popular, extra_hint, button_style, active, sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (
                    p.id,
                    p.title,
                    p.description,
                    p.amount,
                    p.currency,
                    p.category,
                    1 if p.popular else 0,
                    p.extra_hint,
                    p.button_style,
                    i,
                ),
            )
        for cat_id, (title, desc, _) in CATEGORIES.items():
            conn.execute(
                """
                INSERT OR IGNORE INTO category_settings (category, enabled, title, description)
                VALUES (?, 1, ?, ?)
                """,
                (cat_id, title, desc),
            )
        conn.commit()


def _row_product(row: sqlite3.Row) -> Product:
    return Product(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        amount=row["amount"],
        currency=row["currency"],
        category=row["category"],
        popular=bool(row["popular"]),
        extra_hint=row["extra_hint"] or "",
        button_style=row["button_style"] or "primary",
        active=bool(row["active"]),
    )


def list_products(*, active_only: bool = False, category: str | None = None) -> list[Product]:
    q = "SELECT * FROM products WHERE 1=1"
    params: list[Any] = []
    if active_only:
        q += " AND active = 1"
    if category:
        q += " AND category = ?"
        params.append(category)
    q += " ORDER BY sort_order, title"
    with _connect() as conn:
        rows = conn.execute(q, params).fetchall()
    return [_row_product(r) for r in rows]


def get_product(product_id: str) -> Optional[Product]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return _row_product(row) if row else None


def get_categories_for_bot() -> dict[str, tuple[str, str, list[Product]]]:
    with _connect() as conn:
        settings = {
            r["category"]: r
            for r in conn.execute("SELECT * FROM category_settings").fetchall()
        }
    result: dict[str, tuple[str, str, list[Product]]] = {}
    for cat_id, (default_title, default_desc, _) in CATEGORIES.items():
        st = settings.get(cat_id)
        if st and not st["enabled"]:
            continue
        title = (st["title"] if st else None) or default_title
        desc = (st["description"] if st else None) or default_desc
        products = list_products(active_only=True, category=cat_id)
        if products:
            result[cat_id] = (title, desc, products)
    return result


def list_popular_products() -> list[Product]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM products
            WHERE active = 1 AND popular = 1
            ORDER BY sort_order, title
            """,
        ).fetchall()
    return [_row_product(r) for r in rows]


def create_product(data: dict[str, Any]) -> Product:
    pid = data.get("id") or _slug(data["title"])
    with _connect() as conn:
        if conn.execute("SELECT 1 FROM products WHERE id = ?", (pid,)).fetchone():
            base = pid
            n = 2
            while conn.execute("SELECT 1 FROM products WHERE id = ?", (pid,)).fetchone():
                pid = f"{base}_{n}"
                n += 1
        conn.execute(
            """
            INSERT INTO products (
                id, title, description, amount, currency, category,
                popular, extra_hint, button_style, active, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                pid,
                data["title"],
                data.get("description", ""),
                float(data.get("amount", 0)),
                data.get("currency", "RUB"),
                data["category"],
                1 if data.get("popular") else 0,
                data.get("extra_hint", ""),
                data.get("button_style", "primary"),
                1 if data.get("active", True) else 0,
                int(data.get("sort_order", 0)),
            ),
        )
        conn.commit()
    p = get_product(pid)
    assert p
    return p


def update_product(product_id: str, data: dict[str, Any]) -> Optional[Product]:
    fields = []
    values: list[Any] = []
    mapping = {
        "title": "title",
        "description": "description",
        "amount": "amount",
        "currency": "currency",
        "category": "category",
        "popular": "popular",
        "extra_hint": "extra_hint",
        "button_style": "button_style",
        "active": "active",
        "sort_order": "sort_order",
    }
    for key, col in mapping.items():
        if key in data:
            val = data[key]
            if key == "popular":
                val = 1 if val else 0
            if key == "active":
                val = 1 if val else 0
            fields.append(f"{col} = ?")
            values.append(val)
    if not fields:
        return get_product(product_id)
    values.append(product_id)
    with _connect() as conn:
        conn.execute(f"UPDATE products SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    return get_product(product_id)


def delete_product(product_id: str) -> bool:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
        conn.commit()
        return cur.rowcount > 0


def list_category_settings() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM category_settings ORDER BY category",
        ).fetchall()
    return [dict(r) for r in rows]


def set_category_enabled(category: str, enabled: bool) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE category_settings SET enabled = ? WHERE category = ?",
            (1 if enabled else 0, category),
        )
        conn.commit()


# --- Orders ---


@dataclass
class Order:
    id: str
    user_id: int
    username: str | None
    product_id: str
    product_title: str
    amount: float
    currency: str
    pubg_id: str | None
    comment: str | None
    paycore_url: str | None
    status: str
    created_at: str


def save_order(
    order_id: str,
    user_id: int,
    username: str | None,
    product_id: str,
    product_title: str,
    amount: float,
    currency: str,
    pubg_id: str | None,
    comment: str | None,
    paycore_url: str | None = None,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO orders (
                id, user_id, username, product_id, product_title,
                amount, currency, pubg_id, comment, paycore_url, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
            """,
            (
                order_id,
                user_id,
                username,
                product_id,
                product_title,
                amount,
                currency,
                pubg_id,
                comment,
                paycore_url,
                now,
            ),
        )
        conn.commit()
    _record_order_user(user_id, username, amount)


def register_user(
    user_id: int,
    username: str | None = None,
    first_name: str | None = None,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        row = conn.execute(
            "SELECT user_id FROM bot_users WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if row:
            conn.execute(
                """
                UPDATE bot_users SET
                    username = COALESCE(?, username),
                    first_name = COALESCE(?, first_name),
                    last_seen = ?
                WHERE user_id = ?
                """,
                (username, first_name, now, user_id),
            )
        else:
            conn.execute(
                """
                INSERT INTO bot_users (
                    user_id, username, first_name, orders_count, total_spent,
                    first_seen, last_seen
                ) VALUES (?, ?, ?, 0, 0, ?, ?)
                """,
                (user_id, username, first_name, now, now),
            )
        conn.commit()


def _record_order_user(user_id: int, username: str | None, spent: float) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        row = conn.execute(
            "SELECT user_id FROM bot_users WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if row:
            conn.execute(
                """
                UPDATE bot_users SET
                    username = COALESCE(?, username),
                    orders_count = orders_count + 1,
                    total_spent = total_spent + ?,
                    last_seen = ?
                WHERE user_id = ?
                """,
                (username, spent, now, user_id),
            )
        else:
            conn.execute(
                """
                INSERT INTO bot_users (
                    user_id, username, first_name, orders_count, total_spent,
                    first_seen, last_seen
                ) VALUES (?, ?, NULL, 1, ?, ?, ?)
                """,
                (user_id, username, spent, now, now),
            )
        conn.commit()


def list_recent_orders(limit: int = 50) -> list[Order]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM orders ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [_row_order(r) for r in rows]


def _row_order(row: sqlite3.Row) -> Order:
    return Order(
        id=row["id"],
        user_id=row["user_id"],
        username=row["username"],
        product_id=row["product_id"],
        product_title=row["product_title"],
        amount=row["amount"],
        currency=row["currency"],
        pubg_id=row["pubg_id"],
        comment=row["comment"],
        paycore_url=row["paycore_url"] if "paycore_url" in row.keys() else None,
        status=row["status"],
        created_at=row["created_at"],
    )


def stats_summary() -> dict[str, Any]:
    with _connect() as conn:
        orders = conn.execute("SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM orders").fetchone()
        users = conn.execute("SELECT COUNT(*) FROM bot_users").fetchone()[0]
        buyers = conn.execute(
            "SELECT COUNT(DISTINCT user_id) FROM orders",
        ).fetchone()[0]
        products = conn.execute(
            "SELECT COUNT(*) FROM products WHERE active = 1",
        ).fetchone()[0]
    return {
        "orders_count": orders["c"],
        "sales_total": round(orders["s"], 2),
        "users_total": users,
        "buyers_count": buyers,
        "products_active": products,
    }


# --- Promos ---


def list_promos() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM promocodes ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def create_promo(code: str, discount_percent: float, use_limit: int) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO promocodes (code, discount_percent, use_limit, uses_left, active, created_at)
            VALUES (?, ?, ?, ?, 1, ?)
            """,
            (code.upper(), discount_percent, use_limit, use_limit, now),
        )
        conn.commit()


def delete_promo(code: str) -> bool:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM promocodes WHERE code = ?", (code.upper(),))
        conn.commit()
        return cur.rowcount > 0


def list_users(limit: int = 100) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM bot_users ORDER BY last_seen DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]
