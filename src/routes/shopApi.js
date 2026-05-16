import { PRESET_CUSTOM_EMOJIS } from "../catalog.js";
import { getCategoriesForBot, listProducts } from "../repository.js";
import { miniAppUrlForTenant, tenantSettings } from "../platform/tenants.js";

const CAT_META = {
  escort: { title: "Сопровождение", emoji: "🛡️", tagline: "ПРЕМИУМ · ВИП · БАЗА" },
  boost: { title: "Буст", emoji: "⚡", tagline: "Ранг и фарм" },
  gear: { title: "Снаряжение", emoji: "🔫", tagline: "Под ключ" },
};

export function mountShopApi(router) {
  router.get("/bootstrap", async (req, res) => {
    const tenant = req.tenant;
    const settings = tenantSettings(tenant);
    const botId = tenant.id;
    const categories = getCategoriesForBot(botId);
    const products = listProducts(botId, { activeOnly: true }).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      amount: p.amount,
      currency: p.currency,
      category: p.category,
      popular: p.popular,
    }));

    let botUsername = null;
    try {
      const { Bot } = await import("grammy");
      const me = await new Bot(tenant.telegram_token).api.getMe();
      botUsername = me.username;
    } catch {
      /* ignore */
    }

    res.json({
      shop_name: settings.shopName,
      display_name: tenant.display_name,
      reviews_url: settings.reviewsUrl,
      metro_shop_url: settings.metroShopUrl,
      support_contact: settings.supportContact,
      mini_app_url: miniAppUrlForTenant(tenant),
      bot_username: botUsername,
      categories: Object.entries(categories).map(([id, [title, desc]]) => ({
        id,
        title,
        description: desc,
        ...(CAT_META[id] || { emoji: "📦", tagline: "" }),
      })),
      products,
    });
  });
}

export { PRESET_CUSTOM_EMOJIS };
