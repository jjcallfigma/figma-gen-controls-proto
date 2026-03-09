"use client";

import type { DesignChatMessage } from "@/core/hooks/useDesignChat";
import { useEffect, useRef } from "react";
import { ChoicesBlock } from "./blocks/ChoicesBlock";
import { ContentBlocksBlock } from "./blocks/ContentBlocksBlock";
import { StreamingPlaceholder } from "./blocks/StreamingPlaceholder";
import { SuggestionsBlock } from "./blocks/SuggestionsBlock";
import { TextBlock, splitSuggestions } from "./blocks/TextBlock";
import { ThinkingBlock } from "./blocks/ThinkingBlock";
import { ToolCallBlock, ToolCallSummaries } from "./blocks/ToolCallBlock";
import { chatStyles } from "./primitives";

export function AssistantMessage({
  msg,
  variant = "full",
  isStreaming,
  onChoiceResponse,
  onSuggestionClick,
}: {
  msg: DesignChatMessage;
  variant?: "full" | "compact";
  isStreaming?: boolean;
  onChoiceResponse?: (messageId: string, selectedIds: string[]) => void;
  onSuggestionClick?: (suggestion: string) => void;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bubbleRef.current) {
      bubbleRef.current.scrollTop = bubbleRef.current.scrollHeight;
    }
  }, [msg.content]);

  const { textContent, suggestions } = msg.content
    ? splitSuggestions(msg.content)
    : { textContent: "", suggestions: [] };

  return (
    <div className="flex justify-start">
      <div
        ref={bubbleRef}
        className="max-w-[85%] text-[12px] leading-relaxed"
        style={{ color: chatStyles.text.primary }}
      >
        {msg.thinking && (
          <ThinkingBlock text={msg.thinking} isStreaming={!!isStreaming} />
        )}

        {msg.toolCalls && msg.toolCalls.length > 0 && (
          variant === "compact"
            ? <ToolCallSummaries toolCalls={msg.toolCalls} />
            : <ToolCallBlock toolCalls={msg.toolCalls} />
        )}

        {textContent && (
          <TextBlock content={textContent} isStreaming={isStreaming} />
        )}

        {suggestions.length > 0 && (
          <SuggestionsBlock
            suggestions={suggestions}
            onSuggestionClick={onSuggestionClick}
          />
        )}

        {msg.contentBlocks && <ContentBlocksBlock data={msg.contentBlocks} />}

        {msg.choices && onChoiceResponse && (
          <ChoicesBlock
            choices={msg.choices}
            messageId={msg.id}
            onChoiceResponse={onChoiceResponse}
          />
        )}

        {isStreaming &&
          !msg.content?.trim() &&
          !msg.thinking &&
          !msg.toolCalls?.some((tc) => tc.status === "running") && (
            <StreamingPlaceholder />
          )}
      </div>
    </div>
  );
}
