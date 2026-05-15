import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getSettings } from "./config.js";
import {
  BOOST_PRODUCTS,
  CATEGORIES,
  ESCORT_PRODUCTS,
  GEAR_PRODUCTS,
} from "./catalog.js";

let db;

function dbPath() {
  const dir = getSettings().dataDir();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "shop.db");
}

function connect() {
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
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RUB',
      category TEXT NOT NULL,
      popular INTEGER NOT NULL DEFAULT 0,
      extra_hint TEXT NOT NULL DEFAULT '',
      button_style TEXT NOT NULL DEFAULT 'primary',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS category_settings (
      category TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS promocodes (
      code TEXT PRIMARY KEY,
      discount_percent REAL NOT NULL,
      use_limit INTEGER NOT NULL DEFAULT 0,
      uses_left INTEGER NOT NULL DEFAULT 0,
      one_per_user INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
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
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      orders_count INTEGER NOT NULL DEFAULT 0,
      total_spent REAL NOT NULL DEFAULT 0,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    );
  `);
  seedIfEmpty();
}

function seedIfEmpty() {
  const conn = connect();
  const n = conn.prepare("SELECT COUNT(*) AS c FROM products").get().c;
  if (n > 0) return;

  const all = [...ESCORT_PRODUCTS, ...BOOST_PRODUCTS, ...GEAR_PRODUCTS];
  const ins = conn.prepare(`
    INSERT INTO products (
      id, title, description, amount, currency, category,
      popular, extra_hint, button_style, active, sort_order
    ) VALUES (
      @id, @title, @description, @amount, @currency, @category,
      @popular, @extra_hint, @button_style, 1, @sort_order
    )
  `);
  all.forEach((p, i) => {
    ins.run({
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

  const catIns = conn.prepare(`
    INSERT OR IGNORE INTO category_settings (category, enabled, title, description)
    VALUES (@category, 1, @title, @description)
  `);
  for (const [catId, [title, desc]] of Object.entries(CATEGORIES)) {
    catIns.run({ category: catId, title, description: desc });
  }
}

export function listProducts({ activeOnly = false, category = null } = {}) {
  let q = "SELECT * FROM products WHERE 1=1";
  const params = [];
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

export function getProduct(productId) {
  const row = connect().prepare("SELECT * FROM products WHERE id = ?").get(productId);
  return row ? rowProduct(row) : null;
}

export function getCategoriesForBot() {
  const settings = {};
  for (const row of connect().prepare("SELECT * FROM category_settings").all()) {
    settings[row.category] = row;
  }
  const result = {};
  for (const [catId, [defaultTitle, defaultDesc]] of Object.entries(CATEGORIES)) {
    const st = settings[catId];
    if (st && !st.enabled) continue;
    const title = (st?.title || defaultTitle).trim() || defaultTitle;
    const desc = (st?.description || defaultDesc).trim() || defaultDesc;
    const products = listProducts({ activeOnly: true, category: catId });
    if (products.length) result[catId] = [title, desc, products];
  }
  return result;
}

export function listPopularProducts() {
  return connect()
    .prepare(
      `SELECT * FROM products WHERE active = 1 AND popular = 1 ORDER BY sort_order, title`,
    )
    .all()
    .map(rowProduct);
}

export function createProduct(data) {
  let pid = data.id || slug(data.title);
  const conn = connect();
  if (conn.prepare("SELECT 1 FROM products WHERE id = ?").get(pid)) {
    const base = pid;
    let n = 2;
    while (conn.prepare("SELECT 1 FROM products WHERE id = ?").get(pid)) {
      pid = `${base}_${n++}`;
    }
  }
  conn
    .prepare(
      `INSERT INTO products (
        id, title, description, amount, currency, category,
        popular, extra_hint, button_style, active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
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
  return getProduct(pid);
}

export function updateProduct(productId, data) {
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
  if (!fields.length) return getProduct(productId);
  values.push(productId);
  connect()
    .prepare(`UPDATE products SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);
  return getProduct(productId);
}

export function deleteProduct(productId) {
  const r = connect().prepare("DELETE FROM products WHERE id = ?").run(productId);
  return r.changes > 0;
}

export function listCategorySettings() {
  return connect()
    .prepare("SELECT * FROM category_settings ORDER BY category")
    .all()
    .map((r) => ({ ...r, enabled: !!r.enabled }));
}

export function setCategoryEnabled(category, enabled) {
  connect()
    .prepare("UPDATE category_settings SET enabled = ? WHERE category = ?")
    .run(enabled ? 1 : 0, category);
}

export function saveOrder({
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
        id, user_id, username, product_id, product_title,
        amount, currency, pubg_id, comment, paycore_url, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    )
    .run(
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
  recordOrderUser(userId, username, amount);
}

export function registerUser(userId, username = null, firstName = null) {
  const now = new Date().toISOString();
  const conn = connect();
  const row = conn.prepare("SELECT user_id FROM bot_users WHERE user_id = ?").get(userId);
  if (row) {
    conn
      .prepare(
        `UPDATE bot_users SET
          username = COALESCE(?, username),
          first_name = COALESCE(?, first_name),
          last_seen = ?
        WHERE user_id = ?`,
      )
      .run(username, firstName, now, userId);
  } else {
    conn
      .prepare(
        `INSERT INTO bot_users (
          user_id, username, first_name, orders_count, total_spent, first_seen, last_seen
        ) VALUES (?, ?, ?, 0, 0, ?, ?)`,
      )
      .run(userId, username, firstName, now, now);
  }
}

function recordOrderUser(userId, username, spent) {
  const now = new Date().toISOString();
  const conn = connect();
  const row = conn.prepare("SELECT user_id FROM bot_users WHERE user_id = ?").get(userId);
  if (row) {
    conn
      .prepare(
        `UPDATE bot_users SET
          username = COALESCE(?, username),
          orders_count = orders_count + 1,
          total_spent = total_spent + ?,
          last_seen = ?
        WHERE user_id = ?`,
      )
      .run(username, spent, now, userId);
  } else {
    conn
      .prepare(
        `INSERT INTO bot_users (
          user_id, username, first_name, orders_count, total_spent, first_seen, last_seen
        ) VALUES (?, ?, NULL, 1, ?, ?, ?)`,
      )
      .run(userId, username, spent, now, now);
  }
}

export function listRecentOrders(limit = 50) {
  return connect()
    .prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?")
    .all(limit);
}

export function statsSummary() {
  const conn = connect();
  const orders = conn
    .prepare("SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS s FROM orders")
    .get();
  const users = conn.prepare("SELECT COUNT(*) AS c FROM bot_users").get().c;
  const buyers = conn
    .prepare("SELECT COUNT(DISTINCT user_id) AS c FROM orders")
    .get().c;
  const products = conn
    .prepare("SELECT COUNT(*) AS c FROM products WHERE active = 1")
    .get().c;
  return {
    orders_count: orders.c,
    sales_total: Math.round(orders.s * 100) / 100,
    users_total: users,
    buyers_count: buyers,
    products_active: products,
  };
}

export function listPromos() {
  return connect()
    .prepare("SELECT * FROM promocodes ORDER BY created_at DESC")
    .all();
}

export function createPromo(code, discountPercent, useLimit) {
  const now = new Date().toISOString();
  connect()
    .prepare(
      `INSERT INTO promocodes (code, discount_percent, use_limit, uses_left, active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
    )
    .run(code.toUpperCase(), discountPercent, useLimit, useLimit, now);
}

export function deletePromo(code) {
  const r = connect()
    .prepare("DELETE FROM promocodes WHERE code = ?")
    .run(code.toUpperCase());
  return r.changes > 0;
}

export function listUsers(limit = 100) {
  return connect()
    .prepare("SELECT * FROM bot_users ORDER BY last_seen DESC LIMIT ?")
    .all(limit);
}
