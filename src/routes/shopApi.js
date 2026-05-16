import { REVIEWS_CHANNEL_URL } from "../catalog.js";
import { getCategoriesForBot, getProduct, listProducts } from "../repository.js";
import { miniAppUrlForTenant, tenantSettings } from "../platform/tenants.js";
import { tenantBranding } from "../services/branding.js";
import { initDataMiddleware } from "../services/telegramAuth.js";
import { getUserActivePromo, applyPromoForUser, consumePromo } from "../services/promoService.js";
import {
  computeCartTotal,
  saveOrderExtended,
} from "../services/orderService.js";
import { createPaymentInvoice } from "../paycore.js";
import { listUserOrders } from "../services/orderService.js";
import { notifyAdminsNewOrder } from "../services/notify.js";
import { getBotRunner } from "../botManager.js";

const CAT_META = {
  escort: { title: "Сопровождение", emoji: "🛡️", tagline: "ПРЕМИУМ · ВИП · БАЗА" },
  boost: { title: "Буст", emoji: "⚡", tagline: "Ранг и фарм" },
  gear: { title: "Снаряжение", emoji: "🔫", tagline: "Под ключ" },
};

function newOrderId() {
  const d = new Date();
  const y = String(d.getUTCFullYear()).slice(-2);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hex = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `MS-${y}${m}${day}-${hex}`;
}

export function mountShopApi(router) {
  router.get("/bootstrap", async (req, res) => {
    const tenant = req.tenant;
    const settings = tenantSettings(tenant);
    const botId = tenant.id;
    const categories = getCategoriesForBot(botId);
    const products = listProducts(botId, { activeOnly: true }).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      amount: p.amount,
      currency: p.currency,
      category: p.category,
      popular: p.popular,
    }));

    let botUsername = null;
    try {
      const { Bot } = await import("grammy");
      const me = await new Bot(tenant.telegram_token).api.getMe();
      botUsername = me.username;
    } catch {
      /* ignore */
    }

    const promoActive =
      tenant.promo_ends_at && new Date(tenant.promo_ends_at) > new Date();

    res.json({
      ...tenantBranding(tenant),
      shop_name: settings.shopName,
      reviews_url: settings.reviewsUrl || REVIEWS_CHANNEL_URL,
      metro_shop_url: settings.metroShopUrl,
      support_contact: settings.supportContact,
      mini_app_url: miniAppUrlForTenant(tenant),
      bot_username: botUsername,
      promo: promoActive
        ? { title: tenant.promo_title, ends_at: tenant.promo_ends_at }
        : null,
      categories: Object.entries(categories).map(([id, [title, desc]]) => ({
        id,
        title,
        description: desc,
        ...(CAT_META[id] || { emoji: "📦", tagline: "" }),
      })),
      products,
    });
  });

  const auth = initDataMiddleware((req) => req.tenant.telegram_token);

  router.post("/cart/checkout", auth, async (req, res) => {
    const tenant = req.tenant;
    const botId = tenant.id;
    const user = req.telegramUser;
    if (!user?.id) return res.status(400).json({ detail: "Нет user в initData" });

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ detail: "Корзина пуста" });

    const pubgId = String(req.body?.pubg_id ?? "").trim();
    if (!/^\d{5,}$/.test(pubgId)) {
      return res.status(400).json({ detail: "Укажите корректный Player ID" });
    }

    let discountPercent = 0;
    let promoCode = req.body?.promo_code || getUserActivePromo(botId, user.id);
    if (promoCode) {
      const applied = applyPromoForUser(botId, user.id, promoCode);
      if (applied.ok) {
        discountPercent = applied.discount_percent;
        promoCode = applied.code;
      } else {
        promoCode = null;
      }
    }

    const { lines, total, finalAmount } = computeCartTotal(botId, items, discountPercent);
    if (!lines.length) return res.status(400).json({ detail: "Товары не найдены" });

    const orderId = newOrderId();
    const title =
      lines.length === 1
        ? lines[0].title
        : `${lines[0].title} +${lines.length - 1}`;
    const settings = tenantSettings(tenant);
    const currency = lines[0].currency || settings.paycoreCurrency || "RUB";

    let paycoreUrl = null;
    let status = "new";
    if (finalAmount > 0 && settings.paycoreEnabled()) {
      try {
        const invoice = await createPaymentInvoice(settings, {
          amount: finalAmount,
          currency,
          description: `${settings.shopName}: ${title}`,
          referenceId: orderId,
        });
        paycoreUrl =
          invoice.hpp_url || invoice.payment_url || invoice.checkout_url || null;
        if (paycoreUrl) status = "awaiting_payment";
      } catch (e) {
        console.warn(`[shop] PayCore:`, e.message);
      }
    }

    saveOrderExtended(botId, {
      orderId,
      userId: user.id,
      username: user.username,
      productId: lines[0].product_id,
      productTitle: title,
      amount: total,
      finalAmount,
      currency,
      pubgId,
      comment: String(req.body?.comment ?? "").trim() || null,
      paycoreUrl,
      status,
      promoCode,
      discountPercent,
      source: "miniapp",
      itemsJson: JSON.stringify(lines),
    });

    if (promoCode) consumePromo(botId, user.id, promoCode);

    const order = { id: orderId, pubg_id: pubgId, source: "miniapp", username: user.username, user_id: user.id };
    const runner = getBotRunner(tenant.id);
    if (runner?.bot) {
      const priceText = finalAmount <= 0 ? "по запросу" : `${finalAmount} ${currency}`;
      await notifyAdminsNewOrder(runner.bot, tenant, order, title, priceText);
    }

    res.json({
      ok: true,
      order_id: orderId,
      final_amount: finalAmount,
      paycore_url: paycoreUrl,
      status,
    });
  });

  router.get("/orders/my", auth, (req, res) => {
    const orders = listUserOrders(req.tenant.id, req.telegramUser.id, 20);
    res.json({
      items: orders.map((o) => ({
        id: o.id,
        product_title: o.product_title,
        status: o.status,
        amount: o.final_amount ?? o.amount,
        currency: o.currency,
        created_at: o.created_at,
      })),
    });
  });
}
