(function () {
  const API = window.__SHOP_API__ || "/b/main/shop/api";
  const tg = window.Telegram?.WebApp;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const CAT_VISUAL = {
    escort: { emoji: "🛡️", class: "escort", label: "Сопровождение" },
    boost: { emoji: "⚡", class: "boost", label: "Буст" },
    gear: { emoji: "🔫", class: "gear", label: "Снаряжение" },
  };

  let state = {
    products: [],
    categories: [],
    botUsername: null,
    reviewsUrl: "#",
    metroUrl: "#",
    shopName: "Metro Shop",
    activeProduct: null,
    filterCat: "all",
    cart: [],
    branding: {},
  };

  function initDataHeader() {
    return tg?.initData ? { "X-Telegram-Init-Data": tg.initData } : {};
  }

  function addToCart(p) {
    const ex = state.cart.find((x) => x.product_id === p.id);
    if (ex) ex.qty += 1;
    else state.cart.push({ product_id: p.id, title: p.title, amount: p.amount, qty: 1 });
    updateCartUi();
    haptic("light");
  }

  function updateCartUi() {
    const n = state.cart.reduce((s, x) => s + x.qty, 0);
    $("#cart-count").textContent = String(n);
    const total = state.cart.reduce((s, x) => s + (x.amount > 0 ? x.amount * x.qty : 0), 0);
    $("#cart-total").textContent = fmtPrice(total);
    const box = $("#cart-items");
    box.innerHTML = state.cart
      .map(
        (x) =>
          `<div class="cart-line"><span>${escapeHtml(x.title)} ×${x.qty}</span><span>${fmtPrice(x.amount * x.qty)}</span></div>`,
      )
      .join("");
  }

  function openCartSheet() {
    updateCartUi();
    $("#sheet-backdrop").classList.remove("hidden");
    $("#cart-sheet").classList.remove("hidden");
    requestAnimationFrame(() => {
      $("#sheet-backdrop").classList.add("visible");
      $("#cart-sheet").classList.add("open");
    });
  }

  function closeCartSheet() {
    $("#cart-sheet").classList.remove("open");
    $("#sheet-backdrop").classList.remove("visible");
    setTimeout(() => $("#cart-sheet").classList.add("hidden"), 350);
  }

  function haptic(type = "light") {
    try {
      tg?.HapticFeedback?.impactOccurred(type);
    } catch {
      /* ignore */
    }
  }

  function applyTelegramTheme() {
    if (!tg) return;
    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.("#050807");
    tg.setBackgroundColor?.("#050807");
    const p = tg.themeParams || {};
    if (p.button_color) {
      document.documentElement.style.setProperty("--tg-btn", p.button_color);
    }
    if (p.text_color) {
      document.documentElement.style.setProperty("--text", p.text_color);
    }
  }

  function spawnParticles() {
    const root = $("#particles");
    if (!root) return;
    for (let i = 0; i < 24; i++) {
      const el = document.createElement("span");
      el.className = "particle";
      el.style.left = `${Math.random() * 100}%`;
      el.style.bottom = `${Math.random() * 30}%`;
      el.style.setProperty("--dur", `${6 + Math.random() * 10}s`);
      el.style.setProperty("--delay", `${Math.random() * 8}s`);
      el.style.opacity = `${0.15 + Math.random() * 0.5}`;
      root.appendChild(el);
    }
  }

  function fmtPrice(amount) {
    if (!amount || amount <= 0) return "по запросу";
    const n = amount === Math.trunc(amount) ? Math.trunc(amount) : amount;
    return `${n} ₽`;
  }

  function buyLink(productId) {
    if (!state.botUsername) return null;
    return `https://t.me/${state.botUsername}?start=buy_${encodeURIComponent(productId)}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function catVisual(catId) {
    return CAT_VISUAL[catId] || { emoji: "📦", class: "", label: catId };
  }

  function productCard(p, { layout = "rail", index = 0 } = {}) {
    const vis = catVisual(p.category);
    const card = document.createElement("article");
    card.className = "product-card";
    card.style.animationDelay = `${index * 0.06}s`;
    card.innerHTML = `
      ${p.popular ? '<span class="product-card__badge">Хит</span>' : ""}
      <div class="product-card__body">
        <h3 class="product-card__title">${escapeHtml(p.title)}</h3>
        <p class="product-card__meta">${escapeHtml(vis.label)}</p>
        <p class="product-card__price">${fmtPrice(p.amount)}</p>
      </div>
      <button type="button" class="product-card__buy" data-act="buy">Купить</button>
    `;
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "product-card__buy";
    addBtn.style.marginTop = "4px";
    addBtn.style.background = "rgba(255,255,255,0.15)";
    addBtn.style.color = "#fff";
    addBtn.textContent = "+ В корзину";
    addBtn.onclick = (e) => {
      e.stopPropagation();
      addToCart(p);
    };
    card.appendChild(addBtn);
    card.addEventListener("click", (e) => {
      if (e.target.closest('[data-act="buy"]')) {
        e.stopPropagation();
        purchase(p);
      } else if (e.target.closest(".product-card__buy")) {
        return;
      } else {
        openSheet(p);
      }
    });
    return card;
  }

  function purchase(p) {
    haptic("medium");
    const url = buyLink(p.id);
    if (url) {
      if (tg?.openTelegramLink) tg.openTelegramLink(url);
      else window.open(url, "_blank");
      closeSheet();
      setTimeout(() => tg?.close?.(), 300);
    } else if (tg?.showAlert) {
      tg.showAlert("Откройте магазин из Telegram-бота");
    }
  }

  function openSheet(p) {
    state.activeProduct = p;
    const vis = catVisual(p.category);
    const hero = $("#sheet-hero");
    hero.className = `sheet__hero sheet__hero--${vis.class}`;
    $("#sheet-cat").textContent = vis.label;
    $("#sheet-name").textContent = p.title;
    $("#sheet-price").textContent = fmtPrice(p.amount);
    $("#sheet-desc").textContent =
      p.description?.trim() || "Оформите заказ в боте — укажите Player ID и оплатите через PayCore.";

    $("#sheet-backdrop").classList.remove("hidden");
    requestAnimationFrame(() => {
      $("#sheet-backdrop").classList.add("visible");
      $("#product-sheet").classList.remove("hidden");
      requestAnimationFrame(() => $("#product-sheet").classList.add("open"));
    });

    if (tg?.MainButton) {
      tg.MainButton.setText(`Купить · ${fmtPrice(p.amount)}`);
      tg.MainButton.show();
      tg.MainButton.onClick(() => purchase(p));
    }
    haptic("light");
  }

  function closeSheet() {
    $("#product-sheet").classList.remove("open");
    $("#sheet-backdrop").classList.remove("visible");
    if (tg?.MainButton) {
      tg.MainButton.offClick?.(() => {});
      tg.MainButton.hide();
    }
    setTimeout(() => {
      $("#product-sheet").classList.add("hidden");
      $("#sheet-backdrop").classList.add("hidden");
      state.activeProduct = null;
    }, 350);
  }

  function renderCategories() {
    const grid = $("#cat-grid");
    grid.innerHTML = "";
    state.categories.forEach((c, i) => {
      const vis = CAT_VISUAL[c.id] || { emoji: c.emoji || "📦", class: "", label: c.title };
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `cat-card cat-card--${vis.class || c.id}`;
      btn.style.animationDelay = `${i * 0.07}s`;
      btn.innerHTML = `
        <span class="cat-card__icon">${c.emoji || vis.emoji}</span>
        <strong class="cat-card__title">${escapeHtml(c.title)}</strong>
        <span class="cat-card__sub">${escapeHtml(c.tagline || c.description?.slice(0, 48) || "")}</span>
        <span class="cat-card__arrow">→</span>
      `;
      btn.onclick = () => {
        haptic("light");
        openCategory(c);
      };
      grid.appendChild(btn);
    });
  }

  function renderPopular() {
    const grid = $("#product-grid");
    grid.innerHTML = "";
    const popular = state.products.filter((p) => p.popular);
    const list = (popular.length ? popular : state.products).slice(0, 8);
    list.forEach((p, i) => grid.appendChild(productCard(p, { index: i })));
  }

  function renderProductList(container, products) {
    container.innerHTML = "";
    products.forEach((p, i) => container.appendChild(productCard(p, { layout: "list", index: i })));
    if (!products.length) {
      container.innerHTML =
        '<p style="text-align:center;color:var(--muted);padding:32px 16px">В этом разделе пока нет товаров</p>';
    }
  }

  function openCategory(cat) {
    $("#app").classList.add("hidden");
    $("#view-catalog").classList.remove("hidden");
    $("#view-catalog").setAttribute("aria-hidden", "false");
    $("#cat-title").textContent = cat.title;
    const products = state.products.filter((p) => p.category === cat.id);
    renderProductList($("#cat-products"), products);
    $$(".dock__item").forEach((d) => d.classList.remove("dock__item--active"));
  }

  function openAllProducts(filter = "all") {
    state.filterCat = filter;
    $("#app").classList.add("hidden");
    $("#view-all").classList.remove("hidden");
    renderFilterTabs();
    renderAllProducts();
    $$(".dock__item").forEach((d) => d.classList.remove("dock__item--active"));
  }

  function renderFilterTabs() {
    const tabs = $("#filter-tabs");
    tabs.innerHTML = "";
    const all = { id: "all", title: "Все" };
    const items = [all, ...state.categories];
    items.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `filter-tab${state.filterCat === c.id ? " filter-tab--active" : ""}`;
      btn.textContent = c.title;
      btn.onclick = () => {
        haptic("light");
        state.filterCat = c.id;
        renderFilterTabs();
        renderAllProducts();
      };
      tabs.appendChild(btn);
    });
  }

  function renderAllProducts() {
    const list =
      state.filterCat === "all"
        ? state.products
        : state.products.filter((p) => p.category === state.filterCat);
    renderProductList($("#all-products"), list);
  }

  function goHome() {
    $("#view-catalog").classList.add("hidden");
    $("#view-catalog").setAttribute("aria-hidden", "true");
    $("#view-all").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $$(".dock__item").forEach((d) => {
      d.classList.toggle("dock__item--active", d.dataset.nav === "home");
    });
    haptic("light");
  }

  function hideSplash() {
    const splash = $("#splash");
    splash.classList.add("done");
    $("#app").classList.remove("hidden");
    setTimeout(() => splash.remove(), 600);
  }

  async function load() {
    const res = await fetch(`${API}/bootstrap`);
    if (!res.ok) throw new Error("Не удалось загрузить каталог");
    const data = await res.json();

    state.products = data.products || [];
    state.categories = data.categories || [];
    state.botUsername = data.bot_username;
    state.reviewsUrl = data.reviews_url || "#";
    state.metroUrl = data.metro_shop_url || "#";
    state.shopName = data.shop_name || "Metro Shop";
    state.branding = data;
    if (data.theme_accent) document.documentElement.style.setProperty("--accent", data.theme_accent);
    if (data.theme_bg) {
      document.documentElement.style.setProperty("--bg", data.theme_bg);
      document.body.style.background = data.theme_bg;
    }
    if (data.logo_url) $("#shop-avatar").src = data.logo_url;
    if (data.promo?.title) {
      const banner = document.createElement("div");
      banner.className = "promo-banner";
      banner.textContent = data.promo.title;
      $("#main-scroll")?.prepend(banner);
    }

    $("#hero-brand").textContent = state.shopName;
    $("#hero-tagline").textContent = data.display_name || "PUBG Mobile · Metro Royale";
    document.title = state.shopName;
    $("#top-status").textContent = "online";

    $("#link-reviews").href = state.reviewsUrl;
    $("#link-channel").href = state.metroUrl;
    $("#link-support").href = data.support_contact?.startsWith("http")
      ? data.support_contact
      : `https://t.me/${(data.support_contact || "").replace(/^@/, "")}`;

    renderCategories();
    renderPopular();
    hideSplash();
  }

  function initNav() {
    $("#banner-cta").onclick = () => {
      haptic("medium");
      openAllProducts("all");
    };

    $("#btn-all-products").onclick = () => openAllProducts("all");

    $("#btn-profile").onclick = () => {
      haptic("light");
      const u = tg?.initDataUnsafe?.user;
      const name = u?.first_name ? `${u.first_name}${u.username ? ` (@${u.username})` : ""}` : "Гость";
      if (tg?.showPopup) {
        tg.showPopup({
          title: "Профиль",
          message: `${name}\nID: ${u?.id || "—"}`,
          buttons: [{ type: "ok" }],
        });
      } else if (tg?.showAlert) {
        tg.showAlert(`${name}\nID: ${u?.id || "—"}`);
      }
    };

    $$("[data-back]").forEach((b) => (b.onclick = goHome));
    $$("[data-back-all]").forEach((b) => (b.onclick = goHome));

    $$(".dock__item").forEach((btn) => {
      btn.onclick = () => {
        haptic("light");
        const nav = btn.dataset.nav;
        if (nav === "home") {
          goHome();
          return;
        }
        if (nav === "catalog") {
          openAllProducts("all");
          return;
        }
        if (nav === "reviews") {
          if (state.reviewsUrl && state.reviewsUrl !== "#") {
            if (tg?.openTelegramLink) tg.openTelegramLink(state.reviewsUrl);
            else window.open(state.reviewsUrl, "_blank");
          }
        }
      };
    });

    $("#sheet-buy").onclick = () => {
      if (state.activeProduct) purchase(state.activeProduct);
    };

    $("#sheet-backdrop").onclick = () => {
      closeSheet();
      closeCartSheet();
    };

    $("#cart-fab").onclick = () => {
      haptic("light");
      openCartSheet();
    };

    $("#cart-checkout").onclick = async () => {
      if (!state.cart.length) {
        tg?.showAlert?.("Корзина пуста");
        return;
      }
      const pubgId = $("#cart-pubg-id").value.trim();
      if (!/^\d{5,}$/.test(pubgId)) {
        tg?.showAlert?.("Укажите Player ID (цифры)");
        return;
      }
      haptic("medium");
      try {
        const res = await fetch(`${API}/cart/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...initDataHeader() },
          body: JSON.stringify({
            items: state.cart,
            pubg_id: pubgId,
            promo_code: $("#cart-promo").value.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Ошибка оформления");
        state.cart = [];
        updateCartUi();
        closeCartSheet();
        if (data.paycore_url && tg?.openLink) tg.openLink(data.paycore_url);
        else if (data.paycore_url) window.open(data.paycore_url, "_blank");
        tg?.showAlert?.(`Заказ ${data.order_id} создан!`);
        setTimeout(() => tg?.close?.(), 500);
      } catch (e) {
        tg?.showAlert?.(e.message);
      }
    };

    let startY = 0;
    const sheet = $("#product-sheet");
    sheet.addEventListener(
      "touchstart",
      (e) => {
        startY = e.touches[0].clientY;
      },
      { passive: true },
    );
    sheet.addEventListener(
      "touchend",
      (e) => {
        const dy = e.changedTouches[0].clientY - startY;
        if (dy > 80) closeSheet();
      },
      { passive: true },
    );
  }

  applyTelegramTheme();
  spawnParticles();
  initNav();

  load().catch((e) => {
    $("#splash").querySelector(".splash__title").textContent = "Ошибка";
    const bar = $(".splash__bar");
    if (bar) bar.style.display = "none";
    const err = document.createElement("p");
    err.style.cssText = "color:var(--danger);font-size:14px;margin-top:8px";
    err.textContent = e.message || "Ошибка загрузки";
    $("#splash").appendChild(err);
  });
})();
