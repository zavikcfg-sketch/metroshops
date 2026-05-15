import crypto from "crypto";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getSettings, ROOT } from "./config.js";
import {
  createProduct,
  createPromo,
  deleteProduct,
  deletePromo,
  initDb,
  listCategorySettings,
  listProducts,
  listPromos,
  listRecentOrders,
  listUsers,
  setCategoryEnabled,
  statsSummary,
  updateProduct,
} from "./repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(ROOT, "web", "admin");

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function checkAuth(req, res, next) {
  const settings = getSettings();
  const secret = settings.adminPassword.trim();
  if (!secret) {
    return res.status(503).json({ detail: "Задайте ADMIN_PASSWORD в .env" });
  }
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ detail: "Требуется авторизация" });
  }
  const token = auth.slice(7).trim();
  if (!safeEqual(token, secret)) {
    return res.status(401).json({ detail: "Неверный пароль" });
  }
  next();
}

export function createAdminApp() {
  const app = express();
  app.use(express.json());

  app.post("/api/auth/login", (req, res) => {
    const settings = getSettings();
    const secret = settings.adminPassword.trim();
    if (!secret) {
      return res.status(503).json({ detail: "ADMIN_PASSWORD не задан" });
    }
    const password = String(req.body?.password ?? "");
    if (!safeEqual(password, secret)) {
      return res.status(401).json({ detail: "Неверный пароль" });
    }
    return res.json({ token: secret, brand: settings.shopName });
  });

  app.get("/api/meta", checkAuth, (req, res) => {
    const s = getSettings();
    res.json({
      brand: s.shopName,
      bot_name: "WIXYEZ METRO SHOP BOT",
      reviews_url: s.reviewsUrl,
    });
  });

  app.get("/api/stats", checkAuth, (req, res) => {
    res.json(statsSummary());
  });

  app.get("/api/products", checkAuth, (req, res) => {
    const items = listProducts().map((p) => ({
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

  app.post("/api/products", checkAuth, (req, res) => {
    const p = createProduct(req.body || {});
    res.json({ ok: true, id: p.id });
  });

  app.patch("/api/products/:productId", checkAuth, (req, res) => {
    const data = Object.fromEntries(
      Object.entries(req.body || {}).filter(([, v]) => v !== undefined),
    );
    const p = updateProduct(req.params.productId, data);
    if (!p) return res.status(404).json({ detail: "Товар не найден" });
    res.json({ ok: true });
  });

  app.delete("/api/products/:productId", checkAuth, (req, res) => {
    if (!deleteProduct(req.params.productId)) {
      return res.status(404).json({ detail: "Товар не найден" });
    }
    res.json({ ok: true });
  });

  app.get("/api/categories", checkAuth, (req, res) => {
    res.json({ items: listCategorySettings() });
  });

  app.patch("/api/categories/:categoryId", checkAuth, (req, res) => {
    setCategoryEnabled(req.params.categoryId, !!req.body?.enabled);
    res.json({ ok: true });
  });

  app.get("/api/orders", checkAuth, (req, res) => {
    const items = listRecentOrders(200).map((o) => ({
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

  app.get("/api/promos", checkAuth, (req, res) => {
    res.json({ items: listPromos() });
  });

  app.post("/api/promos", checkAuth, (req, res) => {
    const { code, discount_percent, use_limit } = req.body || {};
    createPromo(code, Number(discount_percent), Number(use_limit));
    res.json({ ok: true });
  });

  app.delete("/api/promos/:code", checkAuth, (req, res) => {
    if (!deletePromo(req.params.code)) return res.status(404).json({ detail: "Not found" });
    res.json({ ok: true });
  });

  app.get("/api/users", checkAuth, (req, res) => {
    res.json({ items: listUsers(500) });
  });

  app.get("/health", (req, res) => {
    res.json({ ok: true, service: "metro-shop-admin" });
  });

  app.get("/", (req, res) => {
    res.sendFile(path.join(WEB, "index.html"));
  });

  app.use("/static", express.static(WEB));
  return app;
}

export function startAdminServer() {
  initDb();
  const settings = getSettings();
  const port = settings.resolvedAdminPort();
  const app = createAdminApp();
  return new Promise((resolve) => {
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`[metro-shop] Admin panel http://0.0.0.0:${port}`);
      resolve(server);
    });
  });
}
