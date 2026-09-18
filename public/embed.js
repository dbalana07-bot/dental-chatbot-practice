// embed.js
// This is the ENTIRE integration a client site needs:
//
//   <script src="https://your-deployed-app.onrender.com/embed.js" async></script>
//
// It creates a small iframe pointed back at this same server, so the chat
// UI, its CSS, and its JS are fully isolated from whatever site it's
// dropped into — nothing here can clash with the host page's styles, and
// nothing on the host page can reach into the chat's DOM or vice versa.
// The iframe resizes itself (via postMessage) between a small circular
// launcher and a full chat panel, so the rest of the host page is never
// covered by an invisible full-size overlay.

(function () {
  // Figure out our own origin from the <script> tag that loaded this file,
  // so the embed works correctly no matter what domain it's hosted on —
  // no hardcoded URL to keep in sync.
  var CHAT_ORIGIN = (function () {
    try {
      return new URL(document.currentScript.src).origin;
    } catch (e) {
      return window.location.origin;
    }
  })();

  var COLLAPSED = { width: "76px", height: "76px" };
  var EXPANDED = { width: "384px", height: "600px" };
  var MOBILE_BREAKPOINT = 480;

  var iframe = document.createElement("iframe");
  iframe.src = CHAT_ORIGIN + "/widget-frame.html";
  iframe.title = "Bright Smile Dental chat";
  iframe.setAttribute("allowtransparency", "true");
  iframe.style.position = "fixed";
  iframe.style.bottom = "16px";
  iframe.style.right = "16px";
  iframe.style.border = "none";
  iframe.style.background = "transparent";
  iframe.style.zIndex = "2147483000"; // sit above essentially anything a host page has
  iframe.style.width = COLLAPSED.width;
  iframe.style.height = COLLAPSED.height;
  iframe.style.borderRadius = "50%";
  iframe.style.transition = "width 0.15s ease, height 0.15s ease, border-radius 0.15s ease";
  iframe.style.colorScheme = "normal";

  function mount() {
    document.body.appendChild(iframe);
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount);
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== CHAT_ORIGIN) return; // ignore messages from anywhere else on the page
    var data = event.data || {};
    if (data.type !== "brightSmileChatResize") return;

    var isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

    if (data.open) {
      if (isMobile) {
        iframe.style.width = "100vw";
        iframe.style.height = "100vh";
        iframe.style.bottom = "0";
        iframe.style.right = "0";
        iframe.style.borderRadius = "0";
      } else {
        iframe.style.width = EXPANDED.width;
        iframe.style.height = EXPANDED.height;
        iframe.style.bottom = "16px";
        iframe.style.right = "16px";
        iframe.style.borderRadius = "18px";
      }
    } else {
      iframe.style.width = COLLAPSED.width;
      iframe.style.height = COLLAPSED.height;
      iframe.style.bottom = "16px";
      iframe.style.right = "16px";
      iframe.style.borderRadius = "50%";
    }
  });
})();
