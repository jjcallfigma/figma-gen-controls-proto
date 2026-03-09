import { renderMarkdown } from "@/core/utils/renderMarkdown";
import { StreamingDot, chatStyles } from "../primitives";

export function ThinkingBlock({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  return (
    <div
      className="mb-2 text-[12px] leading-relaxed markdown-content"
      style={{ color: chatStyles.text.primary }}
    >
      {renderMarkdown(text)}
      {isStreaming && <StreamingDot />}
    </div>
  );
}
