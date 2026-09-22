(function () {
  // 1. Dynamic Copyright Year & Practice Status
  document.getElementById("year").textContent = new Date().getFullYear();

  function updateOfficeStatus() {
    const statusEl = document.getElementById("office-status");
    if (!statusEl) return;

    const now = new Date();
    const day = now.getDay(); // 0 = Sun
    const hour = now.getHours();

    let isOpen = false;
    let hoursText = "";

    if (day >= 1 && day <= 5) {
      isOpen = hour >= 8 && hour < 18;
      hoursText = "8:00 AM – 6:00 PM";
    } else if (day === 6) {
      isOpen = hour >= 9 && hour < 14;
      hoursText = "9:00 AM – 2:00 PM";
    }

    if (isOpen) {
      statusEl.className = "status-indicator open";
      statusEl.textContent = `🟢 Open Today until ${hoursText.split("–")[1].trim()}`;
    } else {
      statusEl.className = "status-indicator closed";
      statusEl.textContent = `🔴 Closed Right Now • Opens ${day === 0 ? "Mon 8:00 AM" : "Tomorrow"}`;
    }
  }
  updateOfficeStatus();

  // 2. Mobile Navigation Toggle
  const navToggle = document.getElementById("nav-toggle");
  const mainNav = document.getElementById("main-nav");
  if (navToggle && mainNav) {
    navToggle.addEventListener("click", () => {
      mainNav.classList.toggle("open");
    });
  }

  // 3. Service Category Filter Tabs
  const tabBtns = document.querySelectorAll("#service-tabs .tab-btn");
  const serviceCards = document.querySelectorAll("#service-grid .service-card");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const category = btn.dataset.category;
      serviceCards.forEach((card) => {
        if (category === "all" || card.dataset.category === category) {
          card.style.display = "flex";
        } else {
          card.style.display = "none";
        }
      });
    });
  });

  // 4. Insurance Real-time Search Filter
  const insuranceInput = document.getElementById("insurance-search");
  const insuranceTags = document.querySelectorAll("#insurance-tags .ins-tag");
  const searchMsg = document.getElementById("insurance-search-msg");

  if (insuranceInput) {
    insuranceInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      let matchCount = 0;

      insuranceTags.forEach((tag) => {
        const name = tag.dataset.name || "";
        if (name.includes(query)) {
          tag.style.display = "flex";
          matchCount++;
        } else {
          tag.style.display = "none";
        }
      });

      if (searchMsg) {
        if (query.length > 0 && matchCount === 0) {
          searchMsg.classList.remove("hidden");
          searchMsg.innerHTML = `Don't see <strong>"${escapeHtml(query)}"</strong>? Ask our virtual assistant below — we offer out-of-network claims & our $30/mo membership!`;
        } else {
          searchMsg.classList.add("hidden");
        }
      }
    });
  }

  // 5. FAQ Accordion
  const faqQuestions = document.querySelectorAll(".faq-question");
  faqQuestions.forEach((q) => {
    q.addEventListener("click", () => {
      const item = q.closest(".faq-item");
      const isActive = item.classList.contains("active");

      document.querySelectorAll(".faq-item").forEach((el) => el.classList.remove("active"));

      if (!isActive) {
        item.classList.add("active");
      }
    });
  });

  // 6. Seamless Integration with Embed Chatbot Widget
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest(".trigger-chat");
    if (!trigger) return;

    const promptText = trigger.dataset.prompt;

    // Access the embedded iframe if present
    const iframe = document.querySelector("iframe[title*='Bright Smile']");
    if (iframe && iframe.contentWindow) {
      // Post message to open iframe if needed
      window.postMessage({ type: "brightSmileChatOpen" }, "*");
      
      // Focus/trigger launcher inside iframe
      try {
        const launcherInIframe = iframe.contentWindow.document.getElementById("chat-launcher");
        if (launcherInIframe) launcherInIframe.click();

        const inputInIframe = iframe.contentWindow.document.getElementById("chat-input");
        if (inputInIframe && promptText) {
          inputInIframe.value = promptText;
          inputInIframe.focus();
        }
      } catch (err) {
        // Cross-origin fallback click simulation
        const fallbackLauncher = document.querySelector("#chat-launcher");
        if (fallbackLauncher) fallbackLauncher.click();
      }
    }
  });

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();