import { EMOJI_ARMOR, EMOJI_BAG, EMOJI_HELMET, EMOJI_MK } from "./catalog.js";

const GEAR_FALLBACK = "🪖🧥👜🔫";
const GEAR_EMOJI_IDS = [EMOJI_HELMET, EMOJI_ARMOR, EMOJI_BAG, EMOJI_MK];
const GEAR_PREFIX = "• Выдача ";

function utf16Len(text) {
  return Buffer.from(text, "utf16le").length / 2;
}

function gearCustomEmojiEntities(offset) {
  const entities = [];
  let pos = offset;
  for (let i = 0; i < GEAR_FALLBACK.length; i++) {
    const char = GEAR_FALLBACK[i];
    const length = utf16Len(char);
    entities.push({
      type: "custom_emoji",
      offset: pos,
      length,
      custom_emoji_id: GEAR_EMOJI_IDS[i],
    });
    pos += length;
  }
  return entities;
}

function gearLinePlain() {
  return `${GEAR_PREFIX}${GEAR_FALLBACK}\n`;
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

export function buildEscortPickMessage({ title, productId, priceRub, extraHint = "" }) {
  const header = `Вы выбрали: ${title}\n\n`;
  const subheader = `Сопровождение ${title}\n`;
  const gearBlock = gearLinePlain();
  const body = escortExtraLines(productId);

  const pricePart =
    priceRub == null ? "Цена: по согласованию\n\n" : `Цена: ${priceRub} ₽\n\n`;

  let footer =
    `${pricePart}Введите Player ID PUBG Mobile.\nОтмена: /cancel`;
  if (extraHint) footer = `${extraHint}\n\n${footer}`;

  const text = header + subheader + gearBlock + body + "\n" + footer;

  const entities = [];
  const bold1 = `Вы выбрали: ${title}`;
  entities.push({ type: "bold", offset: 0, length: utf16Len(bold1) });
  const bold2 = `Сопровождение ${title}`;
  entities.push({
    type: "bold",
    offset: utf16Len(header),
    length: utf16Len(bold2),
  });
  const gearOffset = utf16Len(header + subheader + GEAR_PREFIX);
  entities.push(...gearCustomEmojiEntities(gearOffset));

  return { text, entities };
}
