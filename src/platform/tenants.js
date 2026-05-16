import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getSettings, ROOT } from "../config.js";
import { connect } from "../repository.js";
import { assertCanAddTenant } from "../services/plans.js";
import {
  DEFAULT_MENU_BUTTONS,
  defaultTenantSettings,
  seedCategoriesForBot,
  seedMenuForBot,
  seedProductsForBot,
} from "./seed.js";
import { migrateCompositePrimaryKeys } from "./migratePk.js";

export function initPlatformSchema() {
  const conn = connect();
  conn.exec(`
    CREATE TABLE IF NOT EXISTS tenant_bots (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      telegram_token TEXT NOT NULL,
      admin_password TEXT NOT NULL,
      avatar_path TEXT,
      shop_name TEXT NOT NULL DEFAULT 'Metro Shop',
      reviews_url TEXT,
      metro_shop_url TEXT,
      website_url TEXT,
      support_contact TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS menu_buttons (
      bot_id TEXT NOT NULL,
      button_key TEXT NOT NULL,
      label TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_value TEXT NOT NULL,
      style TEXT NOT NULL DEFAULT 'primary',
      row_order INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (bot_id, button_key)
    );
  `);
  migrateTenantColumns(conn);
  ensureLegacyTenant(conn);
}

function migrateTenantColumns(conn) {
  const tables = [
    "products",
    "category_settings",
    "promocodes",
    "orders",
    "bot_users",
  ];
  for (const table of tables) {
    const cols = conn.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === "bot_id")) {
      conn.exec(`ALTER TABLE ${table} ADD COLUMN bot_id TEXT NOT NULL DEFAULT 'main'`);
    }
  }
  migrateCompositePrimaryKeys(conn);
  const menuCols = conn.prepare("PRAGMA table_info(menu_buttons)").all();
  if (!menuCols.some((c) => c.name === "icon_emoji_id")) {
    conn.exec("ALTER TABLE menu_buttons ADD COLUMN icon_emoji_id TEXT");
  }
}

function ensureLegacyTenant(conn) {
  const settings = getSettings();
  const token = settings.resolveToken();
  const legacyPassword = settings.adminPassword.trim();
  if (!token || !legacyPassword) return;

  const row = conn.prepare("SELECT id FROM tenant_bots WHERE id = 'main'").get();
  if (row) return;

  const defs = defaultTenantSettings(settings.shopName);
  conn
    .prepare(
      `INSERT INTO tenant_bots (
        id, slug, display_name, telegram_token, admin_password,
        shop_name, reviews_url, metro_shop_url, website_url, support_contact, active, created_at
      ) VALUES (?, 'main', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(
      "main",
      settings.shopName || "WIXYEZ METRO SHOP",
      token,
      legacyPassword,
      defs.shop_name,
      defs.reviews_url,
      defs.metro_shop_url,
      defs.website_url,
      defs.support_contact,
      new Date().toISOString(),
    );
  seedProductsForBot(conn, "main");
  seedCategoriesForBot(conn, "main");
  seedMenuForBot(conn, "main");
}

export function makeSlug(name) {
  const base = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
  const s = base || "shop";
  const conn = connect();
  let slug = s;
  let n = 2;
  while (conn.prepare("SELECT 1 FROM tenant_bots WHERE slug = ?").get(slug)) {
    slug = `${s}_${n++}`;
  }
  return slug;
}

export function generatePassword(len = 12) {
  return crypto.randomBytes(9).toString("base64url").slice(0, len);
}

export function tenantAvatarsDir(botId) {
  const dir = path.join(getSettings().dataDir(), "avatars", botId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function rowToTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    display_name: row.display_name,
    telegram_token: row.telegram_token,
    admin_password: row.admin_password,
    avatar_path: row.avatar_path,
    shop_name: row.shop_name,
    reviews_url: row.reviews_url,
    metro_shop_url: row.metro_shop_url,
    website_url: row.website_url,
    support_contact: row.support_contact,
    active: !!row.active,
    created_at: row.created_at,
    theme_accent: row.theme_accent || "#b8ff5c",
    theme_bg: row.theme_bg || "#050807",
    banner_path: row.banner_path || null,
    promo_title: row.promo_title || null,
    promo_ends_at: row.promo_ends_at || null,
    plan_id: row.plan_id || "free",
    notify_chat_ids: row.notify_chat_ids || "",
  };
}

export function getTenantById(id) {
  const row = connect().prepare("SELECT * FROM tenant_bots WHERE id = ?").get(id);
  return rowToTenant(row);
}

export function getTenantBySlug(slug) {
  const row = connect().prepare("SELECT * FROM tenant_bots WHERE slug = ?").get(slug);
  return rowToTenant(row);
}

export function listTenants() {
  return connect()
    .prepare("SELECT * FROM tenant_bots ORDER BY created_at DESC")
    .all()
    .map(rowToTenant);
}

export function listActiveTenants() {
  return connect()
    .prepare("SELECT * FROM tenant_bots WHERE active = 1 ORDER BY created_at")
    .all()
    .map(rowToTenant);
}

export function findTenantSlugByToken(token, excludeId = null) {
  const t = String(token ?? "").trim();
  if (!t) return null;
  const row = excludeId
    ? connect()
        .prepare("SELECT slug FROM tenant_bots WHERE telegram_token = ? AND id != ? LIMIT 1")
        .get(t, excludeId)
    : connect()
        .prepare("SELECT slug FROM tenant_bots WHERE telegram_token = ? LIMIT 1")
        .get(t);
  return row?.slug ?? null;
}

export function listOtherTenantsWithToken(token, tenantId) {
  return connect()
    .prepare("SELECT id, slug FROM tenant_bots WHERE telegram_token = ? AND id != ?")
    .all(String(token ?? "").trim(), tenantId)
    .map((r) => ({ id: r.id, slug: r.slug }));
}

export function createTenant({ token, displayName, adminPassword, avatarPath = null }) {
  const password = String(adminPassword ?? "").trim();
  if (password.length < 4) {
    throw new Error("Укажите пароль админки (минимум 4 символа)");
  }

  assertCanAddTenant("free");

  const trimmedToken = String(token ?? "").trim();
  const dupSlug = findTenantSlugByToken(trimmedToken);
  if (dupSlug) {
    throw new Error(
      `Этот токен Telegram уже используется ботом «${dupSlug}». Создайте нового бота в @BotFather и вставьте его токен.`,
    );
  }

  const conn = connect();
  const id = crypto.randomUUID();
  const slug = makeSlug(displayName);
  const defs = defaultTenantSettings(displayName);
  const createdAt = new Date().toISOString();

  const insert = conn.transaction(() => {
    conn
      .prepare(
        `INSERT INTO tenant_bots (
          id, slug, display_name, telegram_token, admin_password, avatar_path,
          shop_name, reviews_url, metro_shop_url, website_url, support_contact, active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        id,
        slug,
        displayName,
        trimmedToken,
        password,
        avatarPath,
        defs.shop_name,
        defs.reviews_url,
        defs.metro_shop_url,
        defs.website_url,
        defs.support_contact,
        createdAt,
      );
    seedProductsForBot(conn, id);
    seedCategoriesForBot(conn, id);
    seedMenuForBot(conn, id);
  });

  insert();

  const tenant = getTenantById(id);
  return { tenant, adminPassword: password, adminUrl: `/b/${slug}/` };
}

export function updateTenant(id, data) {
  const fields = [];
  const values = [];
  const map = {
    display_name: "display_name",
    shop_name: "shop_name",
    reviews_url: "reviews_url",
    metro_shop_url: "metro_shop_url",
    website_url: "website_url",
    support_contact: "support_contact",
    avatar_path: "avatar_path",
    banner_path: "banner_path",
    theme_accent: "theme_accent",
    theme_bg: "theme_bg",
    promo_title: "promo_title",
    promo_ends_at: "promo_ends_at",
    plan_id: "plan_id",
    notify_chat_ids: "notify_chat_ids",
    active: "active",
  };
  for (const [k, col] of Object.entries(map)) {
    if (k in data) {
      let v = data[k];
      if (k === "active") v = v ? 1 : 0;
      fields.push(`${col} = ?`);
      values.push(v);
    }
  }
  if (!fields.length) return getTenantById(id);
  values.push(id);
  connect()
    .prepare(`UPDATE tenant_bots SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);
  return getTenantById(id);
}

export function setTenantActive(id, active) {
  connect()
    .prepare("UPDATE tenant_bots SET active = ? WHERE id = ?")
    .run(active ? 1 : 0, id);
}

export function deleteTenant(id) {
  const conn = connect();
  if (id === "main") return false;
  conn.prepare("DELETE FROM menu_buttons WHERE bot_id = ?").run(id);
  conn.prepare("DELETE FROM products WHERE bot_id = ?").run(id);
  conn.prepare("DELETE FROM category_settings WHERE bot_id = ?").run(id);
  conn.prepare("DELETE FROM promocodes WHERE bot_id = ?").run(id);
  conn.prepare("DELETE FROM orders WHERE bot_id = ?").run(id);
  conn.prepare("DELETE FROM bot_users WHERE bot_id = ?").run(id);
  const r = conn.prepare("DELETE FROM tenant_bots WHERE id = ?").run(id);
  return r.changes > 0;
}

export function listMenuButtons(botId) {
  const rows = connect()
    .prepare(
      `SELECT * FROM menu_buttons WHERE bot_id = ? ORDER BY row_order, sort_order, button_key`,
    )
    .all(botId);
  if (rows.length) return rows.map((r) => ({ ...r, enabled: !!r.enabled }));
  return DEFAULT_MENU_BUTTONS.map((b) => ({ bot_id: botId, ...b, enabled: true }));
}

export function upsertMenuButton(botId, data) {
  const iconId = data.icon_emoji_id ? String(data.icon_emoji_id).trim() : null;
  connect()
    .prepare(
      `INSERT INTO menu_buttons (
        bot_id, button_key, label, action_type, action_value, style,
        row_order, sort_order, enabled, icon_emoji_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bot_id, button_key) DO UPDATE SET
        label = excluded.label,
        action_type = excluded.action_type,
        action_value = excluded.action_value,
        style = excluded.style,
        row_order = excluded.row_order,
        sort_order = excluded.sort_order,
        enabled = excluded.enabled,
        icon_emoji_id = excluded.icon_emoji_id`,
    )
    .run(
      botId,
      data.button_key,
      data.label,
      data.action_type,
      data.action_value,
      data.style || "primary",
      Number(data.row_order ?? 0),
      Number(data.sort_order ?? 0),
      data.enabled === false ? 0 : 1,
      iconId || null,
    );
}

export function deleteMenuButton(botId, buttonKey) {
  const r = connect()
    .prepare("DELETE FROM menu_buttons WHERE bot_id = ? AND button_key = ?")
    .run(botId, buttonKey);
  return r.changes > 0;
}

export function miniAppUrlForTenant(tenant) {
  const base = getSettings().adminPublicUrl?.replace(/\/$/, "") || "";
  if (!base || !tenant?.slug) return "";
  return `${base}/b/${tenant.slug}/shop/`;
}

export function tenantSettings(tenant) {
  return {
    shopName: tenant.shop_name,
    reviewsUrl: tenant.reviews_url,
    metroShopUrl: tenant.metro_shop_url,
    websiteUrl: tenant.website_url || "",
    supportContact: tenant.support_contact || "@your_support",
    adminPassword: tenant.admin_password,
    bannerFile: () => {
      if (tenant.banner_path && fs.existsSync(tenant.banner_path)) return tenant.banner_path;
      if (tenant.avatar_path && fs.existsSync(tenant.avatar_path)) return tenant.avatar_path;
      return path.join(ROOT, getSettings().bannerPath || "assets/banner.png");
    },
    paycoreMode: getSettings().paycoreMode,
    paycoreApiBaseUrl: getSettings().paycoreApiBaseUrl,
    paycorePublicKey: getSettings().paycorePublicKey,
    paycorePaymentService: getSettings().paycorePaymentService,
    paycoreCurrency: getSettings().paycoreCurrency,
    paycoreEnabled() {
      return getSettings().paycoreEnabled();
    },
    resolveToken: () => tenant.telegram_token,
    adminIdList: () => getSettings().adminIdList(),
  };
}
