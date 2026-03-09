"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/core/state/store";
import {
  getCanvasObjectUnderMouse,
  getSelectedObjectUnderMouse,
} from "@/core/utils/selectionDetection";
import Color from "color";
import React, { useRef, useState } from "react";
import { RgbaColorPicker } from "react-colorful";
import { Icon24CloseSmall } from "../icons/icon-24-close-small";

interface ColorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  color: string;
  opacity?: number;
  onColorChange: (color: string) => void;
  onOpacityChange?: (opacity: number) => void;
  title?: string;
  showOpacity?: boolean;
}

const hexToRgba = (hex: string, alpha: number = 1) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b, a: alpha };
};

const rgbaToHex = (rgba: { r: number; g: number; b: number; a: number }) => {
  const toHex = (n: number) => {
    const hex = Math.round(n).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return Color.rgb(rgba.r, rgba.g, rgba.b).hex().toUpperCase();
};

export default function ColorPopover({
  isOpen,
  onClose,
  position,
  color,
  opacity = 1,
  onColorChange,
  onOpacityChange,
  title = "Color",
  showOpacity = true,
}: ColorPopoverProps) {
  // Save the selection state when popover opens
  const [selectionWhenOpened, setSelectionWhenOpened] = useState<string[]>([]);
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [selectJustClosed, setSelectJustClosed] = useState(false);
  const [mouseDownInsidePopover, setMouseDownInsidePopover] = useState(false);
  const flyoutRef = useRef<HTMLDivElement>(null);

  // Save selection state when popover opens
  React.useEffect(() => {
    if (isOpen) {
      const currentSelection = useAppStore.getState().selection.selectedIds;
      setSelectionWhenOpened([...currentSelection]);
    }
  }, [isOpen]);

  // Global click listener to close flyout when clicking outside
  React.useEffect(() => {
    if (!isOpen) return;

    const handleGlobalClick = (e: Event) => {
      // If any select is open, don't close the popover at all
      if (isSelectOpen) {
        return;
      }

      // If a select just closed, ignore the next click for a short period
      if (selectJustClosed) {
        return;
      }

      const target = e.target as HTMLElement;

      // Track mouse down/up inside popover to handle drag operations
      if (e.type === "mousedown" || e.type === "touchstart") {
        const isInsidePopover = flyoutRef.current?.contains(target) || false;
        setMouseDownInsidePopover(isInsidePopover);
      }

      // Protect drag operations that started inside the popover
      if (mouseDownInsidePopover) {
        if (e.type === "mouseup" || e.type === "touchend") {
          setMouseDownInsidePopover(false); // Reset for next interaction
          return;
        }

        // Protect all events during drag operations
        return;
      }

      // Debug can be re-enabled if needed
      // console.log("Global click detected:", { target: target.tagName, ... });

      // Don't close if clicking inside the flyout itself
      if (flyoutRef.current?.contains(target)) {
        return;
      }

      // Also check for data attribute (additional protection)
      if (target.closest('[data-color-popover="true"]')) {
        return;
      }

      // Don't close if clicking inside any Radix portalled content (Select dropdowns, etc.)
      const portalRoot = document.getElementById("portal-root");
      if (portalRoot && portalRoot.contains(target)) {
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

        const isCanvasInteraction =
          !flyoutRef.current?.contains(target) &&
          !target.closest('[data-color-popover="true"]');

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

        // Close on click for backwards compatibility
        onClose();
      }
    };

    // Use normal bubbling phase to allow stopPropagation to work
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
    };
  }, [isOpen, isSelectOpen, selectJustClosed, onClose]);

  if (!isOpen) return null;

  const currentRgba = hexToRgba(color, opacity);

  const handleRgbaChange = (rgba: {
    r: number;
    g: number;
    b: number;
    a: number;
  }) => {
    const newHex = rgbaToHex(rgba);
    onColorChange(newHex);
    if (onOpacityChange) {
      onOpacityChange(rgba.a);
    }
  };

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    if (/^#[0-9A-F]{6}$/i.test(newColor)) {
      onColorChange(newColor);
    }
  };

  return (
    <div
      ref={flyoutRef}
      className="fixed z-50 bg-white rounded-[13px] shadow-500"
      data-color-popover="true"
      style={{
        left: position.x,
        top: position.y,
        width: "240px",
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-medium">{title}</span>
        <Button
          onClick={onClose}
          variant="ghost"
          size="sm"
          className="w-6 h-6 p-0 hover:bg-secondary"
        >
          <Icon24CloseSmall />
        </Button>
      </div>

      {/* Color Picker */}
      <div className="p-4">
        <RgbaColorPicker
          className="react-colorful--small"
          color={currentRgba}
          onChange={handleRgbaChange}
          style={{ width: "100%" }}
        />

        {/* Color input field */}
        <div className="mt-3">
          <Input
            type="text"
            value={color}
            onChange={handleHexInputChange}
            placeholder="#FFFFFF"
          />
        </div>

        {/* Opacity slider (if enabled) */}
        {showOpacity && onOpacityChange && (
          <div className="mt-3">
            <label className="text-xs text-muted-foreground mb-1 block">
              Opacity
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={opacity}
              onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-muted-foreground mt-1">
              {Math.round(opacity * 100)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
