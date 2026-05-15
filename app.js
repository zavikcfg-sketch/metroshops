/**
 * Telegram-бот (long polling). Админка — http-wrapper.js или start.sh.
 */
import { mainBot } from "./src/index.js";

mainBot().catch((err) => {
  console.error("[metro-shop] Fatal:", err);
  process.exit(1);
});
