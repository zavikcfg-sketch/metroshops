import { connect } from "../repository.js";
import { registerUser } from "../repository.js";

const REFERRAL_BONUS_RUB = 50;

export function registerReferral(botId, referredId, referrerId) {
  if (!referredId || !referrerId || referredId === referrerId) return null;
  const conn = connect();
  const existing = conn
    .prepare("SELECT referrer_id FROM referral_events WHERE bot_id = ? AND referred_id = ?")
    .get(botId, referredId);
  if (existing) return null;

  const user = conn
    .prepare("SELECT referred_by FROM bot_users WHERE bot_id = ? AND user_id = ?")
    .get(botId, referredId);
  if (user?.referred_by) return null;

  const now = new Date().toISOString();
  try {
    conn
      .prepare(
        `INSERT INTO referral_events (bot_id, referrer_id, referred_id, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(botId, referrerId, referredId, now);
    conn
      .prepare(
        `UPDATE bot_users SET referred_by = ? WHERE bot_id = ? AND user_id = ?`,
      )
      .run(referrerId, botId, referredId);
    conn
      .prepare(
        `UPDATE bot_users SET referral_balance = referral_balance + ? WHERE bot_id = ? AND user_id = ?`,
      )
      .run(REFERRAL_BONUS_RUB, botId, referrerId);
    return { referrerId, bonus: REFERRAL_BONUS_RUB };
  } catch {
    return null;
  }
}

export function ensureUserForReferral(botId, userId, username, firstName, referrerId) {
  registerUser(botId, userId, username, firstName);
  if (referrerId) registerReferral(botId, userId, referrerId);
}

export function getReferralStats(botId, userId) {
  const conn = connect();
  const refs = conn
    .prepare("SELECT COUNT(*) AS c FROM referral_events WHERE bot_id = ? AND referrer_id = ?")
    .get(botId, userId).c;
  const bal = conn
    .prepare("SELECT referral_balance FROM bot_users WHERE bot_id = ? AND user_id = ?")
    .get(botId, userId);
  return { count: refs, balance: bal?.referral_balance ?? 0, bonusPerReferral: REFERRAL_BONUS_RUB };
}
