import { chatStyles, UserAvatar } from "./primitives";

/** Extract the user's prompt from a message that includes design tree context. */
function extractUserPrompt(content: string): {
  userPrompt: string;
  selectionLabel: string | null;
} {
  if (!content.includes("Design tree:\n```html\n")) {
    return { userPrompt: content, selectionLabel: null };
  }

  const parts = content.split("```\n\n");
  const userPrompt = parts.length > 1 ? parts[parts.length - 1] : content;

  const contextMatch = content.match(/^\[Context:\s*(.+?)\]/);
  const selectionLabel = contextMatch?.[1] || "Selection";

  return { userPrompt, selectionLabel };
}

export function UserBubble({
  content,
  variant = "full",
}: {
  content: string;
  variant?: "full" | "compact";
}) {
  const { userPrompt, selectionLabel } = extractUserPrompt(content);

  if (selectionLabel) {
    return (
      <div className="flex justify-end">
        <div className="flex items-start justify-end gap-2 max-w-[85%] w-full">
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex bg-selected items-center gap-1 px-2 py-0.5 rounded-[5px] text-[11px]">
              {selectionLabel}
            </span>
            <div
              className="text-[12px] leading-relaxed scrollbar-hide"
              style={{
                padding: "8px 16px",
                borderRadius: chatStyles.radius.bubble,
                backgroundColor: chatStyles.bg.secondary,
                color: chatStyles.text.primary,
                maxHeight: variant === "compact" ? 100 : 200,
                overflowY: "auto",
              }}
            >
              {userPrompt}
            </div>
          </div>
          <UserAvatar className="h-6 w-6 mb-[6px] self-end" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="flex items-start justify-end gap-2 max-w-[85%] w-full">
        <div
          className="text-[12px] leading-relaxed scrollbar-hide"
          style={{
            padding: "8px 16px",
            borderRadius: chatStyles.radius.bubble,
            backgroundColor: chatStyles.bg.secondary,
            color: chatStyles.text.primary,
            maxHeight: variant === "compact" ? 100 : 200,
            overflowY: "auto",
          }}
        >
          {userPrompt}
        </div>
        <UserAvatar className="h-6 w-6 mb-[6px] self-end" />
      </div>
    </div>
  );
}
