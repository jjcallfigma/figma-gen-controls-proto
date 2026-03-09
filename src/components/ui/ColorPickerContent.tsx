"use client";

import { Input } from "@/components/ui/input";
import Color from "color";
import React from "react";
import { RgbaColorPicker } from "react-colorful";

interface ColorPickerContentProps {
  color: string;
  opacity?: number;
  onColorChange?: (color: string) => void;
  onOpacityChange?: (opacity: number) => void;
  onRgbaChange?: (rgba: { r: number; g: number; b: number; a: number }) => void;
  onColorPickerStart?: () => void;
  onColorPickerEnd?: () => void;
  showOpacity?: boolean;
}

// Helper functions to convert between hex and rgba
const hexToRgba = (hex: string, alpha: number = 1) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b, a: alpha };
};

const rgbaToHex = (rgba: { r: number; g: number; b: number; a: number }) => {
  return Color.rgb(rgba.r, rgba.g, rgba.b).hex().toUpperCase();
};

export default function ColorPickerContent({
  color,
  opacity = 1,
  onColorChange,
  onOpacityChange,
  onRgbaChange,
  onColorPickerStart,
  onColorPickerEnd,
  showOpacity = true,
}: ColorPickerContentProps) {
  const currentRgba = hexToRgba(color, opacity);

  const handleRgbaChange = (rgba: {
    r: number;
    g: number;
    b: number;
    a: number;
  }) => {
    // If onRgbaChange is provided, use it (this handles both color and opacity together)
    if (onRgbaChange) {
      onRgbaChange(rgba);
    } else {
      // Fallback to separate calls
      const newHex = rgbaToHex(rgba);
      if (onColorChange) {
        onColorChange(newHex);
      }
      if (onOpacityChange) {
        onOpacityChange(rgba.a);
      }
    }
  };

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    if (/^#[0-9A-F]{6}$/i.test(newColor) && onColorChange) {
      onColorChange(newColor);
    }
  };

  return (
    <div className="mb-4 px-4 py-0">
      <div
        onMouseDown={(e) => {
          onColorPickerStart?.();
          // Don't stop propagation - let PropertyPopover track this too
        }}
        onMouseUp={(e) => {
          onColorPickerEnd?.();
          // Don't stop propagation - let PropertyPopover track this too
        }}
        onTouchStart={() => onColorPickerStart?.()}
        onTouchEnd={() => onColorPickerEnd?.()}
      >
        <RgbaColorPicker
          className="react-colorful--small"
          color={currentRgba}
          onChange={handleRgbaChange}
          style={{ width: "100%" }}
        />
      </div>

      {/* Color input field - only show if onColorChange is provided */}
      {onColorChange && (
        <div className="mt-3">
          <Input
            type="text"
            value={color}
            onChange={handleHexInputChange}
            placeholder="#FFFFFF"
          />
        </div>
      )}
    </div>
  );
}
