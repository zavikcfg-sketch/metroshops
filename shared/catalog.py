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
    needs_pubg_id: bool = True
    extra_hint: str = ""


METRO_CASH: list[Product] = [
    Product(
        id="cash_100k",
        title="100 000 Metro Cash",
        description="Пополнение Metro Cash на ваш аккаунт",
        amount=149.0,
        currency="RUB",
        category="cash",
    ),
    Product(
        id="cash_500k",
        title="500 000 Metro Cash",
        description="Пополнение Metro Cash на ваш аккаунт",
        amount=599.0,
        currency="RUB",
        category="cash",
    ),
    Product(
        id="cash_1m",
        title="1 000 000 Metro Cash",
        description="Пополнение Metro Cash на ваш аккаунт",
        amount=1099.0,
        currency="RUB",
        category="cash",
    ),
]

METRO_GEAR: list[Product] = [
    Product(
        id="gear_steel_set",
        title="Steel Front (полный сет)",
        description="Шлем + броня + рюкзак Steel Front",
        amount=399.0,
        currency="RUB",
        category="gear",
        extra_hint="Укажите желаемый уровень усиления (если важно).",
    ),
    Product(
        id="gear_cobalt_set",
        title="Cobalt (полный сет)",
        description="Шлем + броня + рюкзак Cobalt",
        amount=449.0,
        currency="RUB",
        category="gear",
    ),
    Product(
        id="gear_armor6",
        title="Броня 6 lvl",
        description="Бронежилет 6 уровня для Metro Royale",
        amount=299.0,
        currency="RUB",
        category="gear",
    ),
    Product(
        id="gear_mk14",
        title="Mk14 (Metro)",
        description="Снайперская винтовка Mk14 с вложениями по запросу",
        amount=349.0,
        currency="RUB",
        category="gear",
    ),
    Product(
        id="gear_amr",
        title="AMR",
        description="AMR — редкое метро-оружие",
        amount=499.0,
        currency="RUB",
        category="gear",
    ),
]

METRO_SERVICES: list[Product] = [
    Product(
        id="svc_escort",
        title="Сопровождение 5 рейдов",
        description="Опытный игрок сопровождает в Metro Royale",
        amount=799.0,
        currency="RUB",
        category="services",
        extra_hint="Напишите ваш ранг и удобное время игры.",
    ),
    Product(
        id="svc_farm",
        title="Фарм лута (1 час)",
        description="Вынос ценного лута на ваш склад",
        amount=599.0,
        currency="RUB",
        category="services",
    ),
    Product(
        id="svc_custom",
        title="Индивидуальный заказ",
        description="Любой предмет Metro — оценим вручную",
        amount=0.0,
        currency="RUB",
        category="services",
        extra_hint="Опишите, что нужно: предмет, количество, бюджет.",
    ),
]

BUY_LOOT: list[Product] = [
    Product(
        id="buy_any",
        title="Скупка лута",
        description="Продайте нам добычу из Metro Royale",
        amount=0.0,
        currency="RUB",
        category="buy",
        needs_pubg_id=True,
        extra_hint=(
            "Перечислите предметы и их состояние.\n"
            "Приложите скриншоты в следующем сообщении."
        ),
    ),
]

CATEGORIES: dict[str, tuple[str, str, list[Product]]] = {
    "cash": ("💰 Metro Cash", "Пополнение внутриигровой валюты Metro Royale", METRO_CASH),
    "gear": ("🔫 Снаряжение", "Оружие и броня для рейдов", METRO_GEAR),
    "services": ("🛡️ Услуги", "Сопровождение и фарм", METRO_SERVICES),
    "buy": ("📦 Скупка лута", "Продайте нам ваш лут", BUY_LOOT),
}

_BY_ID: dict[str, Product] = {}
for _products in (METRO_CASH, METRO_GEAR, METRO_SERVICES, BUY_LOOT):
    for _p in _products:
        _BY_ID[_p.id] = _p


def get_product(product_id: str) -> Optional[Product]:
    return _BY_ID.get(product_id)
