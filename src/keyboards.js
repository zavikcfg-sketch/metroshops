import { REVIEWS_CHANNEL_URL } from "./catalog.js";
import { getTenantById, listMenuButtons, miniAppUrlForTenant } from "./platform/tenants.js";
import { getProduct, listProducts } from "./repository.js";

function btn(text, { callback_data, url, style, icon_custom_emoji_id, web_app } = {}) {
  const row = { text };
  if (callback_data) row.callback_data = callback_data;
  if (url) row.url = url;
  if (web_app) row.web_app = web_app;
  if (style) row.style = style;
  if (icon_custom_emoji_id) row.icon_custom_emoji_id = String(icon_custom_emoji_id);
  return row;
}

function resolveActionValue(b, botId) {
  if (b.action_type === "web_app") {
    const val = (b.action_value || "").trim();
    if (!val || val === "__SHOP_URL__") {
      const tenant = getTenantById(botId);
      if (tenant) {
        const url = miniAppUrlForTenant(tenant);
        if (url) return { web_app: { url } };
      }
    }
    return { web_app: { url: val } };
  }
  if (b.action_type === "url") return { url: b.action_value };
  if (b.action_type === "callback") return { callback_data: b.action_value };
  return {};
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
    const action = resolveActionValue(b, botId);
    if (b.action_type === "web_app" && !action.web_app?.url) continue;

    const cell = btn(b.label, {
      ...action,
      style: b.style || "primary",
      icon_custom_emoji_id: b.icon_emoji_id || undefined,
    });
    rowsMap.get(rowKey).push({ cell, sort: b.sort_order ?? 0 });
  }

  const rows = [...rowsMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, cells]) =>
      cells.sort((a, b) => a.sort - b.sort).map((x) => x.cell),
    );

  if (settings.websiteUrl && !siteBtn) {
    const insertAt = Math.min(3, rows.length);
    const siteRow = [
      btn("САЙТ (БЕЗ VPN) ↗", { url: settings.websiteUrl, style: "primary" }),
    ];
    rows.splice(insertAt, 0, siteRow);
  } else if (siteBtn?.action_value) {
    const insertAt = Math.min(3, rows.length);
    const action = resolveActionValue(siteBtn, botId);
    rows.splice(insertAt, 0, [
      btn(siteBtn.label, {
        ...action,
        style: siteBtn.style || "primary",
        icon_custom_emoji_id: siteBtn.icon_emoji_id || undefined,
      }),
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

export function inlineProductList(botId, category) {
  const rows = [];
  for (const product of listProducts(botId, { activeOnly: true, category })) {
    const price = product.amount > 0 ? Math.trunc(product.amount) : 0;
    const label = price
      ? `${product.title} — ${price} ₽`
      : `${product.title} — по запросу`;
    const style = ["primary", "success", "danger"].includes(product.button_style)
      ? product.button_style
      : "primary";
    rows.push([btn(label, { callback_data: `pick_${product.id}`, style })]);
  }
  rows.push([btn("◀️ В главное меню", { callback_data: "menu_root", style: "danger" })]);
  return { inline_keyboard: rows };
}

export function inlineConfirmOrder(productId, botId) {
  const product = getProduct(botId, productId);
  const price = product?.amount > 0 ? Math.trunc(product.amount) : 0;
  const label = price ? `✅ Подтвердить · ${price} ₽` : "✅ Подтвердить заказ";
  return {
    inline_keyboard: [
      [btn(label, { callback_data: `confirm_${productId}`, style: "success" })],
      [btn("◀️ Назад", { callback_data: "menu_root", style: "danger" })],
    ],
  };
}

export function inlinePaycore(url) {
  return { inline_keyboard: [[btn("💳 Оплатить", { url, style: "primary" })]] };
}

export function shopDeepLink(username, productId) {
  const u = username?.replace(/^@/, "") || "";
  return `https://t.me/${u}?start=buy_${encodeURIComponent(productId)}`;
}
