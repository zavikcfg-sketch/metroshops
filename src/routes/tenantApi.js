import {
  createProduct,
  createPromo,
  deleteProduct,
  deletePromo,
  listCategorySettings,
  listProducts,
  listPromos,
  listRecentOrders,
  listUsers,
  setCategoryEnabled,
  statsSummary,
  updateProduct,
} from "../repository.js";
import { PRESET_CUSTOM_EMOJIS } from "../catalog.js";
import {
  deleteMenuButton,
  getTenantById,
  getTenantBySlug,
  listMenuButtons,
  miniAppUrlForTenant,
  tenantSettings,
  updateTenant,
  upsertMenuButton,
} from "../platform/tenants.js";
import {
  getBotRunner,
  getBotStatus,
  restartTenantBot,
  startTenantBot,
  stopTenantBot,
} from "../botManager.js";
import { updateOrderStatus, ORDER_STATUSES } from "../services/orderService.js";
import { sendBroadcast } from "../services/broadcast.js";
import { tenantBrandingDir } from "../services/branding.js";
import { backupDatabase } from "../services/backup.js";
import { sendFunpayEscortCard } from "../services/funpay/notify.js";
import { FunPayClient } from "../services/funpay/client.js";
import { runFunpaySyncNow } from "../services/funpay/poller.js";
import fs from "fs";
import path from "path";

export function mountTenantApi(router, { checkTenantAuth }) {
  router.post("/auth/login", (req, res) => {
    const tenant = req.tenant;
    const password = String(req.body?.password ?? "");
    if (!tenant || password !== tenant.admin_password) {
      return res.status(401).json({ detail: "Неверный пароль" });
    }
    return res.json({ token: tenant.admin_password, brand: tenant.shop_name, slug: tenant.slug });
  });

  router.get("/meta", checkTenantAuth, (req, res) => {
    const t = req.tenant;
    res.json({
      brand: t.shop_name,
      bot_name: t.display_name,
      reviews_url: t.reviews_url,
      slug: t.slug,
    });
  });

  router.get("/stats", checkTenantAuth, (req, res) => {
    res.json(statsSummary(req.tenant.id));
  });

  router.get("/products", checkTenantAuth, (req, res) => {
    const items = listProducts(req.tenant.id).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      amount: p.amount,
      currency: p.currency,
      category: p.category,
      popular: p.popular,
      extra_hint: p.extra_hint,
      button_style: p.button_style,
      active: p.active,
    }));
    res.json({ items });
  });

  router.post("/products", checkTenantAuth, (req, res) => {
    const p = createProduct(req.tenant.id, req.body || {});
    res.json({ ok: true, id: p.id });
  });

  router.patch("/products/:productId", checkTenantAuth, (req, res) => {
    const data = Object.fromEntries(
      Object.entries(req.body || {}).filter(([, v]) => v !== undefined),
    );
    const p = updateProduct(req.tenant.id, req.params.productId, data);
    if (!p) return res.status(404).json({ detail: "Товар не найден" });
    res.json({ ok: true });
  });

  router.delete("/products/:productId", checkTenantAuth, (req, res) => {
    if (!deleteProduct(req.tenant.id, req.params.productId)) {
      return res.status(404).json({ detail: "Товар не найден" });
    }
    res.json({ ok: true });
  });

  router.get("/categories", checkTenantAuth, (req, res) => {
    res.json({ items: listCategorySettings(req.tenant.id) });
  });

  router.patch("/categories/:categoryId", checkTenantAuth, (req, res) => {
    setCategoryEnabled(req.tenant.id, req.params.categoryId, !!req.body?.enabled);
    res.json({ ok: true });
  });

  router.get("/orders", checkTenantAuth, (req, res) => {
    const items = listRecentOrders(req.tenant.id, 200).map((o) => ({
      id: o.id,
      user_id: o.user_id,
      username: o.username,
      product_title: o.product_title,
      amount: o.final_amount ?? o.amount,
      currency: o.currency,
      pubg_id: o.pubg_id,
      status: o.status,
      status_label: ORDER_STATUSES[o.status] || o.status,
      promo_code: o.promo_code,
      source: o.source,
      created_at: o.created_at,
    }));
    res.json({ items, statuses: ORDER_STATUSES });
  });

  router.patch("/orders/:orderId/status", checkTenantAuth, (req, res) => {
    const status = req.body?.status;
    if (!status) return res.status(400).json({ detail: "Укажите status" });
    const r = updateOrderStatus(req.tenant.id, req.params.orderId, status);
    if (!r.changed) return res.status(404).json({ detail: "Заказ не найден" });
    res.json({ ok: true, order: r.order });
  });

  router.get("/orders/export.csv", checkTenantAuth, (req, res) => {
    const orders = listRecentOrders(req.tenant.id, 5000);
    const header = "id,date,user,product,amount,currency,pubg_id,status,source\n";
    const rows = orders
      .map((o) =>
        [
          o.id,
          o.created_at,
          o.username || o.user_id,
          `"${(o.product_title || "").replace(/"/g, '""')}"`,
          o.final_amount ?? o.amount,
          o.currency,
          o.pubg_id,
          o.status,
          o.source,
        ].join(","),
      )
      .join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.send("\uFEFF" + header + rows);
  });

  router.get("/branding", checkTenantAuth, (req, res) => {
    const t = req.tenant;
    res.json({
      shop_name: t.shop_name,
      theme_accent: t.theme_accent,
      theme_bg: t.theme_bg,
      promo_title: t.promo_title,
      promo_ends_at: t.promo_ends_at,
      notify_chat_ids: t.notify_chat_ids,
      plan_id: t.plan_id,
    });
  });

  router.patch("/branding", checkTenantAuth, (req, res) => {
    const body = req.body || {};
    updateTenant(req.tenant.id, {
      shop_name: body.shop_name,
      theme_accent: body.theme_accent,
      theme_bg: body.theme_bg,
      promo_title: body.promo_title,
      promo_ends_at: body.promo_ends_at,
      notify_chat_ids: body.notify_chat_ids,
    });
    res.json({ ok: true });
  });

  router.post("/branding/upload", checkTenantAuth, (req, res) => {
    const kind = req.body?.kind || "logo";
    const b64 = req.body?.image_base64;
    if (!b64) return res.status(400).json({ detail: "Нужен image_base64" });
    const buf = Buffer.from(String(b64).replace(/^data:image\/\w+;base64,/, ""), "base64");
    const dir = tenantBrandingDir(req.tenant.id);
    const fname = kind === "banner" ? "banner.jpg" : "logo.jpg";
    const fp = path.join(dir, fname);
    fs.writeFileSync(fp, buf);
    const field = kind === "banner" ? "banner_path" : "avatar_path";
    updateTenant(req.tenant.id, { [field]: fp });
    res.json({ ok: true, path: fp });
  });

  router.post("/broadcast", checkTenantAuth, async (req, res) => {
    const message = String(req.body?.message ?? "").trim();
    if (!message) return res.status(400).json({ detail: "Пустое сообщение" });
    const runner = getBotRunner(req.tenant.id);
    if (!runner?.bot) {
      return res.status(400).json({ detail: "Запустите бота перед рассылкой" });
    }
    const result = await sendBroadcast(runner.bot, req.tenant.id, message);
    res.json({ ok: true, ...result });
  });

  router.post("/backup", checkTenantAuth, (req, res) => {
    const dest = backupDatabase();
    res.json({ ok: !!dest, path: dest });
  });

  router.get("/onboarding", checkTenantAuth, (req, res) => {
    const id = req.tenant.id;
    res.json({
      steps: [
        { id: "bot", done: !!req.tenant.telegram_token, label: "Токен бота подключён" },
        { id: "products", done: listProducts(id).length > 0, label: "Есть товары" },
        { id: "buttons", done: listMenuButtons(id).length > 0, label: "Настроены кнопки" },
        {
          id: "miniapp",
          done: true,
          label: "Mini App",
          url: miniAppUrlForTenant(req.tenant),
        },
        {
          id: "funpay",
          done:
            !!req.tenant.funpay_enabled &&
            !!String(req.tenant.funpay_golden_key || "").trim() &&
            !!String(req.tenant.funpay_escort_chat_id || "").trim(),
          label: "FunPay → группа сопровождения",
        },
      ],
    });
  });

  router.get("/funpay", checkTenantAuth, (req, res) => {
    const t = req.tenant;
    const key = String(t.funpay_golden_key || "");
    res.json({
      funpay_enabled: !!t.funpay_enabled,
      funpay_escort_chat_id: t.funpay_escort_chat_id || "",
      golden_key_set: key.length > 4,
      golden_key_hint: key.length > 4 ? `${key.slice(0, 4)}…${key.slice(-4)}` : "",
    });
  });

  router.patch("/funpay", checkTenantAuth, (req, res) => {
    const body = req.body || {};
    const patch = {
      funpay_enabled: !!body.funpay_enabled,
      funpay_escort_chat_id: String(body.funpay_escort_chat_id ?? "").trim(),
    };
    const newKey = String(body.funpay_golden_key ?? "").trim();
    if (newKey && !newKey.includes("…")) {
      patch.funpay_golden_key = newKey;
    }
    updateTenant(req.tenant.id, patch);
    res.json({ ok: true });
  });

  router.get("/funpay/status", checkTenantAuth, async (req, res) => {
    const t = req.tenant;
    const enabled =
      !!t.funpay_enabled &&
      String(t.funpay_golden_key || "").trim().length > 8 &&
      !!String(t.funpay_escort_chat_id || "").trim();
    const out = {
      enabled,
      slug: t.slug,
      bot_running: !!getBotRunner(t.id)?.bot,
      escort_chat_id: t.funpay_escort_chat_id || "",
    };
    if (!enabled) {
      return res.json(out);
    }
    try {
      const client = new FunPayClient(t.funpay_golden_key);
      const app = await client.ensureReady();
      const orders = await client.getLastOrders(8);
      out.funpay_user_id = app.userId;
      out.funpay_username = app.userName || app.username || null;
      out.orders_on_page = orders.length;
      out.trade_debug = client.lastTradeDebug;
      out.latest_orders = orders.slice(0, 5).map((o) => ({
        id: o.orderId,
        product: o.product,
        status: o.status,
        order_status: o.orderStatus,
        date: o.date,
        buyer_id: o.userId,
      }));
    } catch (e) {
      out.error = e.message;
    }
    return res.json(out);
  });

  router.post("/funpay/sync", checkTenantAuth, async (req, res) => {
    try {
      await runFunpaySyncNow();
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ detail: e.message });
    }
  });

  router.post("/funpay/test", checkTenantAuth, async (req, res) => {
    const runner = getBotRunner(req.tenant.id);
    if (!runner?.bot) {
      return res.status(400).json({ detail: "Сначала запустите Telegram-бота" });
    }
    const t = getTenantById(req.tenant.id);
    if (!String(t.funpay_escort_chat_id || "").trim()) {
      return res.status(400).json({ detail: "Укажите ID группы сопровождения" });
    }
    const demo = {
      funpay_order_id: "TEST",
      product: "Сопровождение ПРЕМИУМ (тест)",
      buyer_funpay_id: "123456",
      buyer_name: "FunPayBuyer",
      description: "Player ID: 51234567890\nКомментарий покупателя для проверки карточки.",
      pubg_id: "51234567890",
      amount: 1,
      status: "new",
      claimed_by: null,
      claimed_by_name: null,
    };
    try {
      await sendFunpayEscortCard(runner.bot, t, demo);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ detail: e.message });
    }
  });

  router.get("/promos", checkTenantAuth, (req, res) => {
    res.json({ items: listPromos(req.tenant.id) });
  });

  router.post("/promos", checkTenantAuth, (req, res) => {
    const { code, discount_percent, use_limit } = req.body || {};
    createPromo(req.tenant.id, code, Number(discount_percent), Number(use_limit));
    res.json({ ok: true });
  });

  router.delete("/promos/:code", checkTenantAuth, (req, res) => {
    if (!deletePromo(req.tenant.id, req.params.code)) {
      return res.status(404).json({ detail: "Not found" });
    }
    res.json({ ok: true });
  });

  router.get("/users", checkTenantAuth, (req, res) => {
    res.json({ items: listUsers(req.tenant.id, 500) });
  });

  router.get("/menu-buttons", checkTenantAuth, (req, res) => {
    res.json({
      items: listMenuButtons(req.tenant.id),
      mini_app_url: miniAppUrlForTenant(req.tenant),
    });
  });

  router.get("/menu-buttons/emoji-presets", checkTenantAuth, (req, res) => {
    res.json({ items: PRESET_CUSTOM_EMOJIS });
  });

  router.post("/menu-buttons", checkTenantAuth, (req, res) => {
    const body = req.body || {};
    const button_key = String(body.button_key ?? "")
      .trim()
      .replace(/[^a-z0-9_]/gi, "_")
      .slice(0, 48);
    if (!button_key) {
      return res.status(400).json({ detail: "Укажите ключ кнопки (латиница)" });
    }
    if (!body.label?.trim()) {
      return res.status(400).json({ detail: "Укажите текст кнопки" });
    }
    upsertMenuButton(req.tenant.id, {
      button_key,
      label: body.label.trim(),
      action_type: body.action_type || "callback",
      action_value: body.action_value ?? button_key,
      style: body.style || "primary",
      row_order: body.row_order ?? 0,
      sort_order: body.sort_order ?? 0,
      enabled: body.enabled !== false,
      icon_emoji_id: body.icon_emoji_id || null,
    });
    res.json({ ok: true, button_key });
  });

  router.put("/menu-buttons/:key", checkTenantAuth, (req, res) => {
    const body = req.body || {};
    upsertMenuButton(req.tenant.id, {
      button_key: req.params.key,
      label: body.label,
      action_type: body.action_type,
      action_value: body.action_value,
      style: body.style,
      row_order: body.row_order,
      sort_order: body.sort_order,
      enabled: body.enabled !== false,
      icon_emoji_id: body.icon_emoji_id || null,
    });
    res.json({ ok: true });
  });

  router.delete("/menu-buttons/:key", checkTenantAuth, (req, res) => {
    if (!deleteMenuButton(req.tenant.id, req.params.key)) {
      return res.status(404).json({ detail: "Кнопка не найдена" });
    }
    res.json({ ok: true });
  });

  router.get("/bot/status", checkTenantAuth, async (req, res) => {
    const st = await getBotStatus(req.tenant.id);
    res.json(st);
  });

  router.post("/bot/start", checkTenantAuth, async (req, res) => {
    const result = await startTenantBot(req.tenant);
    if (!result.ok) return res.status(400).json({ detail: result.error });
    res.json(result);
  });

  router.post("/bot/stop", checkTenantAuth, async (req, res) => {
    const result = await stopTenantBot(req.tenant.id);
    res.json(result);
  });

  router.post("/bot/restart", checkTenantAuth, async (req, res) => {
    const result = await restartTenantBot(req.tenant.id);
    if (!result.ok) return res.status(400).json({ detail: result.error });
    res.json(result);
  });
}

export function tenantMiddleware(req, res, next) {
  const slug = req.params.slug;
  const tenant = getTenantBySlug(slug);
  if (!tenant) return res.status(404).json({ detail: "Бот не найден" });
  req.tenant = tenant;
  req.tenantSettings = tenantSettings(tenant);
  next();
}

export function makeTenantAuth() {
  return (req, res, next) => {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ detail: "Требуется авторизация" });
    }
    const token = auth.slice(7).trim();
    if (token !== req.tenant.admin_password) {
      return res.status(401).json({ detail: "Неверный пароль" });
    }
    next();
  };
}
