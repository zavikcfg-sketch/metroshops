"""
PUBG Mobile Metro Shop — Telegram-бот.

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
    from aiogram.types import CallbackQuery, Message
except ImportError:
    logger.exception("Установите зависимости: pip install -r requirements.txt")
    raise

from keyboards import (  # noqa: E402
    inline_categories,
    inline_confirm_order,
    inline_product_list,
    reply_cancel_only,
    reply_main_menu,
)
from shared.catalog import CATEGORIES, get_product  # noqa: E402
from shared.config import get_settings  # noqa: E402
from shared.database import init_db, list_recent_orders, save_order  # noqa: E402


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


async def send_welcome(bot: Bot, chat_id: int, shop_name: str) -> None:
    text = (
        f"🚇 <b>{shop_name}</b>\n"
        f"<i>PUBG Mobile · Metro Royale</i>\n\n"
        f"Покупка Metro Cash, снаряжения и услуг для Metro Royale.\n"
        f"Скупка лута — продайте добычу оператору.\n\n"
        f"Выберите категорию в меню или нажмите «🛒 Каталог»."
    )
    await bot.send_message(
        chat_id,
        text,
        reply_markup=reply_main_menu(),
        parse_mode="HTML",
    )
    await bot.send_message(chat_id, "Категории:", reply_markup=inline_categories())


def register_handlers(dp: Dispatcher, settings) -> None:
    shop_name = settings.shop_name.strip() or "Metro Shop"
    admin_ids = settings.admin_id_list()
    support = settings.support_contact.strip() or "@your_support"

    @dp.message(Command("start"))
    async def cmd_start(message: Message) -> None:
        await send_welcome(message.bot, message.chat.id, shop_name)

    @dp.message(Command("help", "menu"))
    async def cmd_help(message: Message) -> None:
        await message.answer(
            "Команды:\n"
            "/start — главное меню\n"
            "/help — справка\n"
            "/cancel — отменить текущий заказ",
            reply_markup=inline_categories(),
        )

    @dp.message(Command("cancel"))
    async def cmd_cancel(message: Message, state: FSMContext) -> None:
        await state.clear()
        await message.answer("Заказ отменён.", reply_markup=reply_main_menu())

    @dp.message(F.text == "🛒 Каталог")
    async def show_catalog(message: Message) -> None:
        await message.answer("Выберите категорию:", reply_markup=inline_categories())

    @dp.message(F.text == "ℹ️ Как купить")
    async def how_to_buy(message: Message) -> None:
        await message.answer(
            f"<b>Как оформить заказ</b>\n\n"
            f"1. Откройте «🛒 Каталог» и выберите товар.\n"
            f"2. Введите <b>Player ID</b> из PUBG Mobile.\n"
            f"3. Добавьте комментарий (ник, сервер, пожелания).\n"
            f"4. Подтвердите заявку — оператор свяжется с вами.\n\n"
            f"⚠️ Не передавайте пароль от аккаунта. Достаточно Player ID.\n"
            f"Цены в каталоге — примерные, замените в <code>shared/catalog.py</code>.",
            parse_mode="HTML",
        )

    @dp.message(F.text == "💬 Поддержка")
    async def support_handler(message: Message) -> None:
        ch = settings.channel_username.strip()
        extra = f"\nКанал: {ch}" if ch else ""
        await message.answer(
            f"Поддержка: {support}{extra}\n\n"
            f"Опишите вопрос одним сообщением — ответим в чате.",
        )

    @dp.message(F.text == "📋 Мои заказы")
    async def my_orders(message: Message) -> None:
        orders = [
            o
            for o in list_recent_orders(50)
            if message.from_user and o.user_id == message.from_user.id
        ]
        if not orders:
            await message.answer("У вас пока нет заявок. Оформите заказ через каталог.")
            return
        lines = []
        for o in orders[:10]:
            price = "по запросу" if o.amount <= 0 else f"{o.amount:g} {o.currency}"
            lines.append(
                f"• <b>{o.id}</b> — {o.product_title} ({price})\n"
                f"  статус: {o.status}",
            )
        await message.answer(
            "<b>Ваши заявки:</b>\n\n" + "\n".join(lines),
            parse_mode="HTML",
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
                f"ID: <code>{o.pubg_id or '—'}</code> | {o.status}\n"
                f"<i>{(o.comment or '')[:80]}</i>",
            )
        await message.answer(
            "<b>Последние заявки:</b>\n\n" + "\n\n".join(lines),
            parse_mode="HTML",
        )

    @dp.callback_query(F.data == "menu_categories")
    async def cb_menu_categories(q: CallbackQuery) -> None:
        await q.message.edit_text("Выберите категорию:", reply_markup=inline_categories())
        await q.answer()

    @dp.callback_query(F.data.startswith("cat_"))
    async def cb_category(q: CallbackQuery) -> None:
        cat_id = q.data.removeprefix("cat_")
        cat = CATEGORIES.get(cat_id)
        if not cat:
            await q.answer("Категория не найдена", show_alert=True)
            return
        title, desc, products = cat
        items = [_format_product_line(p) for p in products]
        await q.message.edit_text(
            f"<b>{title}</b>\n{desc}\n\nВыберите товар:",
            reply_markup=inline_product_list(items),
            parse_mode="HTML",
        )
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

        price_line = (
            "Цена: <b>по согласованию</b>"
            if product.amount <= 0
            else f"Цена: <b>{product.amount:g} {product.currency}</b>"
        )
        hint = (
            f"\n\n{product.extra_hint}"
            if product.extra_hint
            else ""
        )
        await q.message.answer(
            f"Вы выбрали: <b>{product.title}</b>\n"
            f"{product.description}\n"
            f"{price_line}{hint}\n\n"
            f"Введите <b>Player ID</b> PUBG Mobile (цифры из профиля).\n"
            f"Отмена: /cancel или «❌ Отменить заказ».",
            parse_mode="HTML",
            reply_markup=reply_cancel_only(),
        )

    @dp.message(OrderFlow.waiting_pubg_id, F.text.in_({"❌ Отменить заказ"}))
    @dp.message(OrderFlow.waiting_comment, F.text.in_({"❌ Отменить заказ"}))
    async def cancel_during_flow(message: Message, state: FSMContext) -> None:
        await state.clear()
        await message.answer("Заказ отменён.", reply_markup=reply_main_menu())

    @dp.message(OrderFlow.waiting_pubg_id, F.text)
    async def process_pubg_id(message: Message, state: FSMContext) -> None:
        pubg_id = (message.text or "").strip()
        if not pubg_id.isdigit() or len(pubg_id) < 5:
            await message.answer(
                "Player ID обычно состоит только из цифр (минимум 5). Введите ещё раз.",
            )
            return
        await state.update_data(pubg_id=pubg_id)
        await state.set_state(OrderFlow.waiting_comment)
        await message.answer(
            "Добавьте комментарий: ник в игре, сервер, пожелания.\n"
            "Если нечего добавить — отправьте «-».",
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
        await q.message.answer("Главное меню:", reply_markup=reply_main_menu())
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
        )
        await state.clear()

        price = (
            "по согласованию"
            if product.amount <= 0
            else f"{product.amount:g} {product.currency}"
        )
        user_text = (
            f"✅ Заявка <b>{order_id}</b> принята!\n\n"
            f"<b>Товар:</b> {product.title}\n"
            f"<b>Сумма:</b> {price}\n"
            f"<b>Player ID:</b> <code>{pubg_id}</code>\n"
            f"<b>Комментарий:</b> {comment or '—'}\n\n"
            f"Оператор свяжется с вами для оплаты и выдачи.\n"
            f"Поддержка: {support}"
        )
        await q.message.edit_text(user_text, parse_mode="HTML")
        await q.message.answer("Меню:", reply_markup=reply_main_menu())
        await q.answer("Заявка создана")

        admin_text = (
            f"🆕 <b>Новая заявка {order_id}</b>\n\n"
            f"От: {q.from_user.full_name}"
            f"{f' (@{username})' if username else ''}\n"
            f"TG ID: <code>{q.from_user.id}</code>\n\n"
            f"<b>Товар:</b> {product.title}\n"
            f"<b>Сумма:</b> {price}\n"
            f"<b>Player ID:</b> <code>{pubg_id}</code>\n"
            f"<b>Комментарий:</b> {comment or '—'}"
        )
        for admin_id in admin_ids:
            try:
                await q.bot.send_message(admin_id, admin_text, parse_mode="HTML")
            except Exception:
                logger.warning("Не удалось уведомить админа %s", admin_id)


async def run_bot() -> None:
    init_db()
    settings = get_settings()
    token = settings.resolve_token()
    if not token:
        logger.error("Задайте TELEGRAM_BOT_TOKEN в .env")
        raise SystemExit(1)

    bot = Bot(token=token, default=DefaultBotProperties(parse_mode="HTML"))
    dp = Dispatcher(storage=MemoryStorage())
    register_handlers(dp, settings)

    try:
        me = await bot.get_me()
        logger.info("Бот запущен: @%s", me.username)
        wh = await bot.get_webhook_info()
        if wh.url:
            logger.warning("Сбрасываю webhook: %s", wh.url)
            await bot.delete_webhook(drop_pending_updates=False)
        await dp.start_polling(bot)
    except TelegramNetworkError:
        logger.exception("Нет сети до api.telegram.org")
        raise SystemExit(1) from None
    except TelegramAPIError:
        logger.exception("Ошибка Telegram API (проверьте токен)")
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
