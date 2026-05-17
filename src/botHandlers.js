import fs from "fs";
import { Bot, InputFile, session } from "grammy";
import { ESCORT_INFO_FULL, reviewsUrl } from "./catalog.js";
import { buildEscortPickMessage } from "./customEmoji.js";
import {
  inlineEscortMenu,
  inlineOrderActions,
  inlinePaycore,
  inlinePopularMenu,
  inlineProductList,
  inlineRootMenu,
} from "./keyboards.js";
import { getTenantById, miniAppUrlForTenant, tenantSettings, updateTenant } from "./platform/tenants.js";
import { createPaymentInvoice } from "./paycore.js";
import {
  getCategoriesForBot,
  getProduct,
  listRecentOrders,
  registerUser,
} from "./repository.js";
import { applyPromoForUser, consumePromo, getUserActivePromo } from "./services/promoService.js";
import { ensureUserForReferral, getReferralStats } from "./services/referralService.js";
import {
  formatOrderLine,
  getOrder,
  listUserOrders,
  saveOrderExtended,
  updateOrderStatus,
} from "./services/orderService.js";
import { notifyAdminsNewOrder, notifyUserOrderStatus, parseNotifyChatIds } from "./services/notify.js";
import {
  findFunpayOrder,
  getFunpayOrder,
  orderWithEscorts,
  setFunpayOrderStatus,
} from "./services/funpay/repository.js";
import {
  joinEscort,
  leaveEscort,
  resetEscorts,
  completeEscortOrder,
  userInEscort,
} from "./services/funpay/escorts.js";
import { applyFunpayCardFromCtx } from "./services/funpay/notify.js";
import { sendFunPayMessageToBuyer } from "./services/funpay/messaging.js";
import { FUNPAY_REVIEW_REQUEST } from "./services/funpay/messages.js";

function formatProductLine(product) {
  if (product.amount <= 0) return [product.id, `${product.title} — по запросу`];
  const price =
    product.amount === Math.trunc(product.amount)
      ? Math.trunc(product.amount)
      : product.amount;
  return [product.id, `${product.title} — ${price} ₽`];
}

function isAdmin(userId, adminIds) {
  return userId != null && adminIds.includes(userId);
}

function newOrderId() {
  const d = new Date();
  const y = String(d.getUTCFullYear()).slice(-2);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hex = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `MS-${y}${m}${day}-${hex}`;
}

function welcomeCaption(shopName) {
  return (
    `👋 <b>Добро пожаловать в ${shopName}!</b>\n\n` +
    `🚇 <b>Самый качественный Metro Shop</b> для PUBG Mobile · Metro Royale\n\n` +
    `🛡️ Сопровождение ПРЕМИУМ / ВИП / БАЗА\n` +
    `⚡ Буст ранга и фарм · 🔫 Снаряжение под ключ\n\n` +
    `✅ Работаем <b>24/7</b>\n` +
    `💳 Оплата через <b>PayCore</b>\n\n` +
    `Выберите раздел в меню ниже 👇`
  );
}

async function editMenuMessage(ctx, text, replyMarkup) {
  const msg = ctx.callbackQuery?.message;
  if (!msg) return;
  if (msg.photo?.length) {
    await ctx.editMessageCaption({
      caption: text,
      reply_markup: replyMarkup,
      parse_mode: "HTML",
    });
  } else {
    await ctx.editMessageText(text, {
      reply_markup: replyMarkup,
      parse_mode: "HTML",
    });
  }
}

async function sendWelcome(bot, chatId, settings, botId) {
  const shopName = settings.shopName.trim() || "Metro Shop";
  const caption = welcomeCaption(shopName);
  const markup = inlineRootMenu(settings, botId);
  const banner = settings.bannerFile();

  if (fs.existsSync(banner)) {
    await bot.api.sendPhoto(chatId, new InputFile(banner), {
      caption,
      reply_markup: markup,
      parse_mode: "HTML",
    });
  } else {
    await bot.api.sendMessage(chatId, caption, {
      reply_markup: markup,
      parse_mode: "HTML",
    });
  }
}

export async function runTenantBot(tenant) {
  const botId = tenant.id;
  const settings = tenantSettings(tenant);
  const shopName = settings.shopName.trim() || tenant.display_name;
  const adminIds = settings.adminIdList();
  const support = settings.supportContact.trim() || "@your_support";

  const bot = new Bot(tenant.telegram_token);

  bot.on("message", async (ctx) => {
    const newChatId = ctx.message?.migrate_to_chat_id;
    if (newChatId == null) return;
    const oldChatId = String(ctx.chat?.id ?? "");
    const escortChat = String(tenant.funpay_escort_chat_id || "").trim();
    if (!escortChat || escortChat !== oldChatId) return;
    const next = String(newChatId);
    updateTenant(tenant.id, { funpay_escort_chat_id: next });
    console.log(`[funpay] @${tenant.slug}: группа сопровождения ${oldChatId} → ${next}`);
    try {
      await ctx.reply(
        "✅ Группа переведена в супергруппу — ID для FunPay-карточек обновлён автоматически.",
      );
    } catch {
      /* optional */
    }
  });

  bot.use(
    session({
      initial: () => ({
        orderStep: null,
        productId: null,
        pubgId: null,
        comment: null,
      }),
    }),
  );

  const clearOrder = (ctx) => {
    ctx.session.orderStep = null;
    ctx.session.productId = null;
    ctx.session.pubgId = null;
    ctx.session.comment = null;
  };

  const rootMenu = () => inlineRootMenu(settings, botId);

  bot.command("start", async (ctx) => {
    const payload = ctx.message?.text?.split(/\s+/)[1] || "";
    if (ctx.from) {
      let referrerId = null;
      if (payload.startsWith("ref_")) {
        referrerId = Number(payload.slice(4));
        if (!Number.isFinite(referrerId)) referrerId = null;
      }
      ensureUserForReferral(
        botId,
        ctx.from.id,
        ctx.from.username,
        ctx.from.first_name,
        referrerId,
      );
    }
    if (payload.startsWith("buy_")) {
      const productId = decodeURIComponent(payload.slice(4));
      const product = getProduct(botId, productId);
      if (product) {
        ctx.session.orderStep = "pubg_id";
        ctx.session.productId = product.id;
        const price = product.amount > 0 ? Math.trunc(product.amount) : null;
        const pricePart = price == null ? "Цена: по согласованию\n\n" : `Цена: ${price} ₽\n\n`;
        const text =
          product.category === "escort"
            ? buildEscortPickMessage({
                title: product.title,
                productId: product.id,
                priceRub: price,
                extraHint: product.extra_hint,
              })
            : `<b>Вы выбрали: ${product.title}</b>\n\n${pricePart}` +
              `Введите <b>Player ID</b> PUBG Mobile.\nОтмена: /cancel`;
        await ctx.reply(text, {
          parse_mode: "HTML",
          reply_markup: inlineOrderActions(product.id),
        });
        ctx.session.orderStep = "waiting_pubg_id";
        ctx.session.productId = product.id;
        return;
      }
    }
    await sendWelcome(bot, ctx.chat.id, settings, botId);
  });

  bot.command(["help", "menu"], async (ctx) => {
    await ctx.reply(
      "Команды:\n/start — главное меню\n/help — справка\n/cancel — отменить заказ",
      { reply_markup: rootMenu() },
    );
  });

  bot.command("cancel", async (ctx) => {
    clearOrder(ctx);
    await ctx.reply("Заказ отменён.", { reply_markup: rootMenu() });
  });

  bot.command("promo", async (ctx) => {
    const parts = ctx.message?.text?.split(/\s+/) ?? [];
    const code = parts[1]?.trim() ?? "";
    if (!code || !ctx.from) {
      await ctx.reply("Укажите код: /promo SUMMER2026");
      return;
    }
    const r = applyPromoForUser(botId, ctx.from.id, code);
    if (!r.ok) {
      await ctx.reply(`❌ ${r.error}`, { reply_markup: rootMenu() });
      return;
    }
    await ctx.reply(
      `✅ Промокод <code>${r.code}</code> активирован!\nСкидка: <b>${r.discount_percent}%</b> на следующий заказ.`,
      { parse_mode: "HTML", reply_markup: rootMenu() },
    );
  });

  bot.command("myorders", async (ctx) => {
    if (!ctx.from) return;
    const orders = listUserOrders(botId, ctx.from.id, 10);
    if (!orders.length) {
      await ctx.reply("У вас пока нет заказов.", { reply_markup: rootMenu() });
      return;
    }
    const lines = orders.map(formatOrderLine);
    const rows = orders.slice(0, 5).map((o) => [
      {
        text: `↻ ${o.id}`,
        callback_data: `repeat:${o.product_id}`,
      },
    ]);
    await ctx.reply(`<b>Ваши заказы:</b>\n\n${lines.join("\n\n")}`, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [...rows, [{ text: "◀️ Меню", callback_data: "menu_root" }]] },
    });
  });

  bot.command("orders", async (ctx) => {
    if (!isAdmin(ctx.from?.id, adminIds)) return;
    const orders = listRecentOrders(botId, 15);
    if (!orders.length) {
      await ctx.reply("Заявок пока нет.");
      return;
    }
    const lines = orders.map((o) => {
      const uname = o.username ? `@${o.username}` : String(o.user_id);
      const price = o.amount <= 0 ? "по запросу" : `${o.amount} ${o.currency}`;
      return (
        `<b>${o.id}</b> | ${uname}\n` +
        `${o.product_title} — ${price}\n` +
        `ID: <code>${o.pubg_id || "—"}</code> | ${o.status}`
      );
    });
    await ctx.reply(`<b>Последние заявки:</b>\n\n${lines.join("\n\n")}`, {
      parse_mode: "HTML",
    });
  });

  bot.callbackQuery("menu_root", async (ctx) => {
    await editMenuMessage(ctx, welcomeCaption(shopName), rootMenu());
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu_promo", async (ctx) => {
    await editMenuMessage(
      ctx,
      "🎁 <b>Промокоды</b>\n\n<code>/promo ВАШ_КОД</code>",
      rootMenu(),
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu_popular", async (ctx) => {
    const text = "🎖 <b>Популярное</b>\n\nВыберите товар:";
    const markup = inlinePopularMenu(botId);
    const msg = ctx.callbackQuery.message;
    if (msg?.photo?.length) {
      await ctx.editMessageCaption({ caption: text, reply_markup: markup, parse_mode: "HTML" });
    } else {
      await ctx.editMessageText(text, { reply_markup: markup, parse_mode: "HTML" });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu_referral", async (ctx) => {
    const me = await ctx.api.getMe();
    if (!me.username || !ctx.from) {
      await ctx.answerCallbackQuery({ text: "У бота нет @username", show_alert: true });
      return;
    }
    const stats = getReferralStats(botId, ctx.from.id);
    const link = `https://t.me/${me.username}?start=ref_${ctx.from.id}`;
    await editMenuMessage(
      ctx,
      `👥 <b>Реферальная система</b>\n\n` +
        `Ваша ссылка:\n<code>${link}</code>\n\n` +
        `Приглашено: <b>${stats.count}</b>\n` +
        `Бонусный баланс: <b>${stats.balance} ₽</b>\n` +
        `(+${stats.bonusPerReferral} ₽ за друга)`,
      rootMenu(),
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu_info", async (ctx) => {
    const rev = settings.reviewsUrl.trim() || reviewsUrl();
    await editMenuMessage(
      ctx,
      `💬 <b>Информация · ${shopName}</b>\n\n` +
        `📢 <a href="${rev}">Отзывы</a>\nПоддержка: ${support}`,
      rootMenu(),
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu_escort_info", async (ctx) => {
    const markup = inlineEscortMenu(botId);
    const msg = ctx.callbackQuery.message;
    if (msg?.photo?.length) {
      await ctx.editMessageCaption({
        caption: ESCORT_INFO_FULL,
        reply_markup: markup,
        parse_mode: "HTML",
      });
    } else {
      await ctx.editMessageText(ESCORT_INFO_FULL, {
        reply_markup: markup,
        parse_mode: "HTML",
      });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^cat_/, async (ctx) => {
    const catId = ctx.callbackQuery.data.replace(/^cat_/, "");
    const cat = getCategoriesForBot(botId)[catId];
    if (!cat) {
      await ctx.answerCallbackQuery({ text: "Раздел не найден", show_alert: true });
      return;
    }
    const [title, desc, products] = cat;
    let text;
    let markup;
    if (catId === "escort") {
      text = `${title}\n\n${desc}\n\n<b>Выберите тариф:</b>`;
      markup = inlineEscortMenu(botId);
    } else {
      const items = products.map(formatProductLine);
      text = `${title}\n\n${desc}\n\nВыберите товар:`;
      markup = inlineProductList(botId, items);
    }
    const msg = ctx.callbackQuery.message;
    if (msg?.photo?.length) {
      await ctx.editMessageCaption({ caption: text, reply_markup: markup, parse_mode: "HTML" });
    } else {
      await ctx.editMessageText(text, { reply_markup: markup, parse_mode: "HTML" });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^pick_/, async (ctx) => {
    const pid = ctx.callbackQuery.data.replace(/^pick_/, "");
    const product = getProduct(botId, pid);
    await ctx.answerCallbackQuery();
    if (!product) {
      await ctx.reply("Товар не найден. /start");
      return;
    }
    ctx.session.orderStep = "waiting_pubg_id";
    ctx.session.productId = pid;

    if (product.category === "escort") {
      const price = product.amount > 0 ? Math.trunc(product.amount) : null;
      const text = buildEscortPickMessage({
        title: product.title,
        productId: product.id,
        priceRub: price,
        extraHint: product.extra_hint,
      });
      await ctx.reply(text, { parse_mode: "HTML" });
    } else {
      const priceLine =
        product.amount <= 0
          ? "Цена: <b>по согласованию</b>"
          : `Цена: <b>${Math.trunc(product.amount)} ₽</b>`;
      const hint = product.extra_hint ? `\n\n${product.extra_hint}` : "";
      await ctx.reply(
        `Вы выбрали: <b>${product.title}</b>\n\n${product.description}\n\n${priceLine}${hint}\n\n` +
          `Введите <b>Player ID</b>.\nОтмена: /cancel`,
        { parse_mode: "HTML" },
      );
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.orderStep === "waiting_pubg_id") {
      const pubgId = ctx.message.text.trim();
      if (!/^\d{5,}$/.test(pubgId)) {
        await ctx.reply("Player ID — только цифры (минимум 5).");
        return;
      }
      ctx.session.pubgId = pubgId;
      ctx.session.orderStep = "waiting_comment";
      await ctx.reply("Комментарий или «-» если пусто:");
      return;
    }
    if (ctx.session.orderStep === "waiting_comment") {
      let comment = ctx.message.text.trim();
      if (comment === "-") comment = "";
      const product = getProduct(botId, ctx.session.productId);
      if (!product) {
        clearOrder(ctx);
        await ctx.reply("Сессия сброшена. /start");
        return;
      }
      ctx.session.comment = comment;
      ctx.session.orderStep = "waiting_confirm";
      const price =
        product.amount <= 0 ? "по согласованию" : `${product.amount} ${product.currency}`;
      await ctx.reply(
        `<b>Проверьте заявку</b>\n\nТовар: ${product.title}\nСумма: ${price}\n` +
          `Player ID: <code>${ctx.session.pubgId}</code>\nКомментарий: ${comment || "—"}`,
        { parse_mode: "HTML", reply_markup: inlineOrderActions() },
      );
      return;
    }
    return next();
  });

  bot.callbackQuery("order_cancel", async (ctx) => {
    clearOrder(ctx);
    await ctx.editMessageText("Заказ отменён.");
    await sendWelcome(bot, ctx.chat.id, settings, botId);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("order_confirm", async (ctx) => {
    const product = getProduct(botId, ctx.session.productId);
    if (!product || !ctx.from) {
      clearOrder(ctx);
      await ctx.answerCallbackQuery({ text: "Сессия сброшена", show_alert: true });
      return;
    }
    const orderId = newOrderId();
    const pubgId = ctx.session.pubgId || "";
    const comment = ctx.session.comment || "";
    const username = ctx.from.username;

    let discountPercent = 0;
    let promoCode = getUserActivePromo(botId, ctx.from.id);
    if (promoCode) {
      const applied = applyPromoForUser(botId, ctx.from.id, promoCode);
      if (applied.ok) {
        discountPercent = applied.discount_percent;
        promoCode = applied.code;
      } else promoCode = null;
    }

    const baseAmount = product.amount > 0 ? product.amount : 0;
    const finalAmount =
      discountPercent > 0
        ? Math.max(0, Math.round(baseAmount * (1 - discountPercent / 100) * 100) / 100)
        : baseAmount;

    let paycoreUrl = null;
    let status = "new";
    if (finalAmount > 0 && settings.paycoreEnabled()) {
      try {
        const invoice = await createPaymentInvoice(settings, {
          amount: finalAmount,
          currency: product.currency || settings.paycoreCurrency,
          description: `${shopName}: ${product.title}`,
          referenceId: orderId,
        });
        paycoreUrl =
          invoice.hpp_url || invoice.payment_url || invoice.checkout_url || null;
        if (paycoreUrl) status = "awaiting_payment";
      } catch (e) {
        console.warn(`[metro-shop] PayCore @${tenant.slug}:`, e.message);
      }
    } else if (finalAmount <= 0) {
      status = "processing";
    }

    saveOrderExtended(botId, {
      orderId,
      userId: ctx.from.id,
      username,
      productId: product.id,
      productTitle: product.title,
      amount: baseAmount,
      finalAmount,
      currency: product.currency || "RUB",
      pubgId,
      comment: comment || null,
      paycoreUrl,
      status,
      promoCode,
      discountPercent,
      source: "bot",
    });
    if (promoCode) consumePromo(botId, ctx.from.id, promoCode);
    clearOrder(ctx);

    const price = finalAmount <= 0 ? "по согласованию" : `${finalAmount} ${product.currency}`;
    let userText =
      `✅ Заявка <b>${orderId}</b> создана!\n\n<b>Товар:</b> ${product.title}\n` +
      `<b>Сумма:</b> ${price}\n<b>Player ID:</b> <code>${pubgId}</code>\n\n`;

    if (paycoreUrl) {
      userText += "Оплатите кнопкой ниже.";
      await ctx.editMessageText(userText, { parse_mode: "HTML" });
      await ctx.reply("💳 Оплата", { reply_markup: inlinePaycore(paycoreUrl) });
    } else {
      userText += `Оператор свяжется с вами. ${support}`;
      await ctx.editMessageText(userText, { parse_mode: "HTML" });
      await sendWelcome(bot, ctx.chat.id, settings, botId);
    }
    await ctx.answerCallbackQuery({ text: "Заявка создана" });

    const order = getOrder(botId, orderId);
    const notifyIds = [
      ...adminIds,
      ...parseNotifyChatIds(tenant.notify_chat_ids),
    ];
    await notifyAdminsNewOrder(bot, tenant, order, product.title, price, notifyIds);
  });

  bot.callbackQuery(/^fp\|/, async (ctx) => {
    const parts = ctx.callbackQuery.data.split("|");
    const action = parts[1];
    const fpOrderId = parts[2];
    if (!fpOrderId || !action) {
      await ctx.answerCallbackQuery();
      return;
    }

    const order = findFunpayOrder(fpOrderId) || getFunpayOrder(botId, fpOrderId);
    if (!order) {
      await ctx.answerCallbackQuery({ text: "Заказ не найден", show_alert: true });
      return;
    }

    const orderBotId = order.bot_id;
    const liveTenant = getTenantById(orderBotId) || tenant;
    const escortChat = String(liveTenant.funpay_escort_chat_id || "").trim();
    const chatIdStr = String(ctx.chat?.id ?? "");
    const inEscortGroup =
      (escortChat && chatIdStr === escortChat) ||
      (order.group_chat_id && chatIdStr === String(order.group_chat_id));
    const userId = ctx.from?.id;
    const isStaff = isAdmin(userId, adminIds) || inEscortGroup;

    if (!isStaff) {
      await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
      return;
    }

    const userName = ctx.from?.username
      ? `@${ctx.from.username}`
      : [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || String(userId);

    let updated = order;

    const syncCard = async (o) => {
      const fresh = getFunpayOrder(orderBotId, fpOrderId) || o;
      await applyFunpayCardFromCtx(ctx, fresh);
    };

    if (action === "join" || action === "claim") {
      const r = joinEscort(orderBotId, fpOrderId, userId, userName);
      if (!r.ok) {
        await ctx.answerCallbackQuery({ text: r.error, show_alert: true });
        return;
      }
      updated = orderWithEscorts(getFunpayOrder(orderBotId, fpOrderId) || order, r.escorts);
      await syncCard(updated);
      await ctx.answerCallbackQuery({
        text: `Вы в составе (${r.escorts.length}/3)`,
      });
      return;
    }

    if (action === "leave" || action === "release") {
      const r = leaveEscort(orderBotId, fpOrderId, userId);
      if (!r.ok) {
        await ctx.answerCallbackQuery({ text: r.error, show_alert: true });
        return;
      }
      updated = orderWithEscorts(getFunpayOrder(orderBotId, fpOrderId) || order, r.escorts);
      await syncCard(updated);
      await ctx.answerCallbackQuery({ text: "Вы вышли из состава" });
      return;
    }

    if (action === "reset" || action === "replace") {
      if (!isAdmin(userId, adminIds)) {
        await ctx.answerCallbackQuery({ text: "Только для админов", show_alert: true });
        return;
      }
      resetEscorts(orderBotId, fpOrderId);
      updated = getFunpayOrder(orderBotId, fpOrderId);
      await syncCard(updated);
      await ctx.answerCallbackQuery({ text: "Состав сброшен — можно набрать заново" });
      return;
    }

    if (action === "done") {
      if (!userInEscort(order, userId) && !isAdmin(userId, adminIds)) {
        await ctx.answerCallbackQuery({
          text: "Нажимает участник состава или админ",
          show_alert: true,
        });
        return;
      }
      const r = completeEscortOrder(orderBotId, fpOrderId);
      if (!r.ok) {
        await ctx.answerCallbackQuery({ text: r.error, show_alert: true });
        return;
      }
      updated = r.order;
      if (updated.buyer_funpay_id) {
        try {
          await sendFunPayMessageToBuyer(
            liveTenant,
            updated.buyer_funpay_id,
            FUNPAY_REVIEW_REQUEST,
          );
        } catch (e) {
          console.warn(`[funpay] review msg #${fpOrderId}:`, e.message);
        }
      }
      await syncCard(updated);
      await ctx.answerCallbackQuery({
        text: "Готово! Покупателю отправлен запрос подтвердить заказ и отзыв",
      });
      return;
    }

    if (action === "cancel") {
      if (!isAdmin(userId, adminIds)) {
        await ctx.answerCallbackQuery({ text: "Только админ", show_alert: true });
        return;
      }
      setFunpayOrderStatus(orderBotId, fpOrderId, "cancelled");
      updated = getFunpayOrder(orderBotId, fpOrderId);
      await syncCard(updated);
      await ctx.answerCallbackQuery({ text: "Заказ отменён" });
      return;
    }

    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^adm\|/, async (ctx) => {
    if (!isAdmin(ctx.from?.id, adminIds)) {
      await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
      return;
    }
    const parts = ctx.callbackQuery.data.split("|");
    const fullId = parts[1];
    const st = parts[2];
    if (!fullId || !st) {
      await ctx.answerCallbackQuery();
      return;
    }
    updateOrderStatus(botId, fullId, st);
    const order = getOrder(botId, fullId);
    if (order) await notifyUserOrderStatus(bot, order.user_id, order);
    await ctx.answerCallbackQuery({ text: "Статус обновлён" });
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    } catch {
      /* ignore */
    }
  });

  bot.callbackQuery(/^repeat:/, async (ctx) => {
    const pid = ctx.callbackQuery.data.replace(/^repeat:/, "");
    const product = getProduct(botId, pid);
    await ctx.answerCallbackQuery();
    if (!product) {
      await ctx.reply("Товар недоступен.");
      return;
    }
    ctx.session.orderStep = "waiting_pubg_id";
    ctx.session.productId = pid;
    await ctx.reply(
      `↻ Повтор заказа: <b>${product.title}</b>\n\nВведите <b>Player ID</b>:`,
      { parse_mode: "HTML" },
    );
  });

  bot.catch((err) => {
    console.error(`[metro-shop] @${tenant.slug}:`, err.error?.message ?? err);
  });

  const me = await bot.api.getMe();
  console.log(`[metro-shop] Бот @${me.username} (${tenant.display_name})`);

  const shopUrl = miniAppUrlForTenant(tenant);
  if (shopUrl) {
    try {
      await bot.api.setChatMenuButton({
        menu_button: {
          type: "web_app",
          text: "🛒 Магазин",
          web_app: { url: shopUrl },
        },
      });
    } catch (e) {
      console.warn(`[metro-shop] Menu button @${tenant.slug}:`, e.message);
    }
  }

  const wh = await bot.api.getWebhookInfo();
  if (wh.url) await bot.api.deleteWebhook({ drop_pending_updates: false });

  const startPromise = bot.start({
    onStart: () => console.log(`[metro-shop] Polling @${me.username} (${tenant.slug})`),
  });

  return {
    bot,
    stop: () => bot.stop(),
    username: me.username,
    startPromise,
  };
}
