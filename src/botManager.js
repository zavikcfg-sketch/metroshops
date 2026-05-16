import { Bot, InputFile } from "grammy";
import fs from "fs";
import {
  getTenantById,
  listActiveTenants,
  listOtherTenantsWithToken,
  setTenantActive,
  updateTenant,
} from "./platform/tenants.js";
import { runTenantBot } from "./botHandlers.js";

const runners = new Map();

export function isBotRunning(tenantId) {
  return runners.has(tenantId);
}

/** Один токен Telegram = один polling. При дублях в БД оставляем main или самый старый. */
function pickOneTenantPerToken(tenants) {
  const byToken = new Map();
  const skipped = [];

  for (const t of tenants) {
    const key = t.telegram_token.trim();
    const prev = byToken.get(key);
    if (!prev) {
      byToken.set(key, t);
      continue;
    }
    if (t.id === "main") {
      skipped.push(prev.slug);
      byToken.set(key, t);
    } else if (prev.id === "main") {
      skipped.push(t.slug);
    } else {
      skipped.push(t.slug);
    }
  }

  if (skipped.length) {
    console.warn(
      `[metro-shop] Один токен — один бот в Telegram. Не запускаем: ${[...new Set(skipped)].join(", ")}. Удалите дубли в /platform или выдайте им разные токены.`,
    );
  }
  return [...byToken.values()];
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

  const token = tenant.telegram_token.trim();
  for (const other of listOtherTenantsWithToken(token, tenant.id)) {
    if (runners.has(other.id)) {
      await stopTenantBot(other.id);
      console.warn(
        `[metro-shop] Остановлен «${other.slug}» — тот же токен, что у «${tenant.slug}»`,
      );
    }
  }

  await stopTenantBot(tenant.id);
  setTenantActive(tenant.id, true);
  const fresh = getTenantById(tenant.id);
  if (!fresh) return { ok: false, error: "Бот не найден" };

  try {
    const runner = await runTenantBot(fresh);
    runner.startPromise?.catch((err) => {
      const msg = err?.error?.message ?? err?.message ?? String(err);
      console.error(`[metro-shop] Polling упал @${fresh.slug}:`, msg);
      runners.delete(fresh.id);
    });
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
  const dupes = listOtherTenantsWithToken(tenant.telegram_token, tenant.id);
  return {
    ok: true,
    running: isBotRunning(tenantId),
    active: tenant.active,
    slug: tenant.slug,
    display_name: tenant.display_name,
    username: info.username,
    telegram_ok: info.ok,
    token_shared_with: dupes.map((d) => d.slug),
  };
}

export async function startAllBots() {
  const tenants = pickOneTenantPerToken(listActiveTenants());
  if (!tenants.length) {
    console.warn("[metro-shop] Нет активных ботов в tenant_bots");
    return;
  }
  for (const t of tenants) {
    await startTenantBot(t);
  }
}
