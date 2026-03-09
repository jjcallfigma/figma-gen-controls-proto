"use client";

import FillPopoverContent from "@/components/ui/FillPopoverContent";
import FillTrigger from "@/components/ui/FillTrigger";
import PropertyPopover from "@/components/ui/PropertyPopover";
import PropertyPopoverHeader from "@/components/ui/PropertyPopoverHeader";
import { useColorChange } from "@/core/hooks/useColorChange";
import { useAppStore } from "@/core/state/store";
import { SolidFill } from "@/types/canvas";
import Color from "color";
import React, { useRef, useState } from "react";

export default function CanvasBackgroundPanel() {
  const backgroundColor = useAppStore(
    (state) => state.canvasSettings.backgroundColor
  );
  const backgroundOpacity = useAppStore(
    (state) => state.canvasSettings.backgroundOpacity
  );
  const dispatch = useAppStore((state) => state.dispatch);
  const colorChange = useColorChange({ undoDelay: 500 });

  // Popover state
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleBackgroundColorChange = (newColor: string) => {
    dispatch({
      type: "canvas.background.changed",
      payload: {
        backgroundColor: newColor,
        previousBackgroundColor: backgroundColor,
      },
    });
  };

  // Handler for trigger hex input (direct text input)
  const handleTriggerColorChange = (newColor: string) => {
    handleBackgroundColorChange(newColor);
  };

  // Handler for popover RGBA picker (color wheel + opacity)
  const handlePopoverRgbaChange = (rgba: {
    r: number;
    g: number;
    b: number;
    a: number;
  }) => {
    const hex = Color.rgb(rgba.r, rgba.g, rgba.b).hex().toUpperCase();

    // Update background color
    const colorAction = {
      type: "canvas.background.changed",
      payload: {
        backgroundColor: hex,
        previousBackgroundColor: backgroundColor,
      },
    };
    colorChange.updateColor(colorAction, "canvas_background");

    // Also update opacity from alpha channel
    if (rgba.a !== backgroundOpacity) {
      const opacityAction = {
        type: "canvas.background.opacity.changed",
        payload: {
          backgroundOpacity: rgba.a, // Alpha is already in 0-1 range
          previousBackgroundOpacity: backgroundOpacity,
        },
      };
      colorChange.updateColor(opacityAction, "canvas_opacity");
    }
  };

  // New handlers for color picker interaction start/end
  const handleColorPickerStart = () => {
    colorChange.startColorChange("canvas_background", backgroundColor);
    colorChange.startColorChange("canvas_opacity", backgroundOpacity);
  };

  const handleColorPickerEnd = () => {
    colorChange.finishColorChange();
  };

  // Handler for opacity changes (expects percentage 0-100)
  const handleBackgroundOpacityChange = (opacityPercentage: number) => {
    const opacity = opacityPercentage / 100; // Convert to 0-1 range
    dispatch({
      type: "canvas.background.opacity.changed",
      payload: {
        backgroundOpacity: opacity,
        previousBackgroundOpacity: backgroundOpacity,
      },
    });
  };

  // Create a virtual fill object for the FillTrigger
  const backgroundFill: SolidFill = {
    id: "canvas-background",
    type: "solid",
    color: backgroundColor,
    opacity: backgroundOpacity,
    blendMode: "normal",
    visible: true,
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPopoverPosition({
      x: rect.left - 240 - 8, // Position to the left with some spacing
      y: rect.top,
    });
    setIsPopoverOpen(true);
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
  };

  return (
    <div ref={triggerRef} className="px-4 py-3">
      <div className="text-xs font-medium mb-3">Page</div>

      <div className="space-y-3">
        {/* Background Color */}
        <div className="flex items-center justify-between">
          <FillTrigger
            fill={backgroundFill}
            onTriggerClick={handleTriggerClick}
            onColorChange={handleTriggerColorChange} // Allow direct hex input changes
            onOpacityChange={handleBackgroundOpacityChange} // Allow opacity changes
            showLabel={true} // Show hex input
            showOpacity={true} // Show opacity input
          />
        </div>
      </div>

      {/* Canvas Background Popover */}
      <PropertyPopover
        isOpen={isPopoverOpen}
        onClose={closePopover}
        position={popoverPosition}
        onPositionChange={setPopoverPosition}
        width={240}
        protectedZoneRef={triggerRef}
        debug={false} // Disable debug for now
      >
        <PropertyPopoverHeader title="Custom" onClose={closePopover} />

        <FillPopoverContent
          activeTab="solid"
          onTabChange={() => {}} // Canvas only has solid fills
          activeFill={backgroundFill}
          onClose={closePopover}
          // onBlendModeChange not provided - blend mode select will be hidden
          onColorChange={undefined} // Don't use this - use onRgbaChange to avoid double firing
          onRgbaChange={handlePopoverRgbaChange} // Handles both color AND opacity through RGBA
          onColorPickerStart={handleColorPickerStart}
          onColorPickerEnd={handleColorPickerEnd}
          // Image callbacks not provided - image tab will be hidden
        />
      </PropertyPopover>
    </div>
  );
}
