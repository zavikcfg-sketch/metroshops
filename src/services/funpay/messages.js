/** Сообщение покупателю в чат FunPay после оплаты. */
export const FUNPAY_ASK_PLAYER_ID =
  process.env.FUNPAY_ASK_PLAYER_ID ||
  "Здравствуйте! Спасибо за покупку 🛡️\n\n" +
    "Укажите, пожалуйста, ваш Player ID (цифры из PUBG Mobile) — " +
    "передам команде сопровождения.\n\n" +
    "Пример: 51234567890";

export const FUNPAY_INVALID_ID =
  "Не вижу Player ID. Отправьте только цифры ID из игры (обычно 9–12 цифр), например: 51234567890";

export const FUNPAY_ID_RECEIVED =
  "Спасибо! Player ID получен ✅ Сопровождающие увидят заказ и скоро выйдут на связь.";
