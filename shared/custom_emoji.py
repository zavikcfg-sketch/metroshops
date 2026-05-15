"""Премиум-эмодзи Telegram (custom_emoji) с корректными UTF-16 offset."""

from __future__ import annotations

from aiogram.enums import MessageEntityType
from aiogram.types import MessageEntity

from shared.catalog import EMOJI_ARMOR, EMOJI_BAG, EMOJI_HELMET, EMOJI_MK

# Порядок: шлем → броня → портфель → МК (fallback-символы для entity)
GEAR_FALLBACK = "🪖🧥👜🔫"
GEAR_EMOJI_IDS = (EMOJI_HELMET, EMOJI_ARMOR, EMOJI_BAG, EMOJI_MK)
GEAR_PREFIX = "• Выдача "


def utf16_len(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def gear_custom_emoji_entities(offset: int) -> list[MessageEntity]:
    entities: list[MessageEntity] = []
    pos = offset
    for char, emoji_id in zip(GEAR_FALLBACK, GEAR_EMOJI_IDS):
        length = utf16_len(char)
        entities.append(
            MessageEntity(
                type=MessageEntityType.CUSTOM_EMOJI,
                offset=pos,
                length=length,
                custom_emoji_id=emoji_id,
            ),
        )
        pos += length
    return entities


def gear_line_plain() -> str:
    return f"{GEAR_PREFIX}{GEAR_FALLBACK}\n"


def escort_extra_lines(product_id: str) -> str:
    mapping = {
        "escort_premium": (
            "• 25–30кк гаранта\n"
            "• 7–8 карта, как вы пожелаете\n"
            "• Вещи в конце сопровождения ❗️\n"
        ),
        "escort_vip": (
            "• 15–20кк гаранта\n"
            "• 7–8 карта, как вы пожелаете\n"
            "• Вещи в конце сопровождения ❗️\n"
        ),
        "escort_base": (
            "• 10–12кк гаранта\n"
            "• 7–8 карта, как вы пожелаете\n"
            "• Вещи в конце сопровождения ❗️\n"
        ),
    }
    return mapping.get(product_id, "")


def build_escort_pick_message(
    *,
    title: str,
    product_id: str,
    price_rub: int | None,
    extra_hint: str = "",
) -> tuple[str, list[MessageEntity]]:
    header = f"Вы выбрали: {title}\n\n"
    subheader = f"Сопровождение {title}\n"
    gear_block = gear_line_plain()
    body = escort_extra_lines(product_id)

    if price_rub is None:
        price_part = "Цена: по согласованию\n\n"
    else:
        price_part = f"Цена: {price_rub} ₽\n\n"

    footer = (
        f"{price_part}"
        f"Введите Player ID PUBG Mobile.\n"
        f"Отмена: /cancel"
    )
    if extra_hint:
        footer = f"{extra_hint}\n\n{footer}"

    text = header + subheader + gear_block + body + "\n" + footer

    entities: list[MessageEntity] = []
    bold1 = f"Вы выбрали: {title}"
    entities.append(
        MessageEntity(
            type=MessageEntityType.BOLD,
            offset=0,
            length=utf16_len(bold1),
        ),
    )
    bold2 = f"Сопровождение {title}"
    entities.append(
        MessageEntity(
            type=MessageEntityType.BOLD,
            offset=utf16_len(header),
            length=utf16_len(bold2),
        ),
    )
    gear_offset = utf16_len(header + subheader + GEAR_PREFIX)
    entities.extend(gear_custom_emoji_entities(gear_offset))

    return text, entities
