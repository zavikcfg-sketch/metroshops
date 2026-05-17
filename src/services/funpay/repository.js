import { connect } from "../../repository.js";

export const FP_STATUSES = {
  new: "🆕 Новый",
  claimed: "👤 В работе",
  done: "✅ Выполнен",
  cancelled: "❌ Отменён",
};

export function initFunpaySchema() {
  connect().exec(`
    CREATE TABLE IF NOT EXISTS funpay_orders (
      bot_id TEXT NOT NULL,
      funpay_order_id TEXT NOT NULL,
      product TEXT NOT NULL DEFAULT '',
      buyer_funpay_id TEXT,
      buyer_name TEXT,
      description TEXT NOT NULL DEFAULT '',
      pubg_id TEXT,
      amount INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'new',
      claimed_by INTEGER,
      claimed_by_name TEXT,
      group_chat_id TEXT,
      group_message_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      PRIMARY KEY (bot_id, funpay_order_id)
    );
    CREATE INDEX IF NOT EXISTS idx_funpay_orders_status ON funpay_orders(bot_id, status);
  `);
}

export function getFunpayOrder(botId, funpayOrderId) {
  const row = connect()
    .prepare(
      `SELECT * FROM funpay_orders WHERE bot_id = ? AND funpay_order_id = ?`,
    )
    .get(botId, String(funpayOrderId));
  if (!row) return null;
  return mapRow(row);
}

export function funpayOrderExists(botId, funpayOrderId) {
  const row = connect()
    .prepare(
      `SELECT 1 AS ok FROM funpay_orders WHERE bot_id = ? AND funpay_order_id = ?`,
    )
    .get(botId, String(funpayOrderId));
  return !!row;
}

export function insertFunpayOrder(botId, data) {
  const now = new Date().toISOString();
  connect()
    .prepare(
      `INSERT INTO funpay_orders (
        bot_id, funpay_order_id, product, buyer_funpay_id, buyer_name,
        description, pubg_id, amount, status, group_chat_id, group_message_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)`,
    )
    .run(
      botId,
      String(data.funpayOrderId),
      data.product || "",
      data.buyerFunpayId ? String(data.buyerFunpayId) : null,
      data.buyerName || null,
      data.description || "",
      data.pubgId || null,
      data.amount ?? 1,
      data.groupChatId ? String(data.groupChatId) : null,
      data.groupMessageId ?? null,
      now,
      now,
    );
  return getFunpayOrder(botId, data.funpayOrderId);
}

export function updateFunpayOrderMessage(botId, funpayOrderId, chatId, messageId) {
  const now = new Date().toISOString();
  connect()
    .prepare(
      `UPDATE funpay_orders SET group_chat_id = ?, group_message_id = ?, updated_at = ?
       WHERE bot_id = ? AND funpay_order_id = ?`,
    )
    .run(String(chatId), messageId, now, botId, String(funpayOrderId));
}

export function claimFunpayOrder(botId, funpayOrderId, userId, userName) {
  const now = new Date().toISOString();
  connect()
    .prepare(
      `UPDATE funpay_orders SET status = 'claimed', claimed_by = ?, claimed_by_name = ?, updated_at = ?
       WHERE bot_id = ? AND funpay_order_id = ? AND status = 'new' AND claimed_by IS NULL`,
    )
    .run(userId, userName, now, botId, String(funpayOrderId));
  return getFunpayOrder(botId, funpayOrderId);
}

export function setFunpayOrderStatus(botId, funpayOrderId, status) {
  const now = new Date().toISOString();
  connect()
    .prepare(
      `UPDATE funpay_orders SET status = ?, updated_at = ? WHERE bot_id = ? AND funpay_order_id = ?`,
    )
    .run(status, now, botId, String(funpayOrderId));
  return getFunpayOrder(botId, funpayOrderId);
}

export function releaseFunpayOrder(botId, funpayOrderId) {
  const now = new Date().toISOString();
  connect()
    .prepare(
      `UPDATE funpay_orders SET status = 'new', claimed_by = NULL, claimed_by_name = NULL, updated_at = ?
       WHERE bot_id = ? AND funpay_order_id = ? AND status = 'claimed'`,
    )
    .run(now, botId, String(funpayOrderId));
  return getFunpayOrder(botId, funpayOrderId);
}

function mapRow(row) {
  return {
    bot_id: row.bot_id,
    funpay_order_id: row.funpay_order_id,
    product: row.product,
    buyer_funpay_id: row.buyer_funpay_id,
    buyer_name: row.buyer_name,
    description: row.description,
    pubg_id: row.pubg_id,
    amount: row.amount,
    status: row.status,
    claimed_by: row.claimed_by,
    claimed_by_name: row.claimed_by_name,
    group_chat_id: row.group_chat_id,
    group_message_id: row.group_message_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
