import { FunPayClient } from "./client.js";
import { getTenantById } from "../../platform/tenants.js";

export async function sendFunPayMessageToBuyer(tenant, buyerFunpayId, text) {
  if (!buyerFunpayId) throw new Error("Нет ID покупателя FunPay");
  const key = String(tenant.funpay_golden_key || "").trim();
  if (!key) throw new Error("Не настроен golden_key");

  const client = new FunPayClient(key);
  await client.ensureReady();
  const last = await client.getUserLastMessageId(buyerFunpayId);
  await client.sendChatMessage(buyerFunpayId, text, last);
}

export async function sendFunPayMessageForBot(botId, buyerFunpayId, text) {
  const tenant = getTenantById(botId);
  if (!tenant) throw new Error("Бот не найден");
  return sendFunPayMessageToBuyer(tenant, buyerFunpayId, text);
}
