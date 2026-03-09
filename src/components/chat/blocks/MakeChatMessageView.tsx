"use client";

import type { MakeChatMessage } from "@/types/canvas";
import { renderMarkdown } from "@/core/utils/renderMarkdown";
import SyntaxHighlight from "@/components/SyntaxHighlight";
import { Icon24LayoutSetSmall } from "@/components/icons/icon-24-layout-set-small";
import { Icon24MoveSmall } from "@/components/icons/icon-24-move-small";
import { Icon24Reload } from "@/components/icons/icon-24-reload";
import { Icon24TrashSmall } from "@/components/icons/icon-24-trash-small";
import { Spinner, StreamingDot, UserAvatar, chatStyles } from "../primitives";
import { useState } from "react";

// ─── Helpers ─────────────────────────────────────────────────────────

function resolveMessageType(
  msg: MakeChatMessage,
): NonNullable<MakeChatMessage["messageType"]> | "user" {
  if (msg.messageType) return msg.messageType;

  // Backward compat: infer from content prefixes
  if (msg.content.startsWith("__ERROR_DETECTED__")) return "error";
  if (msg.content.startsWith("__AUTO_FIX__")) return "auto_fix";
  if (msg.content.startsWith("__CODE_STREAMING__")) return "code_streaming";
  if (
    msg.role === "assistant" &&
    (msg.content.startsWith("Worked for ") ||
      msg.content.startsWith("Auto-fixed") ||
      msg.content.startsWith("Auto-fix failed"))
  )
    return "elapsed";

  if (msg.role === "user") return "user";

  // Detect legacy messages where raw code ended up in content
  if (msg.role === "assistant" && looksLikeCode(msg.content)) return "elapsed";

  return "text";
}

function looksLikeCode(content: string): boolean {
  if (!content || content.length < 40) return false;
  const trimmed = content.trimStart();
  return (
    trimmed.startsWith("import ") ||
    trimmed.startsWith("export ") ||
    (trimmed.startsWith("const ") && trimmed.includes("=>")) ||
    (trimmed.startsWith("function ") && trimmed.includes("{"))
  );
}

function stripPrefix(content: string, prefix: string): string {
  return content.startsWith(prefix) ? content.slice(prefix.length) : content;
}

// ─── Sub-components ──────────────────────────────────────────────────

function ThinkingSection({
  text,
  isStreaming,
  collapsed,
}: {
  text: string;
  isStreaming: boolean;
  collapsed: boolean;
}) {
  const [isOpen, setIsOpen] = useState(!collapsed);

  if (!text) return null;

  if (isStreaming && !collapsed) {
    return (
      <div
        className="mb-2 text-[12px] leading-relaxed markdown-content"
        style={{ color: chatStyles.text.secondary }}
      >
        {renderMarkdown(text)}
        <StreamingDot />
      </div>
    );
  }

  return (
    <div className="mb-2">
      <button
        type="button"
        className="flex items-center gap-1 text-[11px] cursor-pointer select-none"
        style={{ color: chatStyles.text.tertiary }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className="flex-shrink-0 transition-transform"
          style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          <path
            d="M3.5 2L6.5 5L3.5 8"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Thinking
      </button>
      {isOpen && (
        <div
          className="mt-1 text-[11px] leading-relaxed markdown-content pl-3 border-l"
          style={{
            color: chatStyles.text.secondary,
            borderColor: chatStyles.border,
          }}
        >
          {renderMarkdown(text)}
        </div>
      )}
    </div>
  );
}

function CodeStreamingBlock({
  code,
  isStreaming,
}: {
  code: string;
  isStreaming: boolean;
}) {
  return (
    <div
      className="w-full text-[11px] leading-relaxed font-mono rounded-[8px] overflow-hidden border relative"
      style={{
        padding: "10px 12px",
        maxHeight: isStreaming ? "300px" : "400px",
        overflow: isStreaming ? "hidden" : "auto",
        whiteSpace: "pre",
        borderColor: chatStyles.border,
        backgroundColor: chatStyles.bg.card,
      }}
    >
      {code ? (
        <SyntaxHighlight code={code} />
      ) : (
        <span style={{ color: chatStyles.text.tertiary }}>Writing code…</span>
      )}
      {isStreaming && (
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            height: 40,
            background: "linear-gradient(transparent, var(--color-bg, #fff))",
          }}
        />
      )}
    </div>
  );
}

function ErrorBlock({ content }: { content: string }) {
  return (
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
      <span>{content}</span>
    </div>
  );
}

function AutoFixBlock({ content }: { content: string }) {
  return (
    <div
      className="flex items-center gap-2 text-[11px] leading-relaxed"
      style={{
        color: chatStyles.text.secondary,
        fontStyle: "italic",
      }}
    >
      <Spinner />
      <span>{content}</span>
    </div>
  );
}

function ElapsedBlock({ content }: { content: string }) {
  const displayContent = looksLikeCode(content) ? "Code applied" : content;
  const isError =
    displayContent.startsWith("Auto-fix failed") || displayContent.includes("❌");

  if (displayContent.startsWith("Auto-fixed")) {
    return (
      <div className="text-[11px] leading-relaxed" style={{ color: chatStyles.text.secondary }}>
        {displayContent.split("\n").map((line, i) => (
          <div key={i} style={{ marginTop: i > 0 ? 4 : 0 }}>
            {line}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="text-[11px] leading-relaxed"
      style={{ color: chatStyles.text.secondary }}
    >
      {isError ? `❌ ${displayContent}` : displayContent}
    </div>
  );
}

function UserActionPill({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-start justify-end gap-2 max-w-[85%] w-full">
      <div
        className="text-[12px] leading-relaxed flex items-center gap-1.5"
        style={{
          padding: "6px 12px",
          borderRadius: chatStyles.radius.bubble,
          backgroundColor: chatStyles.bg.secondary,
          color: chatStyles.text.primary,
        }}
      >
        {icon}
        {label}
      </div>
      <UserAvatar className="h-6 w-6 mt-1" />
    </div>
  );
}

function UserMessageBubble({ content }: { content: string }) {
  return (
    <div className="flex items-start justify-end gap-2 max-w-[85%] w-full">
      <div
        className="text-[12px] leading-relaxed"
        style={{
          padding: "8px 16px",
          borderRadius: chatStyles.radius.bubble,
          backgroundColor: chatStyles.bg.secondary,
          color: chatStyles.text.primary,
        }}
      >
        {content}
      </div>
      <UserAvatar className="h-6 w-6 mb-[6px] self-end" />
    </div>
  );
}

function AssistantTextBlock({
  content,
  isStreaming,
  onSuggestionClick,
}: {
  content: string;
  isStreaming?: boolean;
  onSuggestionClick?: (suggestion: string) => void;
}) {
  const lines = content.split("\n");
  const textLines = lines.filter((l) => !l.trim().startsWith("→"));
  const suggestions = lines
    .filter((l) => l.trim().startsWith("→"))
    .map((l) => l.trim().slice(1).trim());

  const textContent = textLines.join("\n").trim();

  return (
    <div
      className="max-w-[85%] text-[12px] leading-relaxed"
      style={{ color: chatStyles.text.primary }}
    >
      {textContent && (
        <div className="markdown-content">
          {renderMarkdown(textContent)}
          {isStreaming && <StreamingDot />}
        </div>
      )}
      {suggestions.length > 0 && (
        <ul
          className="mt-2 flex flex-col gap-1"
          style={{ listStyle: "none", padding: 0, margin: 0 }}
        >
          <li
            className="text-[11px] mb-0.5 mt-2"
            style={{ color: chatStyles.text.secondary }}
          >
            Suggestions:
          </li>
          {suggestions.map((s, i) => (
            <li
              key={i}
              className="flex text-[11px] items-start gap-1.5 cursor-pointer hover:opacity-80"
              style={{ color: chatStyles.text.secondary }}
              onClick={() => onSuggestionClick?.(s)}
            >
              <span className="flex-shrink-0 mt-px">•</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export interface MakeChatMessageViewProps {
  msg: MakeChatMessage;
  isStreaming?: boolean;
  onSuggestionClick?: (suggestion: string) => void;
}

export function MakeChatMessageView({
  msg,
  isStreaming = false,
  onSuggestionClick,
}: MakeChatMessageViewProps) {
  const type = resolveMessageType(msg);

  // Thinking text: from structured field or legacy content (during reasoning phase)
  const thinkingText = msg.thinking || "";
  const isThinkingPhase =
    isStreaming && !msg.isCodeStreaming && type !== "code_streaming" && !!thinkingText;

  // ── User messages ──────────────────────────────────────────────────

  if (type === "user") {
    if (msg.content.includes("Design tree:\n```html\n")) {
      return (
        <div data-chat-role="user" className="flex justify-end">
          <UserActionPill
            icon={<Icon24LayoutSetSmall className="flex-shrink-0 opacity-50" />}
            label="Convert from design"
          />
        </div>
      );
    }
    if (msg.content.includes("Updated design tree:\n```html\n")) {
      return (
        <div data-chat-role="user" className="flex justify-end">
          <UserActionPill
            icon={<Icon24Reload className="flex-shrink-0 opacity-50" />}
            label="Update from design"
          />
        </div>
      );
    }
    if (msg.content.startsWith("[Delete element]")) {
      return (
        <div data-chat-role="user" className="flex justify-end">
          <UserActionPill
            icon={<Icon24TrashSmall className="flex-shrink-0 opacity-50" />}
            label="Delete element"
          />
        </div>
      );
    }
    if (msg.content.startsWith("[Move element]")) {
      return (
        <div data-chat-role="user" className="flex justify-end">
          <UserActionPill
            icon={<Icon24MoveSmall className="flex-shrink-0 opacity-50" />}
            label="Move element"
          />
        </div>
      );
    }
    if (msg.content.startsWith("[Selected element:")) {
      const userText = msg.content.split("\n```\n\n").pop() || msg.content;
      return (
        <div data-chat-role="user" className="flex justify-end">
          <UserMessageBubble content={userText} />
        </div>
      );
    }
    return (
      <div data-chat-role="user" className="flex justify-end">
        <UserMessageBubble content={msg.content} />
      </div>
    );
  }

  // ── Assistant messages ─────────────────────────────────────────────

  if (type === "error") {
    return (
      <div data-chat-role="assistant" className="flex justify-start">
        <ErrorBlock content={stripPrefix(msg.content, "__ERROR_DETECTED__")} />
      </div>
    );
  }

  if (type === "auto_fix") {
    return (
      <div data-chat-role="assistant" className="flex justify-start">
        <AutoFixBlock content={stripPrefix(msg.content, "__AUTO_FIX__")} />
      </div>
    );
  }

  if (type === "elapsed") {
    return (
      <div data-chat-role="assistant" className="flex justify-start">
        <ElapsedBlock content={msg.content} />
      </div>
    );
  }

  if (type === "code_streaming") {
    const code =
      msg.isCodeStreaming !== undefined
        ? msg.content
        : stripPrefix(msg.content, "__CODE_STREAMING__");

    return (
      <div data-chat-role="assistant" className="flex flex-col gap-2 justify-start">
        {thinkingText && (
          <ThinkingSection text={thinkingText} isStreaming={false} collapsed />
        )}
        <CodeStreamingBlock code={code} isStreaming={isStreaming} />
      </div>
    );
  }

  // Default assistant text (summary, reasoning during streaming, etc.)
  if (isThinkingPhase) {
    return (
      <div data-chat-role="assistant" className="flex justify-start">
        <ThinkingSection text={thinkingText} isStreaming collapsed={false} />
      </div>
    );
  }

  // Empty streaming placeholder
  if (isStreaming && !msg.content?.trim() && !thinkingText) {
    return (
      <div data-chat-role="assistant" className="flex justify-start">
        <div
          className="text-[12px]"
          style={{ color: chatStyles.text.tertiary }}
        >
          Thinking…
        </div>
      </div>
    );
  }

  return (
    <div data-chat-role="assistant" className="flex flex-col gap-2 justify-start">
      {thinkingText && (
        <ThinkingSection text={thinkingText} isStreaming={false} collapsed />
      )}
      <AssistantTextBlock
        content={msg.content}
        isStreaming={isStreaming}
        onSuggestionClick={onSuggestionClick}
      />
    </div>
  );
}
