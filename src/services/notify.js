import { ORDER_STATUSES } from "./orderService.js";

export function parseNotifyChatIds(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,\s;]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export async function notifyAdminsNewOrder(
  bot,
  tenant,
  order,
  productTitle,
  priceText,
  extraAdminIds = [],
) {
  const ids = parseNotifyChatIds(tenant.notify_chat_ids);
  const all = [...new Set([...ids, ...extraAdminIds])];
  const text =
    `🆕 <b>Новый заказ</b> · ${tenant.display_name}\n\n` +
    `<b>${order.id}</b>\n` +
    `Товар: ${productTitle}\n` +
    `Сумма: ${priceText}\n` +
    `Player ID: <code>${order.pubg_id || "—"}</code>\n` +
    `Клиент: ${order.username ? `@${order.username}` : order.user_id}\n` +
    `Источник: ${order.source || "bot"}`;

  const markup = {
    inline_keyboard: [
      [
        { text: "⚙️ В работе", callback_data: `adm|${order.id}|processing` },
        { text: "✅ Выдан", callback_data: `adm|${order.id}|completed` },
      ],
      [
        { text: "💳 Оплачен", callback_data: `adm|${order.id}|paid` },
        { text: "❌ Отмена", callback_data: `adm|${order.id}|cancelled` },
      ],
    ],
  };

  for (const chatId of all) {
    try {
      await bot.api.sendMessage(chatId, text, { parse_mode: "HTML", reply_markup: markup });
    } catch (e) {
      console.warn(`[notify] admin ${chatId}:`, e.message);
    }
  }
}

export async function notifyUserOrderStatus(bot, userId, order) {
  const label = ORDER_STATUSES[order.status] || order.status;
  const text =
    `📦 <b>Заказ ${order.id}</b>\n\n` +
    `Статус: ${label}\n` +
    `Товар: ${order.product_title}\n` +
    `Player ID: <code>${order.pubg_id || "—"}</code>`;
  try {
    await bot.api.sendMessage(userId, text, { parse_mode: "HTML" });
  } catch (e) {
    console.warn(`[notify] user ${userId}:`, e.message);
  }
}
