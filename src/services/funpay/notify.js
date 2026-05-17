import { FP_STATUSES } from "./repository.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildFunpayCardText(tenant, order) {
  const statusLabel = FP_STATUSES[order.status] || order.status;
  const lines = [
    `🛒 <b>FunPay · новый заказ</b>`,
    `🏪 ${esc(tenant.shop_name || tenant.display_name)}`,
    "",
    `📦 <b>${esc(order.product || "Товар")}</b>`,
    `🆔 Заказ FunPay: <code>#${esc(order.funpay_order_id)}</code>`,
  ];

  if (order.buyer_funpay_id) {
    lines.push(`👤 Покупатель ID: <code>${esc(order.buyer_funpay_id)}</code>`);
  }
  if (order.buyer_name) {
    lines.push(`📛 Ник: ${esc(order.buyer_name)}`);
  }
  if (order.pubg_id) {
    lines.push(`🎮 Player ID: <code>${esc(order.pubg_id)}</code>`);
  }
  if (order.amount > 1) {
    lines.push(`🔢 Количество: ${order.amount} шт.`);
  }

  lines.push("", `<b>Описание покупки:</b>`);
  const desc = (order.description || "—").slice(0, 1200);
  lines.push(esc(desc));

  lines.push("", `Статус: ${statusLabel}`);
  if (order.claimed_by_name) {
    lines.push(`Сопровождает: <b>${esc(order.claimed_by_name)}</b>`);
  }

  return lines.join("\n");
}

export function buildFunpayCardKeyboard(botId, order) {
  const oid = order.funpay_order_id;
  const rows = [];

  if (order.status === "new" && !order.claimed_by) {
    rows.push([
      { text: "🙋 Взять в сопровождение", callback_data: `fp|claim|${oid}` },
    ]);
  } else if (order.status === "claimed") {
    rows.push([
      { text: "✅ Сопровождение завершено", callback_data: `fp|done|${oid}` },
      { text: "↩️ Вернуть в очередь", callback_data: `fp|release|${oid}` },
    ]);
  }

  if (order.status !== "cancelled" && order.status !== "done") {
    rows.push([{ text: "❌ Отказ / отмена", callback_data: `fp|cancel|${oid}` }]);
  }

  rows.push([
    {
      text: "💬 Открыть заказ на FunPay",
      url: `https://funpay.com/orders/${oid}/`,
    },
  ]);

  return { inline_keyboard: rows };
}

export async function sendFunpayEscortCard(bot, tenant, order) {
  const chatId = String(tenant.funpay_escort_chat_id || "").trim();
  if (!chatId) {
    console.warn(`[funpay] @${tenant.slug}: не задан funpay_escort_chat_id`);
    return null;
  }

  const text = buildFunpayCardText(tenant, order);
  const markup = buildFunpayCardKeyboard(tenant.id, order);

  const msg = await bot.api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: markup,
    disable_web_page_preview: true,
  });

  return { chatId, messageId: msg.message_id };
}

export async function refreshFunpayEscortCard(bot, tenant, order) {
  if (!order.group_chat_id || !order.group_message_id) return;
  const text = buildFunpayCardText(tenant, order);
  const markup = buildFunpayCardKeyboard(tenant.id, order);
  try {
    await bot.api.editMessageText(text, {
      chat_id: order.group_chat_id,
      message_id: order.group_message_id,
      parse_mode: "HTML",
      reply_markup: markup,
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.warn(`[funpay] refresh card #${order.funpay_order_id}:`, e.message);
  }
}
