import { startAdminServer } from "./adminServer.js";
import { startBot } from "./bot.js";
import { initDb } from "./repository.js";

export async function main() {
  initDb();
  await startAdminServer();
  await startBot();
}
