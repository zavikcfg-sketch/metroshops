/**
 * Точка входа Bothost / Docker: node app.js
 * Запускает админку (Express) и Telegram-бота (Grammy).
 */
import { main } from "./src/index.js";

main().catch((err) => {
  console.error("[metro-shop] Fatal:", err);
  process.exit(1);
});
