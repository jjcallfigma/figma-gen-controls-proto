/**
 * Lightweight debug logger with namespace-based filtering.
 *
 * Usage (browser console or code):
 *   import { dbg } from '@/lib/debug';
 *   dbg.llm.log('Sending request', { messages, maxTokens });
 *   dbg.actions.group('Executing 5 actions'); ... dbg.actions.groupEnd();
 *
 * Enable channels at runtime (survives hot-reload via localStorage):
 *   __debug.enable('gen-ai:*')     // all gen-ai sub-channels
 *   __debug.enable('*')            // everything
 *   __debug.enable('gen-ai:llm,gen-ai:actions')
 *   __debug.disable()              // silence everything
 *
 * Available channels: gen-ai | gen-ai:llm | gen-ai:actions |
 *                     gen-ai:template | gen-ai:controls | canvas | api
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Logger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  group: (label: string) => void;
  groupCollapsed: (label: string) => void;
  groupEnd: () => void;
  time: (label: string) => void;
  timeEnd: (label: string) => void;
}

// ─── Channel colors ──────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  "gen-ai":          "#9B59B6",
  "gen-ai:llm":      "#3498DB",
  "gen-ai:actions":  "#2ECC71",
  "gen-ai:template": "#F39C12",
  "gen-ai:controls": "#E74C3C",
  canvas:            "#1ABC9C",
  api:               "#E67E22",
};

// ─── Namespace matching ──────────────────────────────────────────────────────

function getPattern(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("debug") ?? "";
  } catch {
    return "";
  }
}

function isEnabled(namespace: string): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  if (typeof window === "undefined") return false;
  const pattern = getPattern();
  if (!pattern) return false;
  const parts = pattern.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.some((p) => {
    if (p === "*") return true;
    if (p === namespace) return true;
    if (p.endsWith(":*")) return namespace.startsWith(p.slice(0, -1));
    return false;
  });
}

// ─── Logger factory ──────────────────────────────────────────────────────────

function makeLogger(namespace: string): Logger {
  const color = CHANNEL_COLORS[namespace] ?? "#666666";
  const badge = `%c[${namespace}]`;
  const style = `color:${color};font-weight:700;font-family:monospace;`;

  return {
    log(...args) {
      if (!isEnabled(namespace)) return;
      console.log(badge, style, ...args);
    },
    warn(...args) {
      if (!isEnabled(namespace)) return;
      console.warn(badge, style, ...args);
    },
    error(...args) {
      // Errors always surface in dev regardless of namespace filter
      if (process.env.NODE_ENV !== "development") return;
      console.error(badge, style, ...args);
    },
    group(label) {
      if (!isEnabled(namespace)) return;
      console.group(`%c[${namespace}] ${label}`, style);
    },
    groupCollapsed(label) {
      if (!isEnabled(namespace)) return;
      console.groupCollapsed(`%c[${namespace}] ${label}`, style);
    },
    groupEnd() {
      if (!isEnabled(namespace)) return;
      console.groupEnd();
    },
    time(label) {
      if (!isEnabled(namespace)) return;
      console.time(`[${namespace}] ${label}`);
    },
    timeEnd(label) {
      if (!isEnabled(namespace)) return;
      console.timeEnd(`[${namespace}] ${label}`);
    },
  };
}

// ─── Pre-built channel loggers ───────────────────────────────────────────────

export const dbg = {
  /** Top-level gen-ai events (pipeline entry/exit) */
  genAi:    makeLogger("gen-ai"),
  /** LLM request/response cycle */
  llm:      makeLogger("gen-ai:llm"),
  /** Action descriptor execution */
  actions:  makeLogger("gen-ai:actions"),
  /** Template placeholder resolution */
  template: makeLogger("gen-ai:template"),
  /** Control value changes & re-runs */
  controls: makeLogger("gen-ai:controls"),
  /** Canvas store dispatch events */
  canvas:   makeLogger("canvas"),
  /** API route logs (server-side) */
  api:      makeLogger("api"),
};

/** Create a logger for a custom namespace. */
export function createDebugger(namespace: string): Logger {
  return makeLogger(namespace);
}

// ─── window.__debug helpers ──────────────────────────────────────────────────

declare global {
  interface Window {
    __debug: DebugHelpers;
  }
}

export interface DebugHelpers {
  /** Enable debug channels. Pattern examples: '*', 'gen-ai:*', 'gen-ai:llm,canvas' */
  enable: (pattern: string) => void;
  /** Disable all debug channels */
  disable: () => void;
  /** Print available commands */
  help: () => void;
  /** Dump the current Zustand canvas store state to the console */
  store: () => void;
  /** Dump the last N gen-ai debug events */
  genAi: (n?: number) => void;
  /** Open / close the gen-ai debug panel */
  panel: {
    toggle: () => void;
    open: (tab?: "llm" | "actions" | "errors" | "history") => void;
    close: () => void;
  };
}

function enable(pattern: string) {
  try { localStorage.setItem("debug", pattern); } catch { /* noop */ }
  console.log(
    `%c[debug] Enabled: "${pattern}". Active immediately; hot-reload preserves it.`,
    "color:#9B59B6;font-weight:bold",
  );
}

function disable() {
  try { localStorage.removeItem("debug"); } catch { /* noop */ }
  console.log("%c[debug] All channels disabled.", "color:#666;font-weight:bold");
}

function printHelp() {
  console.log(
    `%c┌──────────────────────────────────────────────────────────┐
│                  __debug — Debug Helpers                  │
├──────────────────────────────────────────────────────────┤
│ LOGGING                                                   │
│  __debug.enable('gen-ai:*')   All gen-ai channels        │
│  __debug.enable('*')          Every channel              │
│  __debug.enable('gen-ai:llm,gen-ai:actions')  Multi      │
│  __debug.disable()            Silence everything         │
│                                                           │
│ CHANNELS                                                  │
│  gen-ai           Pipeline entry/exit                    │
│  gen-ai:llm       LLM request/response                   │
│  gen-ai:actions   Action descriptor execution            │
│  gen-ai:template  Template placeholder resolution        │
│  gen-ai:controls  Control value changes & re-runs        │
│  canvas           Canvas store dispatches                │
│                                                           │
│ INSPECTION                                                │
│  __debug.store()             Dump canvas store state     │
│  __debug.genAi(20)           Last N gen-ai debug events  │
│  __debug.panel.toggle()      Toggle debug panel          │
│  __debug.panel.open('llm')   Open panel on a tab         │
│  __debug.panel.close()       Close debug panel           │
│  __debug.help()              Show this help              │
└──────────────────────────────────────────────────────────┘`,
    "color:#9B59B6;font-family:monospace;font-size:12px",
  );
}

/** Install `window.__debug` in development. Called once at app startup. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function installDebugHelpers(
  storeRef?: { getState: () => unknown },
  // Using `any` here because the DebugTab union would create a circular dep and this is a dev utility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debugStoreRef?: { getState: () => any },
) {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "development") return;

  const helpers: DebugHelpers = {
    enable,
    disable,
    help: printHelp,

    store() {
      if (storeRef) {
        console.log("[debug] Canvas store state:", storeRef.getState());
      } else {
        console.warn("[debug] Canvas store not yet registered. Try again after app mounts.");
      }
    },

    genAi(n = 10) {
      if (debugStoreRef) {
        const records = debugStoreRef.getState().records.slice(0, n);
        console.log(`[debug] Last ${n} gen-ai debug events:`, records);
      } else {
        console.warn("[debug] Gen-AI debug store not yet registered.");
      }
    },

    panel: {
      toggle() { debugStoreRef?.getState().togglePanel(); },
      open(tab) { debugStoreRef?.getState().openPanel(tab); },
      close() { debugStoreRef?.getState().closePanel(); },
    },
  };

  window.__debug = helpers;

  // Print welcome hint once per session
  if (!sessionStorage.getItem("__debug_welcomed")) {
    sessionStorage.setItem("__debug_welcomed", "1");
    console.log(
      "%c[debug] Dev mode active. Type __debug.help() for available commands.",
      "color:#9B59B6;font-weight:bold",
    );
  }
}
