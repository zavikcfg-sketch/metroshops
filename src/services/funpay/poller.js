import { listActiveTenants } from "../../platform/tenants.js";
import { getBotRunner } from "../../botManager.js";
import { FunPayClient } from "./client.js";
import {
  funpayOrderExists,
  insertFunpayOrder,
  updateFunpayOrderMessage,
} from "./repository.js";
import { sendFunpayEscortCard } from "./notify.js";
import { initFunpaySchema } from "./repository.js";

const clients = new Map();
let timer = null;

function tenantFunpayEnabled(t) {
  return (
    !!t.funpay_enabled &&
    String(t.funpay_golden_key || "").trim().length > 8 &&
    String(t.funpay_escort_chat_id || "").trim().length > 0
  );
}

function listFunpayTenants() {
  return listActiveTenants().filter(tenantFunpayEnabled);
}

async function getClient(goldenKey) {
  const key = goldenKey.trim();
  let c = clients.get(key);
  if (!c) {
    c = new FunPayClient(key);
    clients.set(key, c);
  }
  try {
    await c.ensureReady();
  } catch (e) {
    clients.delete(key);
    throw e;
  }
  return c;
}

async function processTenant(tenant) {
  const runner = getBotRunner(tenant.id);
  if (!runner?.bot) {
    return;
  }

  let client;
  try {
    client = await getClient(tenant.funpay_golden_key);
  } catch (e) {
    console.warn(`[funpay] auth @${tenant.slug}:`, e.message);
    return;
  }

  let orders;
  try {
    orders = await client.getNewOrders();
  } catch (e) {
    console.warn(`[funpay] orders @${tenant.slug}:`, e.message);
    return;
  }

  for (const brief of orders) {
    if (funpayOrderExists(tenant.id, brief.orderId)) continue;

    let details = {
      description: brief.product,
      buyerName: null,
      buyerFunpayId: brief.userId,
      pubgId: null,
    };
    try {
      details = await client.getOrderDetails(brief.orderId);
      if (!details.buyerFunpayId && brief.userId) {
        details.buyerFunpayId = brief.userId;
      }
    } catch (e) {
      console.warn(`[funpay] details #${brief.orderId}:`, e.message);
    }

    const description =
      details.description ||
      [brief.product, brief.status ? `Статус: ${brief.status}` : ""].filter(Boolean).join("\n");

    let row = insertFunpayOrder(tenant.id, {
      funpayOrderId: brief.orderId,
      product: brief.product,
      buyerFunpayId: details.buyerFunpayId || brief.userId,
      buyerName: details.buyerName,
      description,
      pubgId: details.pubgId,
      amount: brief.amount,
    });

    try {
      const sent = await sendFunpayEscortCard(runner.bot, tenant, row);
      if (sent) {
        updateFunpayOrderMessage(
          tenant.id,
          brief.orderId,
          sent.chatId,
          sent.messageId,
        );
        console.log(
          `[funpay] @${tenant.slug}: заказ #${brief.orderId} → группа ${sent.chatId}`,
        );
      }
    } catch (e) {
      console.warn(`[funpay] notify #${brief.orderId}:`, e.message);
    }
  }
}

async function tick() {
  const tenants = listFunpayTenants();
  for (const t of tenants) {
    try {
      await processTenant(t);
    } catch (e) {
      console.warn(`[funpay] tenant ${t.slug}:`, e.message);
    }
  }
}

export function startFunPayPoller() {
  initFunpaySchema();
  const ms = Math.max(15000, Number(process.env.FUNPAY_POLL_MS) || 35000);
  if (timer) return;
  console.log(`[funpay] Poller каждые ${ms} мс`);
  tick().catch((e) => console.warn("[funpay] first tick:", e.message));
  timer = setInterval(() => {
    tick().catch((e) => console.warn("[funpay] tick:", e.message));
  }, ms);
}

export function stopFunPayPoller() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
