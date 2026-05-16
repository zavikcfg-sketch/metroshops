import { connect, getProduct, recordOrderUser } from "../repository.js";

export const ORDER_STATUSES = {
  new: "🆕 Новый",
  awaiting_payment: "💳 Ожидает оплаты",
  paid: "✅ Оплачен",
  processing: "⚙️ В работе",
  completed: "🎉 Выдан",
  cancelled: "❌ Отменён",
};

export function getOrder(botId, orderId) {
  return connect().prepare("SELECT * FROM orders WHERE bot_id = ? AND id = ?").get(botId, orderId);
}

export function listUserOrders(botId, userId, limit = 15) {
  return connect()
    .prepare(
      "SELECT * FROM orders WHERE bot_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(botId, userId, limit);
}

export function updateOrderStatus(botId, orderId, status, { notifyUser } = {}) {
  const now = new Date().toISOString();
  const r = connect()
    .prepare(
      `UPDATE orders SET status = ?, updated_at = ? WHERE bot_id = ? AND id = ?`,
    )
    .run(status, now, botId, orderId);
  return { changed: r.changes > 0, order: getOrder(botId, orderId), notifyUser };
}

export function formatOrderLine(o) {
  const st = ORDER_STATUSES[o.status] || o.status;
  const amt = o.final_amount ?? o.amount;
  const price = amt <= 0 ? "по запросу" : `${amt} ${o.currency}`;
  return (
    `<b>${o.id}</b> · ${st}\n` +
    `${o.product_title} — ${price}\n` +
    `ID: <code>${o.pubg_id || "—"}</code>`
  );
}

export function computeCartTotal(botId, items, discountPercent = 0) {
  let total = 0;
  const lines = [];
  for (const it of items) {
    const p = getProduct(botId, it.product_id);
    if (!p || !p.active) continue;
    const qty = Math.max(1, Number(it.qty) || 1);
    const lineAmount = p.amount > 0 ? p.amount * qty : 0;
    total += lineAmount;
    lines.push({
      product_id: p.id,
      title: p.title,
      qty,
      amount: p.amount,
      currency: p.currency,
      line_total: lineAmount,
    });
  }
  const discount = discountPercent > 0 ? (total * discountPercent) / 100 : 0;
  const finalAmount = Math.max(0, Math.round((total - discount) * 100) / 100);
  return { lines, total, discount, finalAmount };
}

export function saveOrderExtended(
  botId,
  {
    orderId,
    userId,
    username,
    productId,
    productTitle,
    amount,
    finalAmount,
    currency,
    pubgId,
    comment,
    paycoreUrl,
    status = "new",
    promoCode = null,
    discountPercent = 0,
    source = "bot",
    itemsJson = null,
  },
) {
  const now = new Date().toISOString();
  connect()
    .prepare(
      `INSERT INTO orders (
        bot_id, id, user_id, username, product_id, product_title,
        amount, final_amount, currency, pubg_id, comment, paycore_url,
        status, promo_code, discount_percent, source, items_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      botId,
      orderId,
      userId,
      username,
      productId,
      productTitle,
      amount,
      finalAmount ?? amount,
      currency,
      pubgId,
      comment,
      paycoreUrl,
      status,
      promoCode,
      discountPercent,
      source,
      itemsJson,
      now,
      now,
    );
  recordOrderUser(botId, userId, username, finalAmount ?? amount);
}
