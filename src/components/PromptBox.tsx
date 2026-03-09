"use client";

import React, { useState, useRef, useEffect } from "react";
import { Icon24Library } from "./icons/icon-24-library";
import { Icon24Adjust } from "./icons/icon-24-adjust";
import { Icon24Send } from "./icons/icon-24-send";


interface PromptBoxProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  hasSelection?: boolean;
  className?: string;
}

// Selection tag component
function SelectionTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div className="box-border flex flex-col gap-[10px] items-start pb-[4px] pt-[12px] px-[12px] w-full">
      <div 
        className="border border-solid box-border flex gap-[2px] h-[24px] items-center justify-center pl-[2px] pr-0 py-0 rounded-[5px]"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex gap-[2px] items-center rounded-[3px]">
          <div className="relative shrink-0 size-[24px]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="6" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1" fill="none"/>
            </svg>
          </div>
          <div 
            className="flex flex-col justify-center leading-[0] not-italic overflow-ellipsis overflow-hidden shrink-0 text-nowrap"
            style={{
              fontFamily: "var(--text-body-large-strong-font-family, 'Inter', sans-serif)",
              fontWeight: "var(--text-body-large-strong-font-weight, 550)",
              fontSize: "var(--text-body-large-strong-font-size, 13px)",
              color: "var(--color-text)",
              letterSpacing: "-0.0325px",
            }}
          >
            <p className="leading-[22px] overflow-ellipsis overflow-hidden text-[13px] whitespace-pre">
              {label}
            </p>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="relative shrink-0 size-[24px] flex items-center justify-center"
        >
          <div className="size-[16px] flex items-center justify-center">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M1 1L7 7M7 1L1 7"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
}

export default function PromptBox({
  onSend,
  placeholder = "What do you want to make?",
  disabled = false,
  loading = false,
  hasSelection = false,
  className = "",
}: PromptBoxProps) {
  const [message, setMessage] = useState("");
  const [selection, setSelection] = useState(hasSelection ? "Today" : null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!message.trim() || disabled || loading) return;
    
    onSend(message.trim());
    setMessage("");
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = message.trim().length > 0 && !disabled && !loading;

  return (
    <div className={`${className}`}>
      <div 
        className="border border-solid box-border flex flex-col items-start justify-center w-full rounded-[13px]"
        style={{
          backgroundColor: "var(--color-bg)",
          borderColor: "var(--color-border)",
          minHeight: "130px",
        }}
      >
        <div className="flex flex-col items-start overflow-hidden w-full flex-1">
          {/* Selection tag */}
          {selection && (
            <SelectionTag 
              label={selection} 
              onRemove={() => setSelection(null)} 
            />
          )}

          {/* Main text input area */}
          <div className="box-border flex flex-1 items-start justify-between p-[16px] pb-[8px] w-full">
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    rows={1}
                    className="border-0 outline-none bg-transparent resize-none overflow-hidden w-full"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 450,
                      fontSize: "13px",
                      lineHeight: "22px",
                      letterSpacing: "-0.0325px",
                      color: message ? "var(--color-text)" : "var(--color-text-tertiary)",
                      minHeight: "22px",
                    }}
                  />
          </div>

          {/* Bottom toolbar */}
          <div className="box-border flex items-start justify-between p-[12px] w-full">
            <div className="basis-0 flex gap-[4px] grow items-center min-h-px min-w-px">
              <div className="flex gap-[4px] items-center rounded-[5px]">
                <Icon24Library />
              </div>
            </div>
            <div className="flex gap-[8px] items-center">
              <Icon24Adjust />
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="overflow-hidden rounded-[24px] shrink-0 size-[24px] flex items-center justify-center"
                style={{
                  backgroundColor: canSend ? "var(--color-bg-brand)" : "var(--color-bg-disabled)",
                  color: "white",
                }}
              >
                {loading ? (
                  <div 
                    className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" 
                  />
                ) : (
                  <Icon24Send />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
