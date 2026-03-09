"use client";

import { useState, useCallback, useRef } from "react";
import { useAppStore } from "@/core/state/store";
import type { CanvasObject } from "@/types/canvas";
import type { UISpec } from "../types";
import { CustomControlsPopover } from "./CustomControlsPopover";
import { Icon24Plus } from "@/components/icons/icon-24-plus";
import { Icon24MinusSmall } from "@/components/icons/icon-24-minus-small";

interface Props {
  object: CanvasObject;
}

export function CustomControlsSection({ object }: Props) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const iconButtonRef = useRef<HTMLButtonElement>(null);

  const spec: UISpec | null = (() => {
    if (!object.genAiSpec) return null;
    try {
      return JSON.parse(object.genAiSpec) as UISpec;
    } catch {
      return null;
    }
  })();

  const handleDetach = useCallback(() => {
    useAppStore.getState().dispatch({
      type: "object.updated",
      payload: {
        id: object.id,
        changes: { genAiSpec: undefined },
        previousValues: { genAiSpec: object.genAiSpec },
      },
    });
    setIsPopoverOpen(false);
  }, [object.id, object.genAiSpec]);

  const hasControls = spec && spec.controls.length > 0;

  return (
    <div ref={sectionRef}>
      {/* Section header */}
      <div className="text-xs font-medium h-10 grid grid-cols-[1fr_auto] items-center pl-4 pr-2">
        <div
          style={{
            color: hasControls ? "var(--color-text)" : "var(--color-text-secondary)",
          }}
        >
          Custom
        </div>
        <button
          className="w-6 h-6 rounded-[5px] hover:bg-secondary"
          title="Add control"
        >
          <Icon24Plus />
        </button>
      </div>

      {/* Single row: [icon] [layer name] [—] */}
      {hasControls && (
      <div>
        <div className="pb-2">
          <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center pl-4 pr-2 h-8">
            {/* Icon button — opens the controls popover */}
            <button
              ref={iconButtonRef}
              onClick={() => setIsPopoverOpen((v) => !v)}
              className="w-6 h-6 flex items-center justify-center rounded-[5px] hover:bg-secondary flex-shrink-0"
              style={{ color: "var(--color-text-secondary)" }}
              title="Edit controls"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M2 4h2m4 0h6M2 8h6m2 0h4M2 12h3m4 0h5" strokeLinecap="round" />
                <circle cx="5.5" cy="4" r="1.5" fill="var(--color-bg)" />
                <circle cx="9.5" cy="8" r="1.5" fill="var(--color-bg)" />
                <circle cx="6.5" cy="12" r="1.5" fill="var(--color-bg)" />
              </svg>
            </button>

            {/* Layer name — disabled select trigger style */}
            <div
              className="flex h-6 w-full items-center rounded-[5px] border bg-background pl-2 py-2 text-xs cursor-default opacity-70 truncate"
              title={object.name}
            >
              <span className="truncate">{object.name}</span>
            </div>

            {/* Remove button — detaches controls */}
            <div className="flex items-center">
              <button
                onClick={handleDetach}
                className="w-6 h-6 rounded-[5px] text-xs flex items-center justify-center hover:bg-secondary"
                title="Remove custom controls"
              >
                <Icon24MinusSmall />
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Popover with all controls */}
      {isPopoverOpen && hasControls && spec && (
        <CustomControlsPopover
          spec={spec}
          frameId={object.id}
          anchorRef={iconButtonRef}
          onClose={() => setIsPopoverOpen(false)}
        />
      )}
    </div>
  );
}
