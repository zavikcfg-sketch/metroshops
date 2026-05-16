import fs from "fs";
import { Bot, InputFile, session } from "grammy";
import { ESCORT_INFO_FULL, reviewsUrl } from "./catalog.js";
import { buildEscortPickMessage } from "./customEmoji.js";
import {
  inlineConfirmOrder,
  inlineEscortMenu,
  inlinePaycore,
  inlineProductList,
  inlineRootMenu,
} from "./keyboards.js";
import { tenantSettings } from "./platform/tenants.js";
import {
  createPaymentInvoice,
  PayCoreNotConfiguredError,
  PayCoreRequestError,
} from "./paycore.js";
import {
  getCategoriesForBot,
  getProduct,
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
    if (ctx.from) registerUser(botId, ctx.from.id, ctx.from.username, ctx.from.first_name);
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
    if (!code) {
      await ctx.reply("Укажите код: /promo SUMMER2026");
      return;
    }
    await ctx.reply(`Промокод <code>${code}</code> принят.`, {
      parse_mode: "HTML",
      reply_markup: rootMenu(),
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
    const items = listPopularProducts(botId).map(formatProductLine);
    const text = "🎖 <b>Популярное</b>\n\nВыберите товар:";
    const markup = inlineProductList(botId, items);
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
    const link = `https://t.me/${me.username}?start=ref_${ctx.from.id}`;
    await editMenuMessage(
      ctx,
      `👥 <b>Реферальная система</b>\n\n<code>${link}</code>`,
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
        { parse_mode: "HTML", reply_markup: inlineConfirmOrder() },
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
        console.warn(`[metro-shop] PayCore @${tenant.slug}:`, e.message);
      }
    }

    saveOrder(botId, {
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

    for (const adminId of adminIds) {
      try {
        await bot.api.sendMessage(
          adminId,
          `🆕 ${orderId} · ${tenant.display_name}\n${product.title} — ${price}`,
          { parse_mode: "HTML" },
        );
      } catch {
        /* ignore */
      }
    }
  });

  bot.catch((err) => {
    console.error(`[metro-shop] @${tenant.slug}:`, err.error?.message ?? err);
  });

  const me = await bot.api.getMe();
  console.log(`[metro-shop] Бот @${me.username} (${tenant.display_name})`);

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
