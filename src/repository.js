import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getSettings } from "./config.js";
import { CATEGORIES } from "./catalog.js";
import { initPlatformSchema } from "./platform/tenants.js";

let db;

function dbPath() {
  const dir = getSettings().dataDir();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "shop.db");
}

export function connect() {
  if (!db) {
    db = new Database(dbPath());
    db.pragma("journal_mode = WAL");
  }
  return db;
}

function rowProduct(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    popular: !!row.popular,
    extra_hint: row.extra_hint || "",
    button_style: row.button_style || "primary",
    active: !!row.active,
  };
}

function slug(text) {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return (s || "item").slice(0, 48);
}

export function initDb() {
  const conn = connect();
  conn.exec(`
    CREATE TABLE IF NOT EXISTS products (
      bot_id TEXT NOT NULL DEFAULT 'main',
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RUB',
      category TEXT NOT NULL,
      popular INTEGER NOT NULL DEFAULT 0,
      extra_hint TEXT NOT NULL DEFAULT '',
      button_style TEXT NOT NULL DEFAULT 'primary',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (bot_id, id)
    );
    CREATE TABLE IF NOT EXISTS category_settings (
      bot_id TEXT NOT NULL DEFAULT 'main',
      category TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (bot_id, category)
    );
    CREATE TABLE IF NOT EXISTS promocodes (
      bot_id TEXT NOT NULL DEFAULT 'main',
      code TEXT NOT NULL,
      discount_percent REAL NOT NULL,
      use_limit INTEGER NOT NULL DEFAULT 0,
      uses_left INTEGER NOT NULL DEFAULT 0,
      one_per_user INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      PRIMARY KEY (bot_id, code)
    );
    CREATE TABLE IF NOT EXISTS orders (
      bot_id TEXT NOT NULL DEFAULT 'main',
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username TEXT,
      product_id TEXT NOT NULL,
      product_title TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      pubg_id TEXT,
      comment TEXT,
      paycore_url TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bot_users (
      bot_id TEXT NOT NULL DEFAULT 'main',
      user_id INTEGER NOT NULL,
      username TEXT,
      first_name TEXT,
      orders_count INTEGER NOT NULL DEFAULT 0,
      total_spent REAL NOT NULL DEFAULT 0,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      PRIMARY KEY (bot_id, user_id)
    );
  `);
  initPlatformSchema();
}

export function listProducts(botId, { activeOnly = false, category = null } = {}) {
  let q = "SELECT * FROM products WHERE bot_id = ?";
  const params = [botId];
  if (activeOnly) q += " AND active = 1";
  if (category) {
    q += " AND category = ?";
    params.push(category);
  }
  q += " ORDER BY sort_order, title";
  return connect()
    .prepare(q)
    .all(...params)
    .map(rowProduct);
}

export function getProduct(botId, productId) {
  const row = connect()
    .prepare("SELECT * FROM products WHERE bot_id = ? AND id = ?")
    .get(botId, productId);
  return row ? rowProduct(row) : null;
}

export function getCategoriesForBot(botId) {
  const settings = {};
  for (const row of connect()
    .prepare("SELECT * FROM category_settings WHERE bot_id = ?")
    .all(botId)) {
    settings[row.category] = row;
  }
  const result = {};
  for (const [catId, [defaultTitle, defaultDesc]] of Object.entries(CATEGORIES)) {
    const st = settings[catId];
    if (st && !st.enabled) continue;
    const title = (st?.title || defaultTitle).trim() || defaultTitle;
    const desc = (st?.description || defaultDesc).trim() || defaultDesc;
    const products = listProducts(botId, { activeOnly: true, category: catId });
    if (products.length) result[catId] = [title, desc, products];
  }
  return result;
}

export function listPopularProducts(botId) {
  return connect()
    .prepare(
      `SELECT * FROM products WHERE bot_id = ? AND active = 1 AND popular = 1 ORDER BY sort_order, title`,
    )
    .all(botId)
    .map(rowProduct);
}

export function createProduct(botId, data) {
  let pid = data.id || slug(data.title);
  const conn = connect();
  if (conn.prepare("SELECT 1 FROM products WHERE bot_id = ? AND id = ?").get(botId, pid)) {
    const base = pid;
    let n = 2;
    while (conn.prepare("SELECT 1 FROM products WHERE bot_id = ? AND id = ?").get(botId, pid)) {
      pid = `${base}_${n++}`;
    }
  }
  conn
    .prepare(
      `INSERT INTO products (
        bot_id, id, title, description, amount, currency, category,
        popular, extra_hint, button_style, active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      botId,
      pid,
      data.title,
      data.description || "",
      Number(data.amount ?? 0),
      data.currency || "RUB",
      data.category,
      data.popular ? 1 : 0,
      data.extra_hint || "",
      data.button_style || "primary",
      data.active === false ? 0 : 1,
      Number(data.sort_order ?? 0),
    );
  return getProduct(botId, pid);
}

export function updateProduct(botId, productId, data) {
  const mapping = {
    title: "title",
    description: "description",
    amount: "amount",
    currency: "currency",
    category: "category",
    popular: "popular",
    extra_hint: "extra_hint",
    button_style: "button_style",
    active: "active",
    sort_order: "sort_order",
  };
  const fields = [];
  const values = [];
  for (const [key, col] of Object.entries(mapping)) {
    if (key in data) {
      let val = data[key];
      if (key === "popular" || key === "active") val = val ? 1 : 0;
      fields.push(`${col} = ?`);
      values.push(val);
    }
  }
  if (!fields.length) return getProduct(botId, productId);
  values.push(botId, productId);
  connect()
    .prepare(`UPDATE products SET ${fields.join(", ")} WHERE bot_id = ? AND id = ?`)
    .run(...values);
  return getProduct(botId, productId);
}

export function deleteProduct(botId, productId) {
  const r = connect()
    .prepare("DELETE FROM products WHERE bot_id = ? AND id = ?")
    .run(botId, productId);
  return r.changes > 0;
}

export function listCategorySettings(botId) {
  return connect()
    .prepare("SELECT * FROM category_settings WHERE bot_id = ? ORDER BY category")
    .all(botId)
    .map((r) => ({ ...r, enabled: !!r.enabled }));
}

export function setCategoryEnabled(botId, category, enabled) {
  connect()
    .prepare("UPDATE category_settings SET enabled = ? WHERE bot_id = ? AND category = ?")
    .run(enabled ? 1 : 0, botId, category);
}

export function saveOrder(botId, {
  orderId,
  userId,
  username,
  productId,
  productTitle,
  amount,
  currency,
  pubgId,
  comment,
  paycoreUrl,
}) {
  const now = new Date().toISOString();
  connect()
    .prepare(
      `INSERT INTO orders (
        bot_id, id, user_id, username, product_id, product_title,
        amount, currency, pubg_id, comment, paycore_url, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    )
    .run(
      botId,
      orderId,
      userId,
      username,
      productId,
      productTitle,
      amount,
      currency,
      pubgId,
      comment,
      paycoreUrl,
      now,
    );
  recordOrderUser(botId, userId, username, amount);
}

export function registerUser(botId, userId, username = null, firstName = null) {
  const now = new Date().toISOString();
  const conn = connect();
  const row = conn
    .prepare("SELECT user_id FROM bot_users WHERE bot_id = ? AND user_id = ?")
    .get(botId, userId);
  if (row) {
    conn
      .prepare(
        `UPDATE bot_users SET
          username = COALESCE(?, username),
          first_name = COALESCE(?, first_name),
          last_seen = ?
        WHERE bot_id = ? AND user_id = ?`,
      )
      .run(username, firstName, now, botId, userId);
  } else {
    conn
      .prepare(
        `INSERT INTO bot_users (
          bot_id, user_id, username, first_name, orders_count, total_spent, first_seen, last_seen
        ) VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
      )
      .run(botId, userId, username, firstName, now, now);
  }
}

function recordOrderUser(botId, userId, username, spent) {
  const now = new Date().toISOString();
  const conn = connect();
  const row = conn
    .prepare("SELECT user_id FROM bot_users WHERE bot_id = ? AND user_id = ?")
    .get(botId, userId);
  if (row) {
    conn
      .prepare(
        `UPDATE bot_users SET
          username = COALESCE(?, username),
          orders_count = orders_count + 1,
          total_spent = total_spent + ?,
          last_seen = ?
        WHERE bot_id = ? AND user_id = ?`,
      )
      .run(username, spent, now, botId, userId);
  } else {
    conn
      .prepare(
        `INSERT INTO bot_users (
          bot_id, user_id, username, first_name, orders_count, total_spent, first_seen, last_seen
        ) VALUES (?, ?, ?, NULL, 1, ?, ?, ?)`,
      )
      .run(botId, userId, username, spent, now, now);
  }
}

export function listRecentOrders(botId, limit = 50) {
  return connect()
    .prepare("SELECT * FROM orders WHERE bot_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(botId, limit);
}

export function statsSummary(botId) {
  const conn = connect();
  const orders = conn
    .prepare(
      "SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS s FROM orders WHERE bot_id = ?",
    )
    .get(botId);
  const users = conn
    .prepare("SELECT COUNT(*) AS c FROM bot_users WHERE bot_id = ?")
    .get(botId).c;
  const buyers = conn
    .prepare("SELECT COUNT(DISTINCT user_id) AS c FROM orders WHERE bot_id = ?")
    .get(botId).c;
  const products = conn
    .prepare("SELECT COUNT(*) AS c FROM products WHERE bot_id = ? AND active = 1")
    .get(botId).c;
  return {
    orders_count: orders.c,
    sales_total: Math.round(orders.s * 100) / 100,
    users_total: users,
    buyers_count: buyers,
    products_active: products,
  };
}

export function listPromos(botId) {
  return connect()
    .prepare("SELECT * FROM promocodes WHERE bot_id = ? ORDER BY created_at DESC")
    .all(botId);
}

export function createPromo(botId, code, discountPercent, useLimit) {
  const now = new Date().toISOString();
  connect()
    .prepare(
      `INSERT INTO promocodes (bot_id, code, discount_percent, use_limit, uses_left, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(botId, code.toUpperCase(), discountPercent, useLimit, useLimit, now);
}

export function deletePromo(botId, code) {
  const r = connect()
    .prepare("DELETE FROM promocodes WHERE bot_id = ? AND code = ?")
    .run(botId, code.toUpperCase());
  return r.changes > 0;
}

export function listUsers(botId, limit = 100) {
  return connect()
    .prepare("SELECT * FROM bot_users WHERE bot_id = ? ORDER BY last_seen DESC LIMIT ?")
    .all(botId, limit);
}
