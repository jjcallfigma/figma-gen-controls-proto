/**
 * Shared view extraction logic.
 *
 * Used by both the Make toolbar "Extract all views" button and the
 * AI assistant `extract_views` tool.
 */

import { serializeDesignTree } from "@/core/utils/designSerializer";
import {
  domToDesignWithMeta,
  refineAutoLayoutSizing,
  wrapChildMargins,
} from "@/core/utils/domToDesign";
import { getPreviewDocument } from "@/core/utils/makePreviewRegistry";
import { buildInspectorSrcdoc } from "@/core/utils/sameOriginPreview";

/** Yield to the main thread so the browser can paint/respond to user input. */
const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

// ─── Fast srcdoc from live preview ───────────────────────────────────

/**
 * Build a lightweight srcdoc by reading the already-compiled module script
 * and import map from the live Make preview iframe. This avoids loading
 * Babel standalone (~2.5 MB) in extraction iframes entirely.
 *
 * Tailwind CDN is kept because its generated styles use CSSOM insertRule()
 * which isn't serializable via outerHTML. The CDN is small (~300 KB) and
 * already browser-cached from the live preview.
 *
 * Returns null if the preview isn't available or the compiled code can't
 * be read.
 */
function buildFastSrcdocFromPreview(sourceMakeId: string): string | null {
  try {
    const liveDoc = getPreviewDocument(sourceMakeId);
    if (!liveDoc) return null;

    // Read the compiled module script (Babel output)
    const moduleEl = liveDoc.querySelector('head script[type="module"]');
    const compiledCode = moduleEl?.textContent;
    if (!compiledCode) return null;

    // Read the import map
    const importMapEl = liveDoc.querySelector('script[type="importmap"]');
    const importMapJson = importMapEl?.textContent || "{}";

    // Read all <style> elements (theme CSS, base styles)
    const styleEls = liveDoc.querySelectorAll("head style");
    const styles = Array.from(styleEls)
      .map((s) => s.textContent || "")
      .filter(Boolean)
      .join("\n");

    // Only escape </script> sequences in the compiled code to prevent
    // the HTML parser from prematurely closing the script tag.
    // Do NOT double-escape backslashes or backticks — that corrupts
    // JS escape sequences (\n, \t, template literals) in the Babel output.
    const safeCode = compiledCode.replace(/<\/script/gi, "<\\/script");

    // Build the HTML via concatenation so the compiled code is embedded
    // verbatim (template literal interpolation would require escaping
    // backticks and ${} which would corrupt the code).
    const header =
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
      '  <meta charset="UTF-8">\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '  <script type="importmap">\n  ' + importMapJson + '\n  </script>\n' +
      '  <link rel="preconnect" href="https://fonts.googleapis.com">\n' +
      '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
      '  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">\n' +
      '  <script src="https://cdn.tailwindcss.com"></script>\n' +
      "  <script>tailwind.config={theme:{extend:{fontFamily:{sans:['\"Inter\"','ui-sans-serif','system-ui','sans-serif']}}}}</script>\n" +
      '  <style>\n    ' + styles + '\n' +
      '    * { box-sizing: border-box; }\n' +
      '    body { margin: 0; font-family: "Inter", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"; }\n' +
      '    ::-webkit-scrollbar { display: none; }\n' +
      '  </style>\n' +
      '</head>\n<body>\n' +
      '  <div id="root"></div>\n' +
      '  <script type="module">\n';

    const footer = '\n  </script>\n</body>\n</html>';

    const html = header + safeCode + footer;

    console.log(
      `[extractViews] Built fast srcdoc from live preview (${(html.length / 1024).toFixed(0)} KB, no Babel)`,
    );
    return html;
  } catch (err) {
    console.warn("[extractViews] Could not build fast srcdoc from preview:", err);
    return null;
  }
}

// ─── Types ──────────────────────────────────────────────────────────

export interface NavStep {
  action: "click" | "type" | "select" | "focus" | "clear" | "wait_for";
  text?: string;
  selector?: string;
  value?: string;
  /** Repeat this action N times (default 1). Each repetition waits for DOM stability. */
  count?: number;
}

export interface ViewDef {
  name: string;
  steps: NavStep[];
}

export interface ExtractResult {
  extractedObjects: any[];
  viewCount: number;
  /** Views that were requested but failed (nav error, dedup, etc.) */
  failedViews: string[];
}

// ─── DOM helpers ────────────────────────────────────────────────────

function waitForDomStable(
  doc: Document,
  timeoutMs = 3000,
  quietMs = 300,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!doc.body) {
      resolve(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sawMutation = false;

    const done = (val: boolean) => {
      obs.disconnect();
      if (timer) clearTimeout(timer);
      clearTimeout(deadline);
      resolve(val);
    };

    const obs = new MutationObserver(() => {
      sawMutation = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => done(true), quietMs);
    });

    // Observe documentElement (not just body) to catch theme class changes
    // on <html> (e.g. Tailwind dark mode: <html class="dark">).
    obs.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    const deadline = setTimeout(() => {
      done(sawMutation);
    }, timeoutMs);
  });
}

/**
 * Start observing DOM BEFORE performing an action.
 * Returns { promise, cancel } so the caller can click between start and await.
 */
function observeDomChanges(
  doc: Document,
  timeoutMs = 3000,
  quietMs = 300,
): { promise: Promise<boolean>; cancel: () => void } {
  let obs: MutationObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const promise = new Promise<boolean>((resolve) => {
    if (!doc.body) {
      resolve(false);
      return;
    }

    let sawMutation = false;

    const done = (val: boolean) => {
      if (settled) return;
      settled = true;
      obs?.disconnect();
      if (timer) clearTimeout(timer);
      if (deadline) clearTimeout(deadline);
      resolve(val);
    };

    obs = new MutationObserver(() => {
      sawMutation = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => done(true), quietMs);
    });

    obs.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    deadline = setTimeout(() => done(sawMutation), timeoutMs);
  });

  return {
    promise,
    cancel: () => {
      settled = true;
      obs?.disconnect();
      if (timer) clearTimeout(timer);
      if (deadline) clearTimeout(deadline);
    },
  };
}

function waitForIframeReady(
  doc: Document,
  timeoutMs = 8000,
  quietMs = 400,
): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();

    const poll = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        clearInterval(poll);
        resolve(false);
        return;
      }
      const root =
        doc.getElementById("root") || doc.querySelector("[data-reactroot]");
      const target = root || doc.body;
      if (target.querySelectorAll("*").length > 3) {
        clearInterval(poll);
        const remaining = timeoutMs - (Date.now() - start);
        waitForDomStable(doc, Math.max(remaining, 1000), quietMs).then(() => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setTimeout(() => resolve(true), 50)),
          );
        });
      }
    }, 100);
  });
}

// Interactive elements that handle clicks/input meaningfully
const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  '[role="tab"]',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[contenteditable="true"]',
].join(", ");

const PASSIVE_TAGS = new Set([
  "span", "p", "div", "label", "h1", "h2", "h3", "h4", "h5", "h6",
]);

// ─── DOM snapshot for AI element resolution ──────────────────────────

const SNAPSHOT_ATTRS = [
  "id", "class", "role", "type", "name", "href", "for", "placeholder",
  "aria-label", "aria-checked", "aria-selected", "aria-expanded",
  "data-state", "data-value", "contenteditable",
];

/**
 * Produce a compact, numbered text representation of a DOM tree.
 * Used to send to an LLM for element resolution.
 *
 * Returns the text snapshot AND a nodeMap array where nodeMap[i] is the
 * actual DOM Element for index i, so the AI's returned index can be
 * mapped back to a live element.
 */
function serializeDomCompact(
  doc: Document,
  rootEl: Element,
): { text: string; nodeMap: Element[] } {
  const lines: string[] = [];
  const nodeMap: Element[] = [];
  const win = doc.defaultView;

  const walk = (el: Element, depth: number) => {
    // Skip invisible elements
    if (win) {
      const cs = win.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
    }

    const idx = nodeMap.length;
    nodeMap.push(el);

    const tag = el.tagName.toLowerCase();
    const attrs: string[] = [];
    for (const name of SNAPSHOT_ATTRS) {
      let val = el.getAttribute(name);
      if (val == null) continue;
      if (name === "class") val = val.slice(0, 60);
      attrs.push(`${name}="${val}"`);
    }

    // Direct text content (not from children)
    const directText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent?.trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 40);

    const indent = "  ".repeat(depth);
    const attrStr = attrs.length ? " " + attrs.join(" ") : "";
    const textStr = directText ? ` "${directText}"` : "";
    lines.push(`${indent}[${idx}] <${tag}${attrStr}>${textStr}`);

    for (const child of Array.from(el.children)) {
      walk(child, depth + 1);
    }
  };

  walk(rootEl, 0);
  return { text: lines.join("\n"), nodeMap };
}

// ─── AI element resolution ───────────────────────────────────────────

async function resolveElementWithAI(
  doc: Document,
  rootEl: Element,
  step: NavStep,
): Promise<Element | null> {
  const { text: snapshot, nodeMap } = serializeDomCompact(doc, rootEl);

  const stepDesc =
    `Action: ${step.action}` +
    (step.text ? `, target text: "${step.text}"` : "") +
    (step.selector ? `, CSS selector hint: ${step.selector}` : "") +
    (step.value ? `, value: "${step.value}"` : "");

  try {
    const res = await fetch("/api/resolve-element", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domSnapshot: snapshot, step: stepDesc }),
    });

    if (!res.ok) {
      console.warn(`[resolveElementWithAI] API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const idx = data.index;
    if (typeof idx !== "number" || idx < 0 || idx >= nodeMap.length) {
      console.warn(`[resolveElementWithAI] Invalid index: ${idx}`);
      return null;
    }

    const el = nodeMap[idx];
    console.log(
      `[resolveElementWithAI] Resolved index ${idx}: ` +
      `<${el.tagName.toLowerCase()} role="${el.getAttribute("role") || ""}"> ` +
      `"${(el.textContent || "").trim().slice(0, 40)}"`,
    );
    return el;
  } catch (err) {
    console.warn("[resolveElementWithAI] Failed:", err);
    return null;
  }
}

// ─── Element finding (heuristic fast path) ───────────────────────────

/**
 * Quick heuristic search for an interactive element by text.
 * Returns the element and whether it's interactive (button, link, etc.)
 * or passive (span, div, etc.). The caller decides whether to accept
 * a passive result or escalate to AI.
 */
function findByText(
  doc: Document,
  text: string,
): { el: Element; interactive: boolean } | null {
  const lc = text.toLowerCase();

  // Pass 1: Exact match on interactive elements
  const interactive = Array.from(doc.querySelectorAll(INTERACTIVE_SELECTOR));

  const iExact = interactive.find(
    (e) => e.textContent?.trim().toLowerCase() === lc,
  );
  if (iExact) return { el: iExact, interactive: true };

  // Pass 2: Partial match on interactive elements
  const iPartial = interactive.find((e) =>
    e.textContent?.trim().toLowerCase().includes(lc),
  );
  if (iPartial) return { el: iPartial, interactive: true };

  // Pass 3: aria-label match
  const iAria = interactive.find((e) =>
    e.getAttribute("aria-label")?.toLowerCase().includes(lc),
  );
  if (iAria) return { el: iAria, interactive: true };

  // Pass 3b: placeholder match (for inputs/textareas)
  const iPlaceholder = interactive.find((e) =>
    e.getAttribute("placeholder")?.toLowerCase().includes(lc),
  );
  if (iPlaceholder) return { el: iPlaceholder, interactive: true };

  // Pass 3c: name attribute match (for form elements)
  const iName = interactive.find((e) =>
    e.getAttribute("name")?.toLowerCase().includes(lc),
  );
  if (iName) return { el: iName, interactive: true };

  // Pass 4: Broader elements (passive)
  const broader = Array.from(
    doc.querySelectorAll("span, label, li, nav a, td, th, p, div"),
  );

  const bExact = broader.find(
    (e) => e.textContent?.trim().toLowerCase() === lc,
  );
  if (bExact) return { el: bExact, interactive: false };

  const bPartial = broader.find((e) =>
    e.textContent?.trim().toLowerCase().includes(lc),
  );
  if (bPartial) return { el: bPartial, interactive: false };

  return null;
}

export async function executeNavStep(
  doc: Document,
  step: NavStep,
): Promise<{ found: boolean; elementInfo?: string }> {
  // ── wait_for: poll until text appears in DOM ──
  if (step.action === "wait_for") {
    const target = (step.text || step.value || "").toLowerCase();
    if (!target) return { found: false, elementInfo: "wait_for: no text specified" };

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const bodyText = (doc.body?.textContent || "").toLowerCase();
      if (bodyText.includes(target)) {
        console.log(`[executeNavStep] wait_for: found "${step.text || step.value}" in DOM`);
        return { found: true, elementInfo: `wait_for "${step.text || step.value}"` };
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    console.warn(`[executeNavStep] wait_for: "${step.text || step.value}" not found within 5s`);
    return { found: false, elementInfo: `wait_for "${step.text || step.value}" (timed out)` };
  }

  // ── All other actions: find element, then execute ──
  let el: Element | null = null;
  let source = "";

  // 1. Fast path: heuristic text search
  if (step.text) {
    const result = findByText(doc, step.text);
    if (result) {
      el = result.el;
      source = result.interactive ? "text" : "text (passive)";
    }
  }

  // 2. If text found nothing, try CSS selector
  if (!el && step.selector) {
    try {
      const selectorEl = doc.querySelector(step.selector);
      if (selectorEl) {
        const isInteractive = selectorEl.matches(INTERACTIVE_SELECTOR);
        const childCount = selectorEl.querySelectorAll("*").length;
        if (isInteractive || childCount < 30) {
          el = selectorEl;
          source = "selector";
        }
      }
    } catch { /* invalid selector */ }
  }

  // 3. If we found a passive element (or nothing), ask AI to resolve
  const isPassive = el && PASSIVE_TAGS.has(el.tagName.toLowerCase());
  if (!el || isPassive) {
    const why = !el ? "no element found" : `heuristic found passive <${el.tagName.toLowerCase()}>`;
    console.log(`[executeNavStep] ${why} — escalating to AI for step: ${step.action} "${step.text || step.selector}"`);

    const rootEl = doc.getElementById("root") ||
                   doc.querySelector("[data-reactroot]") ||
                   doc.body;
    const aiEl = await resolveElementWithAI(doc, rootEl, step);
    if (aiEl) {
      el = aiEl;
      source = "ai";
    } else if (isPassive) {
      source = "text (passive, ai-fallback-failed)";
    }
  }

  if (!el) {
    console.warn(
      `[executeNavStep] Element NOT found: text="${step.text}", selector="${step.selector}"`,
    );
    return { found: false };
  }

  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role") || "";
  const textSnippet = (el.textContent || "").trim().slice(0, 60);
  const info = `<${tag}${role ? ` role="${role}"` : ""}> "${textSnippet}" [via ${source}]`;
  console.log(`[executeNavStep] Found: ${info} for step ${step.action} "${step.text || step.selector}"`);

  // Cross-frame safe tag check (instanceof fails across iframe boundaries)
  const isInput = tag === "input";
  const isTextarea = tag === "textarea";
  const isSelect = tag === "select";
  const isTextInput = isInput || isTextarea;

  // Get the native value setter from the element's own window (not parent)
  const getValueSetter = () => {
    const win = el!.ownerDocument.defaultView;
    if (!win) return undefined;
    const proto = isTextarea
      ? win.HTMLTextAreaElement.prototype
      : win.HTMLInputElement.prototype;
    return Object.getOwnPropertyDescriptor(proto, "value")?.set;
  };

  switch (step.action) {
    case "click": {
      if (isInput) {
        const inputType = el.getAttribute("type") || "text";
        if (inputType === "checkbox" || inputType === "radio") {
          (el as any).checked = !(el as any).checked;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      (el as HTMLElement).click?.();
      return { found: true, elementInfo: info };
    }
    case "type":
      if (isTextInput) {
        (el as HTMLElement).focus();
        (el as HTMLElement).click();

        el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));

        const nativeSet = getValueSetter();
        if (nativeSet) {
          nativeSet.call(el, step.value ?? "");
        } else {
          (el as any).value = step.value ?? "";
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
        return { found: true, elementInfo: info };
      }
      if ((el as HTMLElement).isContentEditable) {
        (el as HTMLElement).focus();
        (el as HTMLElement).textContent = step.value ?? "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return { found: true, elementInfo: info };
      }
      return { found: false, elementInfo: `${info} (not an input)` };
    case "select":
      if (isSelect) {
        (el as any).value = step.value ?? "";
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { found: true, elementInfo: info };
      }
      return { found: false, elementInfo: `${info} (not a select)` };
    case "focus":
      (el as HTMLElement).focus();
      (el as HTMLElement).click?.();
      return { found: true, elementInfo: info };
    case "clear":
      if (isTextInput) {
        (el as HTMLElement).focus();
        const nativeClearSet = getValueSetter();
        if (nativeClearSet) {
          nativeClearSet.call(el, "");
        } else {
          (el as any).value = "";
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { found: true, elementInfo: info };
      }
      if ((el as HTMLElement).isContentEditable) {
        (el as HTMLElement).focus();
        (el as HTMLElement).textContent = "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return { found: true, elementInfo: info };
      }
      return { found: false, elementInfo: `${info} (not an input)` };
    default:
      return { found: false };
  }
}

/**
 * Produce a structural hash of a DOM subtree for deduplication.
 * Uses tag structure, text content, and state attributes (but NOT class
 * names, which change too often with Tailwind/CSS-in-JS).
 */
function hashDom(el: Element): string {
  const parts: string[] = [];
  const STATE_ATTRS = ["aria-checked", "aria-selected", "aria-expanded", "data-state"];
  const walk = (node: Element) => {
    parts.push(node.tagName);
    for (const attr of STATE_ATTRS) {
      const val = node.getAttribute(attr);
      if (val != null) parts.push(`${attr}=${val}`);
    }
    if (node.tagName === "INPUT" && ((node as HTMLInputElement).type === "checkbox" || (node as HTMLInputElement).type === "radio")) {
      parts.push(`checked=${(node as HTMLInputElement).checked}`);
    }
    const text = Array.from(node.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent?.trim())
      .filter(Boolean)
      .join("");
    if (text) parts.push(text);
    for (const child of Array.from(node.children)) walk(child);
  };
  walk(el);
  return parts.join("|");
}

// ─── Main extraction ────────────────────────────────────────────────

/**
 * Extract views from a Make object's code by spinning up iframes,
 * navigating to each view, and converting the DOM to design objects.
 *
 * @param code       The Make's React/HTML code
 * @param views      View definitions with navigation steps
 * @param dimensions Make dimensions for the iframe
 * @param placement  Where to place extracted objects on canvas
 * @param sourceMakeId  ID of the source Make (for tracking)
 * @param onProgress Optional callback for status updates
 */
export async function extractViewsFromMake(
  code: string,
  views: ViewDef[],
  dimensions: { width: number; height: number },
  placement: { baseX: number; baseY: number },
  sourceMakeId: string,
  onProgress?: (status: string) => void,
): Promise<ExtractResult> {
  const tStart = performance.now();
  const failedViews: string[] = [];
  const allExtracted: any[] = [];
  let offsetX = 0;
  const seenDomHashes = new Set<string>();

  // Try to build a fast srcdoc from the live preview (skips Babel entirely).
  // Falls back to the full heavyweight srcdoc if the preview isn't available.
  const fastSrcdoc = buildFastSrcdocFromPreview(sourceMakeId);
  let fullSrcdoc: string | null = null;
  const getSrcdoc = () => {
    if (fastSrcdoc) return fastSrcdoc;
    if (!fullSrcdoc) {
      console.log("[extractViews] Falling back to full srcdoc (Babel + Tailwind)");
      fullSrcdoc = buildInspectorSrcdoc(code, {});
    }
    return fullSrcdoc;
  };

  const isFast = !!fastSrcdoc;
  const loadTimeout = isFast ? 6000 : 12000;
  const readyTimeout = isFast ? 4000 : 8000;
  const quietMs = 300;

  // Process one view at a time: create → load → navigate → capture → destroy.
  // Only one iframe exists at any moment, avoiding parallel main-thread contention.
  for (let vi = 0; vi < views.length; vi++) {
    const view = views[vi];
    onProgress?.(`Processing view ${vi + 1}/${views.length}: ${view.name}`);

    // ── Create & load ──
    await yieldToMain();

    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      `position:fixed;left:-9999px;top:-9999px;` +
      `width:${dimensions.width}px;height:${dimensions.height}px;` +
      `border:none;opacity:0;pointer-events:none;`;
    iframe.sandbox.add("allow-scripts");
    iframe.sandbox.add("allow-same-origin");
    iframe.srcdoc = getSrcdoc();

    const t0 = performance.now();
    const iframeDoc = await new Promise<Document | null>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`[extractViews] Iframe timed out for "${view.name}"`);
        resolve(iframe.contentDocument);
      }, loadTimeout);

      iframe.onload = () => {
        clearTimeout(timeout);
        const doc = iframe.contentDocument;
        if (!doc) { resolve(null); return; }
        waitForIframeReady(doc, readyTimeout, quietMs).then(() => resolve(doc));
      };

      document.body.appendChild(iframe);
    });

    console.log(
      `[extractViews] "${view.name}" iframe loaded in ${(performance.now() - t0).toFixed(0)}ms (${isFast ? "fast" : "full"})`,
    );

    if (!iframeDoc) {
      failedViews.push(`${view.name} (iframe unavailable)`);
      iframe.remove();
      continue;
    }

    // ── Navigate ──
    await yieldToMain();

    let navFailed = false;
    const steps = view.steps || [];
    for (let s = 0; s < steps.length; s++) {
      const step = steps[s];
      const repeatCount = Math.max(1, step.count || 1);

      for (let rep = 0; rep < repeatCount; rep++) {
        if (rep > 0) await yieldToMain();

        const domChanged = observeDomChanges(iframeDoc, 3000, 300);
        const result = await executeNavStep(iframeDoc, step);

        if (!result.found) {
          domChanged.cancel();
          const desc = step.text
            ? `${step.action} "${step.text}"`
            : step.selector
              ? `${step.action} ${step.selector}`
              : JSON.stringify(step);
          console.warn(
            `[extractViews] Nav step ${s + 1}/${steps.length} failed for "${view.name}": ${desc}`,
          );
          failedViews.push(`${view.name} (could not ${desc})`);
          navFailed = true;
          break;
        }

        const repLabel = repeatCount > 1 ? ` (rep ${rep + 1}/${repeatCount})` : "";
        console.log(
          `[extractViews] "${view.name}" step ${s + 1}/${steps.length}${repLabel}: ${result.elementInfo}`,
        );

        const changed = await domChanged.promise;
        if (!changed) {
          console.warn(
            `[extractViews] "${view.name}" step ${s + 1}${repLabel}: no DOM change after ${step.action} on ${result.elementInfo}`,
          );
        }
      }

      if (navFailed) break;

      if (iframeDoc) {
        const htmlCls = iframeDoc.documentElement.className;
        const bg = iframeDoc.defaultView?.getComputedStyle(iframeDoc.body).backgroundColor || "";
        if (htmlCls || step.text?.toLowerCase().includes("dark") || step.text?.toLowerCase().includes("mode")) {
          console.log(
            `[extractViews] "${view.name}" after step ${s + 1}: html.class="${htmlCls}", body bg="${bg}"`,
          );
        }
      }
    }

    if (navFailed) {
      iframe.remove();
      continue;
    }

    // ── Capture ──
    await yieldToMain();

    const htmlClasses = iframeDoc.documentElement.className;
    const bodyBg = iframeDoc.defaultView?.getComputedStyle(iframeDoc.body).backgroundColor || "";
    console.log(
      `[extractViews] "${view.name}" pre-capture: html.class="${htmlClasses}", body bg="${bodyBg}"`,
    );

    const htmlClass = iframeDoc.documentElement.className || "";
    const domHash = (htmlClass ? `HTML_CLASS=${htmlClass}|` : "") + hashDom(iframeDoc.body);
    console.log(`[extractViews] "${view.name}" hash prefix: ${domHash.slice(0, 120)}`);

    if (seenDomHashes.has(domHash)) {
      console.warn(`[extractViews] Skipping "${view.name}" — DOM identical to a previous view`);
      failedViews.push(`${view.name} (duplicate — navigation may not have worked)`);
      iframe.remove();
      continue;
    }
    seenDomHashes.add(domHash);

    await yieldToMain();

    const domEls = iframeDoc.body.querySelectorAll("*").length;
    const t1 = performance.now();
    const { objects: designObjects, flexMetaMap } = domToDesignWithMeta(
      iframeDoc,
      iframeDoc.body,
      placement.baseX + offsetX,
      placement.baseY,
      { width: dimensions.width, height: dimensions.height },
    );
    console.log(
      `[extractViews] "${view.name}": ${domEls} DOM elements → ${designObjects.length} design objects in ${(performance.now() - t1).toFixed(0)}ms`,
    );

    // Destroy iframe immediately to free memory and stop its JS execution
    iframe.remove();
    await yieldToMain();

    if (designObjects.length > 0) {
      refineAutoLayoutSizing(designObjects, flexMetaMap);
      wrapChildMargins(designObjects, flexMetaMap);
      const rootObj = designObjects[0];
      rootObj.name = view.name || `View ${vi + 1}`;
      offsetX += rootObj.width + 40;
      allExtracted.push(...designObjects);
    }
  }

  // Tag with source Make and snapshots
  const tmpObjects: Record<string, any> = {};
  for (const o of allExtracted) {
    o.sourceMakeId = sourceMakeId;
    tmpObjects[o.id] = o;
  }
  for (const o of allExtracted) {
    if (!o.parentId || !tmpObjects[o.parentId]) {
      o.sourceDesignSnapshot = serializeDesignTree(o.id, tmpObjects);
    }
  }

  const elapsed = ((performance.now() - tStart) / 1000).toFixed(1);
  const viewCount = allExtracted.length > 0
    ? allExtracted.filter((o) => !o.parentId || !tmpObjects[o.parentId]).length
    : 0;
  console.log(
    `[extractViews] Done in ${elapsed}s: ${viewCount} views extracted, ${failedViews.length} failed`,
    failedViews.length > 0 ? failedViews : "",
  );

  return { extractedObjects: allExtracted, viewCount: seenDomHashes.size, failedViews };
}

// ─── Server-side extraction via Playwright/Stagehand ────────────────

/**
 * Extract views using the server-side Playwright endpoint.
 * Navigation happens in a real headless browser (no dispatchEvent hacks).
 * DOM snapshots are returned and converted to design objects client-side.
 */
export async function extractViewsWithPlaywright(
  code: string,
  views: ViewDef[],
  dimensions: { width: number; height: number },
  placement: { baseX: number; baseY: number },
  sourceMakeId: string,
  onProgress?: (status: string) => void,
): Promise<ExtractResult> {
  const tStart = performance.now();
  onProgress?.("Preparing extraction...");

  // Build the srcdoc HTML to send to the server
  const srcdocHtml = buildInspectorSrcdoc(code, {});

  onProgress?.("Navigating views in headless browser...");

  // Call the server-side Playwright endpoint
  const response = await fetch("/api/extract-playwright", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      srcdocHtml,
      views,
      viewport: dimensions,
    }),
  });

  if (!response.ok) {
    let errMsg: string;
    try {
      const errJson = await response.json();
      errMsg = errJson.error || JSON.stringify(errJson);
    } catch {
      errMsg = await response.text().catch(() => `HTTP ${response.status}`);
    }
    console.error("[extractViews-pw] Server error:", errMsg);
    throw new Error(`Playwright extraction failed: ${errMsg}`);
  }

  const { snapshots } = await response.json();

  // Convert each snapshot to design objects using a temporary iframe
  const failedViews: string[] = [];
  const allExtracted: any[] = [];
  let offsetX = 0;

  for (let vi = 0; vi < snapshots.length; vi++) {
    const snap = snapshots[vi];
    if (!snap.success) {
      failedViews.push(`${snap.name} (${snap.error || "navigation failed"})`);
      continue;
    }

    onProgress?.(`Converting view ${vi + 1}/${snapshots.length}: ${snap.name}`);
    await yieldToMain();

    // Create a temporary iframe to render the snapshot HTML
    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      `position:fixed;left:-9999px;top:-9999px;` +
      `width:${dimensions.width}px;height:${dimensions.height}px;` +
      `border:none;opacity:0;pointer-events:none;`;
    iframe.sandbox.add("allow-scripts");
    iframe.sandbox.add("allow-same-origin");

    // Build the snapshot HTML with injected CSSOM rules
    let snapshotHtml = snap.html;
    if (snap.cssRules && snap.cssRules.length > 0) {
      const cssBlock = `<style id="pw-cssom-rules">\n${snap.cssRules.join("\n")}\n</style>`;
      snapshotHtml = snapshotHtml.replace("</head>", `${cssBlock}\n</head>`);
    }
    iframe.srcdoc = snapshotHtml;

    const iframeDoc = await new Promise<Document | null>((resolve) => {
      const timeout = setTimeout(() => resolve(iframe.contentDocument), 8000);
      iframe.onload = () => {
        clearTimeout(timeout);
        const doc = iframe.contentDocument;
        if (!doc) { resolve(null); return; }
        // Brief settle for CSS to apply
        setTimeout(() => resolve(doc), 300);
      };
      document.body.appendChild(iframe);
    });

    if (!iframeDoc) {
      failedViews.push(`${snap.name} (iframe render failed)`);
      iframe.remove();
      continue;
    }

    await yieldToMain();

    // Convert DOM to design objects
    const { objects: designObjects, flexMetaMap } = domToDesignWithMeta(
      iframeDoc,
      iframeDoc.body,
      placement.baseX + offsetX,
      placement.baseY,
      { width: dimensions.width, height: dimensions.height },
    );

    iframe.remove();
    await yieldToMain();

    if (designObjects.length > 0) {
      refineAutoLayoutSizing(designObjects, flexMetaMap);
      const rootObj = designObjects[0];
      rootObj.name = snap.name || `View ${vi + 1}`;
      offsetX += rootObj.width + 40;
      allExtracted.push(...designObjects);
    }
  }

  // Tag with source Make
  const tmpObjects: Record<string, any> = {};
  for (const o of allExtracted) {
    o.sourceMakeId = sourceMakeId;
    tmpObjects[o.id] = o;
  }
  for (const o of allExtracted) {
    if (!o.parentId || !tmpObjects[o.parentId]) {
      o.sourceDesignSnapshot = serializeDesignTree(o.id, tmpObjects);
    }
  }

  const elapsed = ((performance.now() - tStart) / 1000).toFixed(1);
  const viewCount = allExtracted.length > 0
    ? allExtracted.filter((o) => !o.parentId || !tmpObjects[o.parentId]).length
    : 0;
  console.log(
    `[extractViews-pw] Done in ${elapsed}s: ${viewCount} views extracted, ${failedViews.length} failed`,
    failedViews.length > 0 ? failedViews : "",
  );

  // Quality gates — throw to trigger client-side fallback
  const successCount = snapshots.filter((s: any) => s.success).length;

  // Gate 1: if any views failed navigation, fall back
  if (views.length > 1 && successCount < views.length) {
    console.warn(
      `[extractViews-pw] Only ${successCount}/${views.length} views succeeded — falling back`,
    );
    throw new Error(`Playwright navigation incomplete: ${successCount}/${views.length} views`);
  }

  // Gate 2: if all "successful" views produced nearly identical HTML,
  // navigation ran but didn't actually change state — fall back
  if (successCount > 1) {
    const htmlLengths = snapshots
      .filter((s: any) => s.success)
      .map((s: any) => (s.html as string).length);
    const minLen = Math.min(...htmlLengths);
    const maxLen = Math.max(...htmlLengths);
    if (minLen > 0 && (maxLen - minLen) / minLen < 0.05) {
      console.warn(
        `[extractViews-pw] All views produced similar HTML (${minLen}-${maxLen} chars) — navigation likely no-op, falling back`,
      );
      throw new Error("Playwright navigation produced identical views");
    }
  }

  return { extractedObjects: allExtracted, viewCount, failedViews };
}

/**
 * Paste extracted objects onto the canvas and trigger auto-layout.
 */
export function pasteExtractedViews(
  dispatch: (action: any) => void,
  extractedObjects: any[],
) {
  dispatch({
    type: "objects.pasted",
    payload: { pastedObjects: extractedObjects },
  });
  // Extracted objects already have pixel-perfect positions from
  // domToDesignWithMeta — skip triggerAutoLayoutForObjects to avoid
  // a cascade of sync dispatches that freezes the UI.
}
