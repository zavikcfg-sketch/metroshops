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

  async function loadBots() {
    const { items } = await api("/bots");
    $("#bots-list").innerHTML = items
      .map(
        (b) => `
      <div class="bot-item">
        <h3>${b.display_name}</h3>
        <p class="muted">@${b.slug} · ${b.shop_name}</p>
        <p><a href="${b.admin_url}" target="_blank">${b.admin_url}</a></p>
        <span class="badge ${b.active ? "badge-green" : ""}">${b.active ? "Активен" : "Выкл"}</span>
      </div>`,
      )
      .join("");
  }

  $("#create-bot-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      token: fd.get("token"),
      display_name: fd.get("display_name"),
      admin_password: fd.get("admin_password") || undefined,
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
        <p><strong>Бот создан:</strong> @${data.bot.username}</p>
        <p>Админка: <a href="${data.admin_url}" target="_blank">${data.admin_url}</a></p>
        <p>Пароль клиента: <code>${data.admin_password}</code></p>
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
