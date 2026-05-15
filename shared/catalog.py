from dataclasses import dataclass
from typing import Optional


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


ESCORT_PRODUCTS: list[Product] = [
    Product(
        id="escort_1",
        title="1 рейд",
        description="Сопровождение в одном рейде Metro Royale",
        amount=199.0,
        currency="RUB",
        category="escort",
    ),
    Product(
        id="escort_5",
        title="5 рейдов",
        description="Пакет сопровождения — 5 вылазок с опытным игроком",
        amount=799.0,
        currency="RUB",
        category="escort",
        popular=True,
    ),
    Product(
        id="escort_10",
        title="10 рейдов",
        description="Максимальный пакет сопровождения",
        amount=1399.0,
        currency="RUB",
        category="escort",
    ),
    Product(
        id="escort_vip",
        title="VIP сопровождение",
        description="Индивидуальные условия и расписание",
        amount=0.0,
        currency="RUB",
        category="escort",
        extra_hint="Укажите ранг, время игры и пожелания.",
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
        "Опытный игрок ведёт вас по рейдам Metro Royale",
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
