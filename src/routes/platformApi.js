import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getSettings } from "../config.js";
import {
  createTenant,
  deleteTenant,
  getTenantById,
  listTenants,
  tenantAvatarsDir,
  updateTenant,
} from "../platform/tenants.js";
import { applyBotProfile, restartTenantBot, startTenantBot, stopTenantBot } from "../botManager.js";

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function checkSuperAuth(req, res, next) {
  const secret = getSettings().superAdminPassword?.trim();
  if (!secret) return res.status(503).json({ detail: "Задайте SUPER_ADMIN_PASSWORD" });
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ detail: "Требуется авторизация" });
  }
  if (!safeEqual(auth.slice(7).trim(), secret)) {
    return res.status(401).json({ detail: "Неверный пароль" });
  }
  next();
}

export function mountPlatformApi(router) {
  router.post("/auth/login", (req, res) => {
    const secret = getSettings().superAdminPassword?.trim();
    if (!secret) return res.status(503).json({ detail: "SUPER_ADMIN_PASSWORD не задан" });
    if (!safeEqual(String(req.body?.password ?? ""), secret)) {
      return res.status(401).json({ detail: "Неверный пароль" });
    }
    return res.json({ token: secret, role: "platform" });
  });

  router.get("/bots", checkSuperAuth, (req, res) => {
    const base = `${req.protocol}://${req.get("host")}`;
    const items = listTenants().map((t) => ({
      id: t.id,
      slug: t.slug,
      display_name: t.display_name,
      shop_name: t.shop_name,
      active: t.active,
      created_at: t.created_at,
      admin_url: `${base}/b/${t.slug}/`,
    }));
    res.json({ items });
  });

  router.post("/bots", checkSuperAuth, async (req, res) => {
    const token = String(req.body?.token ?? req.body?.telegram_token ?? "").trim();
    const displayName = String(req.body?.display_name ?? req.body?.name ?? "").trim();
    const adminPassword = String(req.body?.admin_password ?? "").trim();

    if (!token || !displayName) {
      return res.status(400).json({ detail: "Нужны token и display_name" });
    }

    try {
      const { Bot } = await import("grammy");
      const probe = new Bot(token);
      const me = await probe.api.getMe();
      await probe.api.deleteWebhook({ drop_pending_updates: false });

      let avatarPath = null;
      const avatarB64 = req.body?.avatar_base64;
      if (avatarB64 && typeof avatarB64 === "string") {
        const buf = Buffer.from(avatarB64.replace(/^data:image\/\w+;base64,/, ""), "base64");
        const dir = path.join(getSettings().dataDir(), "avatars", "pending");
        fs.mkdirSync(dir, { recursive: true });
        avatarPath = path.join(dir, `${Date.now()}.jpg`);
        fs.writeFileSync(avatarPath, buf);
      }

      const { tenant, adminPassword: pwd, adminUrl } = createTenant({
        token,
        displayName,
        adminPassword: adminPassword || undefined,
        avatarPath,
      });

      if (avatarPath) {
        const finalDir = tenantAvatarsDir(tenant.id);
        const finalPath = path.join(finalDir, "avatar.jpg");
        fs.renameSync(avatarPath, finalPath);
        updateTenant(tenant.id, { avatar_path: finalPath });
        tenant.avatar_path = finalPath;
      }

      await applyBotProfile(tenant, tenant.avatar_path);
      await startTenantBot(getTenantById(tenant.id));

      const base = `${req.protocol}://${req.get("host")}`;
      res.json({
        ok: true,
        bot: {
          id: tenant.id,
          slug: tenant.slug,
          display_name: tenant.display_name,
          username: me.username,
        },
        admin_url: `${base}${adminUrl}`,
        admin_password: pwd,
      });
    } catch (e) {
      console.error("[platform] create bot:", e);
      res.status(400).json({ detail: e.message || "Не удалось создать бота" });
    }
  });

  router.delete("/bots/:id", checkSuperAuth, async (req, res) => {
    await stopTenantBot(req.params.id);
    if (!deleteTenant(req.params.id)) {
      return res.status(404).json({ detail: "Не найден" });
    }
    res.json({ ok: true });
  });

  router.post("/bots/:id/restart", checkSuperAuth, async (req, res) => {
    await restartTenantBot(req.params.id);
    res.json({ ok: true });
  });
}
