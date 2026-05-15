import fs from "fs";
import { Bot, InputFile, session } from "grammy";
import { ESCORT_INFO_FULL, reviewsUrl } from "./catalog.js";
import { buildEscortPickMessage } from "./customEmoji.js";
import { getSettings } from "./config.js";
import {
  inlineConfirmOrder,
  inlineEscortMenu,
  inlinePaycore,
  inlineProductList,
  inlineRootMenu,
} from "./keyboards.js";
import {
  createPaymentInvoice,
  PayCoreNotConfiguredError,
  PayCoreRequestError,
} from "./paycore.js";
import {
  getCategoriesForBot,
  getProduct,
  initDb,
  listPopularProducts,
  listRecentOrders,
  registerUser,
  saveOrder,
} from "./repository.js";

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
    `✅ Работаем <b>24/7</b> — без выходных и задержок\n` +
    `💳 Оплата и выдача через <b>PayCore</b>\n` +
    `🏆 Профи-команда · гарантированный вынос · честные цены\n\n` +
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

async function sendWelcome(bot, chatId, settings) {
  const shopName = settings.shopName.trim() || "WIXYEZ Metro Shop";
  const caption = welcomeCaption(shopName);
  const markup = inlineRootMenu(settings);
  const banner = settings.bannerFile();

  if (fs.existsSync(banner)) {
    await bot.sendPhoto(chatId, new InputFile(banner), {
      caption,
      reply_markup: markup,
      parse_mode: "HTML",
    });
  } else {
    await bot.sendMessage(chatId, caption, {
      reply_markup: markup,
      parse_mode: "HTML",
    });
  }
}

export async function startBot() {
  initDb();
  const settings = getSettings();
  const token = settings.resolveToken();
  if (!token) {
    console.error("[metro-shop] Задайте TELEGRAM_BOT_TOKEN или BOT_TOKEN");
    process.exit(1);
  }

  const shopName = settings.shopName.trim() || "Metro Shop";
  const adminIds = settings.adminIdList();
  const support = settings.supportContact.trim() || "@your_support";

  const bot = new Bot(token);

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

  function clearOrder(ctx) {
    ctx.session.orderStep = null;
    ctx.session.productId = null;
    ctx.session.pubgId = null;
    ctx.session.comment = null;
  }

  bot.command("start", async (ctx) => {
    if (ctx.from) {
      registerUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
    }
    await sendWelcome(bot, ctx.chat.id, settings);
  });

  bot.command(["help", "menu"], async (ctx) => {
    await ctx.reply(
      "Команды:\n/start — главное меню\n/help — справка\n/cancel — отменить заказ",
      { reply_markup: inlineRootMenu(settings) },
    );
  });

  bot.command("cancel", async (ctx) => {
    clearOrder(ctx);
    await ctx.reply("Заказ отменён.", { reply_markup: inlineRootMenu(settings) });
  });

  bot.command("promo", async (ctx) => {
    const parts = ctx.message?.text?.split(/\s+/) ?? [];
    const code = parts[1]?.trim() ?? "";
    if (!code) {
      await ctx.reply("Укажите код: /promo SUMMER2026");
      return;
    }
    await ctx.reply(
      `Промокод <code>${code}</code> принят.\nПодключите проверку промокодов в коде или у оператора.`,
      { parse_mode: "HTML", reply_markup: inlineRootMenu(settings) },
    );
  });

  bot.command("orders", async (ctx) => {
    if (!isAdmin(ctx.from?.id, adminIds)) return;
    const orders = listRecentOrders(15);
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
    await editMenuMessage(ctx, welcomeCaption(shopName), inlineRootMenu(settings));
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu_categories", async (ctx) => {
    await editMenuMessage(
      ctx,
      `<b>${shopName}</b>\n\n🛡️ Сопровождение · ⚡ Буст · 🔫 Снаряжение\n\nВыберите раздел:`,
      inlineRootMenu(settings),
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu_promo", async (ctx) => {
    await editMenuMessage(
      ctx,
      "🎁 <b>Промокоды</b>\n\nОтправьте промокод командой:\n<code>/promo ВАШ_КОД</code>",
      inlineRootMenu(settings),
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu_popular", async (ctx) => {
    const items = listPopularProducts().map(formatProductLine);
    const text = "🎖 <b>Популярное</b>\n\nХиты Metro Royale — выберите товар:";
    const markup = inlineProductList(items);
    const msg = ctx.callbackQuery.message;
    if (msg?.photo?.length) {
      await ctx.editMessageCaption({
        caption: text,
        reply_markup: markup,
        parse_mode: "HTML",
      });
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
    const link = `https://t.me/${me.username}?start=ref_${ctx.from.id}`;
    await editMenuMessage(
      ctx,
      "👥 <b>Реферальная система</b>\n\n" +
        `Ваша ссылка:\n<code>${link}</code>\n\n` +
        "Приглашённые открывают бота по ней — бонус настраивается у оператора.",
      inlineRootMenu(settings),
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu_info", async (ctx) => {
    const ch = settings.channelUsername.trim();
    const site = settings.websiteUrl.trim();
    const rev = settings.reviewsUrl.trim() || reviewsUrl();
    const extra = [`📢 <a href="${rev}">Отзывы</a>`, `Поддержка: ${support}`];
    if (ch) extra.unshift(`Канал: ${ch}`);
    if (site) extra.unshift(`Сайт: ${site}`);
    await editMenuMessage(
      ctx,
      `💬 <b>Информация · ${shopName}</b>\n\n` +
        "· Сопровождение ПРЕМИУМ / ВИП / БАЗА\n" +
        "· Буст и снаряжение Metro Royale\n" +
        "· Оплата PayCore · 24/7\n\n" +
        extra.join("\n"),
      inlineRootMenu(settings),
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu_escort_info", async (ctx) => {
    const markup = inlineEscortMenu();
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
    const cat = getCategoriesForBot()[catId];
    if (!cat) {
      await ctx.answerCallbackQuery({ text: "Раздел не найден", show_alert: true });
      return;
    }
    const [title, desc, products] = cat;
    let text;
    let markup;
    if (catId === "escort") {
      text = `${title}\n\n${desc}\n\n<b>Выберите тариф:</b>`;
      markup = inlineEscortMenu();
    } else {
      const items = products.map(formatProductLine);
      text = `${title}\n\n${desc}\n\nВыберите товар:`;
      markup = inlineProductList(items);
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
    const product = getProduct(pid);
    await ctx.answerCallbackQuery();
    if (!product) {
      await ctx.reply("Товар не найден. /start");
      return;
    }

    ctx.session.orderStep = "waiting_pubg_id";
    ctx.session.productId = pid;

    if (product.category === "escort") {
      const price = product.amount > 0 ? Math.trunc(product.amount) : null;
      const { text, entities } = buildEscortPickMessage({
        title: product.title,
        productId: product.id,
        priceRub: price,
        extraHint: product.extra_hint,
      });
      await ctx.reply(text, { entities });
    } else {
      const priceLine =
        product.amount <= 0
          ? "Цена: <b>по согласованию</b>"
          : `Цена: <b>${Math.trunc(product.amount)} ₽</b>`;
      const hint = product.extra_hint ? `\n\n${product.extra_hint}` : "";
      await ctx.reply(
        `Вы выбрали: <b>${product.title}</b>\n\n` +
          `${product.description}\n\n` +
          `${priceLine}${hint}\n\n` +
          `Введите <b>Player ID</b> PUBG Mobile.\n` +
          `Отмена: /cancel`,
        { parse_mode: "HTML" },
      );
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.orderStep === "waiting_pubg_id") {
      const pubgId = ctx.message.text.trim();
      if (!/^\d{5,}$/.test(pubgId)) {
        await ctx.reply("Player ID — только цифры (минимум 5). Введите ещё раз.");
        return;
      }
      ctx.session.pubgId = pubgId;
      ctx.session.orderStep = "waiting_comment";
      await ctx.reply(
        "Комментарий: ник, сервер, пожелания.\nЕсли нечего — отправьте «-».",
      );
      return;
    }

    if (ctx.session.orderStep === "waiting_comment") {
      let comment = ctx.message.text.trim();
      if (comment === "-") comment = "";
      const product = getProduct(ctx.session.productId);
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
        `<b>Проверьте заявку</b>\n\n` +
          `Товар: ${product.title}\n` +
          `Сумма: ${price}\n` +
          `Player ID: <code>${ctx.session.pubgId}</code>\n` +
          `Комментарий: ${comment || "—"}`,
        { parse_mode: "HTML", reply_markup: inlineConfirmOrder() },
      );
      return;
    }

    return next();
  });

  bot.callbackQuery("order_cancel", async (ctx) => {
    clearOrder(ctx);
    await ctx.editMessageText("Заказ отменён.");
    await sendWelcome(bot, ctx.chat.id, settings);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("order_confirm", async (ctx) => {
    const product = getProduct(ctx.session.productId);
    if (!product || !ctx.from) {
      clearOrder(ctx);
      await ctx.answerCallbackQuery({ text: "Сессия сброшена", show_alert: true });
      return;
    }

    const orderId = newOrderId();
    const pubgId = ctx.session.pubgId || "";
    const comment = ctx.session.comment || "";
    const username = ctx.from.username;

    let paycoreUrl = null;
    if (product.amount > 0 && settings.paycoreEnabled()) {
      try {
        const invoice = await createPaymentInvoice(settings, {
          amount: product.amount,
          currency: product.currency || settings.paycoreCurrency,
          description: `${shopName}: ${product.title}`,
          referenceId: orderId,
        });
        paycoreUrl =
          invoice.hpp_url || invoice.payment_url || invoice.checkout_url || null;
      } catch (e) {
        if (e instanceof PayCoreNotConfiguredError || e instanceof PayCoreRequestError) {
          console.warn("[metro-shop] PayCore:", e.message);
        }
      }
    }

    saveOrder({
      orderId,
      userId: ctx.from.id,
      username,
      productId: product.id,
      productTitle: product.title,
      amount: product.amount,
      currency: product.currency,
      pubgId,
      comment: comment || null,
      paycoreUrl,
    });
    clearOrder(ctx);

    const price =
      product.amount <= 0 ? "по согласованию" : `${product.amount} ${product.currency}`;
    let userText =
      `✅ Заявка <b>${orderId}</b> создана!\n\n` +
      `<b>Товар:</b> ${product.title}\n` +
      `<b>Сумма:</b> ${price}\n` +
      `<b>Player ID:</b> <code>${pubgId}</code>\n` +
      `<b>Комментарий:</b> ${comment || "—"}\n\n`;

    if (paycoreUrl) {
      userText += "Оплатите заказ кнопкой ниже — после оплаты оператор выдаст услугу.";
      await ctx.editMessageText(userText, { parse_mode: "HTML" });
      await ctx.reply("💳 Оплата PayCore", {
        reply_markup: inlinePaycore(paycoreUrl),
      });
    } else {
      userText += `Оператор свяжется с вами для оплаты.\nПоддержка: ${support}`;
      await ctx.editMessageText(userText, { parse_mode: "HTML" });
      await sendWelcome(bot, ctx.chat.id, settings);
    }
    await ctx.answerCallbackQuery({ text: "Заявка создана" });

    let adminText =
      `🆕 <b>${orderId}</b>\n` +
      `${ctx.from.first_name}${username ? ` (@${username})` : ""}\n` +
      `TG: <code>${ctx.from.id}</code>\n\n` +
      `<b>${product.title}</b> — ${price}\n` +
      `Player ID: <code>${pubgId}</code>\n` +
      `${comment || "—"}`;
    if (paycoreUrl) adminText += `\n\nPayCore: ${paycoreUrl}`;

    for (const adminId of adminIds) {
      try {
        await bot.api.sendMessage(adminId, adminText, { parse_mode: "HTML" });
      } catch {
        console.warn(`[metro-shop] Не удалось уведомить админа ${adminId}`);
      }
    }
  });

  const me = await bot.api.getMe();
  console.log(`[metro-shop] Бот запущен: @${me.username} — ${settings.shopName}`);

  const wh = await bot.api.getWebhookInfo();
  if (wh.url) {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
  }

  await bot.start({
    onStart: () => console.log("[metro-shop] Long polling активен"),
  });
}
