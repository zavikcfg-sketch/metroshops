/**
 * Bothost может запускать node web/admin/app.js — перенаправляем на http-wrapper.
 */
import { mainAdmin } from "../../src/index.js";

mainAdmin().catch((err) => {
  console.error("[metro-shop] Fatal:", err);
  process.exit(1);
});
