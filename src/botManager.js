import { Bot, InputFile } from "grammy";
import fs from "fs";
import {
  getTenantById,
  listActiveTenants,
  setTenantActive,
  updateTenant,
} from "./platform/tenants.js";
import { runTenantBot } from "./botHandlers.js";

const runners = new Map();

export function isBotRunning(tenantId) {
  return runners.has(tenantId);
}

export async function applyBotProfile(tenant, avatarPath) {
  const api = new Bot(tenant.telegram_token).api;
  try {
    await api.setMyName(tenant.display_name.slice(0, 64));
  } catch {
    /* optional */
  }
  if (avatarPath && fs.existsSync(avatarPath)) {
    try {
      await api.setMyProfilePhoto({ photo: new InputFile(avatarPath) });
    } catch (e) {
      console.warn(`[metro-shop] Avatar @${tenant.slug}:`, e.message);
    }
  }
}

export async function getBotTelegramInfo(tenant) {
  try {
    const me = await new Bot(tenant.telegram_token).api.getMe();
    return { username: me.username, id: me.id, ok: true };
  } catch (e) {
    return { username: null, ok: false, error: e.message };
  }
}

export async function startTenantBot(tenant) {
  if (!tenant) return { ok: false, error: "Бот не найден" };

  await stopTenantBot(tenant.id);
  setTenantActive(tenant.id, true);
  const fresh = getTenantById(tenant.id);
  if (!fresh) return { ok: false, error: "Бот не найден" };

  try {
    const runner = await runTenantBot(fresh);
    runners.set(fresh.id, runner);
    console.log(`[metro-shop] Started TG bot @${runner.username} (${fresh.slug})`);
    return { ok: true, running: true, username: runner.username };
  } catch (e) {
    console.error(`[metro-shop] Start failed ${fresh.slug}:`, e.message);
    return { ok: false, error: e.message };
  }
}

export async function stopTenantBot(tenantId) {
  const r = runners.get(tenantId);
  if (r) {
    try {
      await r.stop();
    } catch (e) {
      console.warn(`[metro-shop] Stop ${tenantId}:`, e.message);
    }
    runners.delete(tenantId);
    console.log(`[metro-shop] Stopped bot ${tenantId}`);
  }
  return { ok: true, running: false };
}

export async function restartTenantBot(tenantId) {
  const tenant = getTenantById(tenantId);
  if (!tenant) return { ok: false, error: "Бот не найден" };
  await stopTenantBot(tenantId);
  return startTenantBot(tenant);
}

export async function getBotStatus(tenantId) {
  const tenant = getTenantById(tenantId);
  if (!tenant) return { ok: false, error: "Бот не найден" };
  const info = await getBotTelegramInfo(tenant);
  return {
    ok: true,
    running: isBotRunning(tenantId),
    active: tenant.active,
    slug: tenant.slug,
    display_name: tenant.display_name,
    username: info.username,
    telegram_ok: info.ok,
  };
}

export async function startAllBots() {
  const tenants = listActiveTenants();
  if (!tenants.length) {
    console.warn("[metro-shop] Нет активных ботов в tenant_bots");
    return;
  }
  for (const t of tenants) {
    await startTenantBot(t);
  }
}
