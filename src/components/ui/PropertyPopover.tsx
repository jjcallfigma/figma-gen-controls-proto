"use client";

import { useAppStore } from "@/core/state/store";
import {
  getCanvasObjectUnderMouse,
  getSelectedObjectUnderMouse,
} from "@/core/utils/selectionDetection";
import React, { useEffect, useRef, useState } from "react";

export interface PropertyPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  onPositionChange?: (position: { x: number; y: number }) => void;
  width?: number;
  children: React.ReactNode;
  className?: string;

  // Click protection options
  preventCloseOnInternalClick?: boolean; // Default: true
  preventCloseOnPortalClick?: boolean; // Default: true
  protectedZoneRef?: React.RefObject<HTMLElement | null>; // Additional protected area

  // Debug options
  debug?: boolean;
}

export default function PropertyPopover({
  isOpen,
  onClose,
  position,
  onPositionChange,
  width = 240,
  children,
  className = "",
  preventCloseOnInternalClick = true,
  preventCloseOnPortalClick = true,
  protectedZoneRef,
  debug = false,
}: PropertyPopoverProps) {
  // Save the selection state when popover opens
  const [selectionWhenOpened, setSelectionWhenOpened] = useState<string[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Access resize state to protect popover during resize operations
  const isResizing = useAppStore((state) => state.isResizing);

  // Save selection state when popover opens
  useEffect(() => {
    if (isOpen) {
      const currentSelection = useAppStore.getState().selection.selectedIds;
      setSelectionWhenOpened([...currentSelection]);
    }
  }, [isOpen, debug]);
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [selectJustClosed, setSelectJustClosed] = useState(false);
  const [mouseDownInsidePopover, setMouseDownInsidePopover] = useState(false);
  const selectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  // Helper function to check if element is draggable (not interactive)
  const isDraggableArea = (element: HTMLElement): boolean => {
    // Only allow dragging from specific safe areas
    let current: HTMLElement | null = element;
    while (current && current !== popoverRef.current) {
      const tagName = current.tagName.toLowerCase();
      const className = current.className ? String(current.className) : "";
      const role = current.getAttribute("role");

      // Explicitly draggable areas
      const isDragHandle =
        className.includes("drag-handle") ||
        current.getAttribute("data-drag-handle") !== null;

      // Safe background/padding areas (only these are draggable)
      const isSafeArea =
        className.includes("popover-header") ||
        className.includes("popover-background") ||
        className.includes("property-section-header") ||
        current.getAttribute("data-draggable") !== null;

      // Interactive elements that should NOT be draggable
      const isInteractive =
        tagName === "button" ||
        role === "button" ||
        ["input", "textarea", "select"].includes(tagName) ||
        current.getAttribute("data-radix-slider-thumb") !== null ||
        current.getAttribute("data-radix-slider-track") !== null ||
        current.getAttribute("data-radix-slider-range") !== null ||
        current.getAttribute("data-radix-select-trigger") !== null ||
        current.getAttribute("data-radix-select-content") !== null ||
        className.includes("color-picker") ||
        className.includes("color-wheel") ||
        className.includes("saturation") ||
        className.includes("hue") ||
        className.includes("slider") ||
        className.includes("image-preview");

      // If we hit an interactive element, definitely not draggable
      if (isInteractive) {
        return false;
      }

      // If we hit an explicitly safe area or drag handle, allow drag
      if (isDragHandle || isSafeArea) {
        return true;
      }

      current = current.parentElement;
    }

    // Default: only allow drag from the root popover background
    return element === popoverRef.current;
  };

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onPositionChange || !popoverRef.current) return;

    const target = e.target as HTMLElement;
    if (!isDraggableArea(target)) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = popoverRef.current.getBoundingClientRect();
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !dragStart || !onPositionChange) return;

    e.preventDefault();

    const newPosition = {
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y,
    };

    // Keep popover within viewport bounds
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    newPosition.x = Math.max(0, Math.min(newPosition.x, viewportWidth - width));
    newPosition.y = Math.max(0, Math.min(newPosition.y, viewportHeight - 400)); // Approximate popover height

    onPositionChange(newPosition);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  // Global mouse events for dragging
  useEffect(() => {
    if (!isDragging) return;

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragStart, dragOffset, onPositionChange, width]);

  // Direct popover mousedown listener (for cases where global listener doesn't catch events)
  useEffect(() => {
    if (!isOpen || !popoverRef.current) return;

    const handleDirectMouseDown = (e: MouseEvent) => {
      setMouseDownInsidePopover(true);
    };

    const handleDirectMouseUp = (e: MouseEvent) => {
      setMouseDownInsidePopover(false);
    };

    // Add listeners directly to the popover element
    popoverRef.current.addEventListener(
      "mousedown",
      handleDirectMouseDown,
      true
    ); // Use capture phase
    popoverRef.current.addEventListener("mouseup", handleDirectMouseUp, true);

    return () => {
      if (popoverRef.current) {
        popoverRef.current.removeEventListener(
          "mousedown",
          handleDirectMouseDown,
          true
        );
        popoverRef.current.removeEventListener(
          "mouseup",
          handleDirectMouseUp,
          true
        );
      }
    };
  }, [isOpen]);

  // Global click listener with comprehensive protection
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalClick = (e: Event) => {
      const target = e.target as HTMLElement;

      // Track mouse down/up inside popover to handle drag operations
      if (e.type === "mousedown" || e.type === "touchstart") {
        const isInsidePopover = popoverRef.current?.contains(target) || false;
        setMouseDownInsidePopover(isInsidePopover);

        // Track for global listener as backup
        // (Direct listener above is primary method)
      }

      if (debug) {
        console.log("🔍 PropertyPopover event:", {
          eventType: e.type,
          target: target.tagName,
          className: target.className,
          isSelectOpen,
          selectJustClosed,
          mouseDownInsidePopover,
          targetText: target.textContent?.slice(0, 50),
          hasPortalRoot: !!document.getElementById("portal-root"),
          isInPortal: document.getElementById("portal-root")?.contains(target),
          isInPopover: popoverRef.current?.contains(target),
          isInProtectedZone: protectedZoneRef?.current?.contains(target),
          timestamp: Date.now(),
        });
      }

      // FIRST: Protect during resize operations
      if (isResizing) {
        if (debug) console.log("🛡️ Protected: Resize operation active");
        return;
      }

      // SECOND: Always protect portal clicks (Select dropdowns, etc.)
      if (preventCloseOnPortalClick) {
        const portalRoot = document.getElementById("portal-root");
        if (portalRoot && portalRoot.contains(target)) {
          if (debug) console.log("🛡️ Protected: Portal click");
          return;
        }
      }

      // THIRD: If any select is open, don't close the popover - let the select handle its own closing
      if (isSelectOpen) {
        if (debug)
          console.log(
            "🛡️ Protected: Select is open - let select handle its own closing"
          );
        return;
      }

      // THIRD-B: If a select just closed, give it a brief moment (but extend if needed)
      // TEMPORARILY DISABLED - causing issues with popover closing
      // if (selectJustClosed) {
      //   if (debug)
      //     console.log(
      //       "🛡️ Protected: Select just closed",
      //       new Date().toISOString()
      //     );
      //   return;
      // }

      // THIRD-A: Check if target is a select-related element
      if (
        target.closest('[role="listbox"]') ||
        target.closest('[role="option"]') ||
        target.closest("[data-radix-select-content]")
      ) {
        if (debug) console.log("🛡️ Protected: Select UI element");
        return;
      }

      // FOURTH: Protect clicks inside the popover itself
      if (preventCloseOnInternalClick && popoverRef.current?.contains(target)) {
        if (debug) console.log("🛡️ Protected: Internal click");
        return;
      }

      // FOURTH-A: Protect drag operations that started inside the popover
      if (mouseDownInsidePopover) {
        // Protect all events during drag operations
        return;
      }

      // FIFTH: Protect additional zone if provided
      if (protectedZoneRef?.current?.contains(target)) {
        if (debug) console.log("🛡️ Protected: Protected zone click");
        return;
      }

      // SIXTH: Check for data attributes (additional protection)
      if (target.closest('[data-property-popover="true"]')) {
        if (debug) console.log("🛡️ Protected: Data attribute");
        return;
      }

      // SEVENTH: Protect crop mode interactions
      if (target.closest('[data-crop-mode="true"]')) {
        if (debug) console.log("🛡️ Protected: Crop mode interaction");
        return;
      }

      // EIGHTH: Protect resize handle interactions
      if (target.closest('[data-resize-handle="true"]')) {
        if (debug) console.log("🛡️ Protected: Resize handle interaction");
        return;
      }

      // NINTH: Protect FigUI3 fill picker dialog (hoisted to <body>)
      if (target.closest('.fig-fill-picker-dialog')) {
        if (debug) console.log("🛡️ Protected: FigUI3 fill picker dialog");
        return;
      }

      // MOUSEDOWN LOGIC: Close immediately on mousedown for canvas interactions
      if (e.type === "mousedown") {
        // Get canvas object under mouse (any object, selected or not)
        const canvasObjectId = getCanvasObjectUnderMouse(e as MouseEvent);

        // Check if the clicked object was in the ORIGINAL selection when popover opened
        const wasInOriginalSelection =
          canvasObjectId && selectionWhenOpened.includes(canvasObjectId);

        // If clicking on an object that was in the original selection - keep popover open
        if (wasInOriginalSelection) {
          return;
        }

        // If clicking on any canvas object (that wasn't in original selection) - close popover immediately
        if (canvasObjectId) {
          onClose();
          return;
        }

        // Check if this is a general canvas interaction (clicking empty canvas, etc.)
        const isCanvasInteraction =
          !popoverRef.current?.contains(target) &&
          !protectedZoneRef?.current?.contains(target) &&
          !target.closest('[data-property-popover="true"]') &&
          !target.closest('[data-crop-mode="true"]') &&
          !target.closest('.fig-fill-picker-dialog');

        if (isCanvasInteraction) {
          onClose();
          return;
        }
      }

      // CLICK LOGIC: Also check for selected objects on click (for touch devices)
      if (e.type === "click") {
        const selectedObjectId = getSelectedObjectUnderMouse(e as MouseEvent);

        if (selectedObjectId) {
          return;
        }
      }

      // CLICK LOGIC: Original click-based closing for backwards compatibility
      if (e.type !== "click") {
        if (debug) console.log("🛡️ Protected: Non-click event type:", e.type);
        return;
      }

      // FINAL-B: Never close during any form of select interaction
      // Check if this is related to any select interaction globally
      if (
        document.querySelector("[data-radix-select-content]") ||
        document.querySelector('[role="listbox"]') ||
        document.querySelector('[data-state="open"][role="combobox"]')
      ) {
        if (debug)
          console.log("🛡️ Protected: Global select interaction detected");
        return;
      }

      // If we get here, close the popover
      if (debug) console.log("❌ Closing popover on click");
      onClose();
    };

    // Listen on multiple event types for comprehensive coverage
    document.addEventListener("click", handleGlobalClick, false);
    document.addEventListener("mousedown", handleGlobalClick, false);
    document.addEventListener("mouseup", handleGlobalClick, false);
    document.addEventListener("mousemove", handleGlobalClick, false);
    document.addEventListener("touchstart", handleGlobalClick, false);
    document.addEventListener("touchend", handleGlobalClick, false);
    document.addEventListener("touchmove", handleGlobalClick, false);

    return () => {
      document.removeEventListener("click", handleGlobalClick, false);
      document.removeEventListener("mousedown", handleGlobalClick, false);
      document.removeEventListener("mouseup", handleGlobalClick, false);
      document.removeEventListener("mousemove", handleGlobalClick, false);
      document.removeEventListener("touchstart", handleGlobalClick, false);
      document.removeEventListener("touchend", handleGlobalClick, false);
      document.removeEventListener("touchmove", handleGlobalClick, false);

      // Cleanup timeout
      if (selectTimeoutRef.current) {
        clearTimeout(selectTimeoutRef.current);
        selectTimeoutRef.current = null;
      }
    };
  }, [
    isOpen,
    isSelectOpen,
    selectJustClosed,
    mouseDownInsidePopover,
    onClose,
    preventCloseOnInternalClick,
    preventCloseOnPortalClick,
    protectedZoneRef,
    debug,
  ]);

  // Provide select state management to children
  const contextValue = {
    isSelectOpen,
    setIsSelectOpen: (open: boolean) => {
      if (debug) console.log("🔄 Select state changed:", open);
      setIsSelectOpen(open);

      if (!open) {
        // Select just closed, protect for a much longer time to handle long press
        if (debug)
          console.log(
            "🔒 Select protection activated",
            new Date().toISOString()
          );
        setSelectJustClosed(true);

        // Clear any existing timeout
        if (selectTimeoutRef.current) {
          clearTimeout(selectTimeoutRef.current);
        }

        // Set new timeout
        selectTimeoutRef.current = setTimeout(() => {
          if (debug)
            console.log(
              "🔓 Select protection cleared",
              new Date().toISOString()
            );
          setSelectJustClosed(false);
          selectTimeoutRef.current = null;
        }, 100); // 100ms protection - very short to allow quick popover closing
      }
    },
    onSelectOpenChange: (open: boolean) => {
      if (debug) console.log("🔄 Select state changed:", open);
      setIsSelectOpen(open);

      if (!open) {
        // Select just closed, protect for a much longer time to handle long press
        if (debug)
          console.log(
            "🔒 Select protection activated",
            new Date().toISOString()
          );
        setSelectJustClosed(true);

        // Clear any existing timeout
        if (selectTimeoutRef.current) {
          clearTimeout(selectTimeoutRef.current);
        }

        // Set new timeout
        selectTimeoutRef.current = setTimeout(() => {
          if (debug)
            console.log(
              "🔓 Select protection cleared",
              new Date().toISOString()
            );
          setSelectJustClosed(false);
          selectTimeoutRef.current = null;
        }, 100); // 100ms protection - very short to allow quick popover closing
      }
    },
  };

  // After render, clamp position so the popover stays fully within the viewport
  useEffect(() => {
    if (!isOpen || !popoverRef.current || !onPositionChange) return;

    const el = popoverRef.current;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = position.x;
    let y = position.y;

    if (rect.bottom > vh - pad) {
      y = Math.max(pad, vh - rect.height - pad);
    }
    if (rect.right > vw - pad) {
      x = Math.max(pad, vw - rect.width - pad);
    }
    if (y < pad) y = pad;
    if (x < pad) x = pad;

    if (x !== position.x || y !== position.y) {
      onPositionChange({ x, y });
    }
  });

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className={`fixed z-50 bg-default rounded-[13px] shadow-500  ${className}`}
      data-property-popover="true"
      style={{
        left: position.x,
        top: position.y,
        width: `${width}px`,
        userSelect: isDragging ? "none" : "auto",
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        // Always prevent clicks inside from bubbling up
        e.stopPropagation();
      }}
    >
      <PropertyPopoverContext.Provider value={contextValue}>
        {children}
      </PropertyPopoverContext.Provider>
    </div>
  );
}

// Context for select state management
interface PropertyPopoverContextType {
  isSelectOpen: boolean;
  setIsSelectOpen: (open: boolean) => void;
  onSelectOpenChange: (open: boolean) => void;
}

const PropertyPopoverContext =
  React.createContext<PropertyPopoverContextType | null>(null);

// Hook for components inside the popover to access select state
export function usePropertyPopover() {
  const context = React.useContext(PropertyPopoverContext);
  if (!context) {
    throw new Error("usePropertyPopover must be used within a PropertyPopover");
  }
  return context;
}
