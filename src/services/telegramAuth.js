import crypto from "crypto";

export function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return { ok: false, error: "missing" };
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { ok: false, error: "no_hash" };
    params.delete("hash");
    const lines = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`);
    const dataCheckString = lines.join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculated = crypto
      .createHmac("sha256", secret)
      .update(dataCheckString)
      .digest("hex");
    if (calculated !== hash) return { ok: false, error: "invalid_hash" };

    const authDate = Number(params.get("auth_date") || 0);
    if (authDate && Date.now() / 1000 - authDate > 86400) {
      return { ok: false, error: "expired" };
    }

    let user = null;
    const userRaw = params.get("user");
    if (userRaw) user = JSON.parse(userRaw);
    return { ok: true, user, params };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function initDataMiddleware(getToken) {
  return (req, res, next) => {
    const initData =
      req.headers["x-telegram-init-data"] ||
      req.body?.init_data ||
      req.query?.init_data;
    if (!initData) {
      return res.status(401).json({ detail: "Требуется Telegram initData" });
    }
    const token = getToken(req);
    const v = validateTelegramInitData(initData, token);
    if (!v.ok) return res.status(401).json({ detail: "Недействительная сессия Telegram" });
    req.telegramUser = v.user;
    next();
  };
}
