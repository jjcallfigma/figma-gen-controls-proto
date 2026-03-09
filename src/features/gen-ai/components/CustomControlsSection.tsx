"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/core/state/store";
import type { CanvasObject } from "@/types/canvas";
import type { UISpec } from "../types";
import { CustomControlsPopover } from "./CustomControlsPopover";

interface Props {
  object: CanvasObject;
}

export function CustomControlsSection({ object }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [spec, setSpec] = useState<UISpec | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (object.genAiSpec) {
      try {
        setSpec(JSON.parse(object.genAiSpec) as UISpec);
      } catch {
        setSpec(null);
      }
    } else {
      setSpec(null);
    }
  }, [object.genAiSpec]);

  const handleDetach = useCallback(() => {
    useAppStore.getState().dispatch({
      type: "object.updated",
      payload: {
        id: object.id,
        changes: { genAiSpec: undefined },
        previousValues: { genAiSpec: object.genAiSpec },
      },
    });
    setIsOpen(false);
    setSpec(null);
  }, [object.id, object.genAiSpec]);

  if (!spec) return null;

  const controlCount = spec.controls?.length ?? 0;

  return (
    <>
      <div className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            ref={buttonRef}
            onClick={() => setIsOpen((v) => !v)}
            className="flex-1 flex items-center justify-between px-2 py-1.5 rounded-md text-[12px] font-medium transition-colors hover:bg-[var(--color-bg-secondary)]"
            style={{
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              backgroundColor: isOpen ? "var(--color-bg-secondary)" : "transparent",
            }}
          >
            <div className="flex items-center gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              >
                <path d="M2 4h2m4 0h4M2 7h6m2 0h2M2 10h3m4 0h3" strokeLinecap="round" />
                <circle cx="5.5" cy="4" r="1.5" />
                <circle cx="9.5" cy="7" r="1.5" />
                <circle cx="6.5" cy="10" r="1.5" />
              </svg>
              <span>Custom Controls</span>
            </div>
            <span
              className="text-[11px]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {controlCount}
            </span>
          </button>
          <button
            onClick={handleDetach}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg-secondary)]"
            style={{
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
              backgroundColor: "transparent",
            }}
            title="Detach controls (converts to static frame)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M4 8L8 4M3 2H2v1M10 2h-1M10 9v1H9M2 9v1h1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {isOpen && spec && (
        <CustomControlsPopover
          spec={spec}
          frameId={object.id}
          anchorRef={buttonRef}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
