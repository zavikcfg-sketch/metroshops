import { CATEGORIES, BOOST_PRODUCTS, ESCORT_PRODUCTS, GEAR_PRODUCTS } from "../catalog.js";
import { REVIEWS_CHANNEL_URL, METRO_SHOP_CHANNEL_URL } from "../catalog.js";

export const DEFAULT_MENU_BUTTONS = [
  { button_key: "cat_escort", label: "🛡️ Сопровождение", action_type: "callback", action_value: "cat_escort", style: "primary", row_order: 0, sort_order: 0 },
  { button_key: "cat_boost", label: "⚡ Буст", action_type: "callback", action_value: "cat_boost", style: "primary", row_order: 0, sort_order: 1 },
  { button_key: "cat_gear", label: "🔫 Снаряжение", action_type: "callback", action_value: "cat_gear", style: "primary", row_order: 1, sort_order: 0 },
  { button_key: "reviews_main", label: "Наши Отзывы ↗", action_type: "url", action_value: REVIEWS_CHANNEL_URL, style: "danger", row_order: 2, sort_order: 0 },
  { button_key: "escort_order", label: "🛡️ Заказать сопровождение", action_type: "callback", action_value: "cat_escort", style: "primary", row_order: 4, sort_order: 0 },
  { button_key: "menu_promo", label: "🎁 Промокоды", action_type: "callback", action_value: "menu_promo", style: "primary", row_order: 5, sort_order: 0 },
  { button_key: "menu_popular", label: "🎖 Популярное", action_type: "callback", action_value: "menu_popular", style: "primary", row_order: 5, sort_order: 1 },
  { button_key: "menu_referral", label: "👥 Реферальная система", action_type: "callback", action_value: "menu_referral", style: "success", row_order: 6, sort_order: 0 },
  { button_key: "menu_info", label: "💬 Информация", action_type: "callback", action_value: "menu_info", style: "danger", row_order: 7, sort_order: 0 },
  { button_key: "reviews_channel", label: "📢 Канал с отзывами ↗", action_type: "url", action_value: REVIEWS_CHANNEL_URL, style: "primary", row_order: 8, sort_order: 0 },
];

export function seedProductsForBot(conn, botId) {
  const n = conn.prepare("SELECT COUNT(*) AS c FROM products WHERE bot_id = ?").get(botId).c;
  if (n > 0) return;

  const all = [...ESCORT_PRODUCTS, ...BOOST_PRODUCTS, ...GEAR_PRODUCTS];
  const ins = conn.prepare(`
    INSERT INTO products (
      bot_id, id, title, description, amount, currency, category,
      popular, extra_hint, button_style, active, sort_order
    ) VALUES (
      @bot_id, @id, @title, @description, @amount, @currency, @category,
      @popular, @extra_hint, @button_style, 1, @sort_order
    )
  `);
  all.forEach((p, i) => {
    ins.run({
      bot_id: botId,
      id: p.id,
      title: p.title,
      description: p.description,
      amount: p.amount,
      currency: p.currency || "RUB",
      category: p.category,
      popular: p.popular ? 1 : 0,
      extra_hint: p.extra_hint || "",
      button_style: p.button_style || "primary",
      sort_order: i,
    });
  });
}

export function seedCategoriesForBot(conn, botId) {
  const catIns = conn.prepare(`
    INSERT OR IGNORE INTO category_settings (bot_id, category, enabled, title, description)
    VALUES (@bot_id, @category, 1, @title, @description)
  `);
  for (const [catId, [title, desc]] of Object.entries(CATEGORIES)) {
    catIns.run({ bot_id: botId, category: catId, title, description: desc });
  }
}

export function seedMenuForBot(conn, botId, overrides = {}) {
  const ins = conn.prepare(`
    INSERT OR REPLACE INTO menu_buttons (
      bot_id, button_key, label, action_type, action_value, style, row_order, sort_order, enabled
    ) VALUES (
      @bot_id, @button_key, @label, @action_type, @action_value, @style, @row_order, @sort_order, 1
    )
  `);
  for (const b of DEFAULT_MENU_BUTTONS) {
    const o = overrides[b.button_key] || {};
    ins.run({
      bot_id: botId,
      button_key: b.button_key,
      label: o.label ?? b.label,
      action_type: o.action_type ?? b.action_type,
      action_value: o.action_value ?? b.action_value,
      style: o.style ?? b.style,
      row_order: o.row_order ?? b.row_order,
      sort_order: o.sort_order ?? b.sort_order,
    });
  }
}

export function defaultTenantSettings(displayName) {
  return {
    shop_name: displayName || "Metro Shop",
    reviews_url: REVIEWS_CHANNEL_URL,
    metro_shop_url: METRO_SHOP_CHANNEL_URL,
    website_url: "",
    support_contact: "@your_support",
  };
}
