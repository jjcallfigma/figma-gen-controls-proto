"use client";

import { useNavigation } from "@/contexts/NavigationContext";
import { useDesignChat } from "@/core/hooks/useDesignChat";
import { ChatMessage as DesignChatBubble } from "@/components/chat";
import { useMakeChat } from "@/core/hooks/useMakeChat";
import { useAppStore, useSelectedObjects } from "@/core/state/store";
import { renderMarkdown } from "@/core/utils/renderMarkdown";
import { MakeChatMessage } from "@/types/canvas";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AiAssistantEmptyState from "./AiAssistantEmptyState";
import { Icon24Check } from "./icons/icon-24-check";
import { Icon24ChevronLeftLarge } from "./icons/icon-24-chevron-left-large";
import { Icon24Close } from "./icons/icon-24-close";
import { Icon24CodeLayer } from "./icons/icon-24-code-layer";
import { Icon24Expand } from "./icons/icon-24-expand";
import { Icon24LayoutSetSmall } from "./icons/icon-24-layout-set-small";
import { Icon24LoadingSmall } from "./icons/icon-24-loading-small";
import { Icon24MoveSmall } from "./icons/icon-24-move-small";
import { Icon24PlusSmall } from "./icons/icon-24-plus-small";
import { Icon24Reload } from "./icons/icon-24-reload";
import { Icon24TrashSmall } from "./icons/icon-24-trash-small";
import SyntaxHighlight from "./SyntaxHighlight";
import { UserAvatar } from "./chat";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

import { deriveTitle, formatRelativeTime } from "@/core/utils/chatUtils";
import { useGenAI } from "@/features/gen-ai/hooks/useGenAI";

// ─── Make Chat View ──────────────────────────────────────────────────

function MakeChatView({
  makeObjectId,
  makeObjectName,
  sidebarWidth,
  onClose,
  onLoadingChange,
}: {
  makeObjectId: string;
  makeObjectName: string;
  sidebarWidth: number;
  onClose: () => void;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const openMakeEditor = useAppStore((state) => state.openMakeEditor);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [chatBottomPad, setChatBottomPad] = useState(0);
  const lastScrolledUserMsgId = useRef<string | null>(null);

  const {
    chatHistory,
    currentCode,
    message,
    setMessage,
    isLoading,
    aiProvider,
    setAiProvider,
    handleSend,
    handleStop,
  } = useMakeChat({
    objectId: makeObjectId,
    active: true,
  });

  // Focus the input when the Make chat opens
  useEffect(() => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [makeObjectId]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  // Auto-scroll chat
  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container || chatHistory.length === 0) {
      setChatBottomPad(0);
      return;
    }
    const lastUserMsg = [...chatHistory]
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUserMsg) return;
    if (lastUserMsg.id === lastScrolledUserMsgId.current) return;
    lastScrolledUserMsgId.current = lastUserMsg.id;

    requestAnimationFrame(() => {
      const userMsgEls = container.querySelectorAll("[data-chat-role='user']");
      const lastUserMsgEl = userMsgEls[userMsgEls.length - 1] as
        | HTMLElement
        | undefined;
      if (!lastUserMsgEl) return;
      const containerH = container.clientHeight;
      const msgTop = lastUserMsgEl.offsetTop;
      const msgHeight = lastUserMsgEl.offsetHeight;
      const contentH = container.scrollHeight - chatBottomPad;
      const belowMsg = contentH - msgTop;
      const needed = Math.max(0, containerH - belowMsg + msgHeight);
      setChatBottomPad(needed);
      // Wait for React to flush the spacer update before scrolling
      setTimeout(() => {
        requestAnimationFrame(() => {
          container.scrollTo({
            top: Math.max(0, lastUserMsgEl.offsetTop - 16),
            behavior: "smooth",
          });
        });
      }, 50);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatHistory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Detect if the *other* consumer (editor) is streaming — infer from
  // the chat history containing an empty-assistant message.
  const lastMsg = chatHistory[chatHistory.length - 1];
  const externallyLoading =
    !isLoading && lastMsg?.role === "assistant" && lastMsg.content === "";
  const effectiveLoading = isLoading || externallyLoading;
  const canSend = message.trim().length > 0 && !effectiveLoading;

  // Notify parent of loading state so it keeps MakeChatView mounted during generation.
  // Use a ref for the callback to avoid re-firing when the parent passes a new
  // function identity (e.g. inline arrow in a .map()).
  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;
  useEffect(() => {
    onLoadingChangeRef.current?.(effectiveLoading);
  }, [effectiveLoading]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between pl-3 pr-3 pt-3 pb-3 flex-shrink-0 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <span className="text-[13px] font-medium truncate block">
              {makeObjectName}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openMakeEditor(makeObjectId)}
              title="Open full Make editor"
            >
              <Icon24Expand />
            </Button>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-[5px] flex items-center justify-center cursor-default"
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--color-bg-secondary)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <Icon24Close />
            </button>
          </div>
        </div>
      </div>

      {/* Chat messages */}
      <div
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto scrollbar-hide px-6 py-4 relative"
      >
        {chatHistory.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full text-center"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <Icon24CodeLayer className="h-8 w-8 mb-2" />
            <p className="text-[13px] font-medium mb-1">
              What do you want to make?
            </p>
            <p className="text-[12px] opacity-60">
              Describe your idea or ask for changes.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {chatHistory.map((msg) => (
              <ChatMessage key={msg.id} msg={msg} />
            ))}
            {effectiveLoading &&
              chatHistory[chatHistory.length - 1]?.content === "" && (
                <div className="flex justify-start">
                  <div
                    className="py-2 text-[11px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    Thinking...
                  </div>
                </div>
              )}
            <div style={{ height: chatBottomPad }} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        <div
          className="border rounded-xl overflow-hidden"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg)",
          }}
        >
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              // Mark that the user has typed so Delete/Backspace won't
              // delete the canvas object if they clear the field.
              if (e.target.value) e.target.dataset.hasTyped = "1";
            }}
            onFocus={(e) => {
              delete e.target.dataset.hasTyped;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask for changes..."
            rows={3}
            className="w-full px-3 py-3 resize-none border-0 outline-none bg-transparent"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 400,
              fontSize: "13px",
              lineHeight: "20px",
              color: "var(--color-text)",
              minHeight: "68px",
              maxHeight: "200px",
            }}
          />
          <div className="flex items-center justify-between px-3 pb-2">
            {/* Model selector */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAiProvider("openai")}
                className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                style={{
                  backgroundColor:
                    aiProvider === "openai"
                      ? "var(--color-bg-secondary)"
                      : "transparent",
                  color:
                    aiProvider === "openai"
                      ? "var(--color-text)"
                      : "var(--color-text-secondary)",
                  border: "none",
                }}
              >
                GPT-5.2
              </button>
              <button
                onClick={() => setAiProvider("claude")}
                className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                style={{
                  backgroundColor:
                    aiProvider === "claude"
                      ? "var(--color-bg-secondary)"
                      : "transparent",
                  color:
                    aiProvider === "claude"
                      ? "var(--color-text)"
                      : "var(--color-text-secondary)",
                  border: "none",
                }}
              >
                Claude
              </button>
            </div>
            {effectiveLoading ? (
              isLoading ? (
                <button
                  onClick={handleStop}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: "var(--color-bg-inverse, #000000)",
                    color: "white",
                    cursor: "pointer",
                    border: "none",
                  }}
                  title="Stop generation"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="currentColor"
                  >
                    <rect width="10" height="10" rx="1.5" />
                  </svg>
                </button>
              ) : (
                <div
                  className="w-5 h-5 border-2 rounded-full animate-spin"
                  style={{
                    borderColor: "var(--color-border)",
                    borderTopColor: "var(--color-text-secondary)",
                  }}
                  title="Generating in editor…"
                />
              )
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!canSend}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: canSend
                    ? "var(--color-bg-inverse, #000000)"
                    : "var(--color-bg-disabled, #e0e0e0)",
                  color: "white",
                  cursor: canSend ? "pointer" : "default",
                  border: "none",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    d="M7 12V2M7 2L3 6M7 2L11 6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Chat Message (shared rendering) ─────────────────────────────────

function ChatMessage({ msg }: { msg: MakeChatMessage }) {
  if (msg.content.startsWith("__ERROR_DETECTED__")) {
    return (
      <div data-chat-role={msg.role} className="flex justify-start">
        <div
          className="flex items-start gap-2 text-[11px] leading-relaxed px-3 py-2 border rounded-[5px]"
          style={{
            color: "#b91c1c",
            backgroundColor: "#fef2f2",
            borderColor: "#fecaca",
            fontFamily: "Roboto Mono, monospace",
            fontSize: "10px",
            wordBreak: "break-word",
          }}
        >
          <span>{msg.content.slice("__ERROR_DETECTED__".length)}</span>
        </div>
      </div>
    );
  }

  if (msg.content.startsWith("__AUTO_FIX__")) {
    return (
      <div data-chat-role={msg.role} className="flex justify-start">
        <div
          className="flex items-start gap-2 text-[11px] leading-relaxed"
          style={{
            color: "var(--color-text-secondary, #999)",
            fontStyle: "italic",
          }}
        >
          <span>{msg.content.slice("__AUTO_FIX__".length)}</span>
        </div>
      </div>
    );
  }

  if (msg.content.startsWith("__CODE_STREAMING__")) {
    return (
      <div data-chat-role={msg.role} className="flex justify-start">
        <div
          className="max-w-[100%] w-full text-[10px] leading-relaxed font-mono rounded-[8px] overflow-hidden border"
          style={{
            padding: "8px 10px",
            maxHeight: "180px",
            overflow: "hidden",
            whiteSpace: "pre",
          }}
        >
          {msg.content.length > "__CODE_STREAMING__".length ? (
            <SyntaxHighlight
              code={msg.content.slice("__CODE_STREAMING__".length)}
            />
          ) : (
            <span style={{ color: "var(--color-text-tertiary, #888)" }}>
              Writing code...
            </span>
          )}
        </div>
      </div>
    );
  }

  if (msg.content.startsWith("Worked for ") && msg.role === "assistant") {
    return (
      <div data-chat-role={msg.role} className="flex justify-start">
        <div
          className="text-[13px] leading-relaxed"
          style={{ color: "var(--color-text-secondary, #999)" }}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.content.startsWith("Auto-fixed") && msg.role === "assistant") {
    return (
      <div data-chat-role={msg.role} className="flex justify-start">
        <div className="text-[11px] leading-relaxed">
          {msg.content.split("\n").map((line, i) => (
            <div key={i} style={{ marginTop: i > 0 ? 4 : 0 }}>
              {line}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (msg.content.startsWith("Auto-fix failed") && msg.role === "assistant") {
    return (
      <div data-chat-role={msg.role} className="flex justify-start">
        <div className="text-[11px] leading-relaxed">❌ {msg.content}</div>
      </div>
    );
  }

  if (msg.role === "user" && msg.content.includes("Design tree:\n```html\n")) {
    return (
      <div data-chat-role={msg.role} className="flex justify-end">
        <div className="flex items-start justify-end gap-2 max-w-[85%] w-full">
          <div
            className="text-[11px] leading-relaxed flex items-center gap-1.5"
            style={{
              padding: "6px 12px",
              borderRadius: "16px",
              backgroundColor: "var(--color-bg-secondary, #0D99FF)",
              color: "var(--color-text, #333)",
            }}
          >
            <Icon24LayoutSetSmall className="flex-shrink-0 opacity-50" />
            Convert from design
          </div>
          <UserAvatar className="h-6 w-6 mt-1" />
        </div>
      </div>
    );
  }

  if (
    msg.role === "user" &&
    msg.content.includes("Updated design tree:\n```html\n")
  ) {
    return (
      <div data-chat-role={msg.role} className="flex justify-end">
        <div className="flex items-start justify-end gap-2 max-w-[85%] w-full">
          <div
            className="text-[11px] leading-relaxed flex items-center gap-1.5"
            style={{
              padding: "6px 12px",
              borderRadius: "16px",
              backgroundColor: "var(--color-bg-secondary, #0D99FF)",
              color: "var(--color-text, #333)",
            }}
          >
            <Icon24Reload className="flex-shrink-0 opacity-50" />
            Update from design
          </div>
          <UserAvatar className="h-6 w-6 mt-1" />
        </div>
      </div>
    );
  }

  if (msg.role === "user" && msg.content.startsWith("[Delete element]")) {
    return (
      <div data-chat-role={msg.role} className="flex justify-end">
        <div className="flex items-start justify-end gap-2 max-w-[85%] w-full">
          <div
            className="text-[11px] leading-relaxed flex items-center gap-1.5"
            style={{
              padding: "6px 12px",
              borderRadius: "16px",
              backgroundColor: "var(--color-bg-secondary, #0D99FF)",
              color: "var(--color-text, #333)",
            }}
          >
            <Icon24TrashSmall className=" flex-shrink-0 opacity-50" />
            Delete element
          </div>
          <UserAvatar className="h-6 w-6 mt-1" />
        </div>
      </div>
    );
  }

  if (msg.role === "user" && msg.content.startsWith("[Move element]")) {
    return (
      <div data-chat-role={msg.role} className="flex justify-end">
        <div className="flex items-start justify-end gap-2 max-w-[85%] w-full">
          <div
            className="text-[11px] leading-relaxed flex items-center gap-1.5"
            style={{
              padding: "6px 12px",
              borderRadius: "16px",
              backgroundColor: "var(--color-bg-secondary, #0D99FF)",
              color: "var(--color-text, #333)",
            }}
          >
            <Icon24MoveSmall className="flex-shrink-0 opacity-50" />
            Move element
          </div>
          <UserAvatar className="h-6 w-6 mt-1" />
        </div>
      </div>
    );
  }

  if (msg.role === "user" && msg.content.startsWith("[Selected element:")) {
    return (
      <div data-chat-role={msg.role} className="flex justify-end">
        <div className="flex items-start justify-end gap-2 max-w-[85%] w-full">
          <div
            className="text-[11px] leading-relaxed"
            style={{
              padding: "8px 12px",
              borderRadius: "16px",
              backgroundColor: "var(--color-bg-secondary, #0D99FF)",
              color: "var(--color-text, #333)",
            }}
          >
            {msg.content.split("\n```\n\n").pop() || msg.content}
          </div>
          <UserAvatar className="h-6 w-6 mt-1" />
        </div>
      </div>
    );
  }

  if (msg.role === "user") {
    return (
      <div data-chat-role={msg.role} className="flex justify-end">
        <div className="flex items-start justify-end gap-2 max-w-[85%] w-full">
          <div
            className="text-[13px] leading-relaxed"
            style={{
              padding: "8px 16px",
              borderRadius: "16px",
              backgroundColor: "var(--color-bg-secondary, #0D99FF)",
              color: "var(--color-text, #333)",
            }}
          >
            {msg.content}
          </div>
          <UserAvatar className="h-6 w-6 mt-[6px] self-end" />
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div data-chat-role={msg.role} className="flex justify-start">
      <div className="max-w-[85%] text-[13px] leading-relaxed">
        {(() => {
          const lines = msg.content.split("\n");
          const textLines = lines.filter((l) => !l.trim().startsWith("→"));
          const suggestions = lines
            .filter((l) => l.trim().startsWith("→"))
            .map((l) => l.trim().slice(1).trim());

          const textContent = textLines.join("\n").trim();

          return (
            <>
              {textContent && (
                <div className="markdown-content">
                  {renderMarkdown(textContent)}
                </div>
              )}
              {suggestions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {suggestions.map((s, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-3 py-1.5 rounded-full text-[13px]"
                      style={{
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Main Sidebar Component ──────────────────────────────────────────

export default function AiAssistantSidebar({
  visible = true,
}: {
  visible?: boolean;
}) {
  const { setActiveTab, sidebarWidth, setSidebarWidth, isNavigationCollapsed } =
    useNavigation();
  const [isResizing, setIsResizing] = useState(false);

  // Design chat hook (for the generic AI assistant)
  const designChat = useDesignChat();
  const genAI = useGenAI();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [chatBottomPad, setChatBottomPad] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [filterBySelection, setFilterBySelection] = useState(false);
  const lastScrolledUserMsgId = useRef<string | null>(null);

  const selectedObjects = useSelectedObjects();
  const objects = useAppStore((s) => s.objects);
  const selectedIds = useAppStore((s) => s.selection.selectedIds);
  const aiSessionStatuses = useAppStore((s) => s.aiSessionStatuses);
  const addAiDesignChatDoneSeenSession = useAppStore(
    (s) => s.addAiDesignChatDoneSeenSession,
  );

  // Track which "done" sessions the user has viewed
  const [seenSessions, setSeenSessions] = useState<Set<string>>(new Set());

  // Only mark a session as seen if the panel is visible, showing the chat
  // (not the history list), and it's the active session that just finished.
  useEffect(() => {
    if (!visible || showHistory) return;
    const status = aiSessionStatuses[designChat.activeSessionId];
    if (status === "done") {
      setSeenSessions((prev) => {
        if (prev.has(designChat.activeSessionId)) return prev;
        return new Set([...prev, designChat.activeSessionId]);
      });
      addAiDesignChatDoneSeenSession(designChat.activeSessionId);
    }
  }, [aiSessionStatuses, designChat.activeSessionId, visible, showHistory, addAiDesignChatDoneSeenSession]);

  // Filter chat sessions: optionally by selection, then by search query
  const filteredSessions = useMemo(() => {
    let sessions = designChat.allSessions;

    // Only filter by selection when the toggle is active
    if (filterBySelection && selectedIds.length > 0) {
      const selSet = new Set(selectedIds);
      sessions = sessions.filter((session) => {
        if (!session.selectionContext) return false;
        return session.selectionContext.objectIds.some((id) => selSet.has(id));
      });
    }

    // Filter by search query (match against title + message content)
    const q = historySearch.trim().toLowerCase();
    if (q) {
      sessions = sessions.filter((session) => {
        if (session.title?.toLowerCase().includes(q)) return true;
        return session.chatHistory.some((m) =>
          m.content.toLowerCase().includes(q),
        );
      });
    }

    // Most recent first
    sessions.sort((a, b) => {
      const aTime =
        a.chatHistory.length > 0
          ? a.chatHistory[a.chatHistory.length - 1].timestamp
          : 0;
      const bTime =
        b.chatHistory.length > 0
          ? b.chatHistory[b.chatHistory.length - 1].timestamp
          : 0;
      return bTime - aTime;
    });

    return sessions;
  }, [designChat.allSessions, selectedIds, historySearch, filterBySelection]);

  // Handle panel resizing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX; // Normal direction for east resize
        const newWidth = Math.max(240, Math.min(500, startWidth + deltaX));
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [sidebarWidth, setSidebarWidth],
  );

  // ─── Design chat auto-scroll ───────────────────────────────────────
  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container || designChat.chatHistory.length === 0) {
      setChatBottomPad(0);
      return;
    }
    const lastUserMsg = [...designChat.chatHistory]
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUserMsg) return;
    if (lastUserMsg.id === lastScrolledUserMsgId.current) return;
    lastScrolledUserMsgId.current = lastUserMsg.id;

    requestAnimationFrame(() => {
      const userMsgEls = container.querySelectorAll("[data-chat-role='user']");
      const lastUserMsgEl = userMsgEls[userMsgEls.length - 1] as
        | HTMLElement
        | undefined;
      if (!lastUserMsgEl) return;
      const containerH = container.clientHeight;
      const msgTop = lastUserMsgEl.offsetTop;
      const msgHeight = lastUserMsgEl.offsetHeight;
      const contentH = container.scrollHeight - chatBottomPad;
      const belowMsg = contentH - msgTop;
      const needed = Math.max(0, containerH - belowMsg + msgHeight);
      setChatBottomPad(needed);
      setTimeout(() => {
        requestAnimationFrame(() => {
          container.scrollTo({
            top: Math.max(0, lastUserMsgEl.offsetTop - 16),
            behavior: "smooth",
          });
        });
      }, 50);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designChat.chatHistory]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [designChat.message]);

  // Focus the textarea when a selection context is attached (AI button clicked)
  useEffect(() => {
    if (designChat.selectionContext && textareaRef.current) {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }, [designChat.selectionContext]);

  // Auto-open the AI assistant tab when a matching chat is found for the selection
  useEffect(() => {
    const handler = () => {
      setActiveTab("ai-assistant");
    };
    window.addEventListener("ai-assistant-show", handler);
    return () => window.removeEventListener("ai-assistant-show", handler);
  }, [setActiveTab]);

  // Explicitly open a specific chat session (e.g. from "Open in chat" on mini-prompt)
  useEffect(() => {
    const handler = (e: Event) => {
      const sessionId = (e as CustomEvent).detail?.sessionId;
      if (sessionId) {
        designChat.switchToSessionById(sessionId);
        setShowHistory(false);
        setHistorySearch("");
      }
    };
    window.addEventListener("ai-open-chat-session", handler);
    return () => window.removeEventListener("ai-open-chat-session", handler);
  }, [designChat]);

  // Listen for gen-ai modify control requests from the on-canvas prompt
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { message: string; frameId: string } | undefined;
      if (!detail?.message || !detail?.frameId) return;
      await genAI.sendPrompt(detail.message);
    };
    window.addEventListener("gen-ai-modify-send", handler);
    return () => window.removeEventListener("gen-ai-modify-send", handler);
  }, [genAI]);

  const isGenAiIntent = useCallback((text: string): boolean => {
    const lower = text.toLowerCase();
    return /\b(create|generate|make|build|draw)\b.*\b(grid|pattern|dots|circle|rectangle|square|ellipse|shape|line|triangle|polygon|sphere|cube|fractal|tree|voronoi|halftone|palette|swatches|gradient|spiral|scatter|wavy|noise|organic|mosaic|blob|attractor|metaball|turing|reaction.?diffusion|circle.?pack|dla|cellular.?automata|wave.?function|qr|chart|bar.?chart|pie|dither|posterize|flow.?field|wireframe|3d|superformula|rough|sketch|lsystem|l-system)\b/i.test(lower)
      || /\b(generate|create|make|build)\b.*\bwith\b.*\b(controls?|sliders?|parameters?)\b/i.test(lower)
      || /\b(generative|procedural|parametric|computational)\b/i.test(lower);
  }, []);

  const handleUnifiedSend = useCallback(async () => {
    const text = designChat.message.trim();
    if (!text) return;

    if (isGenAiIntent(text)) {
      designChat.setMessage("");
      await genAI.sendPrompt(text);
    } else {
      designChat.handleSend();
    }
  }, [designChat, genAI, isGenAiIntent]);

  const handleDesignChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleUnifiedSend();
    }
  };

  const canSendDesignChat =
    designChat.message.trim().length > 0 && !designChat.isLoading && !genAI.isLoading;

  const handleActionClick = (action: string) => {
    if (action === "design-review") {
      designChat.runDesignReview();
      return;
    }

    const actionPrompts: Record<string, string> = {
      "use-design-systems":
        "Extract my design system from the current page, then audit consistency and suggest how to consolidate colors, fonts, and spacing into a coherent system.",
      "bulk-edits": "Make bulk style changes across the selected elements",
      "new-designs":
        "Create a new card component with a title, description, and action button",
      "ask-feedback":
        "Do a comprehensive design review: check accessibility, audit consistency, and analyze the visual hierarchy. Present findings by severity.",
      "update-content":
        "Update the text content in my design with more realistic copy",
      "style-changes":
        "Inspect my design, then refine the visual style — improve colors, spacing, and border radius for better consistency",
    };

    const prompt = actionPrompts[action];
    if (prompt) {
      designChat.handleSend(prompt);
    }
  };

  // ─── Design AI Assistant ─────────────────────────────────

  return (
    <div
      className={`fixed top-0 h-full z-40 flex-shrink-0 select-none ${isNavigationCollapsed ? "left-0" : "left-[48px]"}`}
      style={{
        width: `${sidebarWidth}px`,
        backgroundColor: "var(--color-bg-elevated)",
        display: visible ? undefined : "none",
      }}
    >
      {/* Resize Handle */}
      <div
        className="absolute top-0 h-full cursor-ew-resize group z-10"
        style={{ right: -4, width: 9 }}
        onMouseDown={handleMouseDown}
      >
        <div
          className="absolute inset-y-0 left-1/2 -translate-x-1/2 transition-colors group-hover:bg-[color:var(--color-text-tertiary)]"
          style={{ width: 1, backgroundColor: "var(--color-border, #e5e5e5)" }}
        />
      </div>

      <div className="h-full flex flex-col">
        {/* Header */}
        <div
          className="flex items-center justify-between pl-3 pr-3 pt-3 pb-3 flex-shrink-0 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex flex-1 items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {showHistory ? (
                <span className="text-[13px] font-medium h-4 flex items-center pl-1">
                  Assistant chats
                </span>
              ) : (
                // Chat view header: left arrow to history + title
                <>
                  {designChat.allSessions.length > 0 && (
                    <button
                      onClick={() => setShowHistory(true)}
                      className="w-6 h-6 flex-shrink-0 rounded-[5px] flex items-center justify-center cursor-default"
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          "var(--color-bg-secondary)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = "transparent")
                      }
                      title="View all chats"
                    >
                      <Icon24ChevronLeftLarge />
                    </button>
                  )}
                  <span className="text-[13px] font-medium h-4 flex items-center truncate min-w-0">
                    {designChat.chatHistory.length > 0
                      ? designChat.allSessions.find(
                          (s) => s.id === designChat.activeSessionId,
                        )?.title || "Assistant"
                      : "New chat"}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  designChat.startNewChat();
                  setShowHistory(false);
                  setHistorySearch("");
                }}
                className="w-6 h-6 rounded-[5px] flex items-center justify-center cursor-default"
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--color-bg-secondary)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
                title="New chat"
              >
                <Icon24PlusSmall />
              </button>
              <button
                onClick={() => setActiveTab("page")}
                className="w-6 h-6 rounded-[5px] flex items-center justify-center cursor-default"
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--color-bg-secondary)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <Icon24Close />
              </button>
            </div>
          </div>
        </div>

        {/* History list view */}
        {showHistory ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search bar + filter toggle */}
            <div className="flex-shrink-0 px-3 pt-3 flex flex-col gap-2">
              <Input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search chats…"
              />
              {selectedIds.length > 0 && (
                <button
                  onClick={() => setFilterBySelection((v) => !v)}
                  className="self-start px-2 py-0.5 rounded-[5px] text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: filterBySelection
                      ? "rgba(59,130,246,0.12)"
                      : "var(--color-bg-secondary)",
                    color: filterBySelection
                      ? "#3b82f6"
                      : "var(--color-text-secondary)",
                    border: filterBySelection
                      ? "1px solid rgba(59,130,246,0.25)"
                      : "1px solid transparent",
                  }}
                >
                  For selection
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {filteredSessions.length === 0 ? (
                <div
                  className="px-6 py-8 text-center text-[12px]"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {filterBySelection
                    ? "No chats for this selection"
                    : historySearch
                      ? "No matching chats"
                      : "No chats yet"}
                </div>
              ) : (
                <div className="flex flex-col px-2 py-3">
                  {filteredSessions.map((session) => {
                    const isActive = session.id === designChat.activeSessionId;

                    // Derive a short title from the first user prompt
                    const firstUserMsg = session.chatHistory.find(
                      (m) => m.role === "user",
                    );
                    // Use AI-generated title if available, else fall back to heuristic
                    let title = session.title;
                    if (!title) {
                      let rawPrompt = firstUserMsg?.content || "Empty chat";
                      const contextEnd = rawPrompt.indexOf("```\n\n");
                      if (contextEnd !== -1) {
                        rawPrompt = rawPrompt.slice(contextEnd + 5);
                      }
                      title = deriveTitle(rawPrompt);
                    }

                    // Last modified: timestamp of the most recent message
                    const lastMsg =
                      session.chatHistory[session.chatHistory.length - 1];
                    const timeAgo = lastMsg
                      ? formatRelativeTime(lastMsg.timestamp)
                      : "";

                    // Last edit summary from the last assistant message
                    const lastAssistantMsg = [...session.chatHistory]
                      .reverse()
                      .find((m) => m.role === "assistant");
                    const lastEdit =
                      lastAssistantMsg?.operationsSummary ||
                      lastAssistantMsg?.toolCalls
                        ?.filter(
                          (tc) => tc.status === "completed" && tc.summary,
                        )
                        .pop()?.summary ||
                      "";

                    const status = aiSessionStatuses[session.id];
                    const isRunning = status === "loading";
                    const isDone = status === "done";
                    const isSeen = seenSessions.has(session.id);

                    return (
                      <button
                        key={session.id}
                        onClick={() => {
                          designChat.switchToSessionById(session.id);
                          setSeenSessions(
                            (prev) => new Set([...prev, session.id]),
                          );
                          setShowHistory(false);
                          setHistorySearch("");
                        }}
                        className="w-full text-left px-2 py-3 transition-colors rounded-[5px] hover:bg-hover"
                      >
                        <div className="flex items-center gap-1">
                          {/* Status indicator */}
                          <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                            {isRunning ? (
                              <Icon24LoadingSmall className="animate-spin" />
                            ) : isDone && !isSeen ? (
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: "50%",
                                  backgroundColor:
                                    "var(--color-icon-brand, #0D99FF)",
                                }}
                              />
                            ) : (
                              <Icon24Check />
                            )}
                          </span>
                          <div className="flex-1 min-w-0 text-[12px] leading-[16px] line-clamp-1 font-medium">
                            {title}
                          </div>
                          {timeAgo && (
                            <span
                              className="flex-shrink-0 text-[11px]"
                              style={{ color: "var(--color-text-tertiary)" }}
                            >
                              {timeAgo}
                            </span>
                          )}
                        </div>
                        {lastEdit && (
                          <div
                            className="text-[11px] leading-[14px] line-clamp-1 mt-0.5 pl-5"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            {lastEdit}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Chat messages */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 relative"
            >
              {designChat.chatHistory.length === 0 ? (
                <AiAssistantEmptyState onActionClick={handleActionClick} />
              ) : (
                <div className="flex flex-col gap-4">
                  {(() => {
                    const history = designChat.chatHistory;

                    return history.map((msg, idx) => {
                      const isLastMsg = idx === history.length - 1;
                      const isStreaming =
                        designChat.isLoading &&
                        msg.role === "assistant" &&
                        isLastMsg;

                      return (
                        <DesignChatBubble
                          key={msg.id}
                          msg={msg}
                          onChoiceResponse={designChat.handleChoiceResponse}
                          onSuggestionClick={(s) => designChat.handleSend(s)}
                          isStreaming={isStreaming}
                        />
                      );
                    });
                  })()}
                  {/* No separate loading indicator — it's all inline in the bubble now */}
                  <div style={{ height: chatBottomPad }} />
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="flex-shrink-0 px-4 pb-4 pt-2">
              <div
                className="border rounded-xl overflow-hidden"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                }}
              >
                {/* Live selection pill — always reflects current canvas selection */}
                {designChat.liveSelectionLabel && (
                  <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-0">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[11px] font-medium"
                      style={{
                        backgroundColor: "transparent",
                        color: "#3b82f6",
                        border: "1px solid rgba(59,130,246,0.25)",
                      }}
                    >
                      {designChat.liveSelectionLabel}
                    </span>
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={designChat.message}
                  onChange={(e) => designChat.setMessage(e.target.value)}
                  onKeyDown={handleDesignChatKeyDown}
                  placeholder={
                    designChat.liveSelectionLabel
                      ? `Describe changes for ${designChat.liveSelectionLabel}...`
                      : "Describe what to change..."
                  }
                  rows={3}
                  className="w-full px-3 py-3 resize-none border-0 outline-none bg-transparent"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 400,
                    fontSize: "13px",
                    lineHeight: "20px",
                    color: "var(--color-text)",
                    minHeight: "68px",
                    maxHeight: "200px",
                  }}
                />
                <div className="flex items-center justify-between px-3 pb-2">
                  {/* Model selector */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => designChat.setAiProvider("openai")}
                      className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                      style={{
                        backgroundColor:
                          designChat.aiProvider === "openai"
                            ? "var(--color-bg-secondary)"
                            : "transparent",
                        color:
                          designChat.aiProvider === "openai"
                            ? "var(--color-text)"
                            : "var(--color-text-secondary)",
                        border: "none",
                      }}
                    >
                      GPT-5.2
                    </button>
                    <button
                      onClick={() => designChat.setAiProvider("claude")}
                      className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                      style={{
                        backgroundColor:
                          designChat.aiProvider === "claude"
                            ? "var(--color-bg-secondary)"
                            : "transparent",
                        color:
                          designChat.aiProvider === "claude"
                            ? "var(--color-text)"
                            : "var(--color-text-secondary)",
                        border: "none",
                      }}
                    >
                      Claude
                    </button>
                  </div>
                  {designChat.isLoading || genAI.isLoading ? (
                    <button
                      onClick={genAI.isLoading ? genAI.stop : designChat.handleStop}
                      className="w-7 h-7 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: "var(--color-bg-inverse, #000000)",
                        color: "white",
                        cursor: "pointer",
                        border: "none",
                      }}
                      title="Stop generation"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="currentColor"
                      >
                        <rect width="10" height="10" rx="1.5" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={handleUnifiedSend}
                      disabled={!canSendDesignChat}
                      className="w-7 h-7 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: canSendDesignChat
                          ? "var(--color-bg-inverse, #000000)"
                          : "var(--color-bg-disabled, #e0e0e0)",
                        color: "white",
                        cursor: canSendDesignChat ? "pointer" : "default",
                        border: "none",
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path
                          d="M7 12V2M7 2L3 6M7 2L11 6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


