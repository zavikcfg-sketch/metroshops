from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from shared.config import Settings


def inline_root_menu(settings: Settings) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [
            InlineKeyboardButton(
                text="🛡️ Сопровождение",
                callback_data="cat_escort",
            ),
            InlineKeyboardButton(
                text="⚡ Буст",
                callback_data="cat_boost",
            ),
        ],
        [
            InlineKeyboardButton(
                text="🔫 Снаряжение",
                callback_data="cat_gear",
            ),
        ],
    ]

    site = settings.website_url.strip()
    metro = settings.metro_shop_url.strip()
    if metro:
        rows.append(
            [
                InlineKeyboardButton(
                    text="Самый качественный MetroShop ↗",
                    url=metro,
                ),
            ],
        )
    if site:
        rows.append(
            [
                InlineKeyboardButton(text="САЙТ (БЕЗ VPN) ↗", url=site),
                InlineKeyboardButton(
                    text="🛒 Каталог",
                    callback_data="menu_categories",
                ),
            ],
        )

    rows.extend(
        [
            [
                InlineKeyboardButton(text="🎁 Промокоды", callback_data="menu_promo"),
                InlineKeyboardButton(text="🎖 Популярное", callback_data="menu_popular"),
            ],
            [
                InlineKeyboardButton(
                    text="👥 Реферальная система",
                    callback_data="menu_referral",
                ),
            ],
            [
                InlineKeyboardButton(text="💬 Информация", callback_data="menu_info"),
            ],
        ],
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def inline_product_list(
    items: list[tuple[str, str]],
    back_callback: str = "menu_root",
) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    for product_id, label in items:
        rows.append(
            [
                InlineKeyboardButton(
                    text=label,
                    callback_data=f"pick_{product_id}",
                ),
            ],
        )
    rows.append(
        [InlineKeyboardButton(text="◀️ В главное меню", callback_data=back_callback)],
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


def inline_paycore(checkout_url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="💳 Оплатить через PayCore", url=checkout_url)],
            [InlineKeyboardButton(text="◀️ В главное меню", callback_data="menu_root")],
        ],
    )
