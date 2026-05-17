import { updateTenant } from "../../platform/tenants.js";

export function extractMigrateToChatId(err) {
  const p = err?.parameters ?? err?.error?.parameters;
  const id = p?.migrate_to_chat_id;
  return id != null ? String(id) : null;
}

export function isChatUpgradedError(err) {
  const m = String(err?.description ?? err?.message ?? "").toLowerCase();
  return m.includes("upgraded to a supergroup");
}

export function isNoopEditError(err) {
  const m = String(err?.description ?? err?.message ?? "").toLowerCase();
  return m.includes("message is not modified") || m.includes("exactly the same");
}

export function isEmptyTextError(err) {
  const m = String(err?.description ?? err?.message ?? "").toLowerCase();
  return m.includes("message text is empty");
}

export function normalizeTelegramText(text, fallback = "🛒 FunPay · заказ сопровождения") {
  const t = String(text ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim();
  return t.length > 0 ? String(text).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "") : fallback;
}

/** Обновить ID группы в БД при миграции в супергруппу. */
export function applyEscortChatMigration(tenantId, newChatId, oldChatId) {
  const next = String(newChatId).trim();
  if (!next) return null;
  updateTenant(tenantId, { funpay_escort_chat_id: next });
  console.log(
    `[funpay] ID группы сопровождения: ${oldChatId || "?"} → ${next} (супергруппа)`,
  );
  return next;
}

export async function sendHtmlMessage(bot, tenantId, chatId, text, extra = {}) {
  const body = normalizeTelegramText(text);
  const opts = { parse_mode: "HTML", disable_web_page_preview: true, ...extra };

  try {
    return await bot.api.sendMessage(chatId, body, opts);
  } catch (e) {
    const migrated = extractMigrateToChatId(e);
    if (migrated) {
      applyEscortChatMigration(tenantId, migrated, chatId);
      return await bot.api.sendMessage(migrated, body, opts);
    }
    throw e;
  }
}

export async function editHtmlMessage(bot, tenantId, chatId, messageId, text, extra = {}) {
  const body = normalizeTelegramText(text);
  const opts = {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  };

  try {
    return await bot.api.editMessageText(body, opts);
  } catch (e) {
    if (isNoopEditError(e)) return null;

    const migrated = extractMigrateToChatId(e);
    if (migrated) {
      applyEscortChatMigration(tenantId, migrated, chatId);
      throw new ResendCardError("chat_migrated", migrated);
    }

    if (isEmptyTextError(e) || isChatUpgradedError(e)) {
      throw new ResendCardError("edit_failed", e.message);
    }
    throw e;
  }
}

export class ResendCardError extends Error {
  constructor(code, detail) {
    super(String(detail || code));
    this.code = code;
  }
}
