export const REVIEWS_CHANNEL_URL = "https://t.me/KotikexsMetroShopOtziv";

export const EMOJI_HELMET = "5204201311238629537";
export const EMOJI_ARMOR = "5201907777227730330";
export const EMOJI_BAG = "5201773765658160740";
export const EMOJI_MK = "5204105005186952289";

export const ESCORT_INFO_FULL =
  "<b>🔑 Опыт, которому можно доверять</b>\n" +
  "У нас более 5 лет игры и 2 года профессиональных сопровождений.\n\n" +
  "<b>🔥 Команда профи</b>\n" +
  "Только адекватные, опытные и сильные игроки без читов.\n\n" +
  "<b>🔎 Индивидуальный подход</b>\n" +
  "Уникальные тактики и стратегии для каждого клиента.\n\n" +
  "<b>Что вы получаете?</b>\n" +
  "🔥 <b>Гарантированный вынос</b>\n" +
  "🔅 <b>Полное сопровождение:</b> матч на 7–8 карте с максимальным выносом\n" +
  "🔅 <b>Дополнительный лут:</b> всё, что не сможете забрать — отдадим на базовой карте\n" +
  "🔅 <b>Шанс попасть в видео</b> в TikTok 🎥\n" +
  "🔅 <b>Поддержка:</b> можно взять друга бесплатно 🧡\n" +
  "🔅 <b>Гарантия результата:</b> вещи для выкладки; при потере лута — выдаём новые\n" +
  "🔅 <b>Максимальный вынос:</b> при нехватке лута — доп. матч или свои вещи\n\n" +
  "<b>🔥 Специальное предложение</b>\n" +
  "При заказе сопровождения — разбор тактик, приёмов и ответы на ваши вопросы ❗️\n\n" +
  `➡️ <a href="${REVIEWS_CHANNEL_URL}">Канал с отзывами</a> ⬅️`;

export const ESCORT_INFO_SHORT =
  "<b>🛡️ Заказать сопровождение</b>\n\n" +
  "ПРЕМИУМ · ВИП · БАЗА — выберите тариф ниже.\n" +
  "5+ лет в Metro · команда без читов · гарантированный вынос.\n\n" +
  `<a href="${REVIEWS_CHANNEL_URL}">📢 Отзывы клиентов</a>`;

const ESCORT_GEAR_LINE = "• Выдача 🪖🧥👜🔫\n";

export const ESCORT_PRODUCTS = [
  {
    id: "escort_premium",
    title: "ПРЕМИУМ",
    description:
      "<b>Сопровождение ПРЕМИУМ</b>\n" +
      ESCORT_GEAR_LINE +
      "• 25–30кк гаранта\n• 7–8 карта, как вы пожелаете\n• Вещи в конце сопровождения ❗️",
    amount: 550,
    currency: "RUB",
    category: "escort",
    popular: true,
    button_style: "danger",
  },
  {
    id: "escort_vip",
    title: "ВИП",
    description:
      "<b>Сопровождение ВИП</b>\n" +
      ESCORT_GEAR_LINE +
      "• 15–20кк гаранта\n• 7–8 карта, как вы пожелаете\n• Вещи в конце сопровождения ❗️",
    amount: 350,
    currency: "RUB",
    category: "escort",
    popular: true,
    button_style: "primary",
  },
  {
    id: "escort_base",
    title: "БАЗА",
    description:
      "<b>Сопровождение БАЗА</b>\n" +
      ESCORT_GEAR_LINE +
      "• 10–12кк гаранта\n• 7–8 карта, как вы пожелаете\n• Вещи в конце сопровождения ❗️",
    amount: 230,
    currency: "RUB",
    category: "escort",
    button_style: "success",
  },
];

export const BOOST_PRODUCTS = [
  {
    id: "boost_rank",
    title: "Буст ранга Metro",
    description: "Прокачка ранга в Metro Royale",
    amount: 999,
    currency: "RUB",
    category: "boost",
    popular: true,
    button_style: "primary",
  },
  {
    id: "boost_cash_1h",
    title: "Фарм Metro Cash (1 ч)",
    description: "Вынос Metro Cash на ваш склад",
    amount: 599,
    currency: "RUB",
    category: "boost",
    button_style: "primary",
  },
  {
    id: "boost_loot_1h",
    title: "Фарм лута (1 ч)",
    description: "Фарм ценного лута в Metro Royale",
    amount: 549,
    currency: "RUB",
    category: "boost",
    button_style: "primary",
  },
  {
    id: "boost_custom",
    title: "Индивидуальный буст",
    description: "Любая задача — оценим вручную",
    amount: 0,
    currency: "RUB",
    category: "boost",
    extra_hint: "Опишите цель: ранг, лут, сроки.",
    button_style: "primary",
  },
];

export const GEAR_PRODUCTS = [
  {
    id: "gear_steel_set",
    title: "Steel Front (сет)",
    description: "Шлем + броня + рюкзак Steel Front",
    amount: 399,
    currency: "RUB",
    category: "gear",
    popular: true,
    button_style: "primary",
  },
  {
    id: "gear_cobalt_set",
    title: "Cobalt (сет)",
    description: "Шлем + броня + рюкзак Cobalt",
    amount: 449,
    currency: "RUB",
    category: "gear",
    button_style: "primary",
  },
  {
    id: "gear_armor6",
    title: "Броня 6 lvl",
    description: "Бронежилет 6 уровня",
    amount: 299,
    currency: "RUB",
    category: "gear",
    button_style: "primary",
  },
  {
    id: "gear_mk14",
    title: "Mk14 (Metro)",
    description: "Mk14 с вложениями по запросу",
    amount: 349,
    currency: "RUB",
    category: "gear",
    button_style: "primary",
  },
  {
    id: "gear_amr",
    title: "AMR",
    description: "Редкое метро-оружие AMR",
    amount: 499,
    currency: "RUB",
    category: "gear",
    button_style: "primary",
  },
  {
    id: "gear_custom",
    title: "Другой предмет",
    description: "Любое снаряжение Metro — под заказ",
    amount: 0,
    currency: "RUB",
    category: "gear",
    extra_hint: "Название предмета, уровень усиления, бюджет.",
    button_style: "primary",
  },
];

export const CATEGORIES = {
  escort: ["🛡️ Сопровождение", ESCORT_INFO_SHORT, ESCORT_PRODUCTS],
  boost: ["⚡ Буст", "Прокачка ранга, фарм Metro Cash и лута", BOOST_PRODUCTS],
  gear: ["🔫 Снаряжение", "Оружие и броня для Metro Royale", GEAR_PRODUCTS],
};

export function reviewsUrl() {
  return REVIEWS_CHANNEL_URL;
}
