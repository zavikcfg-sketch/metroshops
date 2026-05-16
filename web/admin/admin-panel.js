document.addEventListener("DOMContentLoaded", () => {
    const TOKEN_KEY = "metro_admin_token";

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
      const res = await fetch(path, { ...opts, headers });
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
      if (name === "products") loadProducts();
      if (name === "promos") loadPromos();
      if (name === "invoices") loadOrders();
      if (name === "users") loadUsers();
      if (name === "markups") loadCategories();
      if (name === "stats" || name === "home") loadStats();
      if (name === "wallet") {
        $("#wallet-date").textContent = new Date().toLocaleString("ru-RU");
      }
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

    async function loadOrders() {
      const { items } = await api("/api/orders");
      $("#orders-tbody").innerHTML = items
        .map(
          (o) => `
        <tr>
          <td>${o.id}</td>
          <td>${o.created_at?.slice(0, 16).replace("T", " ") || ""}</td>
          <td>${escapeHtml(o.product_title)}</td>
          <td>${o.amount} ${o.currency}</td>
          <td><code>${o.pubg_id || "—"}</code></td>
          <td>${o.status}</td>
        </tr>`,
        )
        .join("");
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
      $("#refresh-products").onclick = loadProducts;
      $("#refresh-orders").onclick = loadOrders;
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
