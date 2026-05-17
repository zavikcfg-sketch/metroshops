import { FunPayClient, chatNodeId, extractPubgId, stripHtml } from "./client.js";

function parseChatMessage(message) {
  const html = message?.html || "";
  return {
    id: Number(message.id) || 0,
    author: Number(message.author) || 0,
    text: stripHtml(html),
  };
}

/**
 * Сессия FunPay Runner: опрос заказов и чатов для одного golden_key.
 */
export class FunPayRunnerSession {
  constructor(goldenKey) {
    this.client = new FunPayClient(goldenKey);
    this.objects = [];
    this.requests = [];
    this.requestShift = 0;
    this.chatWatchers = new Map();
    this.tenants = new Map();
    this.ordersCounter = null;
    this.timer = null;
    this.running = false;
  }

  registerTenant(tenant, handlers) {
    this.tenants.set(tenant.id, { tenant, ...handlers });
  }

  unregisterTenant(tenantId) {
    this.tenants.delete(tenantId);
  }

  async start() {
    if (this.running) return;
    await this.client.ensureReady();
    const uid = this.client.appData.userId;
    this.objects = [
      { type: "orders_counters", id: uid, tag: "metrobot", data: true },
      { type: "chat_counter", id: uid, tag: "metrobot", data: true },
    ];
    this.running = true;
    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((e) => console.warn("[funpay] runner tick:", e.message));
    }, 5000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  ensureChatNode(buyerId, lastMessage = 0) {
    const node = chatNodeId(this.client.appData.userId, buyerId);
    const existing = this.objects.find((o) => o.type === "chat_node" && o.id === node);
    if (existing) {
      if (lastMessage > (existing.data?.last_message || 0)) {
        existing.data.last_message = lastMessage;
      }
      return node;
    }
    this.objects.push({
      type: "chat_node",
      id: node,
      data: { node, last_message: lastMessage, content: "" },
    });
    return node;
  }

  watchBuyerChat(buyerId, lastMessageId, onMessage) {
    const node = this.ensureChatNode(buyerId, lastMessageId);
    this.chatWatchers.set(node, {
      buyerId: String(buyerId),
      lastMessageId: Number(lastMessageId) || 0,
      onMessage,
    });
    return node;
  }

  async sendMessage(buyerId, text) {
    const last = await this.client.getUserLastMessageId(buyerId);
    await this.client.sendChatMessage(buyerId, text, last);
    return last;
  }

  async tick() {
    if (!this.running) return;

    let objs = this.objects;
    if (objs.length > 6) {
      objs = [objs[0], objs[1], ...objs.slice(2 + this.requestShift, 6 + this.requestShift)];
      this.requestShift += 4;
      if (this.requestShift + 6 >= this.objects.length) this.requestShift = 0;
    }

    const pending = this.requests.length ? this.requests.shift() : null;
    const data = await this.client.runnerPoll(objs, pending);
    if (!data?.objects) return;

    for (const obj of data.objects) {
      if (obj.type === "orders_counters") {
        const prev = JSON.stringify(this.ordersCounter);
        const next = JSON.stringify(obj.data);
        if (prev && prev !== next) {
          for (const { onOrdersChanged } of this.tenants.values()) {
            onOrdersChanged?.().catch?.((e) =>
              console.warn("[funpay] onOrdersChanged:", e.message),
            );
          }
        }
        this.ordersCounter = obj.data;
      }

      if (obj.type === "chat_node" && obj.data?.messages?.length) {
        const node = obj.id;
        const watcher = this.chatWatchers.get(node);
        const chatObj = this.objects.find((o) => o.type === "chat_node" && o.id === node);
        if (chatObj?.data) {
          const last = obj.data.messages[obj.data.messages.length - 1];
          chatObj.data.last_message = last?.id ?? chatObj.data.last_message;
        }
        if (!watcher) continue;

        const sellerId = Number(this.client.appData.userId);
        for (const raw of obj.data.messages) {
          const msg = parseChatMessage(raw);
          if (!msg.id || msg.id <= watcher.lastMessageId) continue;
          if (msg.author === sellerId) continue;
          if (String(msg.author) !== String(watcher.buyerId)) continue;
          watcher.lastMessageId = Math.max(watcher.lastMessageId, msg.id);
          try {
            await watcher.onMessage(msg);
          } catch (e) {
            console.warn("[funpay] chat handler:", e.message);
          }
        }
      }
    }
  }
}
