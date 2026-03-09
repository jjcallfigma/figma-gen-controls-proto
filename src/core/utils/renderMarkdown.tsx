import React from "react";

/**
 * Renders a subset of Markdown as React elements for the chat UI.
 * Supports: **bold**, `inline code`, ```fenced code blocks```, numbered lists,
 * bullet lists, headings (##/###), paragraphs, and --- horizontal rules.
 */
export function renderMarkdown(text: string): React.ReactNode {
  // First, split out fenced code blocks from the rest
  const segments = splitCodeBlocks(text);

  return segments.map((segment, si) => {
    if (segment.type === "code") {
      return (
        <pre
          key={si}
          className="my-2 rounded-lg overflow-x-auto leading-relaxed"
          style={{
            fontSize: "0.9em",
            padding: "10px 12px",
            backgroundColor: "var(--color-bg-secondary)",
            fontFamily: "'Roboto Mono', monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            border: "1px solid var(--color-border)",
          }}
        >
          <code>{segment.content}</code>
        </pre>
      );
    }

    // Regular text block — parse as markdown
    return (
      <React.Fragment key={si}>{renderBlocks(segment.content)}</React.Fragment>
    );
  });
}

/** Split text into alternating text / fenced-code segments. */
function splitCodeBlocks(
  text: string,
): Array<{ type: "text" | "code"; content: string; lang?: string }> {
  const result: Array<{
    type: "text" | "code";
    content: string;
    lang?: string;
  }> = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before the code block
    if (match.index > lastIndex) {
      result.push({
        type: "text",
        content: text.slice(lastIndex, match.index),
      });
    }
    result.push({
      type: "code",
      content: match[2].trimEnd(),
      lang: match[1] || undefined,
    });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last code block
  if (lastIndex < text.length) {
    result.push({ type: "text", content: text.slice(lastIndex) });
  }

  return result;
}

/** Classify a single line for block splitting. */
function lineType(
  line: string,
): "bullet" | "numbered" | "heading" | "hr" | "text" {
  const t = line.trim();
  if (!t) return "text";
  if (/^#{2,3}\s+/.test(t)) return "heading";
  if (/^---+$/.test(t)) return "hr";
  if (/^\d+\.\s/.test(t)) return "numbered";
  if (/^[-*]\s/.test(t)) return "bullet";
  return "text";
}

/**
 * Split raw text into sub-blocks at double-newline boundaries AND at
 * transitions between different line types (e.g. paragraph → bullet list).
 */
function splitSubBlocks(text: string): string[] {
  const rawBlocks = text.split(/\n{2,}/);
  const result: string[] = [];

  for (const block of rawBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split("\n");
    let current: string[] = [];
    let currentType = lineType(lines[0]);

    for (const line of lines) {
      const lt = lineType(line);
      const isList = lt === "bullet" || lt === "numbered";
      const waslist = currentType === "bullet" || currentType === "numbered";

      if (
        current.length > 0 &&
        (isList !== waslist || lt === "heading" || lt === "hr")
      ) {
        result.push(current.join("\n"));
        current = [];
        currentType = lt;
      }
      current.push(line);
      if (!isList && lt !== "text") currentType = lt;
      else if (current.length === 1) currentType = lt;
    }
    if (current.length > 0) result.push(current.join("\n"));
  }

  return result;
}

/** Render block-level markdown (headings, lists, paragraphs, hr). */
function renderBlocks(text: string): React.ReactNode {
  const blocks = splitSubBlocks(text);

  return blocks.map((block, bi) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    // ── Heading ──
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      return (
        <div
          key={bi}
          className="font-semibold mt-3 mb-1"
          style={{ color: "var(--color-text)" }}
        >
          {renderInline(h2Match[1])}
        </div>
      );
    }
    const h3Match = trimmed.match(/^###\s+(.+)$/);
    if (h3Match) {
      return (
        <div
          key={bi}
          className="font-semibold mt-2 mb-0.5"
          style={{ color: "var(--color-text)" }}
        >
          {renderInline(h3Match[1])}
        </div>
      );
    }

    // ── Horizontal rule ──
    if (/^---+$/.test(trimmed)) {
      return (
        <hr
          key={bi}
          className="my-2"
          style={{ borderColor: "var(--color-border)", borderTopWidth: 1 }}
        />
      );
    }

    // ── List block (numbered or bulleted) ──
    const lines = trimmed.split("\n");
    const isNumberedList = lines.every(
      (l) => /^\d+\.\s/.test(l.trim()) || l.trim() === "",
    );
    const isBulletList = lines.every(
      (l) => /^[-*]\s/.test(l.trim()) || l.trim() === "",
    );

    if (isNumberedList && lines.some((l) => /^\d+\.\s/.test(l.trim()))) {
      return (
        <ol
          key={bi}
          className="flex flex-col gap-1.5 mt-2 mb-1"
          style={{ listStyle: "none", padding: 0, margin: 0 }}
        >
          {lines
            .filter((l) => l.trim())
            .map((line, li) => {
              const content = line.trim().replace(/^\d+\.\s+/, "");
              return (
                <li key={li} className="flex items-start gap-2">
                  <span
                    className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-medium mt-[1px]"
                    style={{
                      backgroundColor: "var(--color-bg-secondary)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {li + 1}
                  </span>
                  <span className="flex-1">{renderInline(content)}</span>
                </li>
              );
            })}
        </ol>
      );
    }

    if (isBulletList && lines.some((l) => /^[-*]\s/.test(l.trim()))) {
      return (
        <ul key={bi} className="flex flex-col gap-1 mt-2 mb-1">
          {lines
            .filter((l) => l.trim())
            .map((line, li) => {
              const content = line.trim().replace(/^[-*]\s+/, "");
              return (
                <li key={li} className="flex items-start gap-2">
                  <span className="flex-1">{renderInline(content)}</span>
                </li>
              );
            })}
        </ul>
      );
    }

    // ── Regular paragraph ──
    return (
      <p key={bi} className={bi > 0 ? "mt-2" : ""} style={{ margin: 0 }}>
        {renderInline(trimmed.replace(/\n/g, " "))}
      </p>
    );
  });
}

/** Renders inline Markdown: **bold**, `code`, and plain text. */
export function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="px-1 py-px rounded"
          style={{
            fontSize: "0.9em",
            backgroundColor: "var(--color-bg-secondary)",
            fontFamily: "'Roboto Mono', monospace",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
