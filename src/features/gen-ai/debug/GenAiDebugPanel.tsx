"use client";

/**
 * Gen-AI Debug Panel — dev-only floating inspector.
 *
 * Shows a live feed of LLM requests/responses, executed actions, control
 * value changes, and errors, sourced from `useGenAiDebugStore`.
 *
 * Toggle:   Ctrl+Shift+G  (⌘⇧G on Mac)
 *           __debug.panel.toggle() in the browser console
 *
 * This file is only imported via a dynamic import guarded by
 * `process.env.NODE_ENV === 'development'` in page.tsx, so it is excluded
 * from production bundles entirely.
 */

import { useEffect, useCallback, useState } from "react";
import {
  useGenAiDebugStore,
  type DebugRecord,
  type LlmRequestRecord,
  type LlmResponseRecord,
  type ActionExecutionRecord,
  type ControlChangeRecord,
  type ErrorRecord,
  type DebugTab,
} from "./genAiDebugStore";

// ─── Styling constants (inline to avoid Tailwind/FigUI3 conflicts) ────────────

const S = {
  panel: {
    position: "fixed" as const,
    bottom: 12,
    right: 12,
    zIndex: 999999,
    fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace",
    fontSize: 11,
    lineHeight: 1.5,
    userSelect: "text" as const,
  },
  badge: {
    background: "#1a1a2e",
    color: "#9B59B6",
    border: "1px solid #9B59B6",
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
  },
  unseenDot: {
    background: "#E74C3C",
    borderRadius: "50%",
    width: 8,
    height: 8,
    display: "inline-block",
  },
  window: {
    width: 520,
    maxHeight: 460,
    background: "#0d0d1a",
    border: "1px solid #2a2a4a",
    borderRadius: 8,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    display: "flex" as const,
    flexDirection: "column" as const,
    overflow: "hidden" as const,
  },
  header: {
    padding: "8px 12px",
    background: "#1a1a2e",
    borderBottom: "1px solid #2a2a4a",
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  title: {
    color: "#9B59B6",
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: "0.08em",
  },
  headerActions: {
    display: "flex" as const,
    gap: 6,
    alignItems: "center" as const,
  },
  btn: {
    background: "transparent",
    border: "1px solid #333",
    color: "#888",
    borderRadius: 4,
    padding: "2px 7px",
    cursor: "pointer",
    fontSize: 10,
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#666",
    cursor: "pointer",
    fontSize: 14,
    padding: "0 2px",
    lineHeight: 1,
  },
  tabs: {
    display: "flex" as const,
    background: "#111128",
    borderBottom: "1px solid #2a2a4a",
  },
  tab: (active: boolean): React.CSSProperties => ({
    padding: "5px 12px",
    cursor: "pointer",
    fontSize: 10,
    fontWeight: active ? 700 : 400,
    color: active ? "#9B59B6" : "#555",
    background: "transparent",
    borderTop: "none",
    borderLeft: "none",
    borderRight: "none",
    borderBottomStyle: "solid",
    borderBottomWidth: active ? 2 : 0,
    borderBottomColor: active ? "#9B59B6" : "transparent",
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    transition: "color 0.15s",
  }),
  body: {
    flex: 1,
    overflowY: "auto" as const,
    padding: 8,
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: 4,
  },
  empty: {
    color: "#444",
    textAlign: "center" as const,
    padding: "24px 0",
    fontSize: 11,
  },
  card: (accent: string): React.CSSProperties => ({
    background: "#111128",
    border: `1px solid ${accent}33`,
    borderLeft: `3px solid ${accent}`,
    borderRadius: 4,
    padding: "6px 8px",
  }),
  cardHeader: {
    display: "flex" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
    marginBottom: 4,
  },
  pill: (color: string): React.CSSProperties => ({
    display: "inline-block",
    background: `${color}22`,
    color,
    borderRadius: 3,
    padding: "1px 5px",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
  }),
  meta: {
    color: "#555",
    fontSize: 10,
  },
  value: {
    color: "#ccc",
    wordBreak: "break-all" as const,
    fontSize: 10,
    marginTop: 2,
  },
  pre: {
    margin: 0,
    padding: "4px 6px",
    background: "#080814",
    borderRadius: 3,
    color: "#8be",
    fontSize: 10,
    overflowX: "auto" as const,
    maxHeight: 120,
    overflowY: "auto" as const,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
  },
} as const;

// ─── Timestamp helper ────────────────────────────────────────────────────────

function ts(timestamp: number) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-US", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      style={{
        ...S.btn,
        color: copied ? "#2ECC71" : "#888",
        borderColor: copied ? "#2ECC7155" : "#333",
        fontSize: 9,
        padding: "1px 5px",
      }}
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Record serializers (for copy button) ────────────────────────────────────

function serializeRecord(record: DebugRecord): string {
  switch (record.type) {
    case "llm-request":
      return [
        `[LLM Request] ${ts(record.timestamp)}`,
        `Prompt: "${record.promptText}"`,
        `Messages: ${record.messagesCount} | Max tokens: ${record.maxTokens} | System length: ${record.systemPromptLength}`,
        record.autoGenerate ? "Mode: auto-generate" : "",
        record.frameId ? `Frame: ${record.frameId}` : "",
      ].filter(Boolean).join("\n");
    case "llm-response":
      return [
        `[LLM Response] ${ts(record.timestamp)} · ${record.durationMs}ms`,
        record.parsedOk ? "" : `Parse error: ${record.parseError}`,
        `Actions: ${record.actionsCount} | Controls: ${record.controlsCount}`,
        record.hasGenerator ? "Has generator" : "",
        record.replace ? "Replace: true" : "",
        "---",
        record.rawText,
      ].filter(Boolean).join("\n");
    case "actions":
      return [
        `[Actions (${record.source})] ${ts(record.timestamp)} · ${record.actions.length} actions`,
        record.rootFrameId ? `Root frame: ${record.rootFrameId}` : "",
        ...record.actions.map((a, i) =>
          `#${i + 1} ${a.method}${a.tempId ? ` tempId:${a.tempId}` : a.nodeId ? ` id:${a.nodeId}` : ""} ${a.argsPreview}`,
        ),
      ].filter(Boolean).join("\n");
    case "control-change":
      return [
        `[Control: ${record.controlType}] ${ts(record.timestamp)}`,
        `ID: ${record.controlId} | Frame: ${record.frameId}`,
        JSON.stringify(record.value, null, 2),
      ].join("\n");
    case "error":
      return [
        `[Error] ${ts(record.timestamp)} · ${record.context}`,
        record.message,
        record.stack ?? "",
      ].filter(Boolean).join("\n");
  }
}

// ─── Record cards ────────────────────────────────────────────────────────────

function CardHeader({ pill, accent, copyText, children }: {
  pill: string;
  accent: string;
  copyText: string;
  children: React.ReactNode;
}) {
  return (
    <div style={S.cardHeader}>
      <span style={S.pill(accent)}>{pill}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <CopyButton text={copyText} />
        <span style={S.meta}>{children}</span>
      </span>
    </div>
  );
}

function LlmRequestCard({ r }: { r: LlmRequestRecord }) {
  return (
    <div style={S.card("#3498DB")}>
      <CardHeader pill="LLM Request" accent="#3498DB" copyText={serializeRecord(r)}>
        {ts(r.timestamp)}
      </CardHeader>
      <div style={S.value}>
        <strong style={{ color: "#7ec8e3" }}>&ldquo;{r.promptText.slice(0, 120)}{r.promptText.length > 120 ? "…" : ""}&rdquo;</strong>
      </div>
      <div style={{ ...S.meta, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span>msgs: <b style={{ color: "#aaa" }}>{r.messagesCount}</b></span>
        <span>maxTok: <b style={{ color: "#aaa" }}>{r.maxTokens.toLocaleString()}</b></span>
        <span>sysLen: <b style={{ color: "#aaa" }}>{r.systemPromptLength.toLocaleString()}</b></span>
        {r.autoGenerate && <span style={S.pill("#F39C12")}>auto-gen</span>}
        {r.frameId && <span>frame: <b style={{ color: "#888" }}>{r.frameId.slice(0, 8)}…</b></span>}
      </div>
    </div>
  );
}

function LlmResponseCard({ r }: { r: LlmResponseRecord }) {
  const accent = r.parsedOk ? "#2ECC71" : "#E74C3C";
  return (
    <div style={S.card(accent)}>
      <CardHeader pill={`LLM Response${r.parsedOk ? "" : " (parse error)"}`} accent={accent} copyText={serializeRecord(r)}>
        {ts(r.timestamp)} · {r.durationMs}ms
      </CardHeader>
      {r.parseError && <div style={{ color: "#E74C3C", fontSize: 10, marginBottom: 4 }}>{r.parseError}</div>}
      <div style={{ ...S.meta, display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
        <span>actions: <b style={{ color: "#aaa" }}>{r.actionsCount}</b></span>
        <span>controls: <b style={{ color: "#aaa" }}>{r.controlsCount}</b></span>
        {r.hasGenerator && <span style={S.pill("#9B59B6")}>generator</span>}
        {r.replace && <span style={S.pill("#E67E22")}>replace</span>}
      </div>
      <pre style={S.pre}>{r.rawText.slice(0, 800)}{r.rawText.length > 800 ? "\n…[truncated]" : ""}</pre>
    </div>
  );
}

function ActionsCard({ r }: { r: ActionExecutionRecord }) {
  return (
    <div style={S.card("#2ECC71")}>
      <CardHeader pill={`Actions (${r.source})`} accent="#2ECC71" copyText={serializeRecord(r)}>
        {ts(r.timestamp)} · {r.actions.length} action{r.actions.length !== 1 ? "s" : ""}
      </CardHeader>
      {r.rootFrameId && (
        <div style={{ ...S.meta, marginBottom: 4 }}>
          rootFrame: <b style={{ color: "#888" }}>{r.rootFrameId.slice(0, 12)}…</b>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {r.actions.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 6, fontSize: 10 }}>
            <span style={{ color: "#2ECC71", fontWeight: 700, minWidth: 28, textAlign: "right" }}>#{i + 1}</span>
            <span style={{ color: "#7ed7a0" }}>{a.method}</span>
            {(a.nodeId || a.tempId) && (
              <span style={{ color: "#555" }}>
                {a.tempId ? `tempId:${a.tempId.slice(0, 8)}` : `id:${(a.nodeId ?? "").slice(0, 8)}`}
              </span>
            )}
            {a.argsPreview !== "{}" && (
              <span style={{ color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                {a.argsPreview}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ControlChangeCardEl({ r }: { r: ControlChangeRecord }) {
  return (
    <div style={S.card("#E67E22")}>
      <CardHeader pill={`Control: ${r.controlType}`} accent="#E67E22" copyText={serializeRecord(r)}>
        {ts(r.timestamp)}
      </CardHeader>
      <div style={S.meta}>
        id: <b style={{ color: "#aaa" }}>{r.controlId}</b>
        &nbsp;·&nbsp;
        frame: <b style={{ color: "#888" }}>{r.frameId.slice(0, 8)}…</b>
      </div>
      <div style={{ ...S.value, marginTop: 2 }}>
        <pre style={{ ...S.pre, maxHeight: 48 }}>{JSON.stringify(r.value, null, 2)}</pre>
      </div>
    </div>
  );
}

function ErrorCard({ r }: { r: ErrorRecord }) {
  return (
    <div style={S.card("#E74C3C")}>
      <CardHeader pill="Error" accent="#E74C3C" copyText={serializeRecord(r)}>
        {ts(r.timestamp)} · {r.context}
      </CardHeader>
      <div style={{ color: "#e87" , fontSize: 10, marginBottom: r.stack ? 4 : 0 }}>{r.message}</div>
      {r.stack && (
        <pre style={{ ...S.pre, color: "#966", maxHeight: 80 }}>
          {r.stack.split("\n").slice(1, 6).join("\n")}
        </pre>
      )}
    </div>
  );
}

function RecordCard({ record }: { record: DebugRecord }) {
  switch (record.type) {
    case "llm-request":   return <LlmRequestCard r={record} />;
    case "llm-response":  return <LlmResponseCard r={record} />;
    case "actions":       return <ActionsCard r={record} />;
    case "control-change": return <ControlChangeCardEl r={record} />;
    case "error":         return <ErrorCard r={record} />;
  }
}

// ─── Tab content renderers ───────────────────────────────────────────────────

function LlmTab({ records }: { records: DebugRecord[] }) {
  const llm = records.filter((r) => r.type === "llm-request" || r.type === "llm-response");
  return llm.length === 0
    ? <div style={S.empty}>No LLM calls yet. Send a gen-ai prompt to see results here.</div>
    : <>{llm.map((r) => <RecordCard key={r.id} record={r} />)}</>;
}

function ActionsTab({ records }: { records: DebugRecord[] }) {
  const actions = records.filter((r) => r.type === "actions");
  return actions.length === 0
    ? <div style={S.empty}>No actions executed yet.</div>
    : <>{actions.map((r) => <RecordCard key={r.id} record={r} />)}</>;
}

function ErrorsTab({ records }: { records: DebugRecord[] }) {
  const errors = records.filter((r) => r.type === "error");
  return errors.length === 0
    ? <div style={{ ...S.empty, color: "#2ECC71" }}>No errors. All good.</div>
    : <>{errors.map((r) => <RecordCard key={r.id} record={r} />)}</>;
}

function HistoryTab({ records }: { records: DebugRecord[] }) {
  return records.length === 0
    ? <div style={S.empty}>No events yet.</div>
    : <>{records.map((r) => <RecordCard key={r.id} record={r} />)}</>;
}

// ─── Main panel ──────────────────────────────────────────────────────────────

const TABS: Array<{ id: DebugTab; label: string }> = [
  { id: "llm",     label: "LLM" },
  { id: "actions", label: "Actions" },
  { id: "errors",  label: "Errors" },
  { id: "history", label: "All" },
];

export default function GenAiDebugPanel() {
  const { records, isOpen, activeTab, unseenCount, togglePanel, setTab, clear } =
    useGenAiDebugStore();

  const errorCount = records.filter((r) => r.type === "error").length;

  // Keyboard shortcut: Ctrl+Shift+G / ⌘⇧G
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "G") {
        e.preventDefault();
        togglePanel();
      }
    },
    [togglePanel],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // Collapsed badge
  if (!isOpen) {
    return (
      <div style={S.panel}>
        <button style={S.badge} onClick={togglePanel} title="Toggle Gen-AI Debug Panel (Ctrl+Shift+G)">
          <span style={{ fontSize: 10, letterSpacing: "0.06em" }}>GEN-AI DBG</span>
          {unseenCount > 0 && (
            <span style={{
              background: "#E74C3C",
              color: "#fff",
              borderRadius: 10,
              padding: "1px 5px",
              fontSize: 9,
              fontWeight: 700,
            }}>
              {unseenCount}
            </span>
          )}
          {errorCount > 0 && unseenCount === 0 && (
            <span style={{ ...S.unseenDot, background: "#E74C3C55" }} title={`${errorCount} errors`} />
          )}
        </button>
      </div>
    );
  }

  const tabRecords: Record<DebugTab, DebugRecord[]> = {
    llm:     records.filter((r) => r.type === "llm-request" || r.type === "llm-response"),
    actions: records.filter((r) => r.type === "actions"),
    errors:  records.filter((r) => r.type === "error"),
    history: records,
  };

  return (
    <div style={S.panel}>
      <div style={S.window}>
        {/* Header */}
        <div style={S.header}>
          <span style={S.title}>⬡ GEN-AI DEBUG</span>
          <div style={S.headerActions}>
            <span style={{ ...S.meta, fontSize: 9 }}>{records.length} events</span>
            <button style={S.btn} onClick={clear} title="Clear all events">
              Clear
            </button>
            <button
              style={S.btn}
              onClick={() => {
                console.group("[debug] Gen-AI Debug Records");
                console.log(records);
                console.groupEnd();
              }}
              title="Dump records to console"
            >
              Dump
            </button>
            <button style={S.closeBtn} onClick={togglePanel} title="Close (Ctrl+Shift+G)">
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {TABS.map(({ id, label }) => {
            const count = tabRecords[id].length;
            return (
              <button
                key={id}
                style={S.tab(activeTab === id)}
                onClick={() => setTab(id)}
              >
                {label}
                {count > 0 && (
                  <span style={{
                    marginLeft: 4,
                    background: activeTab === id ? "#9B59B622" : "#ffffff11",
                    color: activeTab === id ? "#9B59B6" : "#555",
                    borderRadius: 3,
                    padding: "0 4px",
                    fontSize: 9,
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div style={S.body}>
          {activeTab === "llm"     && <LlmTab records={records} />}
          {activeTab === "actions" && <ActionsTab records={records} />}
          {activeTab === "errors"  && <ErrorsTab records={records} />}
          {activeTab === "history" && <HistoryTab records={records} />}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: "4px 12px",
          borderTop: "1px solid #1a1a2e",
          color: "#333",
          fontSize: 9,
          display: "flex",
          justifyContent: "space-between",
        }}>
          <span>Ctrl+Shift+G to toggle</span>
          <span>__debug.help() for console tools</span>
        </div>
      </div>
    </div>
  );
}
