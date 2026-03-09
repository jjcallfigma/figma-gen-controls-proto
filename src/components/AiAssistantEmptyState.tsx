"use client";

import React from "react";
import { Icon16ChevronRight } from "./icons/icon-16-chevron-right";
import { Icon24AccessibilitySmall } from "./icons/icon-24-accessibility-small";
import { Icon24AiAssistant } from "./icons/icon-24-ai-assistant";
import { Icon24Comment } from "./icons/icon-24-comment";
import { Icon24LayoutSet } from "./icons/icon-24-layout-set";
import { Icon24Library } from "./icons/icon-24-library";
import { Icon24SelectMatchingSmall } from "./icons/icon-24-select-matching-small";
import { Icon24Text } from "./icons/icon-24-text";
import { Icon24VariableColor } from "./icons/icon-24-variable-color";

interface ActionCardProps {
  icon: React.ComponentType;
  title: string;
  description?: string;
  pills?: string[];
  onClick: () => void;
  isLast?: boolean;
}

function ActionCard({
  icon: Icon,
  title,
  description,
  pills,
  onClick,
  isLast = false,
}: ActionCardProps) {
  const isExpandable = description || pills;

  return (
    <div
      onClick={onClick}
      className={`box-border flex flex-col gap-[4px] items-start p-[12px] w-full overflow-hidden cursor-pointer transition-colors ${!isLast ? "border-b" : ""}`}
      style={{ borderColor: "var(--color-border)" }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = "transparent")
      }
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex gap-[8px] items-center">
          <Icon />
          <p
            className="text-[11px] font-medium leading-[16px] tracking-[0.055px]"
            style={{
              color: "var(--color-text)",
            }}
          >
            {title}
          </p>
        </div>
        <div className={isExpandable ? "rotate-90" : ""}>
          <Icon16ChevronRight />
        </div>
      </div>

      {description && (
        <div className="box-border flex gap-[10px] items-center justify-center pl-[4px] pr-0 py-0 w-full">
          <p
            className="grow min-h-px min-w-px text-[11px] pb-2 leading-[16px] tracking-[0.055px]"
            style={{
              color: "var(--color-text-secondary)",
            }}
          >
            {description}
          </p>
        </div>
      )}

      {pills && (
        <div className="flex gap-[8px] items-start w-full">
          {pills.map((pill, index) => (
            <div
              key={index}
              className="border border-solid box-border flex gap-[10px] items-center justify-center px-[8px] py-[4px] rounded-[13px]"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex flex-col justify-center leading-[0] not-italic shrink-0 text-nowrap">
                <p
                  className="leading-[16px] text-[11px] tracking-[0.055px]"
                  style={{
                    fontFamily:
                      "var(--body-medium-fontfamily, 'Inter', sans-serif)",
                    fontWeight: "var(--body-medium-fontweight, 500)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {pill}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface AiAssistantEmptyStateProps {
  onActionClick: (action: string) => void;
}

export default function AiAssistantEmptyState({
  onActionClick,
}: AiAssistantEmptyStateProps) {
  const actions = [
    {
      icon: Icon24AccessibilitySmall,
      title: "Design review",
      description: "Accessibility, consistency, and hierarchy analysis",
      pills: ["Contrast", "Spacing", "Hierarchy"],
      action: "design-review",
    },
    {
      icon: Icon24Library,
      title: "Design system",
      description: "Extract and enforce consistent styles",
      pills: ["Colors", "Typography", "Spacing"],
      action: "use-design-systems",
    },
    {
      icon: Icon24Comment,
      title: "Ask for feedback",
      action: "ask-feedback",
    },
    {
      icon: Icon24LayoutSet,
      title: "New designs",
      action: "new-designs",
    },
    {
      icon: Icon24SelectMatchingSmall,
      title: "Bulk edits",
      action: "bulk-edits",
    },
    {
      icon: Icon24Text,
      title: "Update content",
      action: "update-content",
    },
    {
      icon: Icon24VariableColor,
      title: "Style changes",
      action: "style-changes",
      hasChevron: false,
    },
  ];

  return (
    <div className="flex flex-col gap-[8px] items-center h-full">
      <div className="basis-0 flex flex-col grow items-start justify-center min-h-px min-w-px w-full">
        {/* Header Section */}
        <div className="box-border flex flex-col gap-[12px] items-center justify-end pb-[16px] w-full">
          <div className="flex flex-col gap-[8px] items-center justify-end w-full">
            {/* AI Assistant Icon */}
            <div
              className="box-border flex gap-[10px] items-center p-[8px] rounded-full"
              style={{ backgroundColor: "var(--color-bg-selected)" }}
            >
              <div style={{ color: "var(--color-icon-brand)" }}>
                <Icon24AiAssistant />
              </div>
            </div>

            {/* Greeting Text */}
            <div className="flex flex-col items-center leading-[0] not-italic text-center text-nowrap">
              <p
                className="text-[15px] font-medium leading-[25px] tracking-[-0.075px] text-nowrap whitespace-pre"
                style={{
                  color: "var(--color-text)",
                }}
              >
                Good morning!
              </p>
              <p
                className="text-[13px] leading-[22px] tracking-[-0.0325px] text-nowrap whitespace-pre"
                style={{
                  color: "var(--color-text-secondary)",
                }}
              >
                What do you want to do today?
              </p>
            </div>
          </div>
        </div>

        {/* Actions Card */}
        <div className="box-border flex flex-col gap-[10px] items-start py-0 w-full">
          <div
            style={{
              backgroundColor: "var(--color-bg)",
              borderColor: "var(--color-border)",
            }}
          >
            {/* {actions.map((action, index) => (
              <ActionCard
                key={action.action}
                icon={action.icon}
                title={action.title}
                description={action.description}
                pills={action.pills}
                onClick={() => onActionClick(action.action)}
                isLast={index === actions.length - 1}
              />
            ))} */}
          </div>
        </div>
      </div>
    </div>
  );
}
