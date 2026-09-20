(function () {
  const launcher = document.getElementById("chat-launcher");
  const closeBtn = document.getElementById("chat-close");
  const messagesEl = document.getElementById("chat-messages");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");

  const SESSION_KEY = "brightSmileChatSessionId";
  let sessionId = localStorage.getItem(SESSION_KEY) || null;
  let isSending = false;

  function setOpen(open) {
    document.body.classList.toggle("state-collapsed", !open);
    document.body.classList.toggle("state-expanded", open);
    
    // Reset internal document scroll position
    window.scrollTo(0, 0);

    window.parent.postMessage({ type: "brightSmileChatResize", open }, "*");
    if (open) {
      if (messagesEl.children.length === 0) {
        addMessage(
          "bot",
          "Hi, I'm Sam 👋 I can answer questions about Bright Smile Dental or help you book an appointment. What can I help with?"
        );
      }
      // Prevent browser auto-scrolling on focus
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
    // Kept on a single line to prevent pre-wrap whitespace rendering
    div.innerHTML = `<div class="typing-label">${label}</div><div class="typing-dots"><span></span><span></span><span></span></div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTypingIndicator() {
    const el = document.getElementById("typing-indicator");
    if (el) el.remove();
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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json();

      if (res.ok && (data.toolEvents || []).length > 0) {
        await delay(500);
      }
      removeTypingIndicator();

      if (!res.ok) {
        addMessage("bot", data.error || "Sorry, something went wrong on my end. Please try again.");
        console.error(data);
      } else {
        if (data.sessionId) {
          sessionId = data.sessionId;
          localStorage.setItem(SESSION_KEY, sessionId);
        }

        (data.toolEvents || []).forEach((evt) => {
          if (evt.tool === "book_appointment" && evt.result?.status === "success") {
            addMessage("system", "✅ Appointment booked");
          } else if (evt.tool === "capture_lead" && evt.result?.status === "success") {
            addMessage("system", "📇 Info saved for follow-up");
          }
        });

        addMessage("bot", data.reply || "…");
      }
    } catch (err) {
      removeTypingIndicator();
      addMessage("bot", "Network error — please try again.");
      console.error(err);
    } finally {
      isSending = false;
      sendBtn.disabled = false;
    }
  }
})();