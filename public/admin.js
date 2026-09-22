(function () {
  const TOKEN_KEY = "brightSmileAdminToken";

  const gate = document.getElementById("gate");
  const dashboard = document.getElementById("dashboard");
  const keyInput = document.getElementById("key-input");
  const unlockBtn = document.getElementById("unlock-btn");
  const gateError = document.getElementById("gate-error");
  const refreshBtn = document.getElementById("refresh-btn");
  const exportBtn = document.getElementById("export-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const statsRow = document.getElementById("stats-row");
  const bookingsBody = document.getElementById("bookings-body");
  const leadsBody = document.getElementById("leads-body");
  const bookingsEmpty = document.getElementById("bookings-empty");
  const leadsEmpty = document.getElementById("leads-empty");
  const tabBtns = document.querySelectorAll(".tab-btn");
  const panels = { bookings: document.getElementById("bookings-panel"), leads: document.getElementById("leads-panel") };
  
  const modalOverlay = document.getElementById("modal-overlay");
  const modalClose = document.getElementById("modal-close");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");

  let authToken = sessionStorage.getItem(TOKEN_KEY) || "";
  let currentBookings = [];
  let currentLeads = [];
  let activeTab = "bookings";

  unlockBtn.addEventListener("click", () => tryUnlock(keyInput.value.trim()));
  keyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryUnlock(keyInput.value.trim());
  });
  refreshBtn.addEventListener("click", loadData);
  exportBtn.addEventListener("click", exportCurrentTableCSV);
  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem(TOKEN_KEY);
    authToken = "";
    dashboard.classList.add("hidden");
    gate.classList.remove("hidden");
    keyInput.value = "";
    keyInput.focus();
  });

  modalClose.addEventListener("click", () => modalOverlay.classList.add("hidden"));
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.add("hidden");
  });

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.dataset.tab;
      Object.entries(panels).forEach(([name, el]) => el.classList.toggle("hidden", name !== activeTab));
    });
  });

  async function tryUnlock(candidateKey) {
    if (!candidateKey) return;
    gateError.textContent = "";
    unlockBtn.disabled = true;
    unlockBtn.textContent = "Checking…";

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey: candidateKey }),
      });

      if (res.ok) {
        const data = await res.json();
        authToken = data.token;
        sessionStorage.setItem(TOKEN_KEY, authToken);
        gate.classList.add("hidden");
        dashboard.classList.remove("hidden");
        loadData();
      } else {
        gateError.textContent = "That key didn't work — check ADMIN_KEY in your server's environment.";
      }
    } catch (err) {
      gateError.textContent = "Authentication error — please check network connection.";
      console.error(err);
    } finally {
      unlockBtn.disabled = false;
      unlockBtn.textContent = "Unlock";
    }
  }

  function fetchWithAuth(url, options = {}) {
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
        ...(options.headers || {}),
      },
    });
  }

  async function loadData() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing…";
    try {
      const [leadsRes, bookingsRes] = await Promise.all([
        fetchWithAuth("/api/leads"),
        fetchWithAuth("/api/bookings"),
      ]);

      if (leadsRes.status === 401 || bookingsRes.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        authToken = "";
        dashboard.classList.add("hidden");
        gate.classList.remove("hidden");
        gateError.textContent = "Your session token has expired — please re-enter your key.";
        return;
      }

      currentLeads = await leadsRes.json();
      currentBookings = await bookingsRes.json();

      renderStats(currentLeads, currentBookings);
      renderBookings(currentBookings);
      renderLeads(currentLeads);
    } catch (err) {
      console.error(err);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh";
    }
  }

  function renderStats(leads, bookings) {
    const todayStr = new Date().toISOString().split("T")[0];
    const upcoming = bookings.filter((b) => b.date >= todayStr && b.status !== "Cancelled").length;
    const pendingLeads = leads.filter((l) => l.status !== "Followed Up").length;

    statsRow.innerHTML = `
      <div class="stat"><span class="stat-num">${bookings.length}</span><span class="stat-label">Total Bookings</span></div>
      <div class="stat"><span class="stat-num">${upcoming}</span><span class="stat-label">Active Upcoming</span></div>
      <div class="stat"><span class="stat-num">${pendingLeads}</span><span class="stat-label">Pending Leads</span></div>
    `;
  }

  function renderBookings(bookings) {
    const sorted = [...bookings].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    bookingsBody.innerHTML = "";
    bookingsEmpty.classList.toggle("hidden", sorted.length > 0);

    sorted.forEach((b) => {
      const status = b.status || "Confirmed";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${escapeHtml(b.date)}</strong></td>
        <td>${escapeHtml(b.time)}</td>
        <td>${escapeHtml(b.name)}</td>
        <td>${escapeHtml(b.service)}</td>
        <td><span class="status-badge ${status.toLowerCase()}">${escapeHtml(status)}</span></td>
        <td class="dim">${formatTimestamp(b.createdAt)}</td>
        <td>
          <select class="action-select" data-id="${b.id || b._id}">
            <option value="Confirmed" ${status === "Confirmed" ? "selected" : ""}>Confirmed</option>
            <option value="Rescheduled" ${status === "Rescheduled" ? "selected" : ""}>Rescheduled</option>
            <option value="Cancelled" ${status === "Cancelled" ? "selected" : ""}>Cancelled</option>
          </select>
        </td>
      `;

      const select = tr.querySelector(".action-select");
      select.addEventListener("change", (e) => updateBookingStatus(b.id || b._id, e.target.value));

      bookingsBody.appendChild(tr);
    });
  }

  function renderLeads(leads) {
    const sorted = [...leads].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    leadsBody.innerHTML = "";
    leadsEmpty.classList.toggle("hidden", sorted.length > 0);

    sorted.forEach((l) => {
      const status = l.status || "New";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${escapeHtml(l.name)}</strong></td>
        <td><a href="tel:${escapeHtml(l.phone)}" class="table-link">${escapeHtml(l.phone)}</a></td>
        <td>${escapeHtml(l.reason)}</td>
        <td><span class="status-badge ${status.toLowerCase().replace(" ", "-")}">${escapeHtml(status)}</span></td>
        <td class="dim">${formatTimestamp(l.createdAt)}</td>
        <td>
          <button class="btn-sm btn-view-context">View Context</button>
          <button class="btn-sm btn-toggle-lead">${status === "Followed Up" ? "Mark New" : "Mark Done"}</button>
        </td>
      `;

      tr.querySelector(".btn-view-context").addEventListener("click", () => showContextModal(l));
      tr.querySelector(".btn-toggle-lead").addEventListener("click", () => {
        const nextStatus = status === "Followed Up" ? "New" : "Followed Up";
        updateLeadStatus(l.id || l._id, nextStatus);
      });

      leadsBody.appendChild(tr);
    });
  }

  async function updateBookingStatus(bookingId, status) {
    try {
      await fetchWithAuth(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      loadData();
    } catch (err) {
      console.error("Failed to update booking status:", err);
    }
  }

  async function updateLeadStatus(leadId, status) {
    try {
      await fetchWithAuth(`/api/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      loadData();
    } catch (err) {
      console.error("Failed to update lead status:", err);
    }
  }

  function showContextModal(lead) {
    modalTitle.textContent = `Inquiry Context: ${lead.name}`;
    
    if (lead.transcript && Array.isArray(lead.transcript)) {
      modalBody.innerHTML = lead.transcript
        .map((msg) => `<div class="transcript-msg ${msg.role}"><strong>${msg.role}:</strong> ${escapeHtml(msg.text)}</div>`)
        .join("");
    } else {
      modalBody.innerHTML = `
        <div class="lead-context-box">
          <p><strong>Patient Name:</strong> ${escapeHtml(lead.name)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(lead.phone)}</p>
          <p><strong>Reason for Contact:</strong> ${escapeHtml(lead.reason)}</p>
          <p><strong>Context Details:</strong> ${escapeHtml(lead.context || "No conversation transcript captured.")}</p>
        </div>
      `;
    }
    modalOverlay.classList.remove("hidden");
  }

  function exportCurrentTableCSV() {
    const isBookings = activeTab === "bookings";
    const data = isBookings ? currentBookings : currentLeads;
    if (!data.length) return alert("No data available to export.");

    let csvContent = "data:text/csv;charset=utf-8,";

    if (isBookings) {
      csvContent += "Date,Time,Patient Name,Service,Status,Booked At\n";
      data.forEach((b) => {
        csvContent += `"${b.date}","${b.time}","${b.name}","${b.service}","${b.status || 'Confirmed'}","${b.createdAt}"\n`;
      });
    } else {
      csvContent += "Patient Name,Phone,Reason,Status,Captured At\n";
      data.forEach((l) => {
        csvContent += `"${l.name}","${l.phone}","${l.reason}","${l.status || 'New'}","${l.createdAt}"\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bright_smile_${activeTab}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  if (authToken) {
    gate.classList.add("hidden");
    dashboard.classList.remove("hidden");
    loadData();
  } else {
    keyInput.focus();
  }
})();