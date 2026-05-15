import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "orders.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
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
            )
            """,
        )
        try:
            conn.execute("ALTER TABLE orders ADD COLUMN paycore_url TEXT")
        except sqlite3.OperationalError:
            pass
        conn.commit()


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


def list_recent_orders(limit: int = 15) -> list[Order]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM orders
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [_row_to_order(r) for r in rows]


def _row_to_order(row: sqlite3.Row) -> Order:
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
