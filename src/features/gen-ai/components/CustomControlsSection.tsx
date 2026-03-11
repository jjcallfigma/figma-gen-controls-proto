"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/core/state/store";
import type { CanvasObject } from "@/types/canvas";
import type { UISpec } from "../types";
import { CustomControlsPopover } from "./CustomControlsPopover";
import { Icon24Plus } from "@/components/icons/icon-24-plus";
import { Icon24MinusSmall } from "@/components/icons/icon-24-minus-small";
import { Icon24CustomControls } from "@/components/icons/icon-24-custom-controls";

const POPOVER_WIDTH = 260;

interface Props {
  object: CanvasObject;
}

export function CustomControlsSection({ object }: Props) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
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
    setIsPopoverOpen(false);
    useAppStore.getState().dispatch({
      type: "object.updated",
      payload: {
        id: object.id,
        changes: { genAiSpec: undefined, genAiValues: undefined },
        previousValues: { genAiSpec: object.genAiSpec, genAiValues: object.genAiValues },
      },
    });
  }, [object.id, object.genAiSpec, object.genAiValues]);

  const hasControls = spec && spec.controls.length > 0;

  const openPopover = useCallback(() => {
    if (!sectionRef.current) return;
    const rect = sectionRef.current.getBoundingClientRect();
    // Place to the left of the section; PropertyPopover auto-clamps to viewport
    setPopoverPosition({ x: rect.left - POPOVER_WIDTH, y: rect.top });
    setIsPopoverOpen(true);
  }, []);

  const togglePopover = useCallback(() => {
    if (isPopoverOpen) {
      setIsPopoverOpen(false);
    } else {
      openPopover();
    }
  }, [isPopoverOpen, openPopover]);

  useEffect(() => {
    const handler = (e: Event) => {
      const frameId = (e as CustomEvent).detail?.frameId;
      if (frameId === object.id && hasControls) {
        requestAnimationFrame(() => openPopover());
      }
    };
    window.addEventListener("gen-ai-open-controls", handler);
    return () => window.removeEventListener("gen-ai-open-controls", handler);
  }, [object.id, hasControls, openPopover]);

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
              onClick={togglePopover}
              className="w-6 h-6 flex items-center justify-center rounded-[5px] hover:bg-secondary flex-shrink-0"
              title="Edit controls"
            >
              <Icon24CustomControls />
            </button>

            {/* Layer name — disabled input style matching properties panel */}
            <div
              className="flex h-6 w-full items-center rounded-[5px] pl-2 text-xs cursor-default truncate"
              style={{
                backgroundColor: "var(--color-bg-secondary, #f5f5f5)",
                color: "var(--color-text-tertiary, rgba(0,0,0,0.3))",
              }}
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
      {hasControls && spec && (
        <CustomControlsPopover
          spec={spec}
          frameId={object.id}
          isOpen={isPopoverOpen}
          position={popoverPosition}
          onPositionChange={setPopoverPosition}
          protectedZoneRef={sectionRef}
          onClose={() => setIsPopoverOpen(false)}
        />
      )}
    </div>
  );
}
