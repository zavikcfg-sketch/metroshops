/**
 * Bothost: https://adminpanelbots.bothost.tech
 * Админка (HTTP) + Telegram-бот в одном процессе.
 */
import { logPortDiagnostics } from "./src/port.js";
import { main } from "./src/index.js";

logPortDiagnostics();

process.on("unhandledRejection", (err) => {
  const msg = err?.error?.message ?? err?.message ?? String(err);
  if (msg.includes("409") || msg.includes("getUpdates")) {
    console.error("[metro-shop] Telegram polling conflict (процесс не падает):", msg);
    return;
  }
  console.error("[metro-shop] unhandledRejection:", err);
});

main().catch((err) => {
  console.error("[metro-shop] Fatal:", err);
  process.exit(1);
});
