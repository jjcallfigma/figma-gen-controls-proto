import type { DesignChatMessage } from "@/core/hooks/useDesignChat";
import { AssistantMessage } from "./AssistantMessage";
import { UserBubble } from "./UserBubble";
import { ExtractActivityBlock } from "./blocks/ExtractActivityBlock";
import { MakeActivityBlock } from "./blocks/MakeActivityBlock";
import { StatusBlock } from "./blocks/StatusBlock";

export interface ChatMessageProps {
  msg: DesignChatMessage;
  variant?: "full" | "compact";
  isStreaming?: boolean;
  onChoiceResponse?: (messageId: string, selectedIds: string[]) => void;
  onSuggestionClick?: (suggestion: string) => void;
}

export function ChatMessage({
  msg,
  variant = "full",
  isStreaming,
  onChoiceResponse,
  onSuggestionClick,
}: ChatMessageProps) {
  // Auto follow-up messages are hidden
  if (msg.messageType === "auto_followup") {
    return null;
  }

  // Status messages
  if (msg.operationsSummary || msg.messageType === "status") {
    return (
      <div data-chat-role={msg.role}>
        <StatusBlock content={msg.content} />
      </div>
    );
  }

  // Make activity block
  if (msg.messageType === "make_activity") {
    return (
      <div data-chat-role={msg.role}>
        <MakeActivityBlock
          content={msg.content}
          isDone={msg.makeActivityDone === true}
        />
      </div>
    );
  }

  // Extract activity block (full variant only; compact skips it)
  if (msg.messageType === "extract_activity" && msg.extractResults) {
    if (variant === "compact") return null;
    return (
      <div data-chat-role={msg.role}>
        <ExtractActivityBlock
          content={msg.content}
          extractResults={msg.extractResults}
        />
      </div>
    );
  }

  // User messages
  if (msg.role === "user") {
    return (
      <div data-chat-role={msg.role}>
        <UserBubble content={msg.content} variant={variant} />
      </div>
    );
  }

  // Assistant messages
  return (
    <div data-chat-role={msg.role}>
      <AssistantMessage
        msg={msg}
        variant={variant}
        isStreaming={isStreaming}
        onChoiceResponse={onChoiceResponse}
        onSuggestionClick={onSuggestionClick}
      />
    </div>
  );
}
