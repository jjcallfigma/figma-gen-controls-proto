/**
 * Lightweight event store for the gen-ai debug panel.
 * Records key moments in the gen-ai pipeline — LLM requests/responses,
 * action execution, control value changes, and errors — in a circular
 * buffer of the last MAX_RECORDS events.
 *
 * This store is only populated in development; in production it is never
 * imported (the panel component is dynamically imported with a dev guard).
 */

import { create } from "zustand";

// ─── Record types ────────────────────────────────────────────────────────────

export interface LlmRequestRecord {
  type: "llm-request";
  id: string;
  timestamp: number;
  promptText: string;
  frameId: string | undefined;
  autoGenerate: boolean;
  maxTokens: number;
  messagesCount: number;
  systemPromptLength: number;
}

export interface LlmResponseRecord {
  type: "llm-response";
  /** Matches the corresponding LlmRequestRecord.id */
  requestId: string;
  id: string;
  timestamp: number;
  durationMs: number;
  rawText: string;
  parsedOk: boolean;
  parseError?: string;
  actionsCount: number;
  controlsCount: number;
  hasGenerator: boolean;
  replace?: boolean;
}

export interface ActionExecutionRecord {
  type: "actions";
  id: string;
  timestamp: number;
  actions: Array<{
    method: string;
    nodeId?: string;
    tempId?: string;
    parentId?: string;
    /** Short JSON preview of args */
    argsPreview: string;
  }>;
  rootFrameId: string | undefined;
  frameId: string | undefined;
  source: "direct" | "generator";
}

export interface ControlChangeRecord {
  type: "control-change";
  id: string;
  timestamp: number;
  controlId: string;
  controlType: string;
  value: unknown;
  frameId: string;
}

export interface ErrorRecord {
  type: "error";
  id: string;
  timestamp: number;
  message: string;
  /** Where in the pipeline the error occurred */
  context: string;
  stack?: string;
}

export type DebugRecord =
  | LlmRequestRecord
  | LlmResponseRecord
  | ActionExecutionRecord
  | ControlChangeRecord
  | ErrorRecord;

// ─── Tab types ───────────────────────────────────────────────────────────────

export type DebugTab = "llm" | "actions" | "errors" | "history";

// ─── Store ───────────────────────────────────────────────────────────────────

interface GenAiDebugState {
  records: DebugRecord[];
  isOpen: boolean;
  activeTab: DebugTab;
  /** Count of records added while the panel was closed */
  unseenCount: number;

  push: (record: DebugRecord) => void;
  togglePanel: () => void;
  openPanel: (tab?: DebugTab) => void;
  closePanel: () => void;
  setTab: (tab: DebugTab) => void;
  clear: () => void;
}

const MAX_RECORDS = 100;

export const useGenAiDebugStore = create<GenAiDebugState>((set) => ({
  records: [],
  isOpen: false,
  activeTab: "llm",
  unseenCount: 0,

  push: (record) =>
    set((state) => ({
      records: [record, ...state.records].slice(0, MAX_RECORDS),
      unseenCount: state.isOpen ? 0 : state.unseenCount + 1,
    })),

  togglePanel: () =>
    set((state) => ({ isOpen: !state.isOpen, unseenCount: 0 })),

  openPanel: (tab) =>
    set((state) => ({
      isOpen: true,
      activeTab: tab ?? state.activeTab,
      unseenCount: 0,
    })),

  closePanel: () => set({ isOpen: false }),

  setTab: (tab) => set({ activeTab: tab, unseenCount: 0 }),

  clear: () => set({ records: [], unseenCount: 0 }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _counter = 0;

/** Generate a unique debug record ID */
export function newDebugId(): string {
  return `dbg_${++_counter}_${Date.now()}`;
}

/** Truncate JSON to a readable preview length */
export function jsonPreview(value: unknown, maxLen = 120): string {
  try {
    const s = JSON.stringify(value);
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
  } catch {
    return String(value);
  }
}
