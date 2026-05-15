/**
 * HTTP-обёртка для Bothost (домен / админ-панель).
 * Слушает PORT из панели — на него смотрит https://*.bothost.tech
 */
import { mainAdmin } from "./src/index.js";

mainAdmin().catch((err) => {
  console.error("[metro-shop] http-wrapper fatal:", err);
  process.exit(1);
});
