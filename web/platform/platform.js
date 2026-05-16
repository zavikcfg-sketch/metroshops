document.addEventListener("DOMContentLoaded", () => {
  const TOKEN_KEY = "metro_platform_token";
  const $ = (s) => document.querySelector(s);

  const api = async (path, opts = {}) => {
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`/platform/api${path}`, { ...opts, headers });
    if (res.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      location.reload();
      throw new Error("auth");
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  $("#login-btn").onclick = async () => {
    const err = $("#login-error");
    err.classList.add("hidden");
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: $("#login-password").value }),
      });
      sessionStorage.setItem(TOKEN_KEY, data.token);
      $("#login-screen").classList.add("hidden");
      $("#app").classList.remove("hidden");
      loadBots();
    } catch {
      err.textContent = "Неверный пароль";
      err.classList.remove("hidden");
    }
  };

  $("#logout-btn").onclick = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
  };

  async function botAction(id, action) {
    return api(`/bots/${id}/${action}`, { method: "POST" });
  }

  async function loadBots() {
    const { items } = await api("/bots");
    $("#bots-list").innerHTML = items
      .map((b) => {
        const runBadge = b.running
          ? '<span class="badge badge-green">В Telegram работает</span>'
          : '<span class="badge">Остановлен</span>';
        const tg = b.username ? `@${escapeHtml(b.username)}` : "—";
        const canDelete = b.slug !== "main";
        return `
      <div class="bot-item">
        <h3>${escapeHtml(b.display_name)}</h3>
        <p class="muted">${tg} · slug: ${escapeHtml(b.slug)}</p>
        <p>Админка: <a href="${b.admin_url}" target="_blank">${b.admin_url}</a></p>
        <p><strong>Пароль админки:</strong> <code class="admin-pw">${escapeHtml(b.admin_password)}</code>
          <button type="button" class="btn btn-ghost btn-sm btn-copy-pw" data-pw="${escapeHtml(b.admin_password)}">Копировать</button>
        </p>
        <p>${runBadge}</p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.75rem;">
          <button type="button" class="btn btn-primary btn-sm" data-start="${b.id}">▶ Запуск</button>
          <button type="button" class="btn btn-ghost btn-sm" data-stop="${b.id}">⏹ Стоп</button>
          <button type="button" class="btn btn-ghost btn-sm" data-restart="${b.id}">↻ Рестарт</button>
          ${canDelete ? `<button type="button" class="btn btn-danger btn-sm" data-del="${b.id}" data-name="${escapeHtml(b.display_name)}">Удалить</button>` : ""}
        </div>
      </div>`;
      })
      .join("");

    $("#bots-list").querySelectorAll("[data-copy-pw]").forEach((btn) => {
      btn.onclick = () => {
        navigator.clipboard.writeText(btn.dataset.pw);
        btn.textContent = "Скопировано";
        setTimeout(() => (btn.textContent = "Копировать"), 1500);
      };
    });
    $("#bots-list").querySelectorAll("[data-start]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await botAction(btn.dataset.start, "start");
          loadBots();
        } catch (e) {
          alert(e.message);
        }
      };
    });
    $("#bots-list").querySelectorAll("[data-stop]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await botAction(btn.dataset.stop, "stop");
          loadBots();
        } catch (e) {
          alert(e.message);
        }
      };
    });
    $("#bots-list").querySelectorAll("[data-restart]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await botAction(btn.dataset.restart, "restart");
          loadBots();
        } catch (e) {
          alert(e.message);
        }
      };
    });
    $("#bots-list").querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm(`Удалить бота «${btn.dataset.name}»? Данные и токен будут удалены.`)) return;
        try {
          await api(`/bots/${btn.dataset.del}`, { method: "DELETE" });
          loadBots();
        } catch (e) {
          alert(e.message);
        }
      };
    });
  }

  $("#create-bot-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const adminPassword = String(fd.get("admin_password") || "").trim();
    if (adminPassword.length < 4) {
      alert("Укажите пароль админки (минимум 4 символа)");
      return;
    }
    const body = {
      token: fd.get("token"),
      display_name: fd.get("display_name"),
      admin_password: adminPassword,
    };
    const file = fd.get("avatar");
    if (file && file.size) {
      const b64 = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(file);
      });
      body.avatar_base64 = b64;
    }
    try {
      const data = await api("/bots", { method: "POST", body: JSON.stringify(body) });
      const box = $("#create-result");
      box.classList.add("visible");
      box.innerHTML = `
        <p><strong>Бот создан и запущен:</strong> @${escapeHtml(data.bot.username || "—")}</p>
        <p>Админка: <a href="${data.admin_url}" target="_blank">${data.admin_url}</a></p>
        <p><strong>Пароль админки (как вы указали):</strong> <code>${escapeHtml(data.admin_password)}</code></p>
        <p class="muted">Передайте клиенту ссылку и пароль. Бот уже отвечает в Telegram.</p>
      `;
      e.target.reset();
      loadBots();
    } catch (err) {
      alert(err.message);
    }
  };

  if (sessionStorage.getItem(TOKEN_KEY)) {
    $("#login-screen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    loadBots();
  }
});
