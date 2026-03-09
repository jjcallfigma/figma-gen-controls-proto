import { renderMarkdown } from "@/core/utils/renderMarkdown";
import { StreamingDot, chatStyles } from "../primitives";

export function TextBlock({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  if (!content) return null;

  return (
    <div className="markdown-content">
      {renderMarkdown(content)}
      {isStreaming && <StreamingDot />}
    </div>
  );
}

/** Split text content into main text and arrow-prefixed suggestions. */
export function splitSuggestions(content: string): {
  textContent: string;
  suggestions: string[];
} {
  const lines = content.split("\n");
  const textLines = lines.filter((l) => !l.trim().startsWith("→"));
  const suggestions = lines
    .filter((l) => l.trim().startsWith("→"))
    .map((l) => l.trim().slice(1).trim());
  return { textContent: textLines.join("\n").trim(), suggestions };
}
