import { connect } from "../repository.js";

export function runMigrations() {
  const conn = connect();

  const tenantCols = conn.prepare("PRAGMA table_info(tenant_bots)").all();
  const addTenantCol = (name, ddl) => {
    if (!tenantCols.some((c) => c.name === name)) {
      conn.exec(`ALTER TABLE tenant_bots ADD COLUMN ${ddl}`);
    }
  };
  addTenantCol("theme_accent", "theme_accent TEXT DEFAULT '#b8ff5c'");
  addTenantCol("theme_bg", "theme_bg TEXT DEFAULT '#050807'");
  addTenantCol("banner_path", "banner_path TEXT");
  addTenantCol("promo_title", "promo_title TEXT");
  addTenantCol("promo_ends_at", "promo_ends_at TEXT");
  addTenantCol("plan_id", "plan_id TEXT DEFAULT 'free'");
  addTenantCol("notify_chat_ids", "notify_chat_ids TEXT DEFAULT ''");
  addTenantCol("funpay_enabled", "funpay_enabled INTEGER NOT NULL DEFAULT 0");
  addTenantCol("funpay_golden_key", "funpay_golden_key TEXT DEFAULT ''");
  addTenantCol("funpay_escort_chat_id", "funpay_escort_chat_id TEXT DEFAULT ''");

  const orderCols = conn.prepare("PRAGMA table_info(orders)").all();
  const addOrderCol = (name, ddl) => {
    if (!orderCols.some((c) => c.name === name)) {
      conn.exec(`ALTER TABLE orders ADD COLUMN ${ddl}`);
    }
  };
  addOrderCol("updated_at", "updated_at TEXT");
  addOrderCol("promo_code", "promo_code TEXT");
  addOrderCol("discount_percent", "discount_percent REAL DEFAULT 0");
  addOrderCol("final_amount", "final_amount REAL");
  addOrderCol("source", "source TEXT DEFAULT 'bot'");
  addOrderCol("items_json", "items_json TEXT");

  const userCols = conn.prepare("PRAGMA table_info(bot_users)").all();
  if (!userCols.some((c) => c.name === "referred_by")) {
    conn.exec("ALTER TABLE bot_users ADD COLUMN referred_by INTEGER");
  }
  if (!userCols.some((c) => c.name === "referral_balance")) {
    conn.exec("ALTER TABLE bot_users ADD COLUMN referral_balance REAL NOT NULL DEFAULT 0");
  }
  if (!userCols.some((c) => c.name === "active_promo")) {
    conn.exec("ALTER TABLE bot_users ADD COLUMN active_promo TEXT");
  }

  conn.exec(`
    CREATE TABLE IF NOT EXISTS promo_redemptions (
      bot_id TEXT NOT NULL,
      code TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      used_at TEXT NOT NULL,
      PRIMARY KEY (bot_id, code, user_id)
    );
    CREATE TABLE IF NOT EXISTS referral_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id TEXT NOT NULL,
      referrer_id INTEGER NOT NULL,
      referred_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(bot_id, referred_id)
    );
    CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS platform_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      max_products INTEGER NOT NULL DEFAULT 50,
      max_tenants INTEGER NOT NULL DEFAULT 1,
      price_rub REAL NOT NULL DEFAULT 0
    );
  `);

  const plans = conn.prepare("SELECT COUNT(*) AS c FROM platform_plans").get().c;
  if (!plans) {
    const ins = conn.prepare(
      `INSERT INTO platform_plans (id, name, max_products, max_tenants, price_rub) VALUES (?, ?, ?, ?, ?)`,
    );
    ins.run("free", "Free", 30, 3, 0);
    ins.run("pro", "Pro", 200, 20, 990);
    ins.run("unlimited", "Unlimited", 9999, 999, 4990);
  }
}
