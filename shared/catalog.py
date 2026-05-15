from dataclasses import dataclass
from typing import Optional

REVIEWS_CHANNEL_URL = "https://t.me/KotikexsMetroShopOtziv"

# Premium emoji: шлем → броня → портфель → МК
EMOJI_HELMET = "5204201311238629537"
EMOJI_ARMOR = "5201907777227730330"
EMOJI_BAG = "5201773765658160740"
EMOJI_MK = "5204105005186952289"


def _tg_emoji(emoji_id: str, fallback: str) -> str:
    return f'<tg-emoji emoji-id="{emoji_id}">{fallback}</tg-emoji>'


# HTML-вариант (если клиент поддерживает tg-emoji в caption)
ESCORT_GEAR_LINE_HTML = (
    "• Выдача "
    + _tg_emoji(EMOJI_HELMET, "🪖")
    + _tg_emoji(EMOJI_ARMOR, "🧥")
    + _tg_emoji(EMOJI_BAG, "👜")
    + _tg_emoji(EMOJI_MK, "🔫")
    + "\n"
)

# Для Product.description (без HTML-тегов; эмодзи подставляются при отправке)
ESCORT_GEAR_LINE = "• Выдача 🪖🧥👜🔫\n"

ESCORT_INFO_FULL = (
    "<b>🔑 Опыт, которому можно доверять</b>\n"
    "У нас более 5 лет игры и 2 года профессиональных сопровождений.\n\n"
    "<b>🔥 Команда профи</b>\n"
    "Только адекватные, опытные и сильные игроки без читов.\n\n"
    "<b>🔎 Индивидуальный подход</b>\n"
    "Уникальные тактики и стратегии для каждого клиента.\n\n"
    "<b>Что вы получаете?</b>\n"
    "🔥 <b>Гарантированный вынос</b>\n"
    "🔅 <b>Полное сопровождение:</b> матч на 7–8 карте с максимальным выносом\n"
    "🔅 <b>Дополнительный лут:</b> всё, что не сможете забрать — отдадим на базовой карте\n"
    "🔅 <b>Шанс попасть в видео</b> в TikTok 🎥\n"
    "🔅 <b>Поддержка:</b> можно взять друга бесплатно 🧡\n"
    "🔅 <b>Гарантия результата:</b> вещи для выкладки; при потере лута — выдаём новые\n"
    "🔅 <b>Максимальный вынос:</b> при нехватке лута — доп. матч или свои вещи\n\n"
    "<b>🔥 Специальное предложение</b>\n"
    "При заказе сопровождения — разбор тактик, приёмов и ответы на ваши вопросы ❗️\n\n"
    f'➡️ <a href="{REVIEWS_CHANNEL_URL}">Канал с отзывами</a> ⬅️'
)

ESCORT_INFO_SHORT = (
    "<b>🛡️ Заказать сопровождение</b>\n\n"
    "ПРЕМИУМ · ВИП · БАЗА — выберите тариф ниже.\n"
    "5+ лет в Metro · команда без читов · гарантированный вынос.\n\n"
    f'<a href="{REVIEWS_CHANNEL_URL}">📢 Отзывы клиентов</a>'
)


@dataclass(frozen=True)
class Product:
    id: str
    title: str
    description: str
    amount: float
    currency: str
    category: str
    popular: bool = False
    extra_hint: str = ""
    button_style: str = "primary"
    active: bool = True


ESCORT_PRODUCTS: list[Product] = [
    Product(
        id="escort_premium",
        title="ПРЕМИУМ",
        description=(
            "<b>Сопровождение ПРЕМИУМ</b>\n"
            f"{ESCORT_GEAR_LINE}"
            "• 25–30кк гаранта\n"
            "• 7–8 карта, как вы пожелаете\n"
            "• Вещи в конце сопровождения ❗️"
        ),
        amount=550.0,
        currency="RUB",
        category="escort",
        popular=True,
        button_style="danger",
    ),
    Product(
        id="escort_vip",
        title="ВИП",
        description=(
            "<b>Сопровождение ВИП</b>\n"
            f"{ESCORT_GEAR_LINE}"
            "• 15–20кк гаранта\n"
            "• 7–8 карта, как вы пожелаете\n"
            "• Вещи в конце сопровождения ❗️"
        ),
        amount=350.0,
        currency="RUB",
        category="escort",
        popular=True,
        button_style="primary",
    ),
    Product(
        id="escort_base",
        title="БАЗА",
        description=(
            "<b>Сопровождение БАЗА</b>\n"
            f"{ESCORT_GEAR_LINE}"
            "• 10–12кк гаранта\n"
            "• 7–8 карта, как вы пожелаете\n"
            "• Вещи в конце сопровождения ❗️"
        ),
        amount=230.0,
        currency="RUB",
        category="escort",
        button_style="success",
    ),
]

BOOST_PRODUCTS: list[Product] = [
    Product(
        id="boost_rank",
        title="Буст ранга Metro",
        description="Прокачка ранга в Metro Royale",
        amount=999.0,
        currency="RUB",
        category="boost",
        popular=True,
    ),
    Product(
        id="boost_cash_1h",
        title="Фарм Metro Cash (1 ч)",
        description="Вынос Metro Cash на ваш склад",
        amount=599.0,
        currency="RUB",
        category="boost",
    ),
    Product(
        id="boost_loot_1h",
        title="Фарм лута (1 ч)",
        description="Фарм ценного лута в Metro Royale",
        amount=549.0,
        currency="RUB",
        category="boost",
    ),
    Product(
        id="boost_custom",
        title="Индивидуальный буст",
        description="Любая задача — оценим вручную",
        amount=0.0,
        currency="RUB",
        category="boost",
        extra_hint="Опишите цель: ранг, лут, сроки.",
    ),
]

GEAR_PRODUCTS: list[Product] = [
    Product(
        id="gear_steel_set",
        title="Steel Front (сет)",
        description="Шлем + броня + рюкзак Steel Front",
        amount=399.0,
        currency="RUB",
        category="gear",
        popular=True,
    ),
    Product(
        id="gear_cobalt_set",
        title="Cobalt (сет)",
        description="Шлем + броня + рюкзак Cobalt",
        amount=449.0,
        currency="RUB",
        category="gear",
    ),
    Product(
        id="gear_armor6",
        title="Броня 6 lvl",
        description="Бронежилет 6 уровня",
        amount=299.0,
        currency="RUB",
        category="gear",
    ),
    Product(
        id="gear_mk14",
        title="Mk14 (Metro)",
        description="Mk14 с вложениями по запросу",
        amount=349.0,
        currency="RUB",
        category="gear",
    ),
    Product(
        id="gear_amr",
        title="AMR",
        description="Редкое метро-оружие AMR",
        amount=499.0,
        currency="RUB",
        category="gear",
    ),
    Product(
        id="gear_custom",
        title="Другой предмет",
        description="Любое снаряжение Metro — под заказ",
        amount=0.0,
        currency="RUB",
        category="gear",
        extra_hint="Название предмета, уровень усиления, бюджет.",
    ),
]

CATEGORIES: dict[str, tuple[str, str, list[Product]]] = {
    "escort": (
        "🛡️ Сопровождение",
        ESCORT_INFO_SHORT,
        ESCORT_PRODUCTS,
    ),
    "boost": (
        "⚡ Буст",
        "Прокачка ранга, фарм Metro Cash и лута",
        BOOST_PRODUCTS,
    ),
    "gear": (
        "🔫 Снаряжение",
        "Оружие и броня для Metro Royale",
        GEAR_PRODUCTS,
    ),
}

_ALL: list[Product] = ESCORT_PRODUCTS + BOOST_PRODUCTS + GEAR_PRODUCTS
POPULAR_PRODUCTS = [p for p in _ALL if p.popular]

_BY_ID: dict[str, Product] = {p.id: p for p in _ALL}


def get_product(product_id: str) -> Optional[Product]:
    return _BY_ID.get(product_id)

def reviews_url() -> str:
    return REVIEWS_CHANNEL_URL
