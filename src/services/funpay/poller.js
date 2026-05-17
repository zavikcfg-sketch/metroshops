import { listActiveTenants } from "../../platform/tenants.js";
import { getBotRunner } from "../../botManager.js";
import { isPaidFunpayStatus, isLikelyNewFunpayOrder, extractPubgId } from "./client.js";
import {
  funpayOrderExists,
  insertFunpayOrder,
  updateFunpayOrderMessage,
  getAwaitingFunpayOrder,
  setFunpayOrderPubgId,
  listAwaitingFunpayOrders,
} from "./repository.js";
import { sendFunpayEscortCard } from "./notify.js";
import { initFunpaySchema } from "./repository.js";
import { FunPayRunnerSession } from "./runnerSession.js";
import {
  FUNPAY_ASK_PLAYER_ID,
  FUNPAY_INVALID_ID,
  FUNPAY_ID_RECEIVED,
} from "./messages.js";

const sessions = new Map();
let orderScanTimer = null;

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

function getSession(goldenKey) {
  const key = goldenKey.trim();
  let session = sessions.get(key);
  if (!session) {
    session = new FunPayRunnerSession(key);
    sessions.set(key, session);
    session.start().catch((e) => {
      console.warn("[funpay] session start:", e.message);
      sessions.delete(key);
    });
  }
  return session;
}

function syncSessions() {
  const tenants = listFunpayTenants();
  const activeKeys = new Set();

  for (const tenant of tenants) {
    const key = tenant.funpay_golden_key.trim();
    activeKeys.add(key);
    const session = getSession(key);
    session.registerTenant(tenant, {
      onOrdersChanged: () => scanOrdersForTenant(tenant, session, { forceTop: true }),
    });
    scanOrdersForTenant(tenant, session).catch((e) =>
      console.warn(`[funpay] scan @${tenant.slug}:`, e.message),
    );
    restoreAwaitingChats(tenant, session);
  }

  for (const [key, session] of sessions) {
    if (!activeKeys.has(key)) {
      session.stop();
      sessions.delete(key);
    }
  }
}

function restoreAwaitingChats(tenant, session) {
  for (const order of listAwaitingFunpayOrders(tenant.id)) {
    if (!order.buyer_funpay_id) continue;
    attachBuyerWatcher(tenant, session, order.buyer_funpay_id);
  }
}

function attachBuyerWatcher(tenant, session, buyerId) {
  session.client
    .getUserLastMessageId(buyerId)
    .then((lastMsg) => {
      session.watchBuyerChat(buyerId, lastMsg, (msg) =>
        onBuyerFunpayMessage(tenant, session, buyerId, msg),
      );
    })
    .catch((e) => console.warn(`[funpay] watch buyer ${buyerId}:`, e.message));
}

async function onBuyerFunpayMessage(tenant, session, buyerId, msg) {
  const order = getAwaitingFunpayOrder(tenant.id, buyerId);
  if (!order) return;

  const pubgId = extractPubgId(msg.text);
  if (!pubgId) {
    try {
      const last = await session.client.getUserLastMessageId(buyerId);
      await session.client.sendChatMessage(buyerId, FUNPAY_INVALID_ID, last);
    } catch (e) {
      console.warn(`[funpay] invalid-id reply:`, e.message);
    }
    return;
  }

  const updated = setFunpayOrderPubgId(tenant.id, order.funpay_order_id, pubgId);

  try {
    const last = await session.client.getUserLastMessageId(buyerId);
    await session.client.sendChatMessage(buyerId, FUNPAY_ID_RECEIVED, last);
  } catch (e) {
    console.warn(`[funpay] thanks reply:`, e.message);
  }

  const runner = getBotRunner(tenant.id);
  if (!runner?.bot) {
    console.warn(`[funpay] @${tenant.slug}: бот не запущен — карточка не отправлена`);
    return;
  }

  try {
    const sent = await sendFunpayEscortCard(runner.bot, tenant, updated);
    if (sent) {
      updateFunpayOrderMessage(
        tenant.id,
        order.funpay_order_id,
        sent.chatId,
        sent.messageId,
      );
      console.log(
        `[funpay] @${tenant.slug}: #${order.funpay_order_id} Player ID ${pubgId} → группа`,
      );
    }
  } catch (e) {
    console.warn(`[funpay] card #${order.funpay_order_id}:`, e.message);
  }
}

async function startOrderFlow(tenant, session, brief, details) {
  if (!brief.userId) {
    console.warn(`[funpay] #${brief.orderId}: нет buyer userId`);
    return;
  }

  const description =
    details.description ||
    [brief.product, brief.status ? `Статус: ${brief.status}` : ""].filter(Boolean).join("\n");

  insertFunpayOrder(tenant.id, {
    funpayOrderId: brief.orderId,
    product: brief.product,
    buyerFunpayId: details.buyerFunpayId || brief.userId,
    buyerName: details.buyerName,
    description,
    pubgId: details.pubgId || null,
    amount: brief.amount,
    status: "awaiting_id",
  });

  let lastMsg = 0;
  try {
    lastMsg = await session.client.getUserLastMessageId(brief.userId);
    await session.client.sendChatMessage(brief.userId, FUNPAY_ASK_PLAYER_ID, lastMsg);
    console.log(`[funpay] @${tenant.slug}: #${brief.orderId} — запрос ID в чате FunPay`);
  } catch (e) {
    console.warn(`[funpay] ask id #${brief.orderId}:`, e.message);
  }

  session.watchBuyerChat(brief.userId, lastMsg, (msg) =>
    onBuyerFunpayMessage(tenant, session, brief.userId, msg),
  );

  if (details.pubgId) {
    await onBuyerFunpayMessage(tenant, session, brief.userId, {
      id: lastMsg + 1,
      author: Number(brief.userId),
      text: details.pubgId,
    });
  }
}

async function scanOrdersForTenant(tenant, session, opts = {}) {
  const runner = getBotRunner(tenant.id);
  if (!runner?.bot) return;

  let orders;
  try {
    orders = await session.client.getLastOrders(opts.forceTop ? 8 : 50);
  } catch (e) {
    console.warn(`[funpay] orders @${tenant.slug}:`, e.message);
    return;
  }

  const list = opts.forceTop ? orders.slice(0, 5) : orders;

  for (const brief of list) {
    if (funpayOrderExists(tenant.id, brief.orderId)) continue;
    if (!isPaidFunpayStatus(brief.status)) continue;

    if (!opts.forceTop && !isLikelyNewFunpayOrder(brief.date)) {
      insertFunpayOrder(tenant.id, {
        funpayOrderId: brief.orderId,
        product: brief.product,
        buyerFunpayId: brief.userId,
        description: brief.product,
        amount: brief.amount,
        status: "ignored",
      });
      continue;
    }

    let details = {
      description: brief.product,
      buyerName: null,
      buyerFunpayId: brief.userId,
      pubgId: null,
    };
    try {
      details = await session.client.getOrderDetails(brief.orderId);
      if (!details.buyerFunpayId && brief.userId) {
        details.buyerFunpayId = brief.userId;
      }
    } catch (e) {
      console.warn(`[funpay] details #${brief.orderId}:`, e.message);
    }

    await startOrderFlow(tenant, session, brief, details);
  }
}

async function tick() {
  syncSessions();
}

export function startFunPayPoller() {
  initFunpaySchema();
  const ms = Math.max(15000, Number(process.env.FUNPAY_POLL_MS) || 35000);
  if (orderScanTimer) return;
  console.log(
    `[funpay] Режим: запрос Player ID в чате FunPay → карточка в группу (скан ${ms} мс)`,
  );
  tick().catch((e) => console.warn("[funpay] first tick:", e.message));
  orderScanTimer = setInterval(() => {
    tick().catch((e) => console.warn("[funpay] tick:", e.message));
  }, ms);
}

export function stopFunPayPoller() {
  if (orderScanTimer) {
    clearInterval(orderScanTimer);
    orderScanTimer = null;
  }
  for (const session of sessions.values()) session.stop();
  sessions.clear();
}
