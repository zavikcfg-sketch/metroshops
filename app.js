/** То же, что http-wrapper.js — админка + бот. */
import { main } from "./src/index.js";

main().catch((err) => {
  console.error("[metro-shop] Fatal:", err);
  process.exit(1);
});
