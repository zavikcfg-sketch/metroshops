/** Пересоздаёт таблицы со старым PK (только id / user_id) на составной (bot_id, …). */

function pkColumns(conn, table) {
  return conn
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name);
}

function rebuild(conn, table, createSql, insertSql) {
  const tmp = `${table}_pkfix`;
  conn.exec("BEGIN");
  try {
    conn.exec(createSql.replace("TABLE_NAME", tmp));
    conn.exec(insertSql.replace("TABLE_NAME", tmp).replace("FROM_TABLE", table));
    conn.exec(`DROP TABLE ${table}`);
    conn.exec(`ALTER TABLE ${tmp} RENAME TO ${table}`);
    conn.exec("COMMIT");
    console.log(`[metro-shop] Migrated PK for ${table}`);
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

export function migrateCompositePrimaryKeys(conn) {
  const productsPk = pkColumns(conn, "products");
  if (productsPk.length === 1 && productsPk[0] === "id") {
    rebuild(
      conn,
      "products",
      `CREATE TABLE TABLE_NAME (
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
      )`,
      `INSERT INTO TABLE_NAME (
        bot_id, id, title, description, amount, currency, category,
        popular, extra_hint, button_style, active, sort_order
      ) SELECT
        COALESCE(bot_id, 'main'), id, title, description, amount, currency, category,
        popular, extra_hint, button_style, active, sort_order
      FROM FROM_TABLE`,
    );
  }

  const usersPk = pkColumns(conn, "bot_users");
  if (usersPk.length === 1 && usersPk[0] === "user_id") {
    rebuild(
      conn,
      "bot_users",
      `CREATE TABLE TABLE_NAME (
        bot_id TEXT NOT NULL DEFAULT 'main',
        user_id INTEGER NOT NULL,
        username TEXT,
        first_name TEXT,
        orders_count INTEGER NOT NULL DEFAULT 0,
        total_spent REAL NOT NULL DEFAULT 0,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        PRIMARY KEY (bot_id, user_id)
      )`,
      `INSERT INTO TABLE_NAME (
        bot_id, user_id, username, first_name, orders_count, total_spent, first_seen, last_seen
      ) SELECT
        COALESCE(bot_id, 'main'), user_id, username, first_name, orders_count, total_spent, first_seen, last_seen
      FROM FROM_TABLE`,
    );
  }

  const catPk = pkColumns(conn, "category_settings");
  if (catPk.length === 1 && catPk[0] === "category") {
    rebuild(
      conn,
      "category_settings",
      `CREATE TABLE TABLE_NAME (
        bot_id TEXT NOT NULL DEFAULT 'main',
        category TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (bot_id, category)
      )`,
      `INSERT INTO TABLE_NAME (bot_id, category, enabled, title, description)
      SELECT COALESCE(bot_id, 'main'), category, enabled, title, description FROM FROM_TABLE`,
    );
  }

  const promoPk = pkColumns(conn, "promocodes");
  if (promoPk.length === 1 && promoPk[0] === "code") {
    rebuild(
      conn,
      "promocodes",
      `CREATE TABLE TABLE_NAME (
        bot_id TEXT NOT NULL DEFAULT 'main',
        code TEXT NOT NULL,
        discount_percent REAL NOT NULL,
        use_limit INTEGER NOT NULL DEFAULT 0,
        uses_left INTEGER NOT NULL DEFAULT 0,
        one_per_user INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        PRIMARY KEY (bot_id, code)
      )`,
      `INSERT INTO TABLE_NAME (
        bot_id, code, discount_percent, use_limit, uses_left, one_per_user, active, created_at
      ) SELECT
        COALESCE(bot_id, 'main'), code, discount_percent, use_limit, uses_left, one_per_user, active, created_at
      FROM FROM_TABLE`,
    );
  }
}
