document.addEventListener("DOMContentLoaded", () => {
    const slug = window.__TENANT_SLUG__ || "main";
    const API_BASE = window.__API_BASE__ || `/b/${slug}/api`;
    const TOKEN_KEY = `metro_admin_${slug}`;

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];

    function token() {
      return sessionStorage.getItem(TOKEN_KEY);
    }

    function setToken(t) {
      sessionStorage.setItem(TOKEN_KEY, t);
    }

    function logout() {
      sessionStorage.removeItem(TOKEN_KEY);
      location.reload();
    }

    async function api(path, opts = {}) {
      const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
      if (token()) headers.Authorization = `Bearer ${token()}`;
      const p = path.startsWith("/api/") ? path.slice(4) : path;
      const url = path.startsWith("http") ? path : `${API_BASE}${p}`;
      const res = await fetch(url, { ...opts, headers });
      if (res.status === 401) {
        logout();
        throw new Error("auth");
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      return res.json();
    }

    function showPage(name) {
      $$(".page").forEach((p) => p.classList.add("hidden"));
      $$(".nav-link").forEach((a) => a.classList.remove("active"));
      const page = $(`#page-${name}`);
      const link = $(`.nav-link[data-page="${name}"]`);
      if (page) page.classList.remove("hidden");
      if (link) link.classList.add("active");
      if (name === "buttons") loadButtons();
      if (name === "bots") loadBotControl();
      if (name === "products") loadProducts();
      if (name === "promos") loadPromos();
      if (name === "invoices") loadOrders();
      if (name === "users") loadUsers();
      if (name === "markups") loadCategories();
      if (name === "stats" || name === "home") {
        loadStats();
        loadOnboarding();
      }
      if (name === "branding") loadBranding();
      if (name === "broadcast") {
        $("#broadcast-result").textContent = "";
      }
      if (name === "wallet") {
        $("#wallet-date").textContent = new Date().toLocaleString("ru-RU");
      }
    }

    async function loadBotControl() {
      const st = await api("/bot/status");
      $("#bot-title").textContent = st.display_name || "Мой бот";
      $("#bot-username").textContent = st.username ? `@${st.username}` : "—";
      const statusEl = $("#bot-status-text");
      const msg = $("#bot-control-msg");
      if (st.running) {
        statusEl.innerHTML = '<span class="badge badge-green">Работает в Telegram</span>';
      } else {
        statusEl.innerHTML = '<span class="badge">Остановлен</span>';
      }
      msg.textContent = st.telegram_ok
        ? "Управление polling на сервере."
        : "Проверьте токен бота у главного админа.";
    }

    async function botControl(action) {
      const msg = $("#bot-control-msg");
      msg.textContent = "Выполняется…";
      try {
        const data = await api(`/bot/${action}`, { method: "POST" });
        msg.textContent =
          action === "start"
            ? `Запущен @${data.username || "бот"}`
            : action === "stop"
              ? "Бот остановлен"
              : "Перезапуск выполнен";
        await loadBotControl();
      } catch (e) {
        msg.textContent = e.message;
      }
    }

    let menuButtonsCache = [];
    let emojiPresetsCache = [];

    function readCard(card) {
      return {
        button_key: card.dataset.key,
        label: card.querySelector(".inp-label").value,
        action_type: card.querySelector(".inp-type").value,
        action_value: card.querySelector(".inp-value").value,
        style: card.querySelector(".inp-style").value,
        row_order: Number(card.querySelector(".inp-row").value),
        sort_order: Number(card.querySelector(".inp-sort").value),
        icon_emoji_id: card.querySelector(".inp-emoji").value.trim() || null,
        enabled: card.querySelector(".inp-enabled").checked,
      };
    }

    function renderKeyboardPreview(items) {
      const enabled = items.filter((b) => b.enabled);
      const rows = new Map();
      for (const b of enabled) {
        const r = b.row_order ?? 0;
        if (!rows.has(r)) rows.set(r, []);
        rows.get(r).push(b);
      }
      const preview = $("#tg-keyboard-preview");
      preview.innerHTML = "";
      [...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .forEach(([, cells]) => {
          const rowEl = document.createElement("div");
          rowEl.className = "tg-kb-row";
          cells
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .forEach((b) => {
              const el = document.createElement("span");
              el.className = `tg-kb-btn style-${b.style || "primary"}`;
              if (b.icon_emoji_id) {
                const badge = document.createElement("span");
                badge.className = "emoji-badge";
                badge.title = b.icon_emoji_id;
                badge.textContent = "✨";
                el.appendChild(badge);
              }
              el.appendChild(document.createTextNode(b.label || b.button_key));
              rowEl.appendChild(el);
            });
          preview.appendChild(rowEl);
        });
      if (!preview.children.length) {
        preview.innerHTML = '<p class="muted small">Нет активных кнопок</p>';
      }
    }

    function bindMenuCard(card) {
      const save = async () => {
        const body = readCard(card);
        await api(`/menu-buttons/${body.button_key}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        const idx = menuButtonsCache.findIndex((x) => x.button_key === body.button_key);
        if (idx >= 0) menuButtonsCache[idx] = { ...menuButtonsCache[idx], ...body };
        renderKeyboardPreview(menuButtonsCache);
        const btn = card.querySelector(".btn-save-row");
        btn.textContent = "Сохранено ✓";
        setTimeout(() => (btn.textContent = "Сохранить"), 1200);
      };
      card.querySelector(".btn-save-row").onclick = save;
      card.querySelectorAll("input, select").forEach((el) => {
        el.addEventListener("change", () => {
          const body = readCard(card);
          const idx = menuButtonsCache.findIndex((x) => x.button_key === body.button_key);
          if (idx >= 0) menuButtonsCache[idx] = { ...menuButtonsCache[idx], ...body };
          card.classList.toggle("disabled", !body.enabled);
          renderKeyboardPreview(menuButtonsCache);
        });
      });
      card.querySelector(".btn-del-row")?.addEventListener("click", async () => {
        if (!confirm(`Удалить кнопку «${card.dataset.key}»?`)) return;
        await api(`/menu-buttons/${card.dataset.key}`, { method: "DELETE" });
        await loadButtons();
      });
    }

    function menuButtonCardHtml(b) {
      return `
        <article class="menu-btn-card ${b.enabled ? "" : "disabled"}" data-key="${escapeHtml(b.button_key)}">
          <div class="menu-btn-card-head">
            <code>${escapeHtml(b.button_key)}</code>
            <label class="checkbox" style="margin:0;font-size:13px;color:var(--text)">
              <input type="checkbox" class="inp-enabled" ${b.enabled ? "checked" : ""} /> Вкл
            </label>
          </div>
          <div class="menu-btn-card-fields">
            <label class="full">Текст кнопки
              <input class="inp-label" value="${escapeHtml(b.label)}" />
            </label>
            <label>Премиум emoji ID
              <input class="inp-emoji" value="${escapeHtml(b.icon_emoji_id || "")}" placeholder="5204201311238629537" />
            </label>
            <label>Тип
              <select class="inp-type">
                <option value="callback" ${b.action_type === "callback" ? "selected" : ""}>callback</option>
                <option value="url" ${b.action_type === "url" ? "selected" : ""}>url</option>
                <option value="web_app" ${b.action_type === "web_app" ? "selected" : ""}>web_app</option>
              </select>
            </label>
            <label class="full">Значение
              <input class="inp-value" value="${escapeHtml(b.action_value)}" />
            </label>
            <label>Цвет
              <select class="inp-style">
                <option value="primary" ${b.style === "primary" ? "selected" : ""}>primary</option>
                <option value="success" ${b.style === "success" ? "selected" : ""}>success</option>
                <option value="danger" ${b.style === "danger" ? "selected" : ""}>danger</option>
              </select>
            </label>
            <label>Ряд<input class="inp-row" type="number" value="${b.row_order ?? 0}" /></label>
            <label>Порядок<input class="inp-sort" type="number" value="${b.sort_order ?? 0}" /></label>
          </div>
          <div class="menu-btn-card-actions">
            <button type="button" class="btn btn-primary btn-sm btn-save-row">Сохранить</button>
            <button type="button" class="btn btn-danger btn-sm btn-del-row">Удалить</button>
          </div>
        </article>`;
    }

    async function loadEmojiPresets() {
      if (emojiPresetsCache.length) return emojiPresetsCache;
      try {
        const { items } = await api("/menu-buttons/emoji-presets");
        emojiPresetsCache = items || [];
      } catch {
        emojiPresetsCache = [];
      }
      return emojiPresetsCache;
    }

    function renderEmojiPresets(container, onPick) {
      container.innerHTML = emojiPresetsCache
        .map(
          (e) =>
            `<button type="button" class="emoji-preset-btn" data-id="${e.id}" title="${e.id}">${e.glyph} ${escapeHtml(e.label)}</button>`,
        )
        .join("");
      container.querySelectorAll(".emoji-preset-btn").forEach((btn) => {
        btn.onclick = () => onPick(btn.dataset.id);
      });
    }

    async function loadButtons() {
      const { items, mini_app_url } = await api("/menu-buttons");
      menuButtonsCache = items;
      const grid = $("#buttons-grid");
      grid.innerHTML = items.map((b) => menuButtonCardHtml(b)).join("");
      grid.querySelectorAll(".menu-btn-card").forEach(bindMenuCard);
      renderKeyboardPreview(items);
      if (mini_app_url) {
        const link = $("#miniapp-link");
        link.href = mini_app_url;
        link.classList.remove("hidden");
      }
      await loadEmojiPresets();
    }

    function openMenuBtnModal(editBtn = null) {
      const modal = $("#menu-btn-modal");
      const form = $("#menu-btn-form");
      form.reset();
      form.edit_mode.value = editBtn ? "1" : "";
      const keyInput = form.button_key;
      keyInput.disabled = !!editBtn;
      $("#menu-btn-modal-title").textContent = editBtn ? "Редактировать кнопку" : "Новая кнопка";
      if (editBtn) {
        keyInput.value = editBtn.button_key;
        form.label.value = editBtn.label;
        form.icon_emoji_id.value = editBtn.icon_emoji_id || "";
        form.action_type.value = editBtn.action_type;
        form.action_value.value = editBtn.action_value;
        form.style.value = editBtn.style || "primary";
        form.row_order.value = editBtn.row_order ?? 0;
        form.sort_order.value = editBtn.sort_order ?? 0;
        form.enabled.checked = !!editBtn.enabled;
      }
      renderEmojiPresets($("#emoji-presets"), (id) => {
        form.icon_emoji_id.value = id;
      });
      modal.showModal();
    }

    async function loadStats() {
      const data = await api("/api/stats");
      const html = `
        <div class="stat-card"><span class="muted">Заказов</span><strong>${data.orders_count}</strong></div>
        <div class="stat-card"><span class="muted">Продажи</span><strong>${data.sales_total} ₽</strong></div>
        <div class="stat-card"><span class="muted">Пользователей</span><strong>${data.users_total}</strong></div>
        <div class="stat-card"><span class="muted">С покупками</span><strong>${data.buyers_count}</strong></div>
        <div class="stat-card"><span class="muted">Товаров</span><strong>${data.products_active}</strong></div>
      `;
      $("#home-stats").innerHTML = html;
      $("#stats-grid").innerHTML = html;
      $("#wallet-rub").textContent = `${data.sales_total} ₽`;
    }

    const CAT_LABELS = { escort: "Сопровождение", boost: "Буст", gear: "Снаряжение" };

    async function loadProducts() {
      const { items } = await api("/api/products");
      const tb = $("#products-tbody");
      tb.innerHTML = items
        .map(
          (p) => `
        <tr>
          <td><strong>${escapeHtml(p.title)}</strong><br><small class="muted">${p.id}</small></td>
          <td>${CAT_LABELS[p.category] || p.category}</td>
          <td>${p.amount > 0 ? p.amount + " ₽" : "по запросу"}</td>
          <td>${p.popular ? "✓" : "—"}</td>
          <td>${p.active ? "✓" : "—"}</td>
          <td>
            <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Изм.</button>
            <button class="btn btn-danger btn-sm" data-del="${p.id}">Удалить</button>
          </td>
        </tr>`,
        )
        .join("");

      tb.querySelectorAll("[data-del]").forEach((btn) => {
        btn.onclick = async () => {
          if (!confirm("Удалить товар?")) return;
          await api(`/api/products/${btn.dataset.del}`, { method: "DELETE" });
          loadProducts();
        };
      });
      tb.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.onclick = () => openProductModal(items.find((x) => x.id === btn.dataset.edit));
      });
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    const productModal = $("#product-modal");
    const productForm = $("#product-form");

    function openProductModal(product = null) {
      productForm.reset();
      productForm.edit_id.value = product?.id || "";
      $("#product-modal-title").textContent = product ? "Редактировать товар" : "Новый товар";
      if (product) {
        productForm.title.value = product.title;
        productForm.category.value = product.category;
        productForm.amount.value = product.amount;
        productForm.description.value = product.description || "";
        productForm.button_style.value = product.button_style || "primary";
        productForm.popular.checked = !!product.popular;
        productForm.active.checked = !!product.active;
      }
      productModal.showModal();
    }

    productForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(productForm);
      const body = {
        title: fd.get("title"),
        category: fd.get("category"),
        amount: Number(fd.get("amount")),
        description: fd.get("description"),
        button_style: fd.get("button_style"),
        popular: fd.get("popular") === "on",
        active: fd.get("active") === "on",
      };
      const editId = fd.get("edit_id");
      if (editId) {
        await api(`/api/products/${editId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api("/api/products", { method: "POST", body: JSON.stringify(body) });
      }
      productModal.close();
      loadProducts();
    };

    async function loadPromos() {
      const { items } = await api("/api/promos");
      $("#promos-tbody").innerHTML = items
        .map(
          (p) => `
        <tr>
          <td>${escapeHtml(p.code)}</td>
          <td>${p.discount_percent}%</td>
          <td>${p.use_limit}</td>
          <td>${p.uses_left}</td>
          <td><button class="btn btn-danger btn-sm" data-del="${p.code}">Удалить</button></td>
        </tr>`,
        )
        .join("");
      $("#promos-tbody").querySelectorAll("[data-del]").forEach((btn) => {
        btn.onclick = async () => {
          await api(`/api/promos/${btn.dataset.del}`, { method: "DELETE" });
          loadPromos();
        };
      });
    }

    let orderStatuses = {};

    async function loadOrders() {
      const { items, statuses } = await api("/orders");
      orderStatuses = statuses || {};
      $("#orders-tbody").innerHTML = items
        .map(
          (o) => `
        <tr data-order="${escapeHtml(o.id)}">
          <td>${o.id}</td>
          <td>${o.created_at?.slice(0, 16).replace("T", " ") || ""}</td>
          <td>${escapeHtml(o.product_title)}<br><small class="muted">${o.source || ""}</small></td>
          <td>${o.amount} ${o.currency}</td>
          <td><code>${o.pubg_id || "—"}</code></td>
          <td>
            <select class="order-status-select" data-id="${escapeHtml(o.id)}">
              ${Object.keys(orderStatuses)
                .map(
                  (k) =>
                    `<option value="${k}" ${k === o.status ? "selected" : ""}>${orderStatuses[k] || k}</option>`,
                )
                .join("")}
            </select>
          </td>
        </tr>`,
        )
        .join("");
      $("#orders-tbody").querySelectorAll(".order-status-select").forEach((sel) => {
        sel.onchange = async () => {
          await api(`/orders/${sel.dataset.id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: sel.value }),
          });
        };
      });
    }

    async function loadOnboarding() {
      const { steps } = await api("/onboarding");
      const el = $("#onboarding-card");
      if (!el) return;
      el.innerHTML =
        `<h3>Чеклист запуска</h3><ul class="onboarding-list">` +
        steps
          .map(
            (s) =>
              `<li class="${s.done ? "done" : ""}">${s.done ? "✅" : "⬜"} ${escapeHtml(s.label)}${
                s.url ? ` — <a href="${s.url}" target="_blank">открыть</a>` : ""
              }</li>`,
          )
          .join("") +
        `</ul>`;
    }

    async function loadBranding() {
      const b = await api("/branding");
      const f = $("#branding-form");
      if (!f) return;
      f.shop_name.value = b.shop_name || "";
      f.theme_accent.value = b.theme_accent || "#b8ff5c";
      f.theme_bg.value = b.theme_bg || "#050807";
      f.promo_title.value = b.promo_title || "";
      f.promo_ends_at.value = b.promo_ends_at ? b.promo_ends_at.slice(0, 16) : "";
      f.notify_chat_ids.value = b.notify_chat_ids || "";
    }

    async function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }

    async function loadUsers() {
      const { items } = await api("/api/users");
      $("#users-tbody").innerHTML = items
        .map(
          (u) => `
        <tr>
          <td>${u.user_id}</td>
          <td>${u.username ? "@" + escapeHtml(u.username) : "—"}</td>
          <td>${u.orders_count}</td>
          <td>${u.total_spent} ₽</td>
        </tr>`,
        )
        .join("");
    }

    async function loadCategories() {
      const { items } = await api("/api/categories");
      const labels = { escort: "Сопровождение", boost: "Буст", gear: "Снаряжение" };
      $("#categories-list").innerHTML = items
        .map(
          (c) => `
        <div class="toggle-row">
          <span>${labels[c.category] || c.category}</span>
          <button type="button" class="switch ${c.enabled ? "on" : ""}" data-cat="${c.category}"></button>
        </div>`,
        )
        .join("");
      $("#categories-list").querySelectorAll(".switch").forEach((sw) => {
        sw.onclick = async () => {
          const on = !sw.classList.contains("on");
          await api(`/api/categories/${sw.dataset.cat}`, {
            method: "PATCH",
            body: JSON.stringify({ enabled: on }),
          });
          sw.classList.toggle("on", on);
        };
      });
    }

    function initApp() {
      $("#login-screen").classList.add("hidden");
      $("#app").classList.remove("hidden");

      $$("[data-close]").forEach((b) => {
        b.onclick = () => b.closest("dialog").close();
      });

      $("#logout-btn").onclick = logout;
      $("#add-product-btn").onclick = () => openProductModal();
      $("#bot-btn-start").onclick = () => botControl("start");
      $("#bot-btn-stop").onclick = () => botControl("stop");
      $("#bot-btn-restart").onclick = () => botControl("restart");
      $("#refresh-buttons").onclick = loadButtons;
      $("#add-menu-btn").onclick = () => openMenuBtnModal();

      $("#menu-btn-form").onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const key = String(fd.get("button_key") || "")
          .trim()
          .replace(/[^a-z0-9_]/gi, "_");
        const body = {
          button_key: key,
          label: fd.get("label"),
          action_type: fd.get("action_type"),
          action_value: fd.get("action_value"),
          style: fd.get("style"),
          row_order: Number(fd.get("row_order")),
          sort_order: Number(fd.get("sort_order")),
          icon_emoji_id: String(fd.get("icon_emoji_id") || "").trim() || null,
          enabled: fd.get("enabled") === "on",
        };
        if (fd.get("edit_mode")) {
          await api(`/menu-buttons/${key}`, { method: "PUT", body: JSON.stringify(body) });
        } else {
          await api("/menu-buttons", { method: "POST", body: JSON.stringify(body) });
        }
        $("#menu-btn-modal").close();
        loadButtons();
      };
      $("#refresh-products").onclick = loadProducts;
      $("#refresh-orders").onclick = loadOrders;
      $("#export-orders")?.addEventListener("click", async (e) => {
        e.preventDefault();
        const res = await fetch(`${API_BASE}/orders/export.csv`, {
          headers: { Authorization: `Bearer ${token()}` },
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "orders.csv";
        a.click();
      });

      $("#branding-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await api("/branding", {
          method: "PATCH",
          body: JSON.stringify({
            shop_name: fd.get("shop_name"),
            theme_accent: fd.get("theme_accent"),
            theme_bg: fd.get("theme_bg"),
            promo_title: fd.get("promo_title"),
            promo_ends_at: fd.get("promo_ends_at")
              ? new Date(fd.get("promo_ends_at")).toISOString()
              : null,
            notify_chat_ids: fd.get("notify_chat_ids"),
          }),
        });
        const logo = fd.get("logo_file");
        if (logo?.size) {
          await api("/branding/upload", {
            method: "POST",
            body: JSON.stringify({ kind: "logo", image_base64: await fileToBase64(logo) }),
          });
        }
        const banner = fd.get("banner_file");
        if (banner?.size) {
          await api("/branding/upload", {
            method: "POST",
            body: JSON.stringify({ kind: "banner", image_base64: await fileToBase64(banner) }),
          });
        }
        alert("Сохранено");
      });

      $("#broadcast-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = new FormData(e.target).get("message");
        const r = await api("/broadcast", { method: "POST", body: JSON.stringify({ message: msg }) });
        $("#broadcast-result").textContent = `Отправлено: ${r.sent} · ошибок: ${r.fail}`;
      });
      $("#add-promo-btn").onclick = () => $("#promo-modal").showModal();

      $("#promo-form").onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await api("/api/promos", {
          method: "POST",
          body: JSON.stringify({
            code: fd.get("code"),
            discount_percent: Number(fd.get("discount_percent")),
            use_limit: Number(fd.get("use_limit")),
          }),
        });
        $("#promo-modal").close();
        loadPromos();
      };

      $$(".nav-link").forEach((a) => {
        a.onclick = (e) => {
          e.preventDefault();
          showPage(a.dataset.page);
          location.hash = a.dataset.page;
        };
      });

      api("/api/meta").then((m) => {
        $("#sidebar-name").textContent = m.brand.split(" ")[0] || "WIXYEZ";
        $("#welcome-name").textContent = m.brand.split(" ")[0] || "WIXYEZ";
      });

      const page = location.hash.replace("#", "") || "home";
      showPage(page);
    }

    $("#login-btn").onclick = async () => {
      const err = $("#login-error");
      err.classList.add("hidden");
      try {
        const data = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ password: $("#login-password").value }),
        });
        setToken(data.token);
        initApp();
      } catch (e) {
        err.textContent = "Неверный пароль";
        err.classList.remove("hidden");
      }
    };

    if (token()) {
      initApp();
    }
  });
