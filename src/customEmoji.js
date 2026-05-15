import { EMOJI_ARMOR, EMOJI_BAG, EMOJI_HELMET, EMOJI_MK } from "./catalog.js";

function tgEmoji(emojiId, fallback) {
  return `<tg-emoji emoji-id="${emojiId}">${fallback}</tg-emoji>`;
}

function escortGearLineHtml() {
  return (
    "• Выдача " +
    tgEmoji(EMOJI_HELMET, "🪖") +
    tgEmoji(EMOJI_ARMOR, "🧥") +
    tgEmoji(EMOJI_BAG, "👜") +
    tgEmoji(EMOJI_MK, "🔫") +
    "\n"
  );
}

function escortExtraLines(productId) {
  const mapping = {
    escort_premium:
      "• 25–30кк гаранта\n• 7–8 карта, как вы пожелаете\n• Вещи в конце сопровождения ❗️\n",
    escort_vip:
      "• 15–20кк гаранта\n• 7–8 карта, как вы пожелаете\n• Вещи в конце сопровождения ❗️\n",
    escort_base:
      "• 10–12кк гаранта\n• 7–8 карта, как вы пожелаете\n• Вещи в конце сопровождения ❗️\n",
  };
  return mapping[productId] || "";
}

/** Сообщение при выборе тарифа сопровождения (HTML + tg-emoji). */
export function buildEscortPickMessage({ title, productId, priceRub, extraHint = "" }) {
  const pricePart =
    priceRub == null ? "Цена: по согласованию\n\n" : `Цена: ${priceRub} ₽\n\n`;

  let footer =
    `${pricePart}Введите <b>Player ID</b> PUBG Mobile.\nОтмена: /cancel`;
  if (extraHint) footer = `${extraHint}\n\n${footer}`;

  return (
    `<b>Вы выбрали: ${title}</b>\n\n` +
    `<b>Сопровождение ${title}</b>\n` +
    escortGearLineHtml() +
    escortExtraLines(productId) +
    "\n" +
    footer
  );
}
