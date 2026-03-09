"use client";

import type { ContentBlocksData } from "@/core/hooks/useDesignChat";
import { renderMarkdown } from "@/core/utils/renderMarkdown";
import { useState } from "react";
import { chatStyles } from "../primitives";

export function ContentBlocksBlock({ data }: { data: ContentBlocksData }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      {data.title && (
        <div
          className="text-[13px] font-semibold mb-0.5"
          style={{ color: chatStyles.text.primary }}
        >
          {data.title}
        </div>
      )}

      {data.blocks.map((block, idx) => {
        const isExpanded = expandedIds.has(block.id);
        return (
          <div
            key={block.id}
            style={{
              border: `1px solid ${chatStyles.border}`,
              borderRadius: chatStyles.radius.card,
              overflow: "hidden",
              backgroundColor: chatStyles.bg.card,
            }}
          >
            <button
              onClick={() => block.body && toggle(block.id)}
              className="w-full text-left flex flex-col gap-1 px-3 py-2.5"
              style={{
                cursor: block.body ? "pointer" : "default",
                backgroundColor: isExpanded
                  ? chatStyles.bg.secondary
                  : "transparent",
                transition: "background-color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (block.body && !isExpanded)
                  e.currentTarget.style.backgroundColor =
                    chatStyles.bg.secondary;
              }}
              onMouseLeave={(e) => {
                if (!isExpanded)
                  e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-[11px] font-medium flex-shrink-0"
                    style={{
                      color: chatStyles.text.tertiary,
                      minWidth: 18,
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span
                    className="text-[13px] font-semibold truncate"
                    style={{ color: chatStyles.text.primary }}
                  >
                    {block.title}
                  </span>
                </div>
                {block.body && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="flex-shrink-0 mt-0.5 transition-transform"
                    style={{
                      color: chatStyles.text.tertiary,
                      transform: isExpanded
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                    }}
                  >
                    <path
                      d="M4 6l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>

              <div
                className="text-[12px] leading-relaxed pl-[26px]"
                style={{ color: chatStyles.text.secondary }}
              >
                {block.summary}
              </div>

              {block.tags && block.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-[26px] mt-0.5">
                  {block.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: chatStyles.bg.secondary,
                        color: chatStyles.text.tertiary,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>

            {isExpanded && block.body && (
              <div
                className="px-3 pb-3 pt-1 pl-[38px]"
                style={{
                  borderTop: `1px solid ${chatStyles.border}`,
                }}
              >
                <div
                  className="text-[12px] leading-relaxed"
                  style={{ color: chatStyles.text.secondary }}
                >
                  {renderMarkdown(block.body)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
