import { chatStyles } from "../primitives";

export function SuggestionsBlock({
  suggestions,
  onSuggestionClick,
}: {
  suggestions: string[];
  onSuggestionClick?: (suggestion: string) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSuggestionClick?.(s)}
          className="inline-flex items-center px-3 py-1.5 rounded-full text-[13px] transition-all"
          style={{
            border: `1px solid ${chatStyles.border}`,
            backgroundColor: "transparent",
            color: chatStyles.text.secondary,
            cursor: onSuggestionClick ? "pointer" : "default",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = chatStyles.bg.secondary;
            e.currentTarget.style.color = chatStyles.text.primary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = chatStyles.text.secondary;
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
