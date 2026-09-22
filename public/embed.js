// embed.js
(function () {
  var CHAT_ORIGIN = (function () {
    try {
      return new URL(document.currentScript.src).origin;
    } catch (e) {
      return window.location.origin;
    }
  })();

  var COLLAPSED = { width: "76px", height: "76px" };
  var MOBILE_BREAKPOINT = 640;

  // Pass parent origin safely to the iframe via query parameters
  var hostOrigin = encodeURIComponent(window.location.origin);
  var iframe = document.createElement("iframe");
  iframe.src = CHAT_ORIGIN + "/widget-frame.html?hostOrigin=" + hostOrigin;
  iframe.title = "Bright Smile Dental chat";
  iframe.setAttribute("allowtransparency", "true");
  iframe.style.position = "fixed";
  iframe.style.bottom = "16px";
  iframe.style.right = "16px";
  iframe.style.border = "none";
  iframe.style.background = "transparent";
  iframe.style.zIndex = "2147483000";
  iframe.style.width = COLLAPSED.width;
  iframe.style.height = COLLAPSED.height;
  iframe.style.borderRadius = "50%";
  iframe.style.transition = "width 0.15s ease, height 0.15s ease, border-radius 0.15s ease";
  iframe.style.colorScheme = "normal";

  var isOpen = false;

  function updateIframeSize() {
    if (!isOpen) {
      iframe.style.width = COLLAPSED.width;
      iframe.style.height = COLLAPSED.height;
      iframe.style.bottom = "16px";
      iframe.style.right = "16px";
      iframe.style.borderRadius = "50%";
      return;
    }

    var isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

    if (isMobile) {
      iframe.style.width = "100vw";
      iframe.style.height = "100vh";
      iframe.style.bottom = "0";
      iframe.style.right = "0";
      iframe.style.borderRadius = "0";
    } else {
      var targetWidth = Math.min(384, window.innerWidth - 32);
      var targetHeight = Math.min(600, window.innerHeight - 32);

      iframe.style.width = targetWidth + "px";
      iframe.style.height = targetHeight + "px";
      iframe.style.bottom = "16px";
      iframe.style.right = "16px";
      iframe.style.borderRadius = "18px";
    }
  }

  function mount() {
    document.body.appendChild(iframe);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount);
  }

  window.addEventListener("resize", updateIframeSize);

  window.addEventListener("message", function (event) {
    if (event.origin !== CHAT_ORIGIN) return;
    var data = event.data || {};
    if (data.type !== "brightSmileChatResize") return;

    isOpen = Boolean(data.open);
    updateIframeSize();
  });
})();