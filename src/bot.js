import { startAllBots } from "./botManager.js";
import { initDb } from "./repository.js";
import { startFunPayPoller } from "./services/funpay/poller.js";

export async function startBot() {
  initDb();
  startFunPayPoller();
  await startAllBots();
}
