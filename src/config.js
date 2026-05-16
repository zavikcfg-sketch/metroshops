import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

const envPaths = [path.join(ROOT, ".env"), path.join(process.cwd(), ".env")];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

function env(key, fallback = "") {
  return (process.env[key] ?? fallback).trim();
}

export function getSettings() {
  return {
    telegramBotToken: env("TELEGRAM_BOT_TOKEN") || env("BOT_TOKEN"),
    telegramBotTokenFile: env("TELEGRAM_BOT_TOKEN_FILE") || env("BOT_TOKEN_FILE"),
    adminIds: env("ADMIN_IDS"),
    adminPassword: env("ADMIN_PASSWORD"),
    adminPort: Number(env("ADMIN_PORT", "3000")) || 3000,
    telegramBotUsername: env("TELEGRAM_BOT_USERNAME"),
    shopName: env("SHOP_NAME", "WIXYEZ METRO SHOP"),
    supportContact: env("SUPPORT_CONTACT", "@your_support"),
    channelUsername: env("CHANNEL_USERNAME"),
    websiteUrl: env("WEBSITE_URL"),
    metroShopUrl: env("METRO_SHOP_URL", "https://t.me/KotikexsMetroShop"),
    reviewsUrl: env("REVIEWS_URL", "https://t.me/KotikexsMetroShopOtziv"),
    adminPublicUrl: env("ADMIN_PUBLIC_URL", "https://adminpanelbots.bothost.tech"),
    bannerPath: env("BANNER_PATH", "assets/banner.png"),
    paycoreApiBaseUrl: env("PAYCORE_API_BASE_URL"),
    paycorePublicKey: env("PAYCORE_PUBLIC_KEY"),
    paycorePaymentService: env("PAYCORE_PAYMENT_SERVICE"),
    paycoreCurrency: env("PAYCORE_CURRENCY", "RUB"),
    paycoreMode: env("PAYCORE_MODE", "demo"),
    resolveToken() {
      if (this.telegramBotToken) return this.telegramBotToken;
      if (!this.telegramBotTokenFile) return "";
      const fp = path.isAbsolute(this.telegramBotTokenFile)
        ? this.telegramBotTokenFile
        : path.join(ROOT, this.telegramBotTokenFile);
      if (!fs.existsSync(fp)) return "";
      return fs.readFileSync(fp, "utf8").trim();
    },
    adminIdList() {
      if (!this.adminIds) return [];
      return this.adminIds
        .replace(/;/g, ",")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s))
        .map(Number);
    },
    dataDir() {
      const raw = env("DATA_DIR");
      return raw ? path.resolve(raw) : path.join(ROOT, "data");
    },
    bannerFile() {
      const p = this.bannerPath || "assets/banner.png";
      return path.isAbsolute(p) ? p : path.join(ROOT, p);
    },
    resolvedAdminPort() {
      const port = env("PORT") || env("ADMIN_PORT");
      if (/^\d+$/.test(port)) return Number(port);
      return this.adminPort;
    },
    paycoreEnabled() {
      if (this.paycoreMode.toLowerCase() === "demo") return true;
      return !!(this.paycorePublicKey && this.paycoreApiBaseUrl && this.paycorePaymentService);
    },
  };
}
