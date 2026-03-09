"use client";

import type { ChoicesData } from "@/core/hooks/useDesignChat";
import { useState } from "react";
import { chatStyles } from "../primitives";

export function ChoicesBlock({
  choices,
  messageId,
  onChoiceResponse,
}: {
  choices: ChoicesData;
  messageId: string;
  onChoiceResponse: (messageId: string, selectedIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleSingleClick = (optionId: string) => {
    if (choices.answered) return;
    onChoiceResponse(messageId, [optionId]);
  };

  const handleMultipleToggle = (optionId: string) => {
    if (choices.answered) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        next.add(optionId);
      }
      return next;
    });
  };

  const handleMultipleSubmit = () => {
    if (choices.answered || selected.size === 0) return;
    onChoiceResponse(messageId, Array.from(selected));
  };

  const handleConfirm = (optionId: string) => {
    if (choices.answered) return;
    onChoiceResponse(messageId, [optionId]);
  };

  const isSelected = (optionId: string) =>
    choices.answered
      ? (choices.selectedIds?.includes(optionId) ?? false)
      : selected.has(optionId);

  if (choices.mode === "single") {
    return (
      <div className="mt-3">
        <div
          className="text-[11px] font-medium mb-2"
          style={{ color: chatStyles.text.secondary }}
        >
          {choices.question}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {choices.options.map((opt) => {
            const active = isSelected(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => handleSingleClick(opt.id)}
                disabled={choices.answered}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all"
                style={{
                  border: "1px solid",
                  borderColor: active
                    ? chatStyles.text.primary
                    : chatStyles.border,
                  backgroundColor: active
                    ? chatStyles.text.primary
                    : "transparent",
                  color: active ? chatStyles.bg.card : chatStyles.text.primary,
                  cursor: choices.answered ? "default" : "pointer",
                  opacity: choices.answered && !active ? 0.4 : 1,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {!choices.answered && choices.options.some((o) => o.description) && (
          <div className="mt-2 flex flex-col gap-1">
            {choices.options
              .filter((o) => o.description)
              .map((opt) => (
                <div
                  key={opt.id}
                  className="text-[10px]"
                  style={{ color: chatStyles.text.tertiary }}
                >
                  <span className="font-medium">{opt.label}:</span>{" "}
                  {opt.description}
                </div>
              ))}
          </div>
        )}
      </div>
    );
  }

  if (choices.mode === "multiple") {
    return (
      <div className="mt-3">
        <div
          className="text-[11px] font-medium mb-2"
          style={{ color: chatStyles.text.secondary }}
        >
          {choices.question}
        </div>
        <div className="flex flex-col gap-1.5">
          {choices.options.map((opt) => {
            const checked = isSelected(opt.id);
            return (
              <label
                key={opt.id}
                className="flex items-start gap-2 px-2.5 py-2 rounded-lg transition-colors"
                style={{
                  cursor: choices.answered ? "default" : "pointer",
                  backgroundColor: checked
                    ? chatStyles.bg.secondary
                    : "transparent",
                  opacity: choices.answered && !checked ? 0.4 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleMultipleToggle(opt.id)}
                  disabled={choices.answered}
                  className="mt-0.5 rounded"
                  style={{ accentColor: chatStyles.text.primary }}
                />
                <div className="flex flex-col">
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: chatStyles.text.primary }}
                  >
                    {opt.label}
                  </span>
                  {opt.description && (
                    <span
                      className="text-[10px]"
                      style={{ color: chatStyles.text.secondary }}
                    >
                      {opt.description}
                    </span>
                  )}
                </div>
              </label>
            );
          })}
        </div>
        {!choices.answered && (
          <button
            onClick={handleMultipleSubmit}
            disabled={selected.size === 0}
            className="mt-2 px-4 py-1.5 rounded-full text-[11px] font-medium transition-all"
            style={{
              backgroundColor:
                selected.size > 0
                  ? chatStyles.text.primary
                  : chatStyles.bg.secondary,
              color:
                selected.size > 0
                  ? chatStyles.bg.card
                  : chatStyles.text.tertiary,
              border: "none",
              cursor: selected.size > 0 ? "pointer" : "default",
            }}
          >
            Submit ({selected.size} selected)
          </button>
        )}
      </div>
    );
  }

  if (choices.mode === "confirm") {
    const primaryOpt = choices.options[0];
    const cancelOpt = choices.options[1] || {
      id: "__cancel__",
      label: "Cancel",
    };

    return (
      <div className="mt-3">
        <div
          className="text-[11px] font-medium mb-2"
          style={{ color: chatStyles.text.secondary }}
        >
          {choices.question}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleConfirm(primaryOpt.id)}
            disabled={choices.answered}
            className="px-4 py-1.5 rounded-full text-[11px] font-medium transition-all"
            style={{
              backgroundColor: isSelected(primaryOpt.id)
                ? chatStyles.text.primary
                : choices.answered
                  ? chatStyles.bg.secondary
                  : chatStyles.text.primary,
              color: isSelected(primaryOpt.id)
                ? chatStyles.bg.card
                : choices.answered
                  ? chatStyles.text.tertiary
                  : chatStyles.bg.card,
              border: "none",
              cursor: choices.answered ? "default" : "pointer",
              opacity:
                choices.answered && !isSelected(primaryOpt.id) ? 0.4 : 1,
            }}
          >
            {primaryOpt.label}
          </button>
          <button
            onClick={() => handleConfirm(cancelOpt.id)}
            disabled={choices.answered}
            className="px-4 py-1.5 rounded-full text-[11px] font-medium transition-all"
            style={{
              border: `1px solid ${chatStyles.border}`,
              backgroundColor: isSelected(cancelOpt.id)
                ? chatStyles.bg.secondary
                : "transparent",
              color: chatStyles.text.primary,
              cursor: choices.answered ? "default" : "pointer",
              opacity: choices.answered && !isSelected(cancelOpt.id) ? 0.4 : 1,
            }}
          >
            {cancelOpt.label}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
