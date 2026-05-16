/**
 * Bothost: https://adminpanelbots.bothost.tech
 * Админка (HTTP) + Telegram-бот в одном процессе.
 */
import { logPortDiagnostics } from "./src/port.js";
import { main } from "./src/index.js";

logPortDiagnostics();

main().catch((err) => {
  console.error("[metro-shop] Fatal:", err);
  process.exit(1);
});
