import { getTenantById } from "../../platform/tenants.js";
import { FP_STATUSES } from "./repository.js";
import { parseEscorts, parsePayout } from "./escorts.js";
import { formatPayoutLines, MAX_ESCORTS, ESCORT_LEADER_USERNAME } from "./payout.js";
import { updateFunpayOrderMessage } from "./repository.js";
import {
  editHtmlMessage,
  isNoopEditError,
  normalizeTelegramText,
  ResendCardError,
  sendHtmlMessage,
} from "./telegramChat.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildFunpayCardText(tenant, order) {
  const statusLabel = FP_STATUSES[order.status] || order.status || "—";
  const escorts = parseEscorts(order);
  const payouts = order.status === "done" ? parsePayout(order) : null;
  const orderId = String(order.funpay_order_id || "—").trim() || "—";
  const product = String(order.product || "").trim() || "Сопровождение";
  const shop = String(tenant?.shop_name || tenant?.display_name || "Магазин").trim() || "Магазин";

  const lines = [
    `🛒 <b>FunPay · заказ сопровождения</b>`,
    `🏪 ${esc(shop)}`,
    "",
    `📦 <b>${esc(product)}</b>`,
    `🆔 <code>#${esc(orderId)}</code>`,
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
  const amount = Number(order.order_amount) || 0;
  if (amount > 0) {
    lines.push(`💰 Сумма заказа: ${esc(amount)} ₽`);
  }

  lines.push("", `📊 Статус: ${esc(statusLabel)}`);

  if (escorts.length) {
    lines.push("", `<b>👥 Сопровождающие (${escorts.length}/${MAX_ESCORTS}):</b>`);
    for (const e of escorts) {
      const crown =
        String(e.username || "")
          .replace(/^@/, "")
          .toLowerCase() === ESCORT_LEADER_USERNAME
          ? " 👑"
          : "";
      const label = esc(e.username || e.user_id || "участник");
      lines.push(`• ${label}${crown}`);
    }
  } else if (order.status !== "done" && order.status !== "cancelled") {
    lines.push("", `<i>Места: 0/${MAX_ESCORTS} — нажмите «Взять сопровождение»</i>`);
  }

  if (payouts?.length && amount > 0) {
    const payoutText = formatPayoutLines(payouts, amount);
    if (payoutText && payoutText !== "—") {
      lines.push("", `<b>💵 Распределение (75% пула):</b>`);
      lines.push(esc(payoutText));
      lines.push("", `<i>Лидер @${ESCORT_LEADER_USERNAME}: 50% пула при команде 2–3 чел.</i>`);
    }
  }

  return normalizeTelegramText(lines.join("\n"));
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

function freshTenant(tenant) {
  return getTenantById(tenant.id) || tenant;
}

export async function sendFunpayEscortCard(bot, tenant, order) {
  const t = freshTenant(tenant);
  const chatId = String(t.funpay_escort_chat_id || "").trim();
  if (!chatId) {
    console.warn(`[funpay] @${t.slug}: не задан funpay_escort_chat_id`);
    return null;
  }

  const text = buildFunpayCardText(t, order);
  const markup = buildFunpayCardKeyboard(t.id, order);

  const msg = await sendHtmlMessage(bot, t.id, chatId, text, { reply_markup: markup });
  const usedChatId = String(msg.chat?.id ?? chatId);

  return { chatId: usedChatId, messageId: msg.message_id, tenant: freshTenant(t) };
}

export async function refreshFunpayEscortCard(bot, tenant, order) {
  const t = freshTenant(tenant);
  const text = buildFunpayCardText(t, order);
  const markup = buildFunpayCardKeyboard(t.id, order);
  const chatId = String(order.group_chat_id || t.funpay_escort_chat_id || "").trim();
  const messageId = order.group_message_id;

  if (!chatId) {
    return sendFunpayEscortCard(bot, t, order);
  }

  if (!messageId) {
    const sent = await sendFunpayEscortCard(bot, t, order);
    if (sent) {
      updateFunpayOrderMessage(t.id, order.funpay_order_id, sent.chatId, sent.messageId);
    }
    return sent;
  }

  try {
    await editHtmlMessage(bot, t.id, chatId, messageId, text, { reply_markup: markup });
    return { chatId, messageId };
  } catch (e) {
    if (isNoopEditError(e)) return { chatId, messageId };

    const needResend =
      e instanceof ResendCardError ||
      String(e?.message || "").includes("message to edit not found") ||
      String(e?.message || "").includes("chat not found");

    if (!needResend) {
      console.warn(`[funpay] refresh card #${order.funpay_order_id}:`, e.message);
      return null;
    }

    console.log(
      `[funpay] #${order.funpay_order_id}: повторная отправка карточки (${e.code || "resend"})`,
    );
    const sent = await sendFunpayEscortCard(bot, freshTenant(t), order);
    if (sent) {
      updateFunpayOrderMessage(t.id, order.funpay_order_id, sent.chatId, sent.messageId);
    }
    return sent;
  }
}
