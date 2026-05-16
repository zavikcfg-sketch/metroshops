import { connect } from "../repository.js";

export function getPromo(botId, code) {
  return connect()
    .prepare("SELECT * FROM promocodes WHERE bot_id = ? AND code = ? AND active = 1")
    .get(botId, String(code).toUpperCase());
}

export function setUserActivePromo(botId, userId, code) {
  connect()
    .prepare("UPDATE bot_users SET active_promo = ? WHERE bot_id = ? AND user_id = ?")
    .run(code ? String(code).toUpperCase() : null, botId, userId);
}

export function getUserActivePromo(botId, userId) {
  const row = connect()
    .prepare("SELECT active_promo FROM bot_users WHERE bot_id = ? AND user_id = ?")
    .get(botId, userId);
  return row?.active_promo || null;
}

export function applyPromoForUser(botId, userId, code) {
  const promo = getPromo(botId, code);
  if (!promo) return { ok: false, error: "Промокод не найден или неактивен" };
  if (promo.uses_left <= 0 && promo.use_limit > 0) {
    return { ok: false, error: "Промокод исчерпан" };
  }
  const used = connect()
    .prepare(
      "SELECT 1 FROM promo_redemptions WHERE bot_id = ? AND code = ? AND user_id = ?",
    )
    .get(botId, promo.code, userId);
  if (used && promo.one_per_user) {
    return { ok: false, error: "Вы уже использовали этот промокод" };
  }
  setUserActivePromo(botId, userId, promo.code);
  return {
    ok: true,
    code: promo.code,
    discount_percent: promo.discount_percent,
  };
}

export function consumePromo(botId, userId, code) {
  const promo = getPromo(botId, code);
  if (!promo) return;
  const now = new Date().toISOString();
  const conn = connect();
  if (promo.one_per_user) {
    conn
      .prepare(
        `INSERT OR IGNORE INTO promo_redemptions (bot_id, code, user_id, used_at) VALUES (?, ?, ?, ?)`,
      )
      .run(botId, promo.code, userId, now);
  }
  if (promo.use_limit > 0) {
    conn
      .prepare(
        `UPDATE promocodes SET uses_left = MAX(0, uses_left - 1) WHERE bot_id = ? AND code = ?`,
      )
      .run(botId, promo.code);
  }
  setUserActivePromo(botId, userId, null);
}
