(function () {
  const launcher = document.getElementById("chat-launcher");
  const closeBtn = document.getElementById("chat-close");
  const messagesEl = document.getElementById("chat-messages");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");

  const SESSION_KEY = "brightSmileChatSessionId";
  const TIMEOUT_MS = 15000;
  const MAX_RETRIES = 2;
  const CLINIC_PHONE = "(555) 123-4567";
  const CLINIC_TEL = "tel:5551234567";

  const urlParams = new URLSearchParams(window.location.search);
  const hostOrigin = urlParams.get("hostOrigin") 
    ? decodeURIComponent(urlParams.get("hostOrigin")) 
    : (document.referrer ? new URL(document.referrer).origin : "*");

  let sessionId = localStorage.getItem(SESSION_KEY) || null;
  let isSending = false;

  /**
   * Evaluates whether the dental clinic is currently open.
   * Hours: Mon-Fri 8:00-18:00, Sat 9:00-14:00, Sun Closed.
   */
  function isOfficeOpen() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const hour = now.getHours();

    if (day >= 1 && day <= 5) return hour >= 8 && hour < 18;
    if (day === 6) return hour >= 9 && hour < 14;
    return false;
  }

  function setOpen(open) {
    document.body.classList.toggle("state-collapsed", !open);
    document.body.classList.toggle("state-expanded", open);
    window.scrollTo(0, 0);

    window.parent.postMessage({ type: "brightSmileChatResize", open }, hostOrigin);

    if (open) {
      if (messagesEl.children.length === 0) {
        addMessage(
          "bot",
          "Hi, I'm Sam 👋 I can answer questions about Bright Smile Dental or help you book an appointment. What can I help with?"
        );
      }
      input.focus({ preventScroll: true });
    }
  }

  launcher.addEventListener("click", () => setOpen(true));
  closeBtn.addEventListener("click", () => setOpen(false));
  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getTypingLabel(text) {
    const t = text.toLowerCase();
    if (/\b(human|person|agent|speak|talk|representative|receptionist)\b/.test(t)) {
      return "Connecting you with front desk options…";
    }
    if (/\b(emergency|pain|severe|bleeding|swollen|knocked out|toothache)\b/.test(t)) {
      return "Checking emergency care options…";
    }
    if (/\b(book|appointment|schedule|reserve|slot|available|availability)\b/.test(t)) {
      return "Checking the calendar…";
    }
    if (/\b(price|cost|insurance|cover|fee|\$|whiten|clean)\b/.test(t)) {
      return "Looking that up…";
    }
    return "Sam is typing…";
  }

  function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function addTypingIndicator(label) {
    const div = document.createElement("div");
    div.className = "msg bot typing-indicator-msg";
    div.id = "typing-indicator";
    div.innerHTML = `<div class="typing-label">${label}</div><div class="typing-dots"><span></span><span></span><span></span></div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTypingIndicator() {
    const el = document.getElementById("typing-indicator");
    if (el) el.remove();
  }

  /**
   * Renders interactive Human Escalation or Emergency Cards inside the message stream.
   */
  function renderEscalationCard(type, customText = "") {
    const div = document.createElement("div");
    const open = isOfficeOpen();

    if (type === "emergency") {
      div.className = "msg bot emergency-card";
      div.innerHTML = `
        <div class="card-badge urgent">🚨 Dental Emergency Care</div>
        <p class="card-text">${customText || "If you are experiencing severe pain, uncontrolled bleeding, or trauma, please call our emergency line immediately."}</p>
        <a href="${CLINIC_TEL}" class="card-btn urgent-btn">📞 Call Urgent Care: ${CLINIC_PHONE}</a>
        <div class="card-subnote">For life-threatening medical emergencies, please dial 911 immediately.</div>
      `;
    } else if (type === "human_transfer") {
      div.className = "msg bot escalation-card";
      const statusBadge = open 
        ? `<span class="status-badge open">🟢 Office Currently Open</span>`
        : `<span class="status-badge closed">🔴 Office Currently Closed</span>`;
      
      div.innerHTML = `
        <div class="card-header">${statusBadge}</div>
        <p class="card-text">Our front desk team is ready to help you directly.</p>
        <div class="card-actions">
          <a href="${CLINIC_TEL}" class="card-btn primary-btn">📞 Call ${CLINIC_PHONE}</a>
          <button class="card-btn secondary-btn" id="toggle-callback-btn">📅 Request Call-Back</button>
        </div>
        <form class="callback-form hidden" id="callback-form">
          <input type="text" id="cb-name" placeholder="Your Name" required />
          <input type="tel" id="cb-phone" placeholder="Phone Number" required />
          <button type="submit" id="cb-submit">Submit Request</button>
        </form>
      `;

      // Attach inline callback form trigger
      setTimeout(() => {
        const toggleBtn = div.querySelector("#toggle-callback-btn");
        const cbForm = div.querySelector("#callback-form");
        if (toggleBtn && cbForm) {
          toggleBtn.addEventListener("click", () => {
            cbForm.classList.toggle("hidden");
            messagesEl.scrollTop = messagesEl.scrollHeight;
          });
          cbForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const name = div.querySelector("#cb-name").value.trim();
            const phone = div.querySelector("#cb-phone").value.trim();
            if (name && phone) {
              cbForm.innerHTML = `<div class="cb-success">✅ Thanks ${name}! We'll call ${phone} as soon as possible.</div>`;
              messagesEl.scrollTop = messagesEl.scrollHeight;
              sendCallbackLeadToServer(name, phone);
            }
          });
        }
      }, 0);
    }

    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendCallbackLeadToServer(name, phone) {
    try {
      await fetchChatWithRetry({
        sessionId,
        message: `System Event: User requested callback. Name: ${name}, Phone: ${phone}`
      });
    } catch (e) {
      console.error("Failed to capture callback lead:", e);
    }
  }

  async function fetchChatWithRetry(payload, attempt = 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if ((res.status === 400 || res.status === 404) && payload.sessionId) {
        localStorage.removeItem(SESSION_KEY);
        sessionId = null;
        return fetchChatWithRetry({ ...payload, sessionId: null }, attempt);
      }

      if ([502, 503, 504].includes(res.status) && attempt < MAX_RETRIES) {
        const backoffDelay = Math.pow(2, attempt) * 1000;
        await delay(backoffDelay);
        return fetchChatWithRetry(payload, attempt + 1);
      }

      return res;
    } catch (err) {
      clearTimeout(timeoutId);

      if (attempt < MAX_RETRIES && err.name !== "AbortError") {
        const backoffDelay = Math.pow(2, attempt) * 1000;
        await delay(backoffDelay);
        return fetchChatWithRetry(payload, attempt + 1);
      }

      throw err;
    }
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isSending) return;

    addMessage("user", text);
    input.value = "";
    isSending = true;
    sendBtn.disabled = true;
    addTypingIndicator(getTypingLabel(text));

    try {
      const res = await fetchChatWithRetry({ sessionId, message: text });
      
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new Error("Invalid server response format");
      }

      if (res.ok && (data.toolEvents || []).length > 0) {
        await delay(500);
      }
      removeTypingIndicator();

      if (!res.ok) {
        addMessage("bot", data.error || "Sorry, something went wrong on my end. Please try again.");
      } else {
        if (data.sessionId) {
          sessionId = data.sessionId;
          localStorage.setItem(SESSION_KEY, sessionId);
        }

        let handledByTool = false;

        (data.toolEvents || []).forEach((evt) => {
          if (evt.tool === "transfer_to_human") {
            renderEscalationCard("human_transfer");
            handledByTool = true;
          } else if (evt.tool === "trigger_emergency") {
            renderEscalationCard("emergency", evt.result?.message);
            handledByTool = true;
          } else if (evt.tool === "book_appointment" && evt.result?.status === "success") {
            addMessage("system", "✅ Appointment booked");
          } else if (evt.tool === "capture_lead" && evt.result?.status === "success") {
            addMessage("system", "📇 Info saved for follow-up");
          }
        });

        // Always show bot reply text if provided
        if (data.reply) {
          addMessage("bot", data.reply);
        }

        // Client-side fallback safeguard: if user explicitly requested a human or emergency,
        // render interactive cards even if backend did not emit a tool event
        const lowerText = text.toLowerCase();
        if (!handledByTool) {
          if (/\b(human|person|agent|speak to someone|talk to human|receptionist)\b/.test(lowerText)) {
            renderEscalationCard("human_transfer");
          } else if (/\b(severe pain|uncontrolled bleeding|knocked out tooth|jaw trauma)\b/.test(lowerText)) {
            renderEscalationCard("emergency");
          }
        }
      }
    } catch (err) {
      removeTypingIndicator();
      if (err.name === "AbortError") {
        addMessage("bot", "Request timed out — please check your connection and try again.");
      } else {
        addMessage("bot", "Network error — please try again.");
      }
    } finally {
      isSending = false;
      sendBtn.disabled = false;
    }
  }
})();