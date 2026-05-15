"""
PUBG Mobile Metro Shop — Telegram-бот в стиле WIXYEZ / PayCore.

Запуск: python main.py
"""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
import os
import secrets
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _stderr(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _configure_logging() -> None:
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ),
    )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)


_configure_logging()
logger = logging.getLogger(__name__)

try:
    from aiogram import Bot, Dispatcher, F
    from aiogram.client.default import DefaultBotProperties
    from aiogram.exceptions import TelegramAPIError, TelegramNetworkError
    from aiogram.filters import Command
    from aiogram.fsm.context import FSMContext
    from aiogram.fsm.state import State, StatesGroup
    from aiogram.fsm.storage.memory import MemoryStorage
    from aiogram.types import CallbackQuery, FSInputFile, Message
except ImportError:
    logger.exception("Установите зависимости: pip install -r requirements.txt")
    raise

from keyboards import (  # noqa: E402
    inline_confirm_order,
    inline_escort_menu,
    inline_paycore,
    inline_product_list,
    inline_root_menu,
)
from shared.catalog import (  # noqa: E402
    CATEGORIES,
    ESCORT_INFO_FULL,
    ESCORT_INFO_SHORT,
    POPULAR_PRODUCTS,
    get_product,
    reviews_url,
)
from shared.config import Settings, get_settings  # noqa: E402
from shared.database import init_db, list_recent_orders, save_order  # noqa: E402
from shared.banner import ensure_banner  # noqa: E402
from shared.custom_emoji import build_escort_pick_message  # noqa: E402
from shared.paycore import (  # noqa: E402
    PayCoreNotConfiguredError,
    PayCoreRequestError,
    create_payment_invoice,
)


class OrderFlow(StatesGroup):
    waiting_pubg_id = State()
    waiting_comment = State()
    waiting_confirm = State()


def _format_product_line(product) -> tuple[str, str]:
    if product.amount <= 0:
        return product.id, f"{product.title} — по запросу"
    price = int(product.amount) if product.amount == int(product.amount) else product.amount
    return product.id, f"{product.title} — {price} ₽"


def _is_admin(user_id: int | None, admin_ids: list[int]) -> bool:
    return user_id is not None and user_id in admin_ids


def _new_order_id() -> str:
    return f"MS-{dt.datetime.now(dt.timezone.utc):%y%m%d}-{secrets.token_hex(3).upper()}"


def _welcome_caption(shop_name: str) -> str:
    return (
        f"👋 <b>Добро пожаловать в {shop_name}!</b>\n\n"
        f"🚇 <b>Самый качественный Metro Shop</b> для PUBG Mobile · Metro Royale\n\n"
        f"🛡️ Сопровождение ПРЕМИУМ / ВИП / БАЗА\n"
        f"⚡ Буст ранга и фарм · 🔫 Снаряжение под ключ\n\n"
        f"✅ Работаем <b>24/7</b> — без выходных и задержек\n"
        f"💳 Оплата и выдача через <b>PayCore</b>\n"
        f"🏆 Профи-команда · гарантированный вынос · честные цены\n\n"
        f"Выберите раздел в меню ниже 👇"
    )


async def _edit_menu_message(
    message: Message,
    text: str,
    reply_markup,
) -> None:
    if message.photo:
        await message.edit_caption(
            caption=text,
            reply_markup=reply_markup,
            parse_mode="HTML",
        )
    else:
        await message.edit_text(text, reply_markup=reply_markup, parse_mode="HTML")


async def send_welcome(bot: Bot, chat_id: int, settings: Settings) -> None:
    shop_name = settings.shop_name.strip() or "WIXYEZ Metro Shop"
    caption = _welcome_caption(shop_name)
    markup = inline_root_menu(settings)
    banner = ensure_banner(settings.banner_file())

    if banner.is_file():
        await bot.send_photo(
            chat_id,
            FSInputFile(banner),
            caption=caption,
            reply_markup=markup,
            parse_mode="HTML",
        )
    else:
        await bot.send_message(
            chat_id,
            caption,
            reply_markup=markup,
            parse_mode="HTML",
        )


def register_handlers(dp: Dispatcher, settings: Settings) -> None:
    shop_name = settings.shop_name.strip() or "Metro Shop"
    admin_ids = settings.admin_id_list()
    support = settings.support_contact.strip() or "@your_support"

    @dp.message(Command("start"))
    async def cmd_start(message: Message) -> None:
        await send_welcome(message.bot, message.chat.id, settings)

    @dp.message(Command("help", "menu"))
    async def cmd_help(message: Message) -> None:
        await message.answer(
            "Команды:\n/start — главное меню\n/help — справка\n/cancel — отменить заказ",
            reply_markup=inline_root_menu(settings),
        )

    @dp.message(Command("cancel"))
    async def cmd_cancel(message: Message, state: FSMContext) -> None:
        await state.clear()
        await message.answer("Заказ отменён.", reply_markup=inline_root_menu(settings))

    @dp.message(Command("promo"))
    async def cmd_promo(message: Message) -> None:
        parts = (message.text or "").split(maxsplit=1)
        code = parts[1].strip() if len(parts) > 1 else ""
        if not code:
            await message.answer("Укажите код: /promo SUMMER2026")
            return
        await message.answer(
            f"Промокод <code>{code}</code> принят.\n"
            f"Подключите проверку промокодов в коде или у оператора.",
            parse_mode="HTML",
            reply_markup=inline_root_menu(settings),
        )

    @dp.message(Command("orders"))
    async def admin_orders(message: Message) -> None:
        uid = message.from_user.id if message.from_user else None
        if not _is_admin(uid, admin_ids):
            return
        orders = list_recent_orders(15)
        if not orders:
            await message.answer("Заявок пока нет.")
            return
        lines = []
        for o in orders:
            uname = f"@{o.username}" if o.username else str(o.user_id)
            price = "по запросу" if o.amount <= 0 else f"{o.amount:g} {o.currency}"
            lines.append(
                f"<b>{o.id}</b> | {uname}\n"
                f"{o.product_title} — {price}\n"
                f"ID: <code>{o.pubg_id or '—'}</code> | {o.status}",
            )
        await message.answer(
            "<b>Последние заявки:</b>\n\n" + "\n\n".join(lines),
            parse_mode="HTML",
        )

    @dp.callback_query(F.data == "menu_root")
    async def cb_menu_root(q: CallbackQuery) -> None:
        await _edit_menu_message(
            q.message,
            _welcome_caption(shop_name),
            inline_root_menu(settings),
        )
        await q.answer()

    @dp.callback_query(F.data == "menu_categories")
    async def cb_menu_categories(q: CallbackQuery) -> None:
        await _edit_menu_message(
            q.message,
            f"<b>{shop_name}</b>\n\n"
            f"🛡️ Сопровождение · ⚡ Буст · 🔫 Снаряжение\n\n"
            f"Выберите раздел:",
            inline_root_menu(settings),
        )
        await q.answer()

    @dp.callback_query(F.data == "menu_promo")
    async def cb_menu_promo(q: CallbackQuery) -> None:
        await _edit_menu_message(
            q.message,
            "🎁 <b>Промокоды</b>\n\n"
            "Отправьте промокод командой:\n<code>/promo ВАШ_КОД</code>",
            inline_root_menu(settings),
        )
        await q.answer()

    @dp.callback_query(F.data == "menu_popular")
    async def cb_menu_popular(q: CallbackQuery) -> None:
        items = [_format_product_line(p) for p in POPULAR_PRODUCTS]
        text = "🎖 <b>Популярное</b>\n\nХиты Metro Royale — выберите товар:"
        if q.message.photo:
            await q.message.edit_caption(
                caption=text,
                reply_markup=inline_product_list(items),
                parse_mode="HTML",
            )
        else:
            await q.message.edit_text(
                text,
                reply_markup=inline_product_list(items),
                parse_mode="HTML",
            )
        await q.answer()

    @dp.callback_query(F.data == "menu_referral")
    async def cb_menu_referral(q: CallbackQuery) -> None:
        me = await q.bot.get_me()
        if not me or not me.username or not q.from_user:
            await q.answer("У бота нет @username", show_alert=True)
            return
        link = f"https://t.me/{me.username}?start=ref_{q.from_user.id}"
        await _edit_menu_message(
            q.message,
            "👥 <b>Реферальная система</b>\n\n"
            f"Ваша ссылка:\n<code>{link}</code>\n\n"
            "Приглашённые открывают бота по ней — бонус настраивается у оператора.",
            inline_root_menu(settings),
        )
        await q.answer()

    @dp.callback_query(F.data == "menu_info")
    async def cb_menu_info(q: CallbackQuery) -> None:
        ch = settings.channel_username.strip()
        site = settings.website_url.strip()
        rev = settings.reviews_url.strip() or reviews_url()
        extra = [
            f'📢 <a href="{rev}">Отзывы</a>',
            f"Поддержка: {support}",
        ]
        if ch:
            extra.insert(0, f"Канал: {ch}")
        if site:
            extra.insert(0, f"Сайт: {site}")
        await _edit_menu_message(
            q.message,
            f"💬 <b>Информация · {shop_name}</b>\n\n"
            f"· Сопровождение ПРЕМИУМ / ВИП / БАЗА\n"
            f"· Буст и снаряжение Metro Royale\n"
            f"· Оплата PayCore · 24/7\n\n"
            + "\n".join(extra),
            inline_root_menu(settings),
        )
        await q.answer()

    @dp.callback_query(F.data == "menu_escort_info")
    async def cb_menu_escort_info(q: CallbackQuery) -> None:
        text = ESCORT_INFO_FULL
        markup = inline_escort_menu()
        if q.message.photo:
            await q.message.edit_caption(
                caption=text,
                reply_markup=markup,
                parse_mode="HTML",
            )
        else:
            await q.message.edit_text(text, reply_markup=markup, parse_mode="HTML")
        await q.answer()

    @dp.callback_query(F.data.startswith("cat_"))
    async def cb_category(q: CallbackQuery) -> None:
        cat_id = q.data.removeprefix("cat_")
        cat = CATEGORIES.get(cat_id)
        if not cat:
            await q.answer("Раздел не найден", show_alert=True)
            return
        title, desc, products = cat

        if cat_id == "escort":
            text = f"{title}\n\n{desc}\n\n<b>Выберите тариф:</b>"
            markup = inline_escort_menu()
        else:
            items = [_format_product_line(p) for p in products]
            text = f"{title}\n\n{desc}\n\nВыберите товар:"
            markup = inline_product_list(items)

        if q.message.photo:
            await q.message.edit_caption(caption=text, reply_markup=markup, parse_mode="HTML")
        else:
            await q.message.edit_text(text, reply_markup=markup, parse_mode="HTML")
        await q.answer()

    @dp.callback_query(F.data.startswith("pick_"))
    async def cb_pick(q: CallbackQuery, state: FSMContext) -> None:
        pid = q.data.removeprefix("pick_")
        product = get_product(pid)
        await q.answer()
        if not product:
            await q.message.answer("Товар не найден. /start")
            return

        await state.set_state(OrderFlow.waiting_pubg_id)
        await state.update_data(product_id=pid)

        if product.category == "escort":
            price = None if product.amount <= 0 else int(product.amount)
            text, entities = build_escort_pick_message(
                title=product.title,
                product_id=product.id,
                price_rub=price,
                extra_hint=product.extra_hint,
            )
            await q.message.answer(text, entities=entities, parse_mode=None)
        else:
            price_line = (
                "Цена: <b>по согласованию</b>"
                if product.amount <= 0
                else f"Цена: <b>{int(product.amount)} ₽</b>"
            )
            hint = f"\n\n{product.extra_hint}" if product.extra_hint else ""
            await q.message.answer(
                f"Вы выбрали: <b>{product.title}</b>\n\n"
                f"{product.description}\n\n"
                f"{price_line}{hint}\n\n"
                f"Введите <b>Player ID</b> PUBG Mobile.\n"
                f"Отмена: /cancel",
                parse_mode="HTML",
            )

    @dp.message(OrderFlow.waiting_pubg_id, F.text)
    async def process_pubg_id(message: Message, state: FSMContext) -> None:
        pubg_id = (message.text or "").strip()
        if not pubg_id.isdigit() or len(pubg_id) < 5:
            await message.answer("Player ID — только цифры (минимум 5). Введите ещё раз.")
            return
        await state.update_data(pubg_id=pubg_id)
        await state.set_state(OrderFlow.waiting_comment)
        await message.answer(
            "Комментарий: ник, сервер, пожелания.\nЕсли нечего — отправьте «-».",
        )

    @dp.message(OrderFlow.waiting_comment, F.text)
    async def process_comment(message: Message, state: FSMContext) -> None:
        comment = (message.text or "").strip()
        if comment == "-":
            comment = ""
        data = await state.get_data()
        product = get_product(data.get("product_id", ""))
        if not product:
            await state.clear()
            await message.answer("Сессия сброшена. /start")
            return

        await state.update_data(comment=comment)
        await state.set_state(OrderFlow.waiting_confirm)

        price = (
            "по согласованию"
            if product.amount <= 0
            else f"{product.amount:g} {product.currency}"
        )
        await message.answer(
            f"<b>Проверьте заявку</b>\n\n"
            f"Товар: {product.title}\n"
            f"Сумма: {price}\n"
            f"Player ID: <code>{data.get('pubg_id')}</code>\n"
            f"Комментарий: {comment or '—'}",
            parse_mode="HTML",
            reply_markup=inline_confirm_order(),
        )

    @dp.callback_query(F.data == "order_cancel")
    async def cb_order_cancel(q: CallbackQuery, state: FSMContext) -> None:
        await state.clear()
        await q.message.edit_text("Заказ отменён.")
        await send_welcome(q.bot, q.message.chat.id, settings)
        await q.answer()

    @dp.callback_query(F.data == "order_confirm")
    async def cb_order_confirm(q: CallbackQuery, state: FSMContext) -> None:
        data = await state.get_data()
        product = get_product(data.get("product_id", ""))
        if not product or not q.from_user:
            await state.clear()
            await q.answer("Сессия сброшена", show_alert=True)
            return

        order_id = _new_order_id()
        pubg_id = data.get("pubg_id", "")
        comment = data.get("comment", "")
        username = q.from_user.username

        paycore_url: str | None = None
        if product.amount > 0 and settings.paycore_enabled():
            try:
                invoice = await create_payment_invoice(
                    settings,
                    amount=product.amount,
                    currency=product.currency or settings.paycore_currency,
                    description=f"{shop_name}: {product.title}",
                    reference_id=order_id,
                )
                paycore_url = (
                    invoice.get("hpp_url")
                    or invoice.get("payment_url")
                    or invoice.get("checkout_url")
                )
                if isinstance(paycore_url, str) and paycore_url:
                    pass
                else:
                    paycore_url = None
            except (PayCoreNotConfiguredError, PayCoreRequestError) as exc:
                logger.warning("PayCore: %s", exc)

        save_order(
            order_id=order_id,
            user_id=q.from_user.id,
            username=username,
            product_id=product.id,
            product_title=product.title,
            amount=product.amount,
            currency=product.currency,
            pubg_id=pubg_id,
            comment=comment or None,
            paycore_url=paycore_url,
        )
        await state.clear()

        price = (
            "по согласованию"
            if product.amount <= 0
            else f"{product.amount:g} {product.currency}"
        )
        user_text = (
            f"✅ Заявка <b>{order_id}</b> создана!\n\n"
            f"<b>Товар:</b> {product.title}\n"
            f"<b>Сумма:</b> {price}\n"
            f"<b>Player ID:</b> <code>{pubg_id}</code>\n"
            f"<b>Комментарий:</b> {comment or '—'}\n\n"
        )
        if paycore_url:
            user_text += "Оплатите заказ кнопкой ниже — после оплаты оператор выдаст услугу."
            await q.message.edit_text(user_text, parse_mode="HTML")
            await q.message.answer(
                "💳 Оплата PayCore",
                reply_markup=inline_paycore(paycore_url),
            )
        else:
            user_text += (
                f"Оператор свяжется с вами для оплаты.\n"
                f"Поддержка: {support}"
            )
            await q.message.edit_text(user_text, parse_mode="HTML")
            await send_welcome(q.bot, q.message.chat.id, settings)
        await q.answer("Заявка создана")

        admin_text = (
            f"🆕 <b>{order_id}</b>\n"
            f"{q.from_user.full_name}"
            f"{f' (@{username})' if username else ''}\n"
            f"TG: <code>{q.from_user.id}</code>\n\n"
            f"<b>{product.title}</b> — {price}\n"
            f"Player ID: <code>{pubg_id}</code>\n"
            f"{comment or '—'}"
        )
        if paycore_url:
            admin_text += f"\n\nPayCore: {paycore_url}"
        for admin_id in admin_ids:
            try:
                await q.bot.send_message(admin_id, admin_text, parse_mode="HTML")
            except Exception:
                logger.warning("Не удалось уведомить админа %s", admin_id)


async def run_bot() -> None:
    init_db()
    settings = get_settings()
    ensure_banner(settings.banner_file())
    token = settings.resolve_token()
    if not token:
        logger.error("Задайте TELEGRAM_BOT_TOKEN в .env")
        raise SystemExit(1)

    bot = Bot(token=token, default=DefaultBotProperties(parse_mode="HTML"))
    dp = Dispatcher(storage=MemoryStorage())
    register_handlers(dp, settings)

    try:
        me = await bot.get_me()
        logger.info("Бот запущен: @%s — %s", me.username, settings.shop_name)
        logger.info(
            "Premium emoji IDs: helmet=%s armor=%s bag=%s mk=%s",
            "5204201311238629537",
            "5201907777227730330",
            "5201773765658160740",
            "5204105005186952289",
        )
        wh = await bot.get_webhook_info()
        if wh.url:
            await bot.delete_webhook(drop_pending_updates=False)
        await dp.start_polling(bot)
    except TelegramNetworkError:
        logger.exception("Нет сети до api.telegram.org")
        raise SystemExit(1) from None
    except TelegramAPIError:
        logger.exception("Ошибка Telegram API")
        raise SystemExit(1) from None


def main_cli() -> None:
    _stderr(f"[metro-shop] root={ROOT}")
    try:
        asyncio.run(run_bot())
    except KeyboardInterrupt:
        logger.info("Остановка.")
    except BaseException:
        traceback.print_exc(file=sys.stderr)
        raise


if __name__ == "__main__":
    main_cli()
