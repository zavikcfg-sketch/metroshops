import { REVIEWS_CHANNEL_URL } from "./catalog.js";
import { listMenuButtons } from "./platform/tenants.js";
import { getProduct, listProducts } from "./repository.js";

function btn(text, { callback_data, url, style } = {}) {
  const row = { text };
  if (callback_data) row.callback_data = callback_data;
  if (url) row.url = url;
  if (style) row.style = style;
  return row;
}

export function inlineRootMenu(settings, botId) {
  const reviews = settings.reviewsUrl || REVIEWS_CHANNEL_URL;
  const items = listMenuButtons(botId).filter((b) => b.enabled);

  const siteBtn = items.find((b) => b.button_key === "website");
  const rowsMap = new Map();

  for (const b of items) {
    if (b.button_key === "website") continue;
    const rowKey = b.row_order ?? 0;
    if (!rowsMap.has(rowKey)) rowsMap.set(rowKey, []);
    const cell = btn(b.label, {
      callback_data: b.action_type === "callback" ? b.action_value : undefined,
      url: b.action_type === "url" ? b.action_value : undefined,
      style: b.style || "primary",
    });
    rowsMap.get(rowKey).push(cell);
  }

  const rows = [...rowsMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, cells]) => cells);

  if (settings.websiteUrl && !siteBtn) {
    const insertAt = Math.min(3, rows.length);
    const siteRow = [
      btn("САЙТ (БЕЗ VPN) ↗", { url: settings.websiteUrl, style: "primary" }),
    ];
    rows.splice(insertAt, 0, siteRow);
  } else if (siteBtn?.action_value) {
    const insertAt = Math.min(3, rows.length);
    rows.splice(insertAt, 0, [
      btn(siteBtn.label, { url: siteBtn.action_value, style: siteBtn.style || "primary" }),
    ]);
  }

  if (!rows.length) {
    rows.push(
      [btn("🛡️ Сопровождение", { callback_data: "cat_escort", style: "primary" })],
      [btn("Наши Отзывы ↗", { url: reviews, style: "danger" })],
    );
  }

  return { inline_keyboard: rows };
}

export function inlineEscortMenu(botId) {
  const rows = [];
  for (const product of listProducts(botId, { activeOnly: true, category: "escort" })) {
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

export function inlineProductList(botId, items, backCallback = "menu_root") {
  const rows = items.map(([productId, label]) => {
    const product = getProduct(botId, productId);
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
