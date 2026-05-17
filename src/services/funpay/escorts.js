import {
  getFunpayOrder,
  saveFunpayEscorts,
  saveFunpayPayout,
  setFunpayOrderStatus,
} from "./repository.js";
import { MAX_ESCORTS } from "./payout.js";
import { calcEscortPayouts } from "./payout.js";

export function parseEscorts(order) {
  if (!order?.escorts_json) return [];
  try {
    const list = JSON.parse(order.escorts_json);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function parsePayout(order) {
  if (!order?.payout_json) return null;
  try {
    return JSON.parse(order.payout_json);
  } catch {
    return null;
  }
}

export function joinEscort(botId, orderId, userId, userName) {
  const order = getFunpayOrder(botId, orderId);
  if (!order) return { ok: false, error: "Заказ не найден" };
  if (order.status === "done" || order.status === "cancelled") {
    return { ok: false, error: "Заказ уже закрыт" };
  }

  const escorts = parseEscorts(order);
  if (escorts.length >= MAX_ESCORTS) {
    return { ok: false, error: `Максимум ${MAX_ESCORTS} сопровождающих` };
  }
  if (escorts.some((e) => Number(e.user_id) === Number(userId))) {
    return { ok: false, error: "Вы уже в составе" };
  }

  escorts.push({
    user_id: userId,
    username: userName,
    joined_at: new Date().toISOString(),
  });
  saveFunpayEscorts(botId, orderId, escorts);
  if (order.status === "new") {
    setFunpayOrderStatus(botId, orderId, "in_progress");
  }
  return { ok: true, escorts };
}

export function leaveEscort(botId, orderId, userId) {
  const order = getFunpayOrder(botId, orderId);
  if (!order) return { ok: false, error: "Заказ не найден" };

  const escorts = parseEscorts(order).filter((e) => Number(e.user_id) !== Number(userId));
  if (escorts.length === parseEscorts(order).length) {
    return { ok: false, error: "Вас нет в составе" };
  }

  saveFunpayEscorts(botId, orderId, escorts);
  if (!escorts.length && order.status === "in_progress") {
    setFunpayOrderStatus(botId, orderId, "new");
  }
  return { ok: true, escorts };
}

/** Админ: сбросить всех сопровождающих (замена состава). */
export function resetEscorts(botId, orderId) {
  saveFunpayEscorts(botId, orderId, []);
  setFunpayOrderStatus(botId, orderId, "new");
  return { ok: true, escorts: [] };
}

export function completeEscortOrder(botId, orderId) {
  const order = getFunpayOrder(botId, orderId);
  if (!order) return { ok: false, error: "Заказ не найден" };

  const escorts = parseEscorts(order);
  if (!escorts.length) {
    return { ok: false, error: "Нет сопровождающих в составе" };
  }

  const payouts = calcEscortPayouts(escorts, order.order_amount);
  saveFunpayPayout(botId, orderId, payouts);
  setFunpayOrderStatus(botId, orderId, "done");
  return { ok: true, payouts, order: getFunpayOrder(botId, orderId) };
}

export function userInEscort(order, userId) {
  return parseEscorts(order).some((e) => Number(e.user_id) === Number(userId));
}
