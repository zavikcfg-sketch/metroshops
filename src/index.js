import { startAdminServer } from "./adminServer.js";
import { startBot } from "./bot.js";
import { logPortDiagnostics } from "./port.js";
import { initDb } from "./repository.js";
import { scheduleDailyBackup } from "./services/backup.js";
import { startHealthMonitor } from "./services/monitor.js";

/** Только админка (http-wrapper.js / домен Bothost). */
export async function mainAdmin() {
  initDb();
  await startAdminServer();
}

/** Только Telegram-бот (app.js). */
export async function mainBot() {
  initDb();
  await startBot();
}

/** Локально: админка + бот в одном процессе. */
export async function main() {
  logPortDiagnostics();
  initDb();
  scheduleDailyBackup();
  startHealthMonitor();
  process.on("unhandledRejection", (err) => {
    const msg = err?.error?.message ?? err?.message ?? String(err);
    if (msg.includes("409") || msg.includes("getUpdates")) {
      console.error("[metro-shop] Telegram polling conflict (не падаем):", msg);
      return;
    }
    console.error("[metro-shop] unhandledRejection:", err);
  });
  await startAdminServer();
  await startBot();
}
