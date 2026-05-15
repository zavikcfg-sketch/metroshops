from __future__ import annotations

from typing import Literal

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from shared.catalog import REVIEWS_CHANNEL_URL
from shared.config import Settings
from shared.repository import get_product, list_products

ButtonStyle = Literal["primary", "success", "danger"]


def _btn(
    text: str,
    *,
    callback_data: str | None = None,
    url: str | None = None,
    style: ButtonStyle | None = None,
) -> InlineKeyboardButton:
    kwargs: dict = {"text": text}
    if callback_data is not None:
        kwargs["callback_data"] = callback_data
    if url is not None:
        kwargs["url"] = url
    if style is not None:
        kwargs["style"] = style
    try:
        return InlineKeyboardButton(**kwargs)
    except TypeError:
        kwargs.pop("style", None)
        return InlineKeyboardButton(**kwargs)


def inline_root_menu(settings: Settings) -> InlineKeyboardMarkup:
    reviews = settings.reviews_url.strip() or REVIEWS_CHANNEL_URL
    metro = settings.metro_shop_url.strip() or reviews
    site = settings.website_url.strip()

    rows: list[list[InlineKeyboardButton]] = [
        [
            _btn("🛡️ Сопровождение", callback_data="cat_escort", style="primary"),
            _btn("⚡ Буст", callback_data="cat_boost", style="primary"),
        ],
        [
            _btn("🔫 Снаряжение", callback_data="cat_gear", style="primary"),
        ],
        [
            _btn("Самый качественный MetroShop ↗", url=metro, style="danger"),
        ],
    ]

    if site:
        rows.append(
            [
                _btn("САЙТ (БЕЗ VPN) ↗", url=site, style="primary"),
                _btn("🛡️ Заказать сопровождение", callback_data="cat_escort", style="primary"),
            ],
        )
    else:
        rows.append(
            [_btn("🛡️ Заказать сопровождение", callback_data="cat_escort", style="primary")],
        )

    rows.extend(
        [
            [
                _btn("🎁 Промокоды", callback_data="menu_promo", style="primary"),
                _btn("🎖 Популярное", callback_data="menu_popular", style="primary"),
            ],
            [
                _btn("👥 Реферальная система", callback_data="menu_referral", style="success"),
            ],
            [_btn("💬 Информация", callback_data="menu_info", style="danger")],
            [_btn("📢 Канал с отзывами ↗", url=reviews, style="primary")],
        ],
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def inline_escort_menu() -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    for product in list_products(active_only=True, category="escort"):
        price = int(product.amount) if product.amount > 0 else 0
        label = (
            f"{product.title} — {price} ₽"
            if price
            else f"{product.title} — по запросу"
        )
        style = product.button_style
        if style not in ("primary", "success", "danger"):
            style = "primary"
        rows.append(
            [
                _btn(
                    label,
                    callback_data=f"pick_{product.id}",
                    style=style,  # type: ignore[arg-type]
                ),
            ],
        )
    rows.append(
        [_btn("📖 Подробнее о сопровождении", callback_data="menu_escort_info", style="primary")],
    )
    rows.append([_btn("📢 Отзывы ↗", url=REVIEWS_CHANNEL_URL, style="primary")])
    rows.append([_btn("◀️ В главное меню", callback_data="menu_root", style="danger")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def inline_product_list(
    items: list[tuple[str, str]],
    back_callback: str = "menu_root",
) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    for product_id, label in items:
        product = get_product(product_id)
        style: ButtonStyle | None = "primary"
        if product and product.button_style in ("primary", "success", "danger"):
            style = product.button_style  # type: ignore[assignment]
        rows.append([_btn(label, callback_data=f"pick_{product_id}", style=style)])
    rows.append([_btn("◀️ В главное меню", callback_data=back_callback, style="danger")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def inline_confirm_order() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                _btn("✅ Подтвердить", callback_data="order_confirm", style="success"),
                _btn("❌ Отмена", callback_data="order_cancel", style="danger"),
            ],
        ],
    )


def inline_paycore(checkout_url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [_btn("💳 Оплатить через PayCore", url=checkout_url, style="primary")],
            [_btn("◀️ В главное меню", callback_data="menu_root", style="danger")],
        ],
    )
