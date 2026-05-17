import { FP_STATUSES } from "./repository.js";
import { parseEscorts, parsePayout } from "./escorts.js";
import { formatPayoutLines, MAX_ESCORTS, ESCORT_LEADER_USERNAME } from "./payout.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildFunpayCardText(tenant, order) {
  const statusLabel = FP_STATUSES[order.status] || order.status;
  const escorts = parseEscorts(order);
  const payouts = order.status === "done" ? parsePayout(order) : null;

  const lines = [
    `🛒 <b>FunPay · заказ сопровождения</b>`,
    `🏪 ${esc(tenant.shop_name || tenant.display_name)}`,
    "",
    `📦 <b>${esc(order.product || "Сопровождение")}</b>`,
    `🆔 <code>#${esc(order.funpay_order_id)}</code>`,
  ];

  if (order.buyer_name) {
    lines.push(`📛 Покупатель: ${esc(order.buyer_name)}`);
  }
  if (order.buyer_funpay_id) {
    lines.push(`👤 FunPay ID: <code>${esc(order.buyer_funpay_id)}</code>`);
  }
  if (order.pubg_id) {
    lines.push(`🎮 Player ID: <code>${esc(order.pubg_id)}</code>`);
  }
  if (order.order_amount > 0) {
    lines.push(`💰 Сумма заказа: ${esc(order.order_amount)} ₽`);
  }

  lines.push("", `📊 Статус: ${statusLabel}`);

  if (escorts.length) {
    lines.push("", `<b>👥 Сопровождающие (${escorts.length}/${MAX_ESCORTS}):</b>`);
    for (const e of escorts) {
      const crown =
        String(e.username || "")
          .replace(/^@/, "")
          .toLowerCase() === ESCORT_LEADER_USERNAME
          ? " 👑"
          : "";
      lines.push(`• ${esc(e.username || e.user_id)}${crown}`);
    }
  } else if (order.status !== "done" && order.status !== "cancelled") {
    lines.push("", `<i>Места: 0/${MAX_ESCORTS} — нажмите «Взять сопровождение»</i>`);
  }

  if (payouts?.length && order.order_amount > 0) {
    lines.push("", `<b>💵 Распределение (75% пула):</b>`);
    lines.push(esc(formatPayoutLines(payouts, order.order_amount)));
    lines.push("", `<i>Лидер @${ESCORT_LEADER_USERNAME}: 50% пула при команде 2–3 чел.</i>`);
  }

  return lines.join("\n");
}

export function buildFunpayCardKeyboard(botId, order) {
  const oid = order.funpay_order_id;
  const escorts = parseEscorts(order);
  const rows = [];
  const n = escorts.length;

  if (order.status !== "done" && order.status !== "cancelled") {
    if (n < MAX_ESCORTS) {
      rows.push([{ text: `🙋 Взять сопровождение (${n}/${MAX_ESCORTS})`, callback_data: `fp|join|${oid}` }]);
    }
    rows.push([{ text: "🚪 Выйти из сопровождения", callback_data: `fp|leave|${oid}` }]);
    if (n >= 1) {
      rows.push([{ text: "✅ Готово · запрос отзыва", callback_data: `fp|done|${oid}` }]);
    }
    if (n > 0) {
      rows.push([{ text: "🔄 Сбросить состав", callback_data: `fp|reset|${oid}` }]);
    }
    rows.push([{ text: "❌ Отмена заказа", callback_data: `fp|cancel|${oid}` }]);
  }

  rows.push([
    {
      text: "💬 Открыть на FunPay",
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
