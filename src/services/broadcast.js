import crypto from "crypto";
import { connect } from "../repository.js";

export function createBroadcast(botId, message) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  connect()
    .prepare(
      `INSERT INTO broadcasts (id, bot_id, message, created_at) VALUES (?, ?, ?, ?)`,
    )
    .run(id, botId, message, now);
  return id;
}

export function updateBroadcastStats(id, sent, fail) {
  connect()
    .prepare(`UPDATE broadcasts SET sent_count = ?, fail_count = ? WHERE id = ?`)
    .run(sent, fail, id);
}

export async function sendBroadcast(bot, botId, message, { delayMs = 35 } = {}) {
  const users = connect()
    .prepare("SELECT user_id FROM bot_users WHERE bot_id = ?")
    .all(botId);
  const broadcastId = createBroadcast(botId, message);
  let sent = 0;
  let fail = 0;
  for (const { user_id } of users) {
    try {
      await bot.api.sendMessage(user_id, message, { parse_mode: "HTML" });
      sent++;
    } catch {
      fail++;
    }
    await sleep(delayMs);
  }
  updateBroadcastStats(broadcastId, sent, fail);
  return { broadcastId, sent, fail, total: users.length };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
