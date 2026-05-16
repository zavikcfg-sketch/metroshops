import http from "http";
import express from "express";
import path from "path";
import { getSettings, ROOT } from "./config.js";
import { logPortDiagnostics, resolveListenPorts } from "./port.js";
import { initDb } from "./repository.js";
import { mountPlatformApi } from "./routes/platformApi.js";
import {
  makeTenantAuth,
  mountTenantApi,
  tenantMiddleware,
} from "./routes/tenantApi.js";
import { mountShopApi } from "./routes/shopApi.js";

const WEB = path.join(ROOT, "web", "admin");
const PLATFORM_WEB = path.join(ROOT, "web", "platform");
const SHOP_WEB = path.join(ROOT, "web", "miniapp");

export function createAdminApp() {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "8mb" }));

  app.get("/health", (req, res) => {
    res.json({ ok: true, service: "metro-shop-platform" });
  });

  const platformRouter = express.Router();
  mountPlatformApi(platformRouter);
  app.use("/platform/api", platformRouter);

  app.get("/platform", (req, res) => {
    res.sendFile(path.join(PLATFORM_WEB, "index.html"));
  });
  app.use("/platform", express.static(PLATFORM_WEB));

  const tenantApi = express.Router({ mergeParams: true });
  tenantApi.use(tenantMiddleware);
  const checkTenant = makeTenantAuth();
  mountTenantApi(tenantApi, { checkTenantAuth: checkTenant });
  app.use("/b/:slug/api", tenantApi);

  app.get("/b/:slug", tenantMiddleware, (req, res) => {
    res.sendFile(path.resolve(WEB, "index.html"));
  });
  app.get("/b/:slug/", tenantMiddleware, (req, res) => {
    res.sendFile(path.resolve(WEB, "index.html"));
  });
  app.use("/b/:slug/static", tenantMiddleware, express.static(WEB));

  const shopApi = express.Router({ mergeParams: true });
  shopApi.use(tenantMiddleware);
  mountShopApi(shopApi);
  app.use("/b/:slug/shop/api", shopApi);

  app.get(["/b/:slug/shop", "/b/:slug/shop/"], tenantMiddleware, (req, res) => {
    res.sendFile(path.resolve(SHOP_WEB, "index.html"));
  });
  app.use("/b/:slug/shop", tenantMiddleware, express.static(SHOP_WEB));

  app.get("/", (req, res) => res.redirect("/platform"));
  app.use("/static", express.static(WEB));

  return app;
}

function listenOnPort(app, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(port, "0.0.0.0", () => {
      console.log(`[metro-shop] Admin listening on 0.0.0.0:${port}`);
      resolve(server);
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`[metro-shop] Port ${port} busy, skipped`);
        resolve(null);
        return;
      }
      reject(err);
    });
  });
}

export async function startAdminServer() {
  initDb();
  logPortDiagnostics();
  const ports = resolveListenPorts();
  const app = createAdminApp();
  const servers = [];
  for (const port of ports) {
    const s = await listenOnPort(app, port);
    if (s) servers.push(s);
  }
  if (!servers.length) throw new Error("Admin: no ports available");
  const publicUrl = getSettings().adminPublicUrl?.replace(/\/$/, "");
  console.log(`[metro-shop] Platform: ${publicUrl || ""}/platform`);
  if (publicUrl) console.log(`[metro-shop] Tenant example: ${publicUrl}/b/main/`);
  return servers;
}
