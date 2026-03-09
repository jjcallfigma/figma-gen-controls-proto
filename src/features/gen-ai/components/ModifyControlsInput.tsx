"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface Props {
  frameId: string;
  onClose?: () => void;
}

export function ModifyControlsInput({ frameId, onClose }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    const text = value.trim();
    if (!text) return;

    window.dispatchEvent(
      new CustomEvent("ai-mini-prompt-send", {
        detail: {
          message: text,
          fingerprint: frameId,
        },
      }),
    );

    setValue("");
    onClose?.();
  }, [value, frameId, onClose]);

  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
          if (e.key === "Escape") {
            onClose?.();
          }
        }}
        placeholder="Add or modify controls..."
        className="flex-1 px-2 py-1 rounded text-[12px] border-0 outline-none bg-transparent"
        style={{
          color: "var(--color-text)",
          fontFamily: "'Inter', sans-serif",
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim()}
        className="px-2 py-0.5 rounded text-[11px] font-medium"
        style={{
          backgroundColor: value.trim()
            ? "var(--color-bg-brand, #7B61FF)"
            : "var(--color-bg-disabled)",
          color: "white",
          border: "none",
          cursor: value.trim() ? "pointer" : "default",
        }}
      >
        Send
      </button>
    </div>
  );
}
