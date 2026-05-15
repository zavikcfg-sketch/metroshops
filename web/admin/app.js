/**
 * Bothost может запускать: node web/admin/app.js
 */
import { main } from "../../src/index.js";

main().catch((err) => {
  console.error("[metro-shop] Fatal:", err);
  process.exit(1);
});
