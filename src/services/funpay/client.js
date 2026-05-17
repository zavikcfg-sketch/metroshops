const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

function stripHtml(html) {
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
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Cookie: this.cookieHeader(),
      },
    });
    this.captureCookies(res);
    if (!res.ok) throw new Error(`FunPay HTTP ${res.status}`);
    return res.text();
  }

  async init() {
    const html = await this.fetchPage();
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

  parseOrdersFromTradeHtml(html, onlyNew = false) {
    const orders = [];
    const classNeedle = onlyNew ? 'class="tc-item info"' : 'class="tc-item"';
    let pos = 0;
    while (pos < html.length) {
      const idx = html.indexOf(classNeedle, pos);
      if (idx === -1) break;
      const end = html.indexOf("</a>", idx);
      if (end === -1) break;
      const block = html.slice(idx, end + 4);
      pos = end + 4;

      const orderM = block.match(/class="tc-order"[^>]*>\s*#?(\d+)/i);
      if (!orderM) continue;
      const orderId = orderM[1];

      const userM = block.match(/data-href="\/users\/(\d+)\//);
      const userId = userM ? userM[1] : null;

      const dateM = block.match(/class="tc-date-time"[^>]*>([^<]+)</);
      const statusM = block.match(/class="tc-status"[^>]*>([^<]+)</);

      let product = "";
      const descM = block.match(/class="order-desc"[^>]*>[\s\S]*?<div>([^<]+)</i);
      if (descM) product = stripHtml(descM[1]);

      let amount = 1;
      const parts = product.split(", ");
      if (parts.length > 1 && /\d+\s*шт\./i.test(parts.at(-1))) {
        const am = parts.at(-1).match(/(\d+)/);
        if (am) amount = Number(am[1]);
        product = parts.slice(0, -1).join(", ");
      }

      orders.push({
        orderId,
        userId,
        date: dateM ? stripHtml(dateM[1]) : "",
        status: statusM ? stripHtml(statusM[1]) : "",
        product,
        amount,
      });
    }
    return orders;
  }

  async getNewOrders() {
    await this.ensureReady();
    const html = await this.fetchPage("orders/trade");
    return this.parseOrdersFromTradeHtml(html, true);
  }

  async getOrderDetails(orderId) {
    await this.ensureReady();
    const html = await this.fetchPage(`orders/${orderId}/`);

    const buyerM =
      html.match(/class="media-user-name"[^>]*>[\s\S]*?<a[^>]*>([^<]+)</i) ||
      html.match(/class="media-user-name"[^>]*>([^<]+)</i);
    const buyerName = buyerM ? stripHtml(buyerM[1]) : null;

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
      buyerFunpayId: null,
      description,
      pubgId,
    };
  }
}

export function extractPubgId(text) {
  const t = String(text || "");
  const labeled =
    t.match(/(?:player\s*id|id\s*игрока|айди|pubg)[:\s#]*(\d{5,15})/i) ||
    t.match(/(?:ник|nickname)[:\s]*([^\n,]{3,32})/i);
  if (labeled) return labeled[1].trim();
  const nums = t.match(/\b(\d{9,12})\b/);
  return nums ? nums[1] : null;
}
