import { connect } from "../../repository.js";

export const FP_STATUSES = {
  awaiting_id: "⏳ Ждём Player ID",
  new: "🆕 Ожидает сопровождающих",
  in_progress: "🎮 В сопровождении",
  done: "✅ Выполнен",
  cancelled: "❌ Отменён",
};

export function initFunpaySchema() {
  const conn = connect();
  conn.exec(`
    CREATE TABLE IF NOT EXISTS funpay_orders (
      bot_id TEXT NOT NULL,
      funpay_order_id TEXT NOT NULL,
      product TEXT NOT NULL DEFAULT '',
      buyer_funpay_id TEXT,
      buyer_name TEXT,
      description TEXT NOT NULL DEFAULT '',
      pubg_id TEXT,
      amount INTEGER NOT NULL DEFAULT 1,
      order_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new',
      claimed_by INTEGER,
      claimed_by_name TEXT,
      escorts_json TEXT NOT NULL DEFAULT '[]',
      payout_json TEXT,
      group_chat_id TEXT,
      group_message_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      PRIMARY KEY (bot_id, funpay_order_id)
    );
    CREATE INDEX IF NOT EXISTS idx_funpay_orders_status ON funpay_orders(bot_id, status);
  `);
  migrateFunpayColumns(conn);
}

function migrateFunpayColumns(conn) {
  const cols = conn.prepare("PRAGMA table_info(funpay_orders)").all();
  const add = (name, ddl) => {
    if (!cols.some((c) => c.name === name)) {
      conn.exec(`ALTER TABLE funpay_orders ADD COLUMN ${ddl}`);
    }
  };
  add("order_amount", "order_amount REAL NOT NULL DEFAULT 0");
  add("escorts_json", "escorts_json TEXT NOT NULL DEFAULT '[]'");
  add("payout_json", "payout_json TEXT");
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
      `SELECT status FROM funpay_orders WHERE bot_id = ? AND funpay_order_id = ?`,
    )
    .get(botId, String(funpayOrderId));
  if (!row) return false;
  return row.status !== "ignored";
}

export function insertFunpayOrder(botId, data) {
  const now = new Date().toISOString();
  const status = data.status || "new";
  connect()
    .prepare(
      `INSERT INTO funpay_orders (
        bot_id, funpay_order_id, product, buyer_funpay_id, buyer_name,
        description, pubg_id, amount, order_amount, status, escorts_json,
        group_chat_id, group_message_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?)`,
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
      Number(data.orderAmount) || 0,
      status,
      data.groupChatId ? String(data.groupChatId) : null,
      data.groupMessageId ?? null,
      now,
      now,
    );
  return getFunpayOrder(botId, data.funpayOrderId);
}

export function getAwaitingFunpayOrder(botId, buyerFunpayId) {
  const row = connect()
    .prepare(
      `SELECT * FROM funpay_orders
       WHERE bot_id = ? AND buyer_funpay_id = ? AND status = 'awaiting_id'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(botId, String(buyerFunpayId));
  return row ? mapRow(row) : null;
}

export function setFunpayOrderPubgId(botId, funpayOrderId, pubgId) {
  const now = new Date().toISOString();
  connect()
    .prepare(
      `UPDATE funpay_orders SET pubg_id = ?, status = 'new', updated_at = ?
       WHERE bot_id = ? AND funpay_order_id = ?`,
    )
    .run(pubgId, now, botId, String(funpayOrderId));
  return getFunpayOrder(botId, funpayOrderId);
}

export function listAwaitingFunpayOrders(botId) {
  return connect()
    .prepare(
      `SELECT * FROM funpay_orders WHERE bot_id = ? AND status = 'awaiting_id'`,
    )
    .all(botId)
    .map(mapRow);
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

export function saveFunpayEscorts(botId, funpayOrderId, escorts) {
  const now = new Date().toISOString();
  connect()
    .prepare(
      `UPDATE funpay_orders SET escorts_json = ?, updated_at = ?
       WHERE bot_id = ? AND funpay_order_id = ?`,
    )
    .run(JSON.stringify(escorts), now, botId, String(funpayOrderId));
}

export function saveFunpayPayout(botId, funpayOrderId, payouts) {
  const now = new Date().toISOString();
  connect()
    .prepare(
      `UPDATE funpay_orders SET payout_json = ?, updated_at = ?
       WHERE bot_id = ? AND funpay_order_id = ?`,
    )
    .run(JSON.stringify(payouts), now, botId, String(funpayOrderId));
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
    order_amount: row.order_amount ?? 0,
    status: row.status,
    claimed_by: row.claimed_by,
    claimed_by_name: row.claimed_by_name,
    escorts_json: row.escorts_json || "[]",
    payout_json: row.payout_json,
    group_chat_id: row.group_chat_id,
    group_message_id: row.group_message_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
