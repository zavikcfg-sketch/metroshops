(function () {
  const API = window.__SHOP_API__ || "/b/main/shop/api";
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    document.documentElement.style.setProperty("--tg-bg", tg.themeParams.bg_color || "#080c0a");
    if (tg.themeParams.bg_color) {
      document.body.style.background = tg.themeParams.bg_color;
    }
  }

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let state = { products: [], categories: [], botUsername: null, reviewsUrl: "#" };

  function fmtPrice(amount) {
    if (!amount || amount <= 0) return "по запросу";
    const n = amount === Math.trunc(amount) ? Math.trunc(amount) : amount;
    return `${n} ₽`;
  }

  function buyLink(productId) {
    if (!state.botUsername) return null;
    return `https://t.me/${state.botUsername}?start=buy_${encodeURIComponent(productId)}`;
  }

  function productCard(p) {
    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      ${p.popular ? '<span class="badge">Хит</span>' : "<span></span>"}
      <h3>${escapeHtml(p.title)}</h3>
      <div class="price">${fmtPrice(p.amount)}</div>
      <button type="button" class="buy">Купить</button>
    `;
    card.querySelector(".buy").onclick = () => {
      const url = buyLink(p.id);
      if (url) {
        if (tg?.openTelegramLink) tg.openTelegramLink(url);
        else window.open(url, "_blank");
        tg?.close?.();
      } else if (tg?.showAlert) {
        tg.showAlert("Откройте магазин из Telegram-бота");
      }
    };
    return card;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderHome() {
    const popular = state.products.filter((p) => p.popular).slice(0, 4);
    const grid = $("#product-grid");
    grid.innerHTML = "";
    (popular.length ? popular : state.products.slice(0, 4)).forEach((p) => {
      grid.appendChild(productCard(p));
    });

    const catGrid = $("#cat-grid");
    catGrid.innerHTML = "";
    state.categories.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cat-card";
      btn.innerHTML = `
        <span class="emoji">${c.emoji || "📦"}</span>
        <strong>${escapeHtml(c.title)}</strong>
        <span>${escapeHtml(c.tagline || c.description?.slice(0, 40) || "")}</span>
      `;
      btn.onclick = () => openCategory(c);
      catGrid.appendChild(btn);
    });
  }

  function openCategory(cat) {
    $("#app").classList.add("hidden");
    $("#view-category").classList.remove("hidden");
    $("#cat-title").textContent = cat.title;
    const grid = $("#cat-products");
    grid.innerHTML = "";
    state.products
      .filter((p) => p.category === cat.id)
      .forEach((p) => grid.appendChild(productCard(p)));
  }

  function goHome() {
    $("#view-category").classList.add("hidden");
    $("#app").classList.remove("hidden");
  }

  async function load() {
    const res = await fetch(`${API}/bootstrap`);
    if (!res.ok) throw new Error("Не удалось загрузить каталог");
    const data = await res.json();
    state.products = data.products || [];
    state.categories = data.categories || [];
    state.botUsername = data.bot_username;
    state.reviewsUrl = data.reviews_url || "#";

    $("#hero-tagline").textContent = data.shop_name || "Metro Shop";
    document.title = data.shop_name || "Metro Shop";
    $("#link-reviews").href = state.reviewsUrl;
    $("#link-support").href = data.support_contact?.startsWith("http")
      ? data.support_contact
      : `https://t.me/${(data.support_contact || "").replace(/^@/, "")}`;

    renderHome();
    $("#loader").classList.add("hidden");
  }

  $("#banner-cta").onclick = () => {
    const escort = state.categories.find((c) => c.id === "escort");
    if (escort) openCategory(escort);
    else if (state.categories[0]) openCategory(state.categories[0]);
  };

  $("#btn-profile").onclick = () => {
    if (tg?.showAlert) tg.showAlert(`ID: ${tg.initDataUnsafe?.user?.id || "—"}`);
  };

  $$("[data-back]").forEach((b) => (b.onclick = goHome));

  load().catch((e) => {
    $("#loader").textContent = e.message || "Ошибка загрузки";
  });
})();
