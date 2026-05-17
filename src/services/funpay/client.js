const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

/** FunPay: числовые (#12345) и новые буквенно-цифровые (#B7LS3KMY) ID заказов. */
export const FUNPAY_ORDER_ID_PATTERN = "[A-Za-z0-9]{4,20}";
const ORDER_ID_IN_TEXT = new RegExp(`#?(${FUNPAY_ORDER_ID_PATTERN})`, "i");
const ORDER_ID_IN_URL = new RegExp(`/orders/(${FUNPAY_ORDER_ID_PATTERN})(?:/|"|'|\\?|$)`, "i");
const SKIP_ORDER_PATHS = new Set(["trade", "new", "list", "offer"]);

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
    this.lastTradeDebug = null;
  }

  cookieHeader() {
    let c = `golden_key=${this.goldenKey}; cookie_prefs=1`;
    if (this.phpSessId) c += `; PHPSESSID=${this.phpSessId}`;
    return c;
  }

  baseHeaders() {
    return {
      "User-Agent": UA,
      Cookie: this.cookieHeader(),
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    };
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

  /** GET с ручным follow redirect (как FunPayAPI). */
  async fetchGet(url, maxRedirects = 8) {
    let current = url;
    for (let i = 0; i < maxRedirects; i++) {
      const res = await fetch(current, {
        method: "GET",
        headers: this.baseHeaders(),
        redirect: "manual",
      });
      this.captureCookies(res);

      if (res.status >= 300 && res.status < 400) {
        let loc = res.headers.get("location") || "";
        if (loc.includes("account/login") || loc.includes("/login")) {
          throw new Error("FunPay: неверный golden_key (редирект на вход)");
        }
        if (!loc) throw new Error(`FunPay: редирект без Location (${res.status})`);
        if (!loc.startsWith("http")) {
          loc = loc.startsWith("/") ? `https://funpay.com${loc}` : `https://funpay.com/${loc}`;
        }
        current = loc;
        continue;
      }

      if (!res.ok) throw new Error(`FunPay HTTP ${res.status}`);
      return res.text();
    }
    throw new Error("FunPay: слишком много редиректов");
  }

  async fetchPage(route = "") {
    const path = route ? route.replace(/^\//, "") : "";
    const url = path ? `https://funpay.com/${path}` : "https://funpay.com/";
    return this.fetchGet(url);
  }

  async init() {
    const html = await this.fetchGet("https://funpay.com/");
    if (!html.includes("data-app-data")) {
      if (/Войти|Log in/i.test(html)) {
        throw new Error("FunPay: неверный golden_key (страница входа)");
      }
      throw new Error("FunPay: не удалось авторизоваться (нет data-app-data)");
    }
    const m = html.match(/data-app-data="([^"]+)"/);
    if (!m) throw new Error("FunPay: не удалось прочитать data-app-data");
    this.appData = decodeAppData(m[1]);
    this.ready = true;
    return this.appData;
  }

  async ensureReady() {
    if (!this.ready) await this.init();
    return this.appData;
  }

  getAccountLabel() {
    if (!this.appData) return "?";
    return `${this.appData.userId || "?"} · ${this.appData.userName || this.appData.username || "?"}`;
  }

  async fetchOrdersTradeHtml() {
    await this.ensureReady();
    const locale = this.appData?.locale || "ru";
    let url = "https://funpay.com/orders/trade";
    if (locale && locale !== "ru") {
      url += `?setlocale=${locale}`;
    }
    const html = await this.fetchGet(url);
    const linkIds = [];
    for (const m of html.matchAll(new RegExp(ORDER_ID_IN_URL.source, "gi"))) {
      const id = m[1];
      if (!SKIP_ORDER_PATHS.has(id.toLowerCase())) linkIds.push(id);
    }
    this.lastTradeDebug = {
      htmlLength: html.length,
      tcItemTokens: (html.match(/\btc-item\b/g) || []).length,
      orderAnchors: (html.match(/<a[^>]*\btc-item\b/gi) || []).length,
      orderLinkIds: [...new Set(linkIds)].slice(0, 10),
      hasTradePage: /orders\/trade|Мои продажи|My sales/i.test(html),
      loggedIn: html.includes("user-link-name") || html.includes("data-app-data"),
    };
    if (this.lastTradeDebug.orderAnchors === 0 && /account\/login|Войти/i.test(html)) {
      throw new Error("FunPay: сессия истекла на странице продаж");
    }
    return html;
  }

  extractOrderId(block) {
    const tc = block.match(
      new RegExp(`class="tc-order"[^>]*>\\s*#?(${FUNPAY_ORDER_ID_PATTERN})`, "i"),
    );
    if (tc) return tc[1].toUpperCase();
    const url = block.match(ORDER_ID_IN_URL);
    if (url && !SKIP_ORDER_PATHS.has(url[1].toLowerCase())) return url[1].toUpperCase();
    const hash = block.match(ORDER_ID_IN_TEXT);
    if (hash && hash[1].length >= 4) return hash[1].toUpperCase();
    return null;
  }

  parseOrderBlock(block, classAttr = "") {
    const orderId = this.extractOrderId(block);
    if (!orderId) return null;

    let userId = null;
    let buyerName = null;
    const buyerSpan = block.match(
      /media-user-name[\s\S]*?<span[^>]*data-href="\/users\/(\d+)\/"[^>]*>([^<]*)</i,
    );
    if (buyerSpan) {
      userId = buyerSpan[1];
      buyerName = stripHtml(buyerSpan[2]);
    } else {
      const userM = block.match(/data-href="\/users\/(\d+)\//);
      userId = userM ? userM[1] : null;
    }

    const dateM = block.match(/class="tc-date-time"[^>]*>([^<]+)</);
    const statusM = block.match(/class="tc-status"[^>]*>([^<]+)</);

    let orderStatus = "closed";
    if (/\bwarning\b/.test(classAttr)) orderStatus = "refunded";
    else if (/\binfo\b/.test(classAttr)) orderStatus = "paid";

    let product = "";
    const descInner = block.match(/class="order-desc"[^>]*>[\s\S]*?<div[^>]*>([^<]+)</i);
    if (descInner) product = stripHtml(descInner[1]);
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
      buyerName,
      date: dateM ? stripHtml(dateM[1]) : "",
      status: statusM ? stripHtml(statusM[1]) : "",
      orderStatus,
      product,
      amount,
    };
  }

  parseOrdersFromTradeHtml(html, onlyNew = false) {
    const orders = [];
    const seen = new Set();

    const anchorRe =
      /<a\b[^>]*\bclass=["'][^"']*\btc-item\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = anchorRe.exec(html)) !== null) {
      const fullAnchor = m[0];
      const inner = m[1];
      const classM = fullAnchor.match(/\bclass=["']([^"']+)["']/i);
      const classAttr = classM ? classM[1] : "";
      if (onlyNew && !/\binfo\b/.test(classAttr)) continue;

      const parsed = this.parseOrderBlock(`${fullAnchor}${inner}`, classAttr);
      if (!parsed || seen.has(parsed.orderId)) continue;
      seen.add(parsed.orderId);
      orders.push(parsed);
    }

    if (!orders.length) {
      const chunks = html.split(/\btc-item\b/i);
      for (let i = 1; i < chunks.length; i++) {
        const block = chunks[i].slice(0, 5000);
        const parsed = this.parseOrderBlock(block, block.slice(0, 120));
        if (!parsed || seen.has(parsed.orderId)) continue;
        if (onlyNew && parsed.orderStatus !== "paid") continue;
        seen.add(parsed.orderId);
        orders.push(parsed);
      }
    }

    if (!orders.length) {
      for (const m of html.matchAll(new RegExp(ORDER_ID_IN_URL.source, "gi"))) {
        const orderId = m[1].toUpperCase();
        if (SKIP_ORDER_PATHS.has(orderId.toLowerCase()) || seen.has(orderId)) continue;
        const idx = m.index ?? 0;
        const block = html.slice(Math.max(0, idx - 800), idx + 3000);
        const classHint = /\btc-item[^"']*\binfo\b/i.test(block) ? "tc-item info" : "";
        const parsed = this.parseOrderBlock(block, classHint);
        if (!parsed) {
          seen.add(orderId);
          orders.push({
            orderId,
            userId: null,
            buyerName: null,
            date: "",
            status: "",
            orderStatus: /\binfo\b/i.test(block) ? "paid" : "closed",
            product: "",
            amount: 1,
          });
          continue;
        }
        if (onlyNew && parsed.orderStatus !== "paid") continue;
        seen.add(parsed.orderId);
        orders.push(parsed);
      }
    }

    return orders;
  }

  async getNewOrders() {
    const html = await this.fetchOrdersTradeHtml();
    return this.parseOrdersFromTradeHtml(html, true);
  }

  async getLastOrders(limit = 40) {
    const html = await this.fetchOrdersTradeHtml();
    return this.parseOrdersFromTradeHtml(html, false).slice(0, limit);
  }

  async post(route, data) {
    await this.ensureReady();
    const body = { ...data, csrf_token: this.appData["csrf-token"] };
    const res = await fetch(`https://funpay.com/${route.replace(/^\//, "")}`, {
      method: "POST",
      headers: {
        ...this.baseHeaders(),
        accept: "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
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
    const html = await this.fetchGet(`https://funpay.com/chat/?node=${node}`);
    const ids = [...html.matchAll(/chat-msg-(\d+)/g)].map((n) => Number(n[1]));
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
    const html = await this.fetchGet(`https://funpay.com/orders/${orderId}/`);

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

export function isLikelyNewFunpayOrder(dateLabel) {
  const d = String(dateLabel || "").toLowerCase();
  if (!d) return true;
  if (/вчера|yesterday/i.test(d)) return false;
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

export function isPaidFunpayStatus(status, orderStatus = "") {
  if (orderStatus === "refunded") return false;
  if (orderStatus === "paid") return true;
  const s = String(status || "").toLowerCase();
  if (!s) return true;
  if (/возврат|refund|отмен|cancel/i.test(s)) return false;
  if (/оплачен|paid|ожида/i.test(s)) return true;
  return true;
}
