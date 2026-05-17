import { startAllBots } from "./botManager.js";
import { initDb } from "./repository.js";
export async function startBot() {
  initDb();
  await startAllBots();
}
