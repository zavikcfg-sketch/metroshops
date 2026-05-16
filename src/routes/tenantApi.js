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
  getTenantBySlug,
  listMenuButtons,
  miniAppUrlForTenant,
  tenantSettings,
  upsertMenuButton,
} from "../platform/tenants.js";
import {
  getBotStatus,
  restartTenantBot,
  startTenantBot,
  stopTenantBot,
} from "../botManager.js";

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
      amount: o.amount,
      currency: o.currency,
      pubg_id: o.pubg_id,
      status: o.status,
      created_at: o.created_at,
    }));
    res.json({ items });
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
