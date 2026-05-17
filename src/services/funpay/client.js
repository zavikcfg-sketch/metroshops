const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

export function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, "\n")
    .trim();
}

function decodeAppData(raw) {
  const decoded = raw
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'");
  return JSON.parse(decoded);
}

/** Минимальный клиент FunPay (golden_key из cookies браузера). */
export class FunPayClient {
  constructor(goldenKey) {
    this.goldenKey = String(goldenKey || "").trim();
    this.phpSessId = null;
    this.appData = null;
    this.ready = false;
  }

  cookieHeader() {
    let c = `golden_key=${this.goldenKey}`;
    if (this.phpSessId) c += `; PHPSESSID=${this.phpSessId}`;
    return c;
  }

  captureCookies(res) {
    const raw = res.headers.getSetCookie?.() || [];
    const list = raw.length ? raw : [];
    const single = res.headers.get("set-cookie");
    if (single && !list.length) list.push(single);
    for (const line of list) {
      const part = String(line).split(";")[0];
      if (part.startsWith("PHPSESSID=")) {
        this.phpSessId = part.slice("PHPSESSID=".length);
      }
    }
  }

  async fetchPage(route = "") {
    const url = route ? `https://funpay.com/${route.replace(/^\//, "")}` : "https://funpay.com/";
    const headers = {
      "User-Agent": UA,
      Cookie: this.cookieHeader(),
      Accept: "text/html,application/xhtml+xml",
    };

    let res = await fetch(url, { method: "GET", headers });
    this.captureCookies(res);
    if (!res.ok) {
      res = await fetch(url, { method: "POST", headers });
      this.captureCookies(res);
    }
    if (!res.ok) throw new Error(`FunPay HTTP ${res.status}`);
    const html = await res.text();
    if (
      /Войти|Log in/i.test(html) &&
      !html.includes("data-app-data") &&
      String(route).includes("orders")
    ) {
      throw new Error("FunPay: сессия истекла — обновите golden_key в админке");
    }
    return html;
  }

  async init() {
    const html = await this.fetchPage();
    if (/Войти|Log in/i.test(html) && !html.includes("data-app-data")) {
      throw new Error("FunPay: неверный golden_key (страница входа)");
    }
    const m = html.match(/data-app-data="([^"]+)"/);
    if (!m) throw new Error("FunPay: не удалось авторизоваться (проверьте golden_key)");
    this.appData = decodeAppData(m[1]);
    this.ready = true;
    return this.appData;
  }

  async ensureReady() {
    if (!this.ready) await this.init();
    return this.appData;
  }

  parseOrderBlock(block) {
    const orderM =
      block.match(/class="tc-order"[^>]*>\s*#?(\d+)/i) ||
      block.match(/\/orders\/(\d+)\//);
    if (!orderM) return null;
    const orderId = orderM[1];

    const userM = block.match(/data-href="\/users\/(\d+)\//);
    const userId = userM ? userM[1] : null;

    const dateM = block.match(/class="tc-date-time"[^>]*>([^<]+)</);
    const statusM = block.match(/class="tc-status"[^>]*>([^<]+)</);

    let product = "";
    const descM = block.match(/class="order-desc"[^>]*>[\s\S]*?<div[^>]*>([^<]+)</i);
    if (descM) product = stripHtml(descM[1]);
    if (!product) {
      const alt = block.match(/class="order-desc"[^>]*>([^<]+)</);
      if (alt) product = stripHtml(alt[1]);
    }

    let amount = 1;
    const parts = product.split(", ");
    if (parts.length > 1 && /\d+\s*шт\./i.test(parts.at(-1))) {
      const am = parts.at(-1).match(/(\d+)/);
      if (am) amount = Number(am[1]);
      product = parts.slice(0, -1).join(", ");
    }

    return {
      orderId,
      userId,
      date: dateM ? stripHtml(dateM[1]) : "",
      status: statusM ? stripHtml(statusM[1]) : "",
      product,
      amount,
    };
  }

  parseOrdersFromTradeHtml(html, onlyNew = false) {
    const orders = [];
    const seen = new Set();
    const chunks = html.split(/class="tc-item/i);
    for (let i = 1; i < chunks.length; i++) {
      const chunk = `class="tc-item${chunks[i]}`;
      if (onlyNew && !/tc-item\s+info|tc-item-info/i.test(chunk.slice(0, 80))) continue;
      const end = chunk.indexOf("</a>");
      const block = end === -1 ? chunk.slice(0, 4000) : chunk.slice(0, end);
      const parsed = this.parseOrderBlock(block);
      if (!parsed || seen.has(parsed.orderId)) continue;
      seen.add(parsed.orderId);
      orders.push(parsed);
    }
    if (!orders.length) {
      for (const m of html.matchAll(/tc-item[\s\S]{0,3500}?\/orders\/(\d+)\//gi)) {
        const parsed = this.parseOrderBlock(m[0]);
        if (!parsed || seen.has(parsed.orderId)) continue;
        seen.add(parsed.orderId);
        orders.push(parsed);
      }
    }
    return orders;
  }

  async getNewOrders() {
    await this.ensureReady();
    const html = await this.fetchPage("orders/trade");
    return this.parseOrdersFromTradeHtml(html, true);
  }

  async getLastOrders(limit = 40) {
    await this.ensureReady();
    const html = await this.fetchPage("orders/trade");
    return this.parseOrdersFromTradeHtml(html, false).slice(0, limit);
  }

  async post(route, data) {
    await this.ensureReady();
    const body = { ...data, csrf_token: this.appData["csrf-token"] };
    const res = await fetch(`https://funpay.com/${route.replace(/^\//, "")}`, {
      method: "POST",
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        "User-Agent": UA,
        Cookie: this.cookieHeader(),
      },
      body: Object.keys(body)
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(body[k])}`)
        .join("&"),
    });
    this.captureCookies(res);
    return res.text();
  }

  async getUserLastMessageId(buyerId) {
    const node = chatNodeId(this.appData.userId, buyerId);
    const html = await this.fetchPage(`chat/?node=${node}`);
    const ids = [...html.matchAll(/chat-msg-(\d+)/g)].map((m) => Number(m[1]));
    return ids.length ? Math.max(...ids) : 0;
  }

  async sendChatMessage(buyerId, text, lastMessageId = 0) {
    await this.ensureReady();
    const node = chatNodeId(this.appData.userId, buyerId);
    const last = lastMessageId || (await this.getUserLastMessageId(buyerId));
    const payload = {
      objects: JSON.stringify([
        { type: "orders_counters", id: this.appData.userId, tag: "metrobot", data: true },
        {
          type: "chat_node",
          id: node,
          data: { node, last_message: last, content: "" },
        },
      ]),
      request: JSON.stringify({
        action: "chat_message",
        data: { node, last_message: last + 1, content: text },
      }),
    };
    await this.post("runner/", payload);
    return last + 1;
  }

  async runnerPoll(objects, pendingRequest = null) {
    await this.ensureReady();
    const payload = {
      objects: JSON.stringify(objects),
      request: pendingRequest ? JSON.stringify(pendingRequest) : "false",
    };
    const raw = await this.post("runner/", payload);
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async getOrderDetails(orderId) {
    await this.ensureReady();
    const html = await this.fetchPage(`orders/${orderId}/`);

    const buyerM =
      html.match(/class="media-user-name"[^>]*>[\s\S]*?<a[^>]*>([^<]+)</i) ||
      html.match(/class="media-user-name"[^>]*>([^<]+)</i);
    const buyerName = buyerM ? stripHtml(buyerM[1]) : null;
    const buyerIdM =
      html.match(/class="param-item chat-panel"[^>]*data-id="(\d+)"/) ||
      html.match(/data-href="\/users\/(\d+)\/"/);
    const buyerFunpayId = buyerIdM ? buyerIdM[1] : null;

    const descBlocks = [];
    const descRe = /class="order-desc"[^>]*>([\s\S]*?)<\/div>/gi;
    let dm;
    while ((dm = descRe.exec(html))) {
      descBlocks.push(stripHtml(dm[1]));
    }
    if (!descBlocks.length) {
      const alt = html.match(/class="order-desc"[^>]*>([\s\S]*?)<\/div>/i);
      if (alt) descBlocks.push(stripHtml(alt[1]));
    }
    const description = descBlocks.filter(Boolean).join("\n\n") || "";

    const pubgId = extractPubgId(description);

    return {
      orderId: String(orderId),
      buyerName,
      buyerFunpayId,
      description,
      pubgId,
    };
  }
}

export function chatNodeId(userA, userB) {
  const a = parseInt(userA, 10);
  const b = parseInt(userB, 10);
  return a < b ? `users-${a}-${b}` : `users-${b}-${a}`;
}

export function extractPubgId(text) {
  const t = String(text || "");
  const labeled =
    t.match(/(?:player\s*id|id\s*игрока|айди|pubg)[:\s#]*(\d{5,15})/i) ||
    t.match(/(?:ник|nickname)[:\s]*([^\n,]{3,32})/i);
  if (labeled) return labeled[1].trim();
  const nums = t.match(/\b(\d{8,12})\b/);
  return nums ? nums[1] : null;
}

/** Заказ с FunPay «свежий» (сегодня / несколько минут назад). */
export function isLikelyNewFunpayOrder(dateLabel) {
  const d = String(dateLabel || "").toLowerCase();
  if (!d) return true;
  if (/вчера|yesterday|\d{2}\.\d{2}\.\d{4}/.test(d)) return false;
  if (/сегодня|today|только что|мин\.|минут|час|hour|sec|сек/i.test(d)) return true;
  if (/\d{2}\.\d{2}\.\d{2}/.test(d)) {
    const m = d.match(/(\d{2})\.(\d{2})\.(\d{2,4})/);
    if (m) {
      const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      const dt = new Date(year, Number(m[2]) - 1, Number(m[1]));
      const diff = Date.now() - dt.getTime();
      return diff >= 0 && diff < 48 * 3600 * 1000;
    }
  }
  return true;
}

export function isPaidFunpayStatus(status) {
  const s = String(status || "").toLowerCase();
  if (!s) return true;
  if (/возврат|refund|отмен|cancel/i.test(s)) return false;
  return true;
}
