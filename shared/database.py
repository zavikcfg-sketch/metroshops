"""Обратная совместимость — используйте shared.repository."""

from shared.repository import (  # noqa: F401
    Order,
    init_db,
    list_recent_orders,
    save_order,
)
