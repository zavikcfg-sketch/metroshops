import { listActiveTenants } from "../platform/tenants.js";
import { getBotTelegramInfo, isBotRunning } from "../botManager.js";
import { getSettings } from "../config.js";

const lastAlert = new Map();

export function startHealthMonitor() {
  const interval = Number(process.env.HEALTH_CHECK_MS || 300000);
  setInterval(runHealthCheck, interval);
  setTimeout(runHealthCheck, 15000);
}

async function runHealthCheck() {
  const tenants = listActiveTenants();
  const alertChat = getSettings().adminIdList();
  if (!alertChat.length) return;

  for (const t of tenants) {
    const info = await getBotTelegramInfo(t);
    const key = t.id;
    if (!info.ok) {
      if (shouldAlert(key)) {
        await sendAlert(alertChat, `⚠️ Бот «${t.slug}»: токен недействитен (${info.error})`);
      }
    } else if (!isBotRunning(t.id) && t.active) {
      if (shouldAlert(`${key}-down`)) {
        await sendAlert(alertChat, `⚠️ Бот «${t.slug}» (@${info.username}) не запущен (polling off)`);
      }
    } else {
      lastAlert.delete(key);
      lastAlert.delete(`${key}-down`);
    }
  }
}

function shouldAlert(key) {
  const now = Date.now();
  const prev = lastAlert.get(key) || 0;
  if (now - prev < 3600000) return false;
  lastAlert.set(key, now);
  return true;
}

async function sendAlert(chatIds, text) {
  const token = getSettings().resolveToken();
  if (!token) return;
  const { Bot } = await import("grammy");
  const bot = new Bot(token);
  for (const id of chatIds) {
    try {
      await bot.api.sendMessage(id, text);
    } catch {
      /* ignore */
    }
  }
}
