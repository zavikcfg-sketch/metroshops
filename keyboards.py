from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
)

from shared.catalog import CATEGORIES


def reply_main_menu() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🛒 Каталог"), KeyboardButton(text="📋 Мои заказы")],
            [KeyboardButton(text="ℹ️ Как купить"), KeyboardButton(text="💬 Поддержка")],
        ],
        resize_keyboard=True,
    )


def inline_categories() -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton(
                text=title,
                callback_data=f"cat_{cat_id}",
            ),
        ]
        for cat_id, (title, _, _) in CATEGORIES.items()
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def inline_product_list(items: list[tuple[str, str]]) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    row: list[InlineKeyboardButton] = []
    for product_id, label in items:
        row.append(
            InlineKeyboardButton(text=label, callback_data=f"pick_{product_id}"),
        )
        if len(row) == 1:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append(
        [InlineKeyboardButton(text="◀️ Категории", callback_data="menu_categories")],
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def inline_confirm_order() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Подтвердить", callback_data="order_confirm"),
                InlineKeyboardButton(text="❌ Отмена", callback_data="order_cancel"),
            ],
        ],
    )


def reply_cancel_only() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="❌ Отменить заказ")]],
        resize_keyboard=True,
    )
