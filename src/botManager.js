import { Bot, InputFile } from "grammy";
import fs from "fs";
import { listActiveTenants, getTenantById } from "./platform/tenants.js";
import { runTenantBot } from "./botHandlers.js";

const runners = new Map();

export async function applyBotProfile(tenant, avatarPath) {
  const api = new Bot(tenant.telegram_token).api;
  try {
    await api.setMyName(tenant.display_name.slice(0, 64));
  } catch {
    /* Bot API may ignore name for some bots */
  }
  if (avatarPath && fs.existsSync(avatarPath)) {
    try {
      await api.setMyProfilePhoto({ photo: new InputFile(avatarPath) });
    } catch (e) {
      console.warn(`[metro-shop] Avatar @${tenant.slug}:`, e.message);
    }
  }
}

export async function startTenantBot(tenant) {
  if (!tenant?.active) return null;
  if (runners.has(tenant.id)) return runners.get(tenant.id);

  try {
    const runner = await runTenantBot(tenant);
    runners.set(tenant.id, runner);
    return runner;
  } catch (e) {
    console.error(`[metro-shop] Start failed ${tenant.slug}:`, e.message);
    return null;
  }
}

export async function stopTenantBot(tenantId) {
  const r = runners.get(tenantId);
  if (!r) return;
  try {
    await r.stop();
  } catch {
    /* ignore */
  }
  runners.delete(tenantId);
}

export async function restartTenantBot(tenantId) {
  await stopTenantBot(tenantId);
  const tenant = getTenantById(tenantId);
  if (tenant) await startTenantBot(tenant);
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
