import fs from "fs";
import path from "path";
import { getSettings } from "../config.js";

export function backupDatabase() {
  const dir = getSettings().dataDir();
  const src = path.join(dir, "shop.db");
  if (!fs.existsSync(src)) return null;
  const backupDir = path.join(dir, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupDir, `shop-${stamp}.db`);
  fs.copyFileSync(src, dest);
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".db"))
    .map((f) => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const old of files.slice(14)) {
    try {
      fs.unlinkSync(path.join(backupDir, old.f));
    } catch {
      /* ignore */
    }
  }
  console.log(`[metro-shop] DB backup: ${dest}`);
  return dest;
}

export function scheduleDailyBackup() {
  backupDatabase();
  setInterval(backupDatabase, 24 * 60 * 60 * 1000);
}
