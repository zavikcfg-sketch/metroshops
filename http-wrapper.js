/**
 * Точка входа Bothost: админка на PORT + Telegram-бот.
 * Домен: https://adminpanelbots.bothost.tech
 */
import { main } from "./src/index.js";

const port = process.env.PORT || "8080";
console.log(`[metro-shop] http-wrapper starting, PORT=${port}`);

main().catch((err) => {
  console.error("[metro-shop] Fatal:", err);
  process.exit(1);
});
