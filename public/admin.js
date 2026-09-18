// admin.js — talks to the same /api/leads and /api/bookings endpoints the
// server already locks behind ADMIN_KEY. This page holds no data of its
// own; everything here is fetched live using the key you enter.

(function () {
  const SESSION_KEY = "brightSmileAdminKey";

  const gate = document.getElementById("gate");
  const dashboard = document.getElementById("dashboard");
  const keyInput = document.getElementById("key-input");
  const unlockBtn = document.getElementById("unlock-btn");
  const gateError = document.getElementById("gate-error");
  const refreshBtn = document.getElementById("refresh-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const statsRow = document.getElementById("stats-row");
  const bookingsBody = document.getElementById("bookings-body");
  const leadsBody = document.getElementById("leads-body");
  const bookingsEmpty = document.getElementById("bookings-empty");
  const leadsEmpty = document.getElementById("leads-empty");
  const tabBtns = document.querySelectorAll(".tab-btn");
  const panels = { bookings: document.getElementById("bookings-panel"), leads: document.getElementById("leads-panel") };

  // Admin key lives only in sessionStorage — cleared when the tab closes,
  // never written to localStorage or anywhere persistent.
  let adminKey = sessionStorage.getItem(SESSION_KEY) || "";

  unlockBtn.addEventListener("click", () => tryUnlock(keyInput.value.trim()));
  keyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryUnlock(keyInput.value.trim());
  });
  refreshBtn.addEventListener("click", loadData);
  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    adminKey = "";
    dashboard.classList.add("hidden");
    gate.classList.remove("hidden");
    keyInput.value = "";
    keyInput.focus();
  });
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      Object.entries(panels).forEach(([name, el]) => el.classList.toggle("hidden", name !== btn.dataset.tab));
    });
  });

  async function tryUnlock(candidateKey) {
    if (!candidateKey) return;
    gateError.textContent = "";
    unlockBtn.disabled = true;
    unlockBtn.textContent = "Checking…";

    const ok = await fetchWithKey("/api/leads", candidateKey).then((r) => r && r.ok).catch(() => false);

    unlockBtn.disabled = false;
    unlockBtn.textContent = "Unlock";

    if (ok) {
      adminKey = candidateKey;
      sessionStorage.setItem(SESSION_KEY, adminKey);
      gate.classList.add("hidden");
      dashboard.classList.remove("hidden");
      loadData();
    } else {
      gateError.textContent = "That key didn't work — check ADMIN_KEY in your server's environment.";
    }
  }

  function fetchWithKey(url, key) {
    return fetch(url, { headers: { "x-admin-key": key } });
  }

  async function loadData() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing…";
    try {
      const [leadsRes, bookingsRes] = await Promise.all([
        fetchWithKey("/api/leads", adminKey),
        fetchWithKey("/api/bookings", adminKey),
      ]);

      if (leadsRes.status === 401 || bookingsRes.status === 401) {
        // Key stopped working (e.g. rotated on the server) — send back to the gate.
        sessionStorage.removeItem(SESSION_KEY);
        dashboard.classList.add("hidden");
        gate.classList.remove("hidden");
        gateError.textContent = "Your session key is no longer valid — please re-enter it.";
        return;
      }

      const leads = await leadsRes.json();
      const bookings = await bookingsRes.json();
      renderStats(leads, bookings);
      renderBookings(bookings);
      renderLeads(leads);
    } catch (err) {
      console.error(err);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh";
    }
  }

  function renderStats(leads, bookings) {
    const todayStr = new Date().toISOString().split("T")[0];
    const upcoming = bookings.filter((b) => b.date >= todayStr).length;
    statsRow.innerHTML = `
      <div class="stat"><span class="stat-num">${bookings.length}</span><span class="stat-label">Total bookings</span></div>
      <div class="stat"><span class="stat-num">${upcoming}</span><span class="stat-label">Upcoming</span></div>
      <div class="stat"><span class="stat-num">${leads.length}</span><span class="stat-label">Leads to follow up</span></div>
    `;
  }

  function renderBookings(bookings) {
    const sorted = [...bookings].sort((a, b) =>
      (a.date + a.time).localeCompare(b.date + b.time)
    );
    bookingsBody.innerHTML = "";
    bookingsEmpty.classList.toggle("hidden", sorted.length > 0);
    sorted.forEach((b) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(b.date)}</td>
        <td>${escapeHtml(b.time)}</td>
        <td>${escapeHtml(b.name)}</td>
        <td>${escapeHtml(b.service)}</td>
        <td class="dim">${formatTimestamp(b.createdAt)}</td>
      `;
      bookingsBody.appendChild(tr);
    });
  }

  function renderLeads(leads) {
    const sorted = [...leads].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    leadsBody.innerHTML = "";
    leadsEmpty.classList.toggle("hidden", sorted.length > 0);
    sorted.forEach((l) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(l.name)}</td>
        <td>${escapeHtml(l.phone)}</td>
        <td>${escapeHtml(l.reason)}</td>
        <td class="dim">${formatTimestamp(l.createdAt)}</td>
      `;
      leadsBody.appendChild(tr);
    });
  }

  function formatTimestamp(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // If a key is already stored from an earlier visit this session, skip the gate.
  if (adminKey) {
    gate.classList.add("hidden");
    dashboard.classList.remove("hidden");
    loadData();
  } else {
    keyInput.focus();
  }
})();
