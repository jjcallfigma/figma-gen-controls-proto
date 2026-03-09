/**
 * Inspector overlay script injected into Sandpack's preview.
 *
 * Communication strategy:
 *   • postMessage from Sandpack iframe → parent is BLOCKED by Sandpack's protocol
 *   • Instead, we use console.log() which Sandpack captures and forwards
 *     to the parent via its documented `listen()` API
 *   • The inspector is "enabled" when data-make-node attributes are present
 *     in the DOM (i.e. the code was instrumented). When they're absent, the
 *     script does nothing — no toggle message needed.
 *
 * The script is delivered as a plain string constant so it can be added to
 * Sandpack's virtual filesystem as a side-effect import.
 */

export const MAKE_INSPECTOR_SCRIPT = `
(function makeInspector() {
  var highlightBox = null;
  var label = null;
  var selectedEl = null;

  // ─── Create overlay elements ───────────────────────────────────────
  function ensureOverlay() {
    if (highlightBox) return;

    highlightBox = document.createElement("div");
    highlightBox.id = "__make-inspector-highlight";
    highlightBox.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483647;" +
      "border:2px solid #3b82f6;background:rgba(59,130,246,0.08);" +
      "transition:all 80ms ease-out;display:none;border-radius:3px;";

    label = document.createElement("div");
    label.id = "__make-inspector-label";
    label.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483647;" +
      "background:#3b82f6;color:#fff;font:500 10px/1 system-ui,sans-serif;" +
      "padding:2px 6px;border-radius:3px;display:none;white-space:nowrap;" +
      "box-shadow:0 1px 3px rgba(0,0,0,0.2);";

    document.body.appendChild(highlightBox);
    document.body.appendChild(label);
  }

  // ─── Helpers ───────────────────────────────────────────────────────
  function findNode(el) {
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.hasAttribute && el.hasAttribute("data-make-node")) return el;
      el = el.parentElement;
    }
    return null;
  }

  function highlight(el) {
    ensureOverlay();
    var rect = el.getBoundingClientRect();
    highlightBox.style.left   = rect.left + "px";
    highlightBox.style.top    = rect.top + "px";
    highlightBox.style.width  = rect.width + "px";
    highlightBox.style.height = rect.height + "px";
    highlightBox.style.display = "block";

    var name = el.getAttribute("data-make-name") || el.tagName.toLowerCase();
    label.textContent = name;
    label.style.left = rect.left + "px";
    label.style.top  = Math.max(0, rect.top - 20) + "px";
    label.style.display = "block";
  }

  function hideHighlight() {
    if (highlightBox) highlightBox.style.display = "none";
    if (label) label.style.display = "none";
  }

  // ─── Event handlers ────────────────────────────────────────────────
  document.addEventListener("mousemove", function(e) {
    var el = findNode(e.target);
    if (el) {
      highlight(el);
    } else if (!selectedEl) {
      hideHighlight();
    }
  }, true);

  document.addEventListener("click", function(e) {
    var el = findNode(e.target);
    if (!el) return; // No instrumented element — don't interfere

    e.preventDefault();
    e.stopPropagation();

    selectedEl = el;
    highlight(el);

    // Change highlight to "selected" style
    if (highlightBox) {
      highlightBox.style.borderColor = "#3b82f6";
      highlightBox.style.background = "rgba(59,130,246,0.12)";
    }

    var nodeId = parseInt(el.getAttribute("data-make-node"), 10);
    var name = el.getAttribute("data-make-name") || el.tagName.toLowerCase();
    var className = el.getAttribute("class") || "";

    // Get direct text content (not children's text)
    var textContent = "";
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) {
        textContent += el.childNodes[i].textContent;
      }
    }

    var rect = el.getBoundingClientRect();

    // ──── KEY: Use console.log as communication channel ────
    // Sandpack captures this and forwards via listen() API
    console.log("__MAKE_INSPECT__:" + JSON.stringify({
      nodeId: nodeId,
      name: name,
      className: className,
      textContent: textContent.trim(),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }));
  }, true);

  document.addEventListener("mouseleave", function() {
    if (!selectedEl) hideHighlight();
  }, true);
})();
`;
