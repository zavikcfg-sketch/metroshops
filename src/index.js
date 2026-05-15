import { startAdminServer } from "./adminServer.js";
import { startBot } from "./bot.js";
import { initDb } from "./repository.js";

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
  initDb();
  await startAdminServer();
  await startBot();
}
