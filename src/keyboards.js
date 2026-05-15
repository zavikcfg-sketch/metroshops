import { REVIEWS_CHANNEL_URL } from "./catalog.js";
import { getProduct, listProducts } from "./repository.js";

function btn(text, { callback_data, url, style } = {}) {
  const row = { text };
  if (callback_data) row.callback_data = callback_data;
  if (url) row.url = url;
  if (style) row.style = style;
  return row;
}

export function inlineRootMenu(settings) {
  const reviews = settings.reviewsUrl || REVIEWS_CHANNEL_URL;
  const metro = settings.metroShopUrl || reviews;
  const site = settings.websiteUrl;

  const rows = [
    [
      btn("🛡️ Сопровождение", { callback_data: "cat_escort", style: "primary" }),
      btn("⚡ Буст", { callback_data: "cat_boost", style: "primary" }),
    ],
    [btn("🔫 Снаряжение", { callback_data: "cat_gear", style: "primary" })],
    [btn("Самый качественный MetroShop ↗", { url: metro, style: "danger" })],
  ];

  if (site) {
    rows.push([
      btn("САЙТ (БЕЗ VPN) ↗", { url: site, style: "primary" }),
      btn("🛡️ Заказать сопровождение", { callback_data: "cat_escort", style: "primary" }),
    ]);
  } else {
    rows.push([
      btn("🛡️ Заказать сопровождение", { callback_data: "cat_escort", style: "primary" }),
    ]);
  }

  rows.push(
    [
      btn("🎁 Промокоды", { callback_data: "menu_promo", style: "primary" }),
      btn("🎖 Популярное", { callback_data: "menu_popular", style: "primary" }),
    ],
    [btn("👥 Реферальная система", { callback_data: "menu_referral", style: "success" })],
    [btn("💬 Информация", { callback_data: "menu_info", style: "danger" })],
    [btn("📢 Канал с отзывами ↗", { url: reviews, style: "primary" })],
  );

  return { inline_keyboard: rows };
}

export function inlineEscortMenu() {
  const rows = [];
  for (const product of listProducts({ activeOnly: true, category: "escort" })) {
    const price = product.amount > 0 ? Math.trunc(product.amount) : 0;
    const label = price
      ? `${product.title} — ${price} ₽`
      : `${product.title} — по запросу`;
    const style = ["primary", "success", "danger"].includes(product.button_style)
      ? product.button_style
      : "primary";
    rows.push([btn(label, { callback_data: `pick_${product.id}`, style })]);
  }
  rows.push([
    btn("📖 Подробнее о сопровождении", {
      callback_data: "menu_escort_info",
      style: "primary",
    }),
  ]);
  rows.push([btn("📢 Отзывы ↗", { url: REVIEWS_CHANNEL_URL, style: "primary" })]);
  rows.push([btn("◀️ В главное меню", { callback_data: "menu_root", style: "danger" })]);
  return { inline_keyboard: rows };
}

export function inlineProductList(items, backCallback = "menu_root") {
  const rows = items.map(([productId, label]) => {
    const product = getProduct(productId);
    let style = "primary";
    if (product && ["primary", "success", "danger"].includes(product.button_style)) {
      style = product.button_style;
    }
    return [btn(label, { callback_data: `pick_${productId}`, style })];
  });
  rows.push([btn("◀️ В главное меню", { callback_data: backCallback, style: "danger" })]);
  return { inline_keyboard: rows };
}

export function inlineConfirmOrder() {
  return {
    inline_keyboard: [
      [
        btn("✅ Подтвердить", { callback_data: "order_confirm", style: "success" }),
        btn("❌ Отмена", { callback_data: "order_cancel", style: "danger" }),
      ],
    ],
  };
}

export function inlinePaycore(checkoutUrl) {
  return {
    inline_keyboard: [
      [btn("💳 Оплатить через PayCore", { url: checkoutUrl, style: "primary" })],
      [btn("◀️ В главное меню", { callback_data: "menu_root", style: "danger" })],
    ],
  };
}
