import path from "path";
import fs from "fs";
import { getSettings, ROOT } from "../config.js";

export function tenantBranding(tenant) {
  return {
    shop_name: tenant.shop_name || tenant.display_name,
    display_name: tenant.display_name,
    theme_accent: tenant.theme_accent || "#b8ff5c",
    theme_bg: tenant.theme_bg || "#050807",
    logo_url: tenant.avatar_path ? publicFileUrl(tenant.avatar_path) : null,
    banner_url: tenant.banner_path ? publicFileUrl(tenant.banner_path) : null,
    promo_title: tenant.promo_title || null,
    promo_ends_at: tenant.promo_ends_at || null,
    reviews_url: tenant.reviews_url,
    metro_shop_url: tenant.metro_shop_url,
  };
}

function publicFileUrl(filePath) {
  const base = getSettings().adminPublicUrl?.replace(/\/$/, "");
  if (!base || !filePath) return null;
  const dataDir = getSettings().dataDir();
  const rel = path.relative(dataDir, filePath).replace(/\\/g, "/");
  if (!rel.startsWith("..")) return `${base}/files/${rel}`;
  return null;
}

export function tenantBrandingDir(botId) {
  const dir = path.join(getSettings().dataDir(), "branding", botId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
