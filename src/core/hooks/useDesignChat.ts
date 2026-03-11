"use client";

import { toast } from "@/components/ui/toast";
import { useAppStore } from "@/core/state/store";
import {
  applyDesignOperations,
} from "@/core/utils/designOperations";
import { calculateGroupBounds } from "@/core/utils/selection";
import { serializeDesignTree } from "@/core/utils/designSerializer";
import { useDesignSystemStore } from "@/core/ai/designSystemStore";
import { getDefaultAutoLayoutSizing, MakeChatMessage, MakeProperties, MakeVersion } from "@/types/canvas";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────

export type AIProvider = "openai" | "claude";

export interface DesignChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** If this message caused operations, store the count for display */
  operationsSummary?: string;
  /** Tool call info for rendering in the UI */
  toolCalls?: ToolCallInfo[];
  /** Message type for special rendering */
  messageType?: "text" | "tool_activity" | "status" | "make_activity" | "extract_activity" | "auto_followup";
  /** For make_activity messages: whether the Make operation has completed */
  makeActivityDone?: boolean;
  /** For extract_activity messages: detailed per-view results */
  extractResults?: {
    status: "running" | "done" | "error";
    views: Array<{ name: string; status: "pending" | "ok" | "failed"; reason?: string }>;
  };
  /** Interactive choices presented by the AI */
  choices?: ChoicesData;
  /** Structured content blocks presented by the AI */
  contentBlocks?: ContentBlocksData;
  /** AI's intermediate reasoning/thinking text (shown alongside tool calls) */
  thinking?: string;
  /** For gen-ai activity messages: the root frame ID with custom controls */
  genAiFrameId?: string;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  status: "running" | "completed";
  summary?: string;
}

export interface ChoicesData {
  question: string;
  mode: "single" | "multiple" | "confirm";
  options: { id: string; label: string; description?: string }[];
  /** Set to true after the user has responded */
  answered: boolean;
  /** The selected option IDs */
  selectedIds?: string[];
}

export interface ContentBlock {
  id: string;
  title: string;
  summary: string;
  body?: string;
  tags?: string[];
}

export interface ContentBlocksData {
  title?: string;
  blocks: ContentBlock[];
}

/** Snapshot of the selection at the time the AI assistant was opened */
export interface SelectionContext {
  /** IDs of the selected objects */
  objectIds: string[];
  /** Human-readable label, e.g. "Card, Title" */
  label: string;
}

/** A persisted chat session, keyed by selection fingerprint */
export interface ChatSession {
  id: string; // fingerprint key
  chatHistory: DesignChatMessage[];
  selectionContext: SelectionContext | null;
  aiProvider: AIProvider;
  /** AI-generated short title for this chat */
  title?: string;
  /** When true, handleSend won't overwrite selectionContext from the live selection */
  pinnedContext?: boolean;
  /** Object IDs last created/updated by the AI in this thread; entrypoint only shows for these */
  lastTouchedObjectIds?: string[];
}

/** Info about an overlapping session found for a set of node IDs */
export interface OverlappingSessionInfo {
  sessionId: string;
  title?: string;
  status: "idle" | "loading" | "done";
}

export interface UseDesignChatReturn {
  chatHistory: DesignChatMessage[];
  message: string;
  setMessage: (msg: string) => void;
  isLoading: boolean;
  aiProvider: AIProvider;
  setAiProvider: (p: AIProvider) => void;
  handleSend: (overrideMessage?: string, opts?: { isAutoFollowUp?: boolean }) => Promise<void>;
  handleStop: () => void;
  clearHistory: () => void;
  /** The selection context attached to the current chat session (if any) */
  selectionContext: SelectionContext | null;
  /** Remove the attached selection context */
  clearSelectionContext: () => void;
  /** Start a new (or replace existing) chat for the current canvas selection */
  startNewChat: () => void;
  /** Live canvas selection label (always reflects what's selected now) */
  liveSelectionLabel: string | null;
  /** True after reasoning is done, while generating operations/summary */
  isWorking: boolean;
  /** All chat sessions (for the history list) */
  allSessions: ChatSession[];
  /** Switch to a specific session by its fingerprint key */
  switchToSessionById: (sessionId: string) => void;
  /** The active session's fingerprint key */
  activeSessionId: string;
  /** Trigger a design review of the current page */
  runDesignReview: () => Promise<void>;
  /** Respond to interactive choices presented in a message */
  handleChoiceResponse: (messageId: string, selectedIds: string[]) => void;
  /** Find the most recent session that overlaps with the given node IDs */
  findOverlappingSession: (nodeIds: string[]) => OverlappingSessionInfo | null;
  /** Append a message to the active session without triggering the API */
  injectMessage: (msg: DesignChatMessage) => void;
  /** Patch a message in the active session by ID */
  updateMessage: (id: string, patch: Partial<DesignChatMessage>) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const GLOBAL_KEY = "__global__";

/** Canonical fingerprint for a set of object IDs */
function getFingerprint(ids: string[]): string {
  if (ids.length === 0) return GLOBAL_KEY;
  return [...ids].sort().join(",");
}

/** Build a human-readable label from object IDs */
function buildSelectionLabel(ids: string[]): string {
  const state = useAppStore.getState();
  const names = ids
    .map((id) => state.objects[id]?.name)
    .filter(Boolean)
    .slice(0, 3);
  if (names.length === 0) return "Selection";
  return names.length < ids.length
    ? `${names.join(", ")} +${ids.length - names.length}`
    : names.join(", ");
}

/** Build the design tree context for a given selection context */
function buildDesignContext(
  ctx: SelectionContext | null
): { designTree: string; contextDescription: string } {
  const state = useAppStore.getState();
  const { objects, selection } = state;

  const ctxIds = ctx
    ? ctx.objectIds.filter((id) => objects[id])
    : selection.selectedIds || [];

  if (ctxIds.length > 0) {
    const selectedSet = new Set(ctxIds);
    const topLevelIds = ctxIds.filter((id) => {
      const obj = objects[id];
      if (!obj) return false;
      let parent = obj.parentId ? objects[obj.parentId] : null;
      while (parent) {
        if (selectedSet.has(parent.id)) return false;
        parent = parent.parentId ? objects[parent.parentId] : null;
      }
      return true;
    });

    const trees = topLevelIds
      .map((id) => serializeDesignTree(id, objects))
      .filter(Boolean);

    if (trees.length > 0) {
      return {
        designTree: trees.join("\n\n"),
        contextDescription: `${topLevelIds.length} selected object(s)`,
      };
    }
  }

  return { designTree: "", contextDescription: "" };
}

/** Build the full canvas context for the agentic API */
function buildCanvasContext() {
  const state = useAppStore.getState();
  const { objects, pages, pageIds, currentPageId, selection } = state as any;

  // Serialize objects to plain data (strip functions, proxies, etc.)
  // Strip base64 image URLs from fills to avoid sending megabytes of data
  const stripImageData = (fills: any[] | undefined) => {
    if (!fills) return fills;
    return fills.map((f: any) => {
      if (f.type === "image" && typeof f.imageUrl === "string" && f.imageUrl.startsWith("data:")) {
        return { ...f, imageUrl: "[base64 image]" };
      }
      return f;
    });
  };

  const plainObjects: Record<string, any> = {};
  for (const [id, obj] of Object.entries(objects)) {
    const o = obj as any;
    plainObjects[id] = {
      id: o.id,
      name: o.name,
      type: o.type,
      x: o.x,
      y: o.y,
      width: o.width,
      height: o.height,
      parentId: o.parentId,
      childIds: o.childIds || [],
      fills: stripImageData(o.fills),
      strokes: o.strokes,
      strokeWidth: o.strokeWidth,
      opacity: o.opacity,
      visible: o.visible,
      autoLayoutSizing: o.autoLayoutSizing,
      properties: o.properties,
    };
  }

  const plainPages: Record<string, any> = {};
  if (pages) {
    for (const [id, page] of Object.entries(pages)) {
      const p = page as any;
      plainPages[id] = {
        id: p.id,
        name: p.name,
        objectIds: p.objectIds || [],
      };
    }
  }

  // Include design system context if available
  const dsStore = useDesignSystemStore.getState();
  const designSystemContext = dsStore.getDesignContext();

  return {
    objects: plainObjects,
    pages: plainPages,
    pageIds: pageIds || [],
    currentPageId: currentPageId || "",
    selectedIds: selection?.selectedIds || [],
    designSystem: designSystemContext || undefined,
  };
}

const NEW_OBJECT_GAP = 40;

/** Compute a default position for new root-level objects (world coordinates). Place to the right of the given objects or current selection. */
function computeNewObjectOrigin(
  preferIds?: string[] | null
): { x: number; y: number } {
  const state = useAppStore.getState();
  const { objects, selection, viewport } = state;
  const ids =
    preferIds && preferIds.length > 0
      ? preferIds
      : selection.selectedIds || [];

  if (ids.length > 0) {
    const bounds = calculateGroupBounds(ids, objects);
    if (bounds.width > 0 || bounds.height > 0) {
      return {
        x: bounds.x + bounds.width + NEW_OBJECT_GAP,
        y: bounds.y,
      };
    }
  }

  const centerX =
    (-viewport.panX + viewport.viewportBounds.width / 2) / viewport.zoom;
  const centerY =
    (-viewport.panY + viewport.viewportBounds.height / 2) / viewport.zoom;
  return { x: centerX - 150, y: centerY - 100 };
}

// ─── Tool name to human-readable label ──────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  inspect_canvas: "Inspecting canvas",
  get_design_overview: "Getting design overview",
  check_accessibility: "Checking accessibility",
  audit_consistency: "Auditing consistency",
  analyze_hierarchy: "Analyzing hierarchy",
  apply_operations: "Applying changes",
  search_design_references: "Searching design references",
  extract_design_system: "Extracting design system",
  present_choices: "Presenting options",
  get_spatial_info: "Analyzing spatial layout",
  move_objects: "Moving objects",
  resize_objects: "Resizing objects",
  select_objects: "Selecting objects",
  present_content_blocks: "Preparing content",
  inspect_make: "Inspecting Make",
  edit_make: "Editing Make",
  create_make: "Creating Make",
  extract_views: "Extracting views",
};

// ─── Module-level shared session storage ────────────────────────────
// Shared across all instances of useDesignChat so that the sidebar,
// ScreenSpace, and other consumers all see the same sessions.
const sharedSessionsMap = new Map<string, ChatSession>();

/**
 * Standalone function: find the most recent session whose objectIds
 * overlap with the given nodeIds.  Can be called outside the hook.
 */
export function findOverlappingSessionForNodes(
  nodeIds: string[],
): OverlappingSessionInfo | null {
  if (nodeIds.length === 0) return null;
  const nodeSet = new Set(nodeIds);
  let bestSession: ChatSession | null = null;
  let bestTimestamp = -1;

  for (const session of sharedSessionsMap.values()) {
    if (!session.selectionContext || session.chatHistory.length === 0) continue;
    // Only match when selection overlaps "last touched" by the AI (so original selection no longer shows entrypoint)
    const idsToMatch =
      session.lastTouchedObjectIds && session.lastTouchedObjectIds.length > 0
        ? session.lastTouchedObjectIds
        : session.selectionContext.objectIds;
    const overlaps = idsToMatch.some((id) => nodeSet.has(id));
    if (!overlaps) continue;
    const lastMsg = session.chatHistory[session.chatHistory.length - 1];
    if (lastMsg.timestamp > bestTimestamp) {
      bestTimestamp = lastMsg.timestamp;
      bestSession = session;
    }
  }

  if (!bestSession) return null;

  const statuses = useAppStore.getState().aiSessionStatuses;
  return {
    sessionId: bestSession.id,
    title: bestSession.title,
    status:
      (statuses[bestSession.id] as "idle" | "loading" | "done") || "idle",
  };
}

/** Look up a session by its ID (fingerprint). */
export function getSessionById(sessionId: string): ChatSession | undefined {
  return sharedSessionsMap.get(sessionId);
}

/**
 * Return all sessions whose objectIds include the given nodeId,
 * sorted most-recent first.
 */
export function getSessionsForNode(nodeId: string): ChatSession[] {
  const result: ChatSession[] = [];
  for (const session of sharedSessionsMap.values()) {
    if (!session.selectionContext || session.chatHistory.length === 0) continue;
    if (session.selectionContext.objectIds.includes(nodeId)) {
      result.push(session);
    }
  }
  result.sort((a, b) => {
    const aT = a.chatHistory[a.chatHistory.length - 1]?.timestamp ?? 0;
    const bT = b.chatHistory[b.chatHistory.length - 1]?.timestamp ?? 0;
    return bT - aT;
  });
  return result;
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useDesignChat(): UseDesignChatReturn {
  // ── Session storage (shared across all hook instances) ──────────
  const sessionsRef = useRef(sharedSessionsMap);
  const [activeSessionId, setActiveSessionId] = useState<string>(GLOBAL_KEY);
  const activeSessionIdRef = useRef<string>(GLOBAL_KEY);

  // Per-session abort controllers (generations run independently)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Per-session loading & working tracking (refs + tick for re-render)
  const loadingSessionsRef = useRef<Set<string>>(new Set());
  const workingSessionsRef = useRef<Set<string>>(new Set());
  // Track sessions with pending async extractions (keep loading until done)
  const pendingExtractionsRef = useRef<Set<string>>(new Set());
  // Timers that auto-clear "done" status after 30 minutes
  const statusExpiryTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [tick, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  // Keep activeSessionId ref in sync
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  // Ensure a global session always exists
  if (!sessionsRef.current.has(GLOBAL_KEY)) {
    sessionsRef.current.set(GLOBAL_KEY, {
      id: GLOBAL_KEY,
      chatHistory: [],
      selectionContext: null,
      aiProvider: "claude",
    });
  }

  // ── Derived active session ───────────────────────────────────────
  const activeSession =
    sessionsRef.current.get(activeSessionId) ??
    sessionsRef.current.get(GLOBAL_KEY)!;

  // ── React state that drives re-renders (view of the active session) ─
  const [chatHistory, setChatHistory] = useState<DesignChatMessage[]>(
    activeSession.chatHistory
  );
  const [selectionContext, setSelectionContext] =
    useState<SelectionContext | null>(activeSession.selectionContext);
  const [aiProvider, setAiProviderState] = useState<AIProvider>(
    activeSession.aiProvider
  );
  const [message, setMessage] = useState("");

  // Derived loading/working for the active session
  const isLoading = loadingSessionsRef.current.has(activeSessionId);
  const isWorking = workingSessionsRef.current.has(activeSessionId);

  // ── Sync React state → session ref ──────────────────────────────
  useEffect(() => {
    const session = sessionsRef.current.get(activeSessionId);
    if (session && !loadingSessionsRef.current.has(activeSessionId)) {
      // Only sync from React state if NOT loading (loading writes directly)
      session.chatHistory = chatHistory;
    }
  }, [chatHistory, activeSessionId]);

  useEffect(() => {
    const session = sessionsRef.current.get(activeSessionId);
    if (session) {
      session.selectionContext = selectionContext;
    }
  }, [selectionContext, activeSessionId]);

  useEffect(() => {
    const session = sessionsRef.current.get(activeSessionId);
    if (session) {
      session.aiProvider = aiProvider;
    }
  }, [aiProvider, activeSessionId]);

  // ── Helper: update a session's chat history ─────────────────────
  // Writes to the session ref, and updates React state only if active.
  const updateSessionHistory = useCallback(
    (sessionId: string, history: DesignChatMessage[]) => {
      const session = sessionsRef.current.get(sessionId);
      if (session) {
        session.chatHistory = history;
      }
      if (activeSessionIdRef.current === sessionId) {
        setChatHistory(history);
      }
    },
    []
  );

  /** Functional updater variant (like setChatHistory(prev => ...)) */
  const updateSessionHistoryFn = useCallback(
    (
      sessionId: string,
      updater: (prev: DesignChatMessage[]) => DesignChatMessage[]
    ) => {
      const session = sessionsRef.current.get(sessionId);
      if (!session) return;
      session.chatHistory = updater(session.chatHistory);
      if (activeSessionIdRef.current === sessionId) {
        setChatHistory(session.chatHistory);
      }
    },
    []
  );

  // ── Switch active session helper ─────────────────────────────────
  const switchToSession = useCallback((sessionId: string) => {
    const session = sessionsRef.current.get(sessionId);
    if (!session) return;
    // Don't abort anything — background generations keep running
    setActiveSessionId(sessionId);
    setChatHistory(session.chatHistory);
    setSelectionContext(session.selectionContext);
    setAiProviderState(session.aiProvider);
    setMessage("");
  }, []);

  // ── Watch canvas selection and auto-switch to matching session ───
  const selectedIds = useAppStore((state) => state.selection.selectedIds);
  const objects = useAppStore((state) => state.objects);

  // Live selection label — always reflects the current canvas selection (including Makes)
  const liveSelectionLabel = useMemo(() => {
    if (!selectedIds || selectedIds.length === 0) return null;
    const names = selectedIds
      .map((id) => objects[id]?.name)
      .filter(Boolean)
      .slice(0, 3);
    if (names.length === 0) return null;
    return names.length < selectedIds.length
      ? `${names.join(", ")} +${selectedIds.length - names.length}`
      : names.join(", ");
  }, [selectedIds, objects]);

  // ── Ensure a session exists for the current selection (without switching to it)
  const ensureSessionForSelection = useCallback(() => {
    const state = useAppStore.getState();
    const ids = state.selection.selectedIds || [];
    if (ids.length === 0) return;

    const fp = getFingerprint(ids);
    if (!sessionsRef.current.has(fp)) {
      const label = buildSelectionLabel(ids);
      sessionsRef.current.set(fp, {
        id: fp,
        chatHistory: [],
        selectionContext: { objectIds: ids, label },
        aiProvider: "claude",
      });
    }
  }, []);

  // ── Listen for "open with selection" events from the canvas AI button
  useEffect(() => {
    const handler = () => {
      ensureSessionForSelection();
    };

    window.addEventListener(
      "ai-assistant-open-with-selection",
      handler as EventListener
    );
    return () =>
      window.removeEventListener(
        "ai-assistant-open-with-selection",
        handler as EventListener
      );
  }, [ensureSessionForSelection]);

  // ── Listen for "switch to session" (e.g. from left panel history or done entrypoint click)
  useEffect(() => {
    const handler = (e: Event) => {
      const sessionId = (e as CustomEvent<{ sessionId: string }>).detail?.sessionId;
      if (!sessionId) return;
      const session = sessionsRef.current.get(sessionId);
      const objectIds =
        (session?.lastTouchedObjectIds?.length ? session.lastTouchedObjectIds : null) ??
        session?.selectionContext?.objectIds ??
        [];
      switchToSession(sessionId);
      if (objectIds.length > 0) {
        const state = useAppStore.getState();
        state.dispatch({
          type: "selection.changed",
          payload: {
            selectedIds: objectIds,
            previousSelection: state.selection.selectedIds ?? [],
          },
        });
        requestAnimationFrame(() => {
          window.dispatchEvent(
            new CustomEvent("canvas-focus-on-objects", { detail: { objectIds } }),
          );
        });
      }
    };
    window.addEventListener("ai-assistant-switch-to-session", handler);
    return () => window.removeEventListener("ai-assistant-switch-to-session", handler);
  }, [switchToSession]);

  // ── startNewChat: "+" button ─────────────────────────────────────
  const startNewChat = useCallback(() => {
    const state = useAppStore.getState();
    const ids = state.selection.selectedIds || [];
    const fp = getFingerprint(ids);

    const ctx: SelectionContext | null =
      ids.length > 0
        ? { objectIds: ids, label: buildSelectionLabel(ids) }
        : null;

    const newSession: ChatSession = {
      id: fp,
      chatHistory: [],
      selectionContext: ctx,
      aiProvider: aiProvider,
    };
    sessionsRef.current.set(fp, newSession);
    switchToSession(fp);
  }, [aiProvider, switchToSession]);

  // ── Listen for "start new chat for objects" event ────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const ids: string[] | undefined = detail?.objectIds;
      if (!ids || ids.length === 0) return;

      const fp = `chat-${ids.sort().join(",")}-${Date.now()}`;
      const newSession: ChatSession = {
        id: fp,
        chatHistory: [],
        selectionContext: { objectIds: ids, label: buildSelectionLabel(ids) },
        aiProvider: aiProvider,
        pinnedContext: true,
      };
      sessionsRef.current.set(fp, newSession);
      switchToSession(fp);
    };

    window.addEventListener("ai-start-new-chat", handler);
    return () => window.removeEventListener("ai-start-new-chat", handler);
  }, [aiProvider, switchToSession]);

  // ── clearSelectionContext ─────────────────────────────────────────
  const clearSelectionContext = useCallback(() => {
    setSelectionContext(null);
  }, []);

  // ── clearHistory ─────────────────────────────────────────────────
  const clearHistory = useCallback(() => {
    setChatHistory([]);
    setSelectionContext(null);
  }, []);

  // ── setAiProvider (persists into session) ────────────────────────
  const setAiProvider = useCallback((p: AIProvider) => {
    setAiProviderState(p);
  }, []);

  // ─── handleSend ─────────────────────────────────────────────────
  // Each invocation captures its target session and runs independently.

  const handleSend = useCallback(
    async (overrideMessage?: string, opts?: { isAutoFollowUp?: boolean }) => {
      const msgText = (overrideMessage ?? message).trim();
      if (!msgText) return;

      // Capture the target session at invocation time
      const targetSessionId = activeSessionIdRef.current;

      // Don't allow if THIS session is already generating
      if (loadingSessionsRef.current.has(targetSessionId)) return;

      // Read context from the target session
      const targetSession = sessionsRef.current.get(targetSessionId);
      if (!targetSession) return;

      // Refresh the session's selection context from the live canvas selection
      // so newly selected items are included (e.g. selecting multiple Makes then chatting).
      // Skip if the session has a pinned context (e.g. programmatic "Update Make" flow).
      if (!targetSession.pinnedContext) {
        const liveIds = useAppStore.getState().selection.selectedIds || [];
        if (liveIds.length > 0) {
          const liveLabel = buildSelectionLabel(liveIds);
          targetSession.selectionContext = { objectIds: [...liveIds], label: liveLabel };
        }
      }

      const { designTree } = buildDesignContext(
        targetSession.selectionContext
      );

      // Embed the selection label so the chat UI can show it as a pill
      const selectionLabel = targetSession.selectionContext?.label || "";
      const userContent = designTree
        ? `[Context: ${selectionLabel}]\n\nDesign tree:\n\`\`\`html\n${designTree}\n\`\`\`\n\n${msgText}`
        : msgText;

      const userMessage: DesignChatMessage = {
        id: nanoid(),
        role: "user",
        content: userContent,
        timestamp: Date.now(),
        ...(opts?.isAutoFollowUp ? { messageType: "auto_followup" as const } : {}),
      };

      const newHistory = [...targetSession.chatHistory, userMessage];
      updateSessionHistory(targetSessionId, newHistory);
      if (!overrideMessage) setMessage("");

      // Update header to reflect the new prompt (for every new prompt on the thread)
      const titleForHeader =
        msgText.length > 60 ? `${msgText.slice(0, 57).trim()}...` : msgText;
      useAppStore.getState().setAiSessionLatestMessage(targetSessionId, titleForHeader);
      useAppStore.getState().setAiSessionLastPrompt(targetSessionId, titleForHeader);
      // Only set thread title when session has no title yet (first message); generate-title may override later
      if (!targetSession.title) {
        useAppStore.getState().setAiSessionTitle(targetSessionId, titleForHeader);
      }

      // Generate a title for this chat if it doesn't have one yet
      if (!targetSession.title && !opts?.isAutoFollowUp) {
        const promptForTitle = msgText;
        fetch("/api/generate-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: promptForTitle }),
        })
          .then((r) => r.json())
          .then((data) => {
            const session = sessionsRef.current.get(targetSessionId);
            if (!session || session.title) return;
            const title = data.title?.trim();
            // Only use if the AI actually generated something different from the raw prompt
            if (title && title.toLowerCase() !== promptForTitle.toLowerCase()) {
              session.title = title;
              useAppStore.getState().setAiSessionTitle(targetSessionId, title);
              rerender();
            }
          })
          .catch(() => {});
      }

      useAppStore.getState().touchAiDesignChatSessionActivity(targetSessionId);

      // Mark this session as loading (persists even if user deselects)
      loadingSessionsRef.current.add(targetSessionId);
      useAppStore.getState().setAiSessionStatus(targetSessionId, "loading");
      useAppStore.getState().addAiDesignChatLoadingSession(targetSessionId);
      rerender();

      // Request-scoped IDs for the AI-editing pulse (captured at send time so pulse
      // still appears on those objects after the user deselects)
      const editingIds = targetSession.selectionContext
        ? targetSession.selectionContext.objectIds
        : useAppStore.getState().selection.selectedIds || [];
      if (editingIds.length > 0) {
        useAppStore.getState().setAiEditingObjectsGroup(targetSessionId, editingIds, true);
      }

      // Add a placeholder assistant message for streaming
      const aiMessageId = nanoid();
      const aiMessage: DesignChatMessage = {
        id: aiMessageId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        toolCalls: [],
        messageType: "text",
      };
      const historyWithPlaceholder = [...newHistory, aiMessage];
      updateSessionHistory(targetSessionId, historyWithPlaceholder);

      const startTime = Date.now();
      const createdObjectIds: string[] = [];
      const updatedObjectIds: string[] = [];
      let totalOperationsApplied = 0;

      try {
        // Build the full canvas context for the agentic API
        const canvasContext = buildCanvasContext();

        // Build API messages (strip tool call info, keep raw content)
        const apiMessages = newHistory
          .filter((m) => m.role === "user" || m.role === "assistant")
          .filter((m) => m.messageType !== "tool_activity" && m.messageType !== "status")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

        const controller = new AbortController();
        abortControllersRef.current.set(targetSessionId, controller);

        const response = await fetch("/api/design-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            designTree,
            canvasContext,
            provider: targetSession.aiProvider,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "API request failed");
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        const toolCallInfos: ToolCallInfo[] = [];
        let pendingChoices: ChoicesData | undefined;
        let pendingContentBlocks: ContentBlocksData | undefined;
        // Persistent temp ID map — accumulates across multiple apply_operations calls
        // so the AI can reference tempIds from earlier calls.
        let sessionTempIdMap = new Map<string, string>();

        // Make activity tracking (compact status instead of code streaming)
        const makeActivityMsgId = `make-activity-${nanoid()}`;
        let makeActivityAdded = false;
        let makeActivityLabel = "";

        // Make code streaming into the Make object's chat history
        let makeStreamOutput = "";
        let makeStreamReasoning = "";
        let makeStreamThinkDone = false;
        const makeStreamUserMsgId = nanoid();
        const makeStreamCodeMsgId = nanoid();
        let makeStreamAdded = false;
        let makeStreamLastUpdate = 0;
        const makeStreamStartTime = Date.now();

        // Buffer for reassembling SSE lines split across chunks
        let sseBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          // Keep the last (potentially incomplete) line in the buffer
          sseBuffer = lines.pop() || "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            if (line === "data: [DONE]") break;
            if (line.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(line.slice(6));

                switch (parsed.type) {
                  case "token": {
                    // Accumulate text content
                    fullText += parsed.content;
                    workingSessionsRef.current.add(targetSessionId);
                    rerender();

                    // Update mini-prompt status with latest text line
                    const lastLine = fullText.trim().split("\n").pop()?.trim();
                    if (lastLine) {
                      useAppStore.getState().setAiSessionLatestMessage(targetSessionId, lastLine);
                    }

                    // Update the assistant message with accumulated text
                    updateSessionHistoryFn(targetSessionId, (prev) => {
                      const updated = [...prev];
                      const lastIdx = updated.length - 1;
                      if (lastIdx >= 0 && updated[lastIdx].id === aiMessageId) {
                        updated[lastIdx] = {
                          ...updated[lastIdx],
                          content: fullText,
                          messageType: "text",
                        };
                      }
                      return updated;
                    });
                    break;
                  }

                  case "thinking": {
                    // AI's intermediate reasoning alongside tool calls
                    const thinkingText = parsed.content || "";
                    if (thinkingText) {
                      updateSessionHistoryFn(targetSessionId, (prev) => {
                        const updated = [...prev];
                        const lastIdx = updated.length - 1;
                        if (lastIdx >= 0 && updated[lastIdx].id === aiMessageId) {
                          const existing = updated[lastIdx].thinking || "";
                          updated[lastIdx] = {
                            ...updated[lastIdx],
                            thinking: existing
                              ? existing + "\n" + thinkingText
                              : thinkingText,
                          };
                        }
                        return updated;
                      });
                    }
                    break;
                  }

                  case "tool_call": {
                    // A tool is being called
                    const callInfo: ToolCallInfo = {
                      id: parsed.id,
                      name: parsed.name,
                      status: "running",
                    };
                    toolCallInfos.push(callInfo);
                    workingSessionsRef.current.add(targetSessionId);
                    rerender();

                    // Update mini-prompt status line
                    const toolLabel = TOOL_LABELS[parsed.name] || `Running ${parsed.name}`;
                    useAppStore.getState().setAiSessionLatestMessage(targetSessionId, toolLabel);

                    // Update the message to show tool activity
                    updateSessionHistoryFn(targetSessionId, (prev) => {
                      const updated = [...prev];
                      const lastIdx = updated.length - 1;
                      if (lastIdx >= 0 && updated[lastIdx].id === aiMessageId) {
                        updated[lastIdx] = {
                          ...updated[lastIdx],
                          content: fullText || TOOL_LABELS[parsed.name] || `Running ${parsed.name}...`,
                          toolCalls: [...toolCallInfos],
                        };
                      }
                      return updated;
                    });
                    break;
                  }

                  case "tool_result": {
                    // Tool finished
                    const callIdx = toolCallInfos.findIndex((tc) => tc.id === parsed.id);
                    if (callIdx >= 0) {
                      toolCallInfos[callIdx] = {
                        ...toolCallInfos[callIdx],
                        status: "completed",
                        summary: parsed.summary,
                      };
                    }

                    updateSessionHistoryFn(targetSessionId, (prev) => {
                      const updated = [...prev];
                      const lastIdx = updated.length - 1;
                      if (lastIdx >= 0 && updated[lastIdx].id === aiMessageId) {
                        updated[lastIdx] = {
                          ...updated[lastIdx],
                          toolCalls: [...toolCallInfos],
                        };
                      }
                      return updated;
                    });
                    break;
                  }

                  case "operations": {
                    // Apply operations to the canvas
                    const ops = parsed.operations || [];
                    if (ops.length > 0) {
                      const session = sessionsRef.current.get(targetSessionId);
                      const origin = computeNewObjectOrigin(
                        session?.selectionContext?.objectIds
                      );
                      const result = applyDesignOperations(ops, origin.x, origin.y, sessionTempIdMap);
                      // Use the authoritative list of created IDs from this batch (one per create op)
                      const newlyCreated = result.createdObjectIds ?? [];
                      for (const realId of newlyCreated) {
                        createdObjectIds.push(realId);
                      }
                      if (result.updatedObjectIds?.length) {
                        updatedObjectIds.push(...result.updatedObjectIds);
                      }
                      if (newlyCreated.length > 0) {
                        useAppStore.getState().setAiEditingObjectsGroup(targetSessionId, newlyCreated, true);
                      }
                      // Accumulate tempIdMap for cross-call references
                      sessionTempIdMap = result.tempIdMap;
                      totalOperationsApplied +=
                        result.created + result.updated + result.deleted + result.reparented + result.duplicated;
                      useAppStore.getState().setAiSessionLatestMessage(
                        targetSessionId,
                        `Applied ${totalOperationsApplied} change(s)`,
                      );
                    }
                    break;
                  }

                  case "selection": {
                    // AI wants to select objects on the canvas
                    const objectIds: string[] = parsed.objectIds || [];
                    if (objectIds.length > 0) {
                      const state = useAppStore.getState();
                      const previousSelection = state.selection.selectedIds || [];
                      state.dispatch({
                        type: "selection.changed",
                        payload: {
                          selectedIds: objectIds,
                          previousSelection,
                        },
                      });
                    }
                    break;
                  }

                  case "choices": {
                    // Interactive choices from the AI — attach to the current assistant message
                    const choicesData: ChoicesData = {
                      question: parsed.question || "",
                      mode: parsed.mode || "single",
                      options: parsed.options || [],
                      answered: false,
                    };
                    pendingChoices = choicesData;

                    updateSessionHistoryFn(targetSessionId, (prev) => {
                      const updated = [...prev];
                      const lastIdx = updated.length - 1;
                      if (lastIdx >= 0 && updated[lastIdx].id === aiMessageId) {
                        updated[lastIdx] = {
                          ...updated[lastIdx],
                          choices: choicesData,
                        };
                      }
                      return updated;
                    });
                    break;
                  }

                  case "content_blocks": {
                    // Structured content blocks — attach to the current assistant message
                    const cbData: ContentBlocksData = {
                      title: parsed.title || undefined,
                      blocks: (parsed.blocks || []).map((b: any) => ({
                        id: b.id || String(Math.random()),
                        title: b.title || "",
                        summary: b.summary || "",
                        body: b.body || undefined,
                        tags: b.tags || undefined,
                      })),
                    };
                    pendingContentBlocks = cbData;

                    updateSessionHistoryFn(targetSessionId, (prev) => {
                      const updated = [...prev];
                      const lastIdx = updated.length - 1;
                      if (lastIdx >= 0 && updated[lastIdx].id === aiMessageId) {
                        updated[lastIdx] = {
                          ...updated[lastIdx],
                          contentBlocks: cbData,
                        };
                      }
                      return updated;
                    });
                    break;
                  }

                  case "make_code_token": {
                    const mid = parsed.makeId;
                    if (!makeActivityLabel) {
                      if (mid && mid !== "__new__") {
                        const obj = useAppStore.getState().objects[mid];
                        makeActivityLabel = obj?.name || "Make";
                      } else {
                        makeActivityLabel = "New Make";
                      }
                    }

                    if (!makeActivityAdded) {
                      makeActivityAdded = true;
                      updateSessionHistoryFn(targetSessionId, (prev) => [
                        ...prev,
                        {
                          id: makeActivityMsgId,
                          role: "assistant" as const,
                          content: `Editing ${makeActivityLabel}`,
                          timestamp: Date.now(),
                          messageType: "make_activity" as const,
                          makeActivityDone: false,
                        },
                      ]);
                    }

                    // Stream code tokens into the Make object's chat history
                    if (mid && mid !== "__new__") {
                      makeStreamOutput += parsed.token || "";

                      // Parse <think> tags
                      if (!makeStreamThinkDone) {
                        const thinkStart = makeStreamOutput.indexOf("<think>");
                        const thinkEnd = makeStreamOutput.indexOf("</think>");
                        if (thinkStart !== -1 && thinkEnd !== -1) {
                          makeStreamReasoning = makeStreamOutput.slice(thinkStart + 7, thinkEnd).trim();
                          makeStreamThinkDone = true;
                        } else if (thinkStart !== -1) {
                          makeStreamReasoning = makeStreamOutput.slice(thinkStart + 7).trim();
                        } else if (makeStreamOutput.length > 20) {
                          makeStreamThinkDone = true;
                        }
                      }

                      // Extract visible code (after </think>, strip fences)
                      let visibleCode = "";
                      if (makeStreamThinkDone) {
                        const thinkEndIdx = makeStreamOutput.indexOf("</think>");
                        const afterThink = thinkEndIdx !== -1
                          ? makeStreamOutput.slice(thinkEndIdx + 8)
                          : makeStreamOutput;
                        const summaryIdx = afterThink.indexOf("<summary>");
                        const rawCode = summaryIdx !== -1
                          ? afterThink.slice(0, summaryIdx)
                          : afterThink;
                        // Strip markdown code fences
                        const stripped = rawCode.replace(/^```[\w]*\n?/, "").replace(/\n?```\s*$/, "").trim();
                        const lines = stripped.split("\n");
                        visibleCode = lines.slice(-15).join("\n");
                      }

                      // Throttle store updates to every ~150ms
                      const now = Date.now();
                      if (now - makeStreamLastUpdate < 150) break;
                      makeStreamLastUpdate = now;

                      const state = useAppStore.getState();
                      const makeObj = state.objects[mid];
                      if (!makeObj || makeObj.type !== "make") break;
                      const props = makeObj.properties as MakeProperties;
                      const existingHistory: MakeChatMessage[] = props.chatHistory || [];

                      if (!makeStreamAdded) {
                        makeStreamAdded = true;
                        const newEntries: MakeChatMessage[] = [
                          {
                            id: makeStreamUserMsgId,
                            role: "user",
                            content: msgText,
                            timestamp: makeStreamStartTime,
                          },
                          {
                            id: makeStreamCodeMsgId,
                            role: "assistant",
                            content: visibleCode,
                            timestamp: Date.now(),
                            thinking: makeStreamReasoning || undefined,
                            isCodeStreaming: true,
                            messageType: "code_streaming",
                          },
                        ];
                        state.dispatch({
                          type: "object.updated",
                          payload: {
                            id: mid,
                            changes: {
                              properties: {
                                ...props,
                                chatHistory: [...existingHistory, ...newEntries],
                              },
                            },
                          },
                        });
                      } else {
                        // Update the existing streaming message
                        const updatedHistory = existingHistory.map((m) =>
                          m.id === makeStreamCodeMsgId
                            ? {
                                ...m,
                                content: visibleCode,
                                thinking: makeStreamReasoning || undefined,
                                isCodeStreaming: true,
                                messageType: "code_streaming" as const,
                              }
                            : m,
                        );
                        state.dispatch({
                          type: "object.updated",
                          payload: {
                            id: mid,
                            changes: {
                              properties: {
                                ...props,
                                chatHistory: updatedHistory,
                              },
                            },
                          },
                        });
                      }
                    }
                    break;
                  }

                  case "make_edit": {
                    // Mark the activity message as done
                    if (makeActivityAdded) {
                      const label = makeActivityLabel || "Make";
                      updateSessionHistoryFn(targetSessionId, (prev) =>
                        prev.map((m) =>
                          m.id === makeActivityMsgId
                            ? { ...m, content: `Edited ${label}`, makeActivityDone: true }
                            : m,
                        ),
                      );
                    }

                    const makeId = parsed.makeId;
                    const newCode = parsed.code;

                    // Extract summary from accumulated output
                    let makeEditSummary = "";
                    const summaryMatch = makeStreamOutput.match(/<summary>([\s\S]*?)<\/summary>/);
                    if (summaryMatch) makeEditSummary = summaryMatch[1].trim();

                    const elapsedMs = Date.now() - makeStreamStartTime;
                    const elapsedStr = elapsedMs >= 1000
                      ? `${(elapsedMs / 1000).toFixed(1)}s`
                      : `${elapsedMs}ms`;

                    if (newCode) {
                      const state = useAppStore.getState();
                      const makeObj = state.objects[makeId];
                      if (makeObj && makeObj.type === "make") {
                        const props = makeObj.properties as MakeProperties;
                        const existingHistory: MakeChatMessage[] = props.chatHistory || [];

                        // Build final messages to replace the streaming message
                        const finalMessages: MakeChatMessage[] = [
                          {
                            id: makeStreamCodeMsgId,
                            role: "assistant",
                            content: `Worked for ${elapsedStr}`,
                            messageType: "elapsed",
                            thinking: makeStreamReasoning || undefined,
                            timestamp: Date.now(),
                          },
                        ];
                        if (makeEditSummary) {
                          finalMessages.push({
                            id: nanoid(),
                            role: "assistant",
                            content: makeEditSummary,
                            thinking: makeStreamReasoning || undefined,
                            timestamp: Date.now(),
                          });
                        }

                        let newHistory: MakeChatMessage[];
                        if (makeStreamAdded) {
                          // Replace the streaming message with final messages
                          newHistory = existingHistory
                            .filter((m) => m.id !== makeStreamCodeMsgId)
                            .concat(finalMessages);
                        } else {
                          // Streaming was never added (very fast response) — add user + final
                          newHistory = [
                            ...existingHistory,
                            {
                              id: makeStreamUserMsgId,
                              role: "user",
                              content: msgText,
                              timestamp: makeStreamStartTime,
                            },
                            ...finalMessages,
                          ];
                        }

                        const prevVersions = props.versions ?? [];
                        const newVersion: MakeVersion = {
                          id: nanoid(),
                          code: newCode,
                          prompt: msgText,
                          timestamp: Date.now(),
                        };
                        const versions = [...prevVersions, newVersion].slice(-50);
                        state.dispatch({
                          type: "object.updated",
                          payload: {
                            id: makeId,
                            changes: {
                              properties: {
                                ...props,
                                code: newCode,
                                chatHistory: newHistory,
                                versions,
                                currentVersionIndex: versions.length - 1,
                              },
                            },
                          },
                        });
                      }
                    }
                    break;
                  }

                  case "make_created": {
                    // Mark the activity message as done
                    if (makeActivityAdded) {
                      const label = parsed.name || makeActivityLabel || "Make";
                      updateSessionHistoryFn(targetSessionId, (prev) =>
                        prev.map((m) =>
                          m.id === makeActivityMsgId
                            ? { ...m, content: `Created ${label}`, makeActivityDone: true }
                            : m,
                        ),
                      );
                    }

                    const { name: makeName, code, width, height } = parsed;
                    if (!code) {
                      console.warn("[design-chat] make_created event received with empty code");
                      break;
                    }
                    if (code.trim().startsWith("<") && !code.includes("import") && !code.includes("export")) {
                      console.warn("[design-chat] make_created: code appears to be JSX fragment (no import/export), will wrap automatically");
                    }

                    const origin = computeNewObjectOrigin();
                    const newId = nanoid();
                    const makeObject = {
                      id: newId,
                      type: "make" as const,
                      name: makeName || "Make",
                      createdAt: Date.now(),
                      x: origin.x,
                      y: origin.y,
                      width: width || 400,
                      height: height || 400,
                      rotation: 0,
                      visible: true,
                      locked: false,
                      opacity: 1,
                      blendMode: "normal",
                      parentId: "",
                      childIds: [],
                      zIndex: 0,
                      fills: [],
                      autoLayoutSizing: getDefaultAutoLayoutSizing(),
                      properties: {
                        type: "make",
                        mode: "react",
                        code,
                        chatHistory: (() => {
                          const createdElapsedMs = Date.now() - makeStreamStartTime;
                          const createdElapsedStr = createdElapsedMs >= 1000
                            ? `${(createdElapsedMs / 1000).toFixed(1)}s`
                            : `${createdElapsedMs}ms`;
                          let createdSummary = "";
                          const sm = makeStreamOutput.match(/<summary>([\s\S]*?)<\/summary>/);
                          if (sm) createdSummary = sm[1].trim();
                          const msgs: MakeChatMessage[] = [
                            {
                              id: nanoid(),
                              role: "user",
                              content: msgText,
                              timestamp: makeStreamStartTime,
                            },
                            {
                              id: nanoid(),
                              role: "assistant",
                              content: `Worked for ${createdElapsedStr}`,
                              messageType: "elapsed",
                              thinking: makeStreamReasoning || undefined,
                              timestamp: Date.now(),
                            },
                          ];
                          if (createdSummary) {
                            msgs.push({
                              id: nanoid(),
                              role: "assistant",
                              content: createdSummary,
                              thinking: makeStreamReasoning || undefined,
                              timestamp: Date.now(),
                            });
                          }
                          return msgs;
                        })(),
                        playing: false,
                        borderRadius: 0,
                        overflow: "hidden",
                        versions: [{
                          id: nanoid(),
                          code,
                          prompt: msgText,
                          timestamp: Date.now(),
                        }],
                        currentVersionIndex: 0,
                      } as MakeProperties,
                    };

                    const state = useAppStore.getState();
                    state.dispatch({
                      type: "object.created",
                      payload: { object: makeObject as any },
                    });

                    // Offset origin for next Make if multiple are created
                    origin.x += (width || 400) + 40;
                    break;
                  }

                  case "extract_views": {
                    const { makeId, views: evViews } = parsed;
                    if (!makeId || !evViews?.length) break;

                    const evState = useAppStore.getState();
                    const evMakeObj = evState.objects[makeId];
                    if (!evMakeObj || evMakeObj.type !== "make") break;

                    const evMakeCode = (evMakeObj.properties as MakeProperties)?.code;
                    if (!evMakeCode) break;

                    // Add an activity message showing per-view progress
                    const extractMsgId = nanoid();
                    const viewStatuses = evViews.map((v: any) => ({
                      name: v.name,
                      status: "pending" as const,
                    }));

                    // Capture stable references for the async callback
                    const _sessionId = targetSessionId;
                    const _updateHistory = updateSessionHistoryFn;
                    const _makeName = evMakeObj.name || makeId;

                    const updateExtractMsg = (
                      content: string,
                      results: { status: "running" | "done" | "error"; views: any[] },
                    ) => {
                      _updateHistory(_sessionId, (prev) =>
                        prev.map((m) =>
                          m.id === extractMsgId
                            ? { ...m, content, extractResults: results }
                            : m,
                        ),
                      );
                    };

                    _updateHistory(_sessionId, (prev) => [
                      ...prev,
                      {
                        id: extractMsgId,
                        role: "assistant" as const,
                        content: `Extracting ${evViews.length} views...`,
                        timestamp: Date.now(),
                        messageType: "extract_activity" as const,
                        extractResults: { status: "running" as const, views: viewStatuses },
                      },
                    ]);

                    // Send extraction results back to the model as an automatic follow-up
                    const sendResultsToModel = (resultsText: string) => {
                      window.dispatchEvent(
                        new CustomEvent("ai-mini-prompt-send", {
                          detail: {
                            message: resultsText,
                            fingerprint: _sessionId,
                            sessionId: _sessionId,
                            isAutoFollowUp: true,
                          },
                        }),
                      );
                    };

                    // Track this extraction so loading/shimmer persists
                    pendingExtractionsRef.current.add(_sessionId);

                    // Run extraction -- use an async IIFE with guaranteed finally
                    (async () => {
                      let mod;
                      try {
                        mod = await import("@/core/utils/viewExtractor");
                      } catch (importErr) {
                        console.error("[extract_views] Failed to import viewExtractor:", importErr);
                        updateExtractMsg("Extraction failed — module error", {
                          status: "error",
                          views: evViews.map((v: any) => ({ name: v.name, status: "failed", reason: "module load error" })),
                        });
                        sendResultsToModel(
                          `[Extraction failed for Make "${_makeName}"]\nModule import error. Please try again.`,
                        );
                        return;
                      }

                      try {
                        // Use Playwright/Stagehand for navigation (real browser, no dispatchEvent hacks).
                        // Falls back to client-side extraction if the server endpoint fails.
                        let extractResult: { extractedObjects: any[]; failedViews: string[] };
                        try {
                          extractResult = await mod.extractViewsWithPlaywright(
                            evMakeCode,
                            evViews,
                            { width: evMakeObj.width, height: evMakeObj.height },
                            { baseX: evMakeObj.x + evMakeObj.width + 60, baseY: evMakeObj.y },
                            makeId,
                          );
                        } catch (pwErr) {
                          console.warn("[extract_views] Playwright extraction failed, falling back to client-side:", pwErr);
                          extractResult = await mod.extractViewsFromMake(
                            evMakeCode,
                            evViews,
                            { width: evMakeObj.width, height: evMakeObj.height },
                            { baseX: evMakeObj.x + evMakeObj.width + 60, baseY: evMakeObj.y },
                            makeId,
                          );
                        }
                        const { extractedObjects, failedViews } = extractResult;

                        if (extractedObjects.length > 0) {
                          mod.pasteExtractedViews(useAppStore.getState().dispatch, extractedObjects);
                        }

                        // Build per-view results with object IDs and positions
                        const topLevelIds = new Set(
                          extractedObjects
                            .filter((o: any) => !o.parentId || !extractedObjects.some((p: any) => p.id === o.parentId))
                            .map((o: any) => o.id),
                        );

                        const finalViews = evViews.map((v: any) => {
                          const failed = failedViews.find((f: string) => f.startsWith(v.name));
                          if (failed) {
                            const reason = failed.includes("(")
                              ? failed.slice(failed.indexOf("(") + 1, -1)
                              : "failed";
                            return { name: v.name, status: "failed" as const, reason };
                          }
                          return { name: v.name, status: "ok" as const };
                        });

                        const okCount = finalViews.filter((v: any) => v.status === "ok").length;
                        const summary = okCount === evViews.length
                          ? `Extracted ${okCount} view${okCount > 1 ? "s" : ""}`
                          : `Extracted ${okCount}/${evViews.length} views`;

                        updateExtractMsg(summary, { status: "done", views: finalViews });

                        // Build a structured results message for the model
                        const resultLines = finalViews.map((v: any) => {
                          if (v.status === "ok") {
                            const frame = extractedObjects.find(
                              (o: any) => topLevelIds.has(o.id) && o.name?.includes(v.name),
                            );
                            if (frame) {
                              const fx = Math.round(frame.x);
                              const fy = Math.round(frame.y);
                              const fw = Math.round(frame.width);
                              const fh = Math.round(frame.height);
                              return (
                                `- "${v.name}": OK, frame ID: ${frame.id}, ` +
                                `position (${fx}, ${fy}), size ${fw}x${fh}. ` +
                                `To place something below this frame, use x=${fx}, y=${fy + fh + 20}.`
                              );
                            }
                            return `- "${v.name}": OK`;
                          }
                          return `- "${v.name}": FAILED (${v.reason})`;
                        });

                        sendResultsToModel(
                          `[Extraction complete for Make "${_makeName}"]\n` +
                          `${okCount}/${evViews.length} views extracted successfully.\n` +
                          resultLines.join("\n") +
                          (okCount > 0
                            ? `\nThe extracted frames are now on the canvas. ` +
                              `If the user requested follow-up tasks (like adding labels or descriptions), ` +
                              `use the coordinates above to position objects relative to each frame. ` +
                              `Otherwise, just confirm the extraction is done.`
                            : `\nNo views were extracted. Let the user know what went wrong.`),
                        );
                      } catch (e: any) {
                        console.error("[extract_views] Extraction error:", e);
                        updateExtractMsg(`Extraction failed: ${e.message || "unknown error"}`, {
                          status: "error",
                          views: evViews.map((v: any) => ({
                            name: v.name, status: "failed", reason: e.message || "error",
                          })),
                        });
                        sendResultsToModel(
                          `[Extraction failed for Make "${_makeName}"]\n` +
                          `Error: ${e.message || "unknown error"}. Let the user know what happened.`,
                        );
                      } finally {
                        pendingExtractionsRef.current.delete(_sessionId);
                        // Stream already finished — clean up loading/shimmer now
                        if (!loadingSessionsRef.current.has(_sessionId)) {
                          useAppStore.getState().setAiSessionStatus(_sessionId, "done");
                          useAppStore.getState().setAiEditingObjectsGroup(_sessionId, [], false);
                          rerender();
                        }
                      }
                    })();
                    break;
                  }

                  case "error": {
                    throw new Error(parsed.message || "API error");
                  }
                }
              } catch (e: any) {
                if (e.message && !e.message.includes("Unexpected")) {
                  throw e;
                }
                // Skip unparseable chunks
              }
            }
          }
        }

        // Finalize the response
        const elapsed = Date.now() - startTime;
        const elapsedStr =
          elapsed < 1000
            ? `${elapsed}ms`
            : `${(elapsed / 1000).toFixed(1)}s`;

        const finalMessages: DesignChatMessage[] = [];

        // Operations status message
        if (totalOperationsApplied > 0) {
          finalMessages.push({
            id: nanoid(),
            role: "assistant",
            content: `Applied ${totalOperationsApplied} change(s) (${elapsedStr})`,
            timestamp: Date.now(),
            operationsSummary: `${totalOperationsApplied} change(s)`,
            messageType: "status",
          });
        }

        // AI text response (if any, and not already shown via streaming)
        if (fullText.trim()) {
          finalMessages.push({
            id: nanoid(),
            role: "assistant",
            content: fullText.trim(),
            timestamp: Date.now(),
            toolCalls: toolCallInfos.length > 0 ? toolCallInfos : undefined,
            messageType: "text",
            choices: pendingChoices,
            contentBlocks: pendingContentBlocks,
          });
        } else if (pendingContentBlocks) {
          // Content blocks but no text — show with the title as content
          finalMessages.push({
            id: nanoid(),
            role: "assistant",
            content: pendingContentBlocks.title || "",
            timestamp: Date.now(),
            toolCalls: toolCallInfos.length > 0 ? toolCallInfos : undefined,
            messageType: "text",
            contentBlocks: pendingContentBlocks,
            choices: pendingChoices,
          });
        } else if (pendingChoices) {
          // Choices but no text — still show the choices with the question as content
          finalMessages.push({
            id: nanoid(),
            role: "assistant",
            content: pendingChoices.question,
            timestamp: Date.now(),
            toolCalls: toolCallInfos.length > 0 ? toolCallInfos : undefined,
            messageType: "text",
            choices: pendingChoices,
          });
        } else if (toolCallInfos.length > 0 && totalOperationsApplied === 0) {
          // Tool calls happened but no text response — show tool summaries
          const summaries = toolCallInfos
            .filter((tc) => tc.summary)
            .map((tc) => tc.summary)
            .join(". ");
          finalMessages.push({
            id: nanoid(),
            role: "assistant",
            content: summaries || "Analysis complete.",
            timestamp: Date.now(),
            toolCalls: toolCallInfos,
            messageType: "text",
          });
        } else if (!fullText.trim() && totalOperationsApplied === 0) {
          finalMessages.push({
            id: nanoid(),
            role: "assistant",
            content: "I understood your request but wasn't sure how to proceed. Could you be more specific?",
            timestamp: Date.now(),
          });
        }

        // Use functional updater so we don't wipe out messages added
        // during SSE processing (e.g. extract_activity, make_activity).
        // Remove the streaming placeholder and append final messages.
        updateSessionHistoryFn(targetSessionId, (prev) => {
          const withoutPlaceholder = prev.filter((m) => m.id !== aiMessageId);
          return [...withoutPlaceholder, ...finalMessages];
        });
      } catch (error: any) {
        if (error.name === "AbortError") {
          updateSessionHistoryFn(targetSessionId, (prev) =>
            prev.map((m) =>
              m.id === aiMessageId
                ? { ...m, content: "Generation stopped." }
                : m
            )
          );
        } else {
          const errorMsg: DesignChatMessage = {
            id: aiMessageId,
            role: "assistant",
            content: `Error: ${error.message}. Make sure your API key is configured in .env.local`,
            timestamp: Date.now(),
          };
          const finalHistory = [...newHistory, errorMsg];
          updateSessionHistory(targetSessionId, finalHistory);
        }
      } finally {
        abortControllersRef.current.delete(targetSessionId);
        loadingSessionsRef.current.delete(targetSessionId);
        workingSessionsRef.current.delete(targetSessionId);
        useAppStore.getState().setAiSessionLatestMessage(targetSessionId, null);
        useAppStore.getState().removeAiDesignChatLoadingSession(targetSessionId);

        const hasExtractionPending = pendingExtractionsRef.current.has(targetSessionId);

        if (!hasExtractionPending) {
          useAppStore.getState().touchAiDesignChatSessionActivity(targetSessionId);
          useAppStore.getState().setAiSessionStatus(targetSessionId, "done");
          useAppStore
            .getState()
            .setAiSessionLastResponseWasTextOnly(
              targetSessionId,
              totalOperationsApplied === 0,
            );

          // Auto-expire "done" status after 30 minutes
          const prevTimer = statusExpiryTimers.current.get(targetSessionId);
          if (prevTimer) clearTimeout(prevTimer);
          statusExpiryTimers.current.set(
            targetSessionId,
            setTimeout(() => {
              useAppStore.getState().setAiSessionStatus(targetSessionId, "idle");
              statusExpiryTimers.current.delete(targetSessionId);
            }, 30 * 60 * 1000),
          );

          // Done entrypoint and thread scope = "last touched" by the AI (created or updated this round).
          const lastTouchedIds = [...createdObjectIds, ...updatedObjectIds];
          const doneEntrypointIds = lastTouchedIds.length > 0 ? lastTouchedIds : editingIds;
          if (doneEntrypointIds.length > 0) {
            useAppStore.getState().removeAiDesignChatDoneSeenSession(targetSessionId);
            useAppStore.getState().setAiDesignChatDoneEntrypointForSession(targetSessionId, {
              objectIds: doneEntrypointIds,
              shownAt: Date.now(),
            });
            const session = sessionsRef.current.get(targetSessionId);
            if (session) {
              session.lastTouchedObjectIds = doneEntrypointIds;
              // Update thread's selection scope to the last-touched set so prompt/shimmer/entrypoint all refer to it
              session.selectionContext = {
                objectIds: doneEntrypointIds,
                label: buildSelectionLabel(doneEntrypointIds),
              };
            }
          }
          // Clear this session's shimmer group
          useAppStore.getState().setAiEditingObjectsGroup(targetSessionId, [], false);
        } else {
          // Keep session status as "loading" while extraction runs
          useAppStore.getState().setAiSessionStatus(targetSessionId, "loading");
        }

        rerender();
      }
    },
    [message, aiProvider, updateSessionHistory, updateSessionHistoryFn, rerender]
  );

  const handleStop = useCallback(() => {
    // Stop the active session's generation
    const controller = abortControllersRef.current.get(activeSessionId);
    if (controller) {
      controller.abort();
    }
  }, [activeSessionId]);

  // ── Listen for mini-prompt sends from the on-canvas AI prompt ─────
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.message || !detail?.fingerprint) return;

      const fp = detail.fingerprint as string;
      // If a specific sessionId was provided (resuming an overlapping thread), use that
      const targetId = (detail.sessionId as string) || fp;

      // Allow callers to pin specific objectIds for the session context
      // instead of reading from the live selection.
      const explicitIds: string[] | undefined = detail.objectIds;

      // Ensure the target session exists
      if (!sessionsRef.current.has(targetId)) {
        const ids = explicitIds ?? useAppStore.getState().selection.selectedIds ?? [];
        sessionsRef.current.set(targetId, {
          id: targetId,
          chatHistory: [],
          selectionContext: ids.length > 0
            ? { objectIds: ids, label: buildSelectionLabel(ids) }
            : null,
          aiProvider: "claude",
          pinnedContext: !!explicitIds,
        });
      }

      // Switch to the target session before sending
      if (activeSessionIdRef.current !== targetId) {
        switchToSession(targetId);
      }

      // If explicit objectIds were provided, pin the selection so
      // handleSend doesn't overwrite the context from the live selection.
      if (explicitIds && explicitIds.length > 0) {
        const state = useAppStore.getState();
        state.dispatch({
          type: "selection.set",
          payload: { ids: explicitIds },
        });
      }

      // Use a small delay so the session switch takes effect
      setTimeout(() => {
        handleSendRef.current(detail.message, detail.isAutoFollowUp ? { isAutoFollowUp: true } : undefined);
      }, 0);
    };

    window.addEventListener("ai-mini-prompt-send", handler);
    return () => window.removeEventListener("ai-mini-prompt-send", handler);
  }, [switchToSession]);

  // ── Listen for object duplications and spawn threads for active sessions ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.originalToDuplicatedMap) {
        console.log("[useDesignChat] duplication event: no map in detail");
        return;
      }

      const map = detail.originalToDuplicatedMap as Record<string, string>;
      const originalIds = Object.keys(map);
      console.log("[useDesignChat] duplication event received, originalIds:", originalIds);

      // Find any session that overlaps with the original IDs
      // Prefer a "loading" session, but also accept non-loading ones
      const statuses = useAppStore.getState().aiSessionStatuses;
      let sourceSession: ChatSession | null = null;

      for (const session of sessionsRef.current.values()) {
        if (!session.selectionContext) continue;

        const hasOverlap = session.selectionContext.objectIds.some((id) =>
          originalIds.includes(id),
        );
        if (hasOverlap) {
          const status = statuses[session.id];
          console.log("[useDesignChat] found overlapping session:", session.id, "status:", status);
          if (status === "loading") {
            sourceSession = session;
            break;
          }
          if (!sourceSession) {
            sourceSession = session;
          }
        }
      }

      if (!sourceSession) {
        console.log("[useDesignChat] no overlapping session found for duplicated objects");
        return;
      }

      console.log("[useDesignChat] using source session:", sourceSession.id);

      // Map the original objectIds to duplicated ones
      const newObjectIds = sourceSession.selectionContext!.objectIds
        .map((id) => map[id])
        .filter(Boolean);

      if (newObjectIds.length === 0) {
        console.log("[useDesignChat] no new object IDs after mapping");
        return;
      }

      const fp = getFingerprint(newObjectIds);
      if (sessionsRef.current.has(fp)) {
        console.log("[useDesignChat] session already exists for fingerprint:", fp);
        return;
      }

      const newSession: ChatSession = {
        id: fp,
        chatHistory: [],
        selectionContext: {
          objectIds: newObjectIds,
          label: buildSelectionLabel(newObjectIds),
        },
        aiProvider: "claude",
      };
      sessionsRef.current.set(fp, newSession);
      switchToSession(fp);
      rerender();
      console.log("[useDesignChat] created new session for duplicated objects:", fp);
    };

    window.addEventListener("canvas-objects-duplicated", handler);
    return () => window.removeEventListener("canvas-objects-duplicated", handler);
  }, [switchToSession, rerender]);

  // ── handleChoiceResponse: user clicked interactive choices ────────
  const handleChoiceResponse = useCallback(
    (messageId: string, selectedOptionIds: string[]) => {
      const targetSessionId = activeSessionIdRef.current;
      const session = sessionsRef.current.get(targetSessionId);
      if (!session) return;

      // Find the message with choices and mark as answered
      const msg = session.chatHistory.find((m) => m.id === messageId);
      if (!msg?.choices || msg.choices.answered) return;

      const choicesData = msg.choices;

      // Build a human-readable response from the selected options
      const selectedLabels = selectedOptionIds
        .map((optId) => {
          const opt = choicesData.options.find((o) => o.id === optId);
          return opt
            ? opt.description
              ? `${opt.label} — ${opt.description}`
              : opt.label
            : optId;
        })
        .join(", ");

      const responseText =
        choicesData.mode === "confirm"
          ? selectedLabels
          : selectedOptionIds.length === 1
            ? `I choose: ${selectedLabels}`
            : `I choose: ${selectedLabels}`;

      // Mark the choices as answered
      updateSessionHistoryFn(targetSessionId, (prev) =>
        prev.map((m) =>
          m.id === messageId && m.choices
            ? {
                ...m,
                choices: {
                  ...m.choices,
                  answered: true,
                  selectedIds: selectedOptionIds,
                },
              }
            : m
        )
      );

      // Auto-send the selection as a new message
      handleSend(responseText);
    },
    [handleSend, updateSessionHistoryFn]
  );

  // ── Design Review: automated analysis of the current page ─────────
  const runDesignReview = useCallback(async () => {
    const reviewPrompt =
      "Please do a comprehensive design review of my current page. " +
      "Check accessibility (contrast, touch targets, text sizes), " +
      "audit consistency (colors, fonts, spacing), " +
      "and analyze the hierarchy (structure, naming, auto-layout usage). " +
      "Present your findings organized by severity and suggest fixes.";
    await handleSend(reviewPrompt);
  }, [handleSend]);

  // Snapshot all sessions for the history list.
  const allSessions = useMemo(() => {
    return Array.from(sessionsRef.current.values()).filter(
      (s) => s.chatHistory.length > 0
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatHistory, activeSessionId, tick]);

  // Delegates to the module-level standalone function
  const findOverlappingSession = useCallback(
    (nodeIds: string[]): OverlappingSessionInfo | null =>
      findOverlappingSessionForNodes(nodeIds),
    [],
  );

  const injectMessage = useCallback(
    (msg: DesignChatMessage) => {
      updateSessionHistoryFn(activeSessionIdRef.current, (prev) => [...prev, msg]);
    },
    [updateSessionHistoryFn],
  );

  const updateMessage = useCallback(
    (id: string, patch: Partial<DesignChatMessage>) => {
      updateSessionHistoryFn(activeSessionIdRef.current, (prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
    },
    [updateSessionHistoryFn],
  );

  return {
    chatHistory,
    message,
    setMessage,
    isLoading,
    aiProvider,
    setAiProvider,
    handleSend,
    handleStop,
    clearHistory,
    selectionContext,
    clearSelectionContext,
    startNewChat,
    liveSelectionLabel,
    isWorking,
    allSessions,
    switchToSessionById: switchToSession,
    activeSessionId,
    runDesignReview,
    handleChoiceResponse,
    findOverlappingSession,
    injectMessage,
    updateMessage,
  };
}
