/** Лидер команды — 50% пула сопровождения, остальные 50% делят между собой (без лидера). */
export const ESCORT_LEADER_USERNAME = String(
  process.env.FUNPAY_ESCORT_LEADER || "kotikexs",
)
  .replace(/^@/, "")
  .toLowerCase();

export const MAX_ESCORTS = 3;
export const ESCORT_POOL_PERCENT = 0.75;

function normUser(name) {
  return String(name || "")
    .replace(/^@/, "")
    .toLowerCase()
    .trim();
}

export function isEscortLeader(username) {
  return normUser(username) === ESCORT_LEADER_USERNAME;
}

/**
 * Расчёт доли с заказа (в рублях и % от суммы заказа).
 * Соло: 75% одному · Дуо: по 37% · Трио: по 25%.
 * С лидером в команде (2–3 чел.): лидеру 50% пула (37.5% заказа), остальным поровну вторые 50% пула.
 */
export function calcEscortPayouts(escorts, orderAmountRub) {
  const amount = Number(orderAmountRub) || 0;
  if (!amount || !escorts?.length) {
    return escorts.map((e) => ({ ...e, amountRub: 0, percentOfOrder: 0 }));
  }

  const pool = amount * ESCORT_POOL_PERCENT;
  const n = escorts.length;
  const leaderIndex = escorts.findIndex((e) => isEscortLeader(e.username));
  const hasLeaderInTeam = leaderIndex >= 0 && n > 1;

  if (hasLeaderInTeam) {
    const leaderShare = pool * 0.5;
    const rest = pool * 0.5;
    const othersCount = n - 1;
    const perOther = othersCount > 0 ? rest / othersCount : 0;

    return escorts.map((e, i) => {
      const rub = i === leaderIndex ? leaderShare : perOther;
      return {
        ...e,
        amountRub: round2(rub),
        percentOfOrder: round2((rub / amount) * 100),
        isLeader: i === leaderIndex,
      };
    });
  }

  const shareOfOrder = { 1: 0.75, 2: 0.37, 3: 0.25 }[n] ?? ESCORT_POOL_PERCENT / n;
  const eachRub = amount * shareOfOrder;

  return escorts.map((e) => ({
    ...e,
    amountRub: round2(eachRub),
    percentOfOrder: round2(shareOfOrder * 100),
    isLeader: isEscortLeader(e.username),
  }));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export function formatPayoutLines(payouts, orderAmountRub) {
  if (!payouts?.length) return "—";
  const amount = Number(orderAmountRub) || 0;
  return payouts
    .map((p, i) => {
      const crown = p.isLeader ? " 👑" : "";
      const pct = p.percentOfOrder ?? 0;
      const rub = p.amountRub ?? 0;
      return `${i + 1}. ${p.username || p.user_id}${crown} — ${pct}% (${rub} ₽)`;
    })
    .join("\n");
}
