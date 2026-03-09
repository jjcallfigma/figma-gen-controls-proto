"use client";

import { createCheckerboardPattern, isEmptyImageUrl } from "@/core/utils/fills";
import { Fill, ImageFill, SolidFill } from "@/types/canvas";
import Color from "color";
import React, { useState } from "react";

interface FillTriggerProps {
  fill: Fill;
  onTriggerClick: (e: React.MouseEvent) => void;
  onColorChange?: (color: string) => void;
  onOpacityChange?: (opacity: number) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showOpacity?: boolean;
  disabled?: boolean;
}

const sizeClasses = {
  sm: "h-[14px] w-[14px]",
  md: "h-[18px] w-[18px]",
  lg: "h-[24px] w-[24px]",
};

const renderFillPreview = (fill: Fill, size: string) => {
  if (fill.type === "solid") {
    const solidFill = fill as SolidFill;
    return (
      <div
        className={`${size} rounded-[3px]`}
        style={{
          backgroundColor: solidFill.color,
          opacity: fill.opacity,
        }}
      />
    );
  }

  if (fill.type === "image") {
    const imageFill = fill as ImageFill;
    const isPlaceholder = isEmptyImageUrl(imageFill.imageUrl);

    if (isPlaceholder) {
      return (
        <div
          className={`${size} rounded-[3px]`}
          style={{
            backgroundImage: `url('${createCheckerboardPattern()}')`,
            backgroundSize: "8px 8px",
            backgroundRepeat: "repeat",
            backgroundPosition: "0 0",
            opacity: fill.opacity,
          }}
        />
      );
    }

    return (
      <div
        className={`${size} rounded-[3px] relative overflow-hidden`}
        style={{ opacity: fill.opacity }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url('${createCheckerboardPattern()}')`,
            backgroundSize: "8px 8px",
            backgroundRepeat: "repeat",
            backgroundPosition: "0 0",
          }}
        />
        <img
          src={imageFill.imageUrl}
          alt="Fill preview"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
    );
  }

  // Fallback for unknown fill types
  return (
    <div
      className={`${size} rounded-[3px] border border-gray-200 bg-gray-100`}
    />
  );
};

function FillTrigger({
  fill,
  onTriggerClick,
  onColorChange,
  onOpacityChange,
  className = "",
  size = "sm",
  showLabel = true,
  showOpacity = true,
  disabled = false,
}: FillTriggerProps) {
  const sizeClass = sizeClasses[size];

  return (
    <div
      className={`flex w-full items-center rounded-[5px] border border-transparent bg-secondary pl-[5px] ${className} focus-within:border-selected hover:focus-within:border-selected hover:border-default h-6  overflow-hidden `}
    >
      {/* Fill preview/selector button */}
      <button
        onClick={onTriggerClick}
        disabled={disabled}
        className={`${sizeClass} rounded-[3px] outline outline-1 outline-[--color-bordertranslucent] outline-offset-[-1px] shrink-0 overflow-hidden ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-default"
        }`}
      >
        {renderFillPreview(fill, sizeClass)}
      </button>

      {/* Label/Input based on fill type */}
      {showLabel && (
        <>
          {fill.type === "solid" && onColorChange && (
            <HexInput
              value={(fill as SolidFill).color || "#FFFFFF"}
              onChange={onColorChange}
              onOpacityChange={onOpacityChange}
              disabled={disabled}
            />
          )}

          {fill.type === "image" && (
            <div className="w-full pl-2 text-xs text-secondary">Image</div>
          )}

          {/* Add more fill types here as needed */}
          {fill.type !== "solid" && fill.type !== "image" && (
            <div className="w-full pl-2 text-xs text-secondary capitalize">
              {fill.type}
            </div>
          )}
        </>
      )}

      {/* Opacity input */}
      {showOpacity && onOpacityChange && (
        <OpacityInput
          value={fill.opacity}
          onChange={onOpacityChange}
          disabled={disabled}
        />
      )}
      {showOpacity && (
        <span className="text-xs text-secondary w-[14px] shrink-0">%</span>
      )}
    </div>
  );
}

// Enhanced hex input component
interface HexInputProps {
  value: string;
  onChange: (color: string) => void;
  onOpacityChange?: (opacity: number) => void;
  disabled?: boolean;
}

function HexInput({
  value,
  onChange,
  onOpacityChange,
  disabled,
}: HexInputProps) {
  const [inputValue, setInputValue] = useState(() => {
    // Display without # symbol and ensure uppercase
    const displayValue = value.startsWith("#") ? value.slice(1) : value;
    return displayValue.toUpperCase();
  });
  const [lastValidValue, setLastValidValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow free editing - users can type anything (hex, color names, etc.)
    setInputValue(e.target.value);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // Select all text on focus for easy replacement
    e.target.select();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur(); // This will trigger handleBlur
    }
  };

  const parseColorToHex = (
    input: string
  ): { hex: string; opacity?: number } | null => {
    const trimmed = input.trim();

    console.log(
      `🎨 [HexInput] Parsing input: "${input}" -> trimmed: "${trimmed}"`
    );

    if (!trimmed) return null;

    try {
      // Handle 8-digit hex with # manually for better alpha control
      if (
        trimmed.startsWith("#") &&
        trimmed.length === 9 &&
        /^#[0-9A-Fa-f]{8}$/.test(trimmed)
      ) {
        const hexColor = trimmed.slice(0, 7); // #RRGGBB
        const alphaHex = trimmed.slice(7, 9); // AA
        const alphaValue = parseInt(alphaHex, 16) / 255; // Convert to 0-1

        return {
          hex: hexColor.toUpperCase(),
          opacity: alphaValue < 1 ? alphaValue : undefined,
        };
      }

      // First, try to parse as-is (handles color names, rgb(), hsl(), #hex)
      const color = Color(trimmed);
      const opacity = color.alpha();

      return {
        hex: color.hex().toUpperCase(),
        opacity: opacity < 1 ? opacity : undefined, // Only return opacity if it's not 1
      };
    } catch (e) {
      // If that fails, try adding # prefix for hex values without #
      try {
        // Check if it looks like a hex value (3, 6, or 8 chars, only hex digits)
        if (
          /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$|^[0-9A-Fa-f]{8}$/.test(trimmed)
        ) {
          if (trimmed.length === 8) {
            // Handle 8-digit hex manually for better alpha control
            const hexColor = "#" + trimmed.slice(0, 6); // First 6 chars for RGB
            const alphaHex = trimmed.slice(6, 8); // Last 2 chars for alpha
            const alphaValue = parseInt(alphaHex, 16) / 255; // Convert to 0-1

            // console.log(`🎨 [HexInput] Parsing 8-digit hex: ${trimmed}`);
            // console.log(`🎨 [HexInput] - Color: ${hexColor}, Alpha hex: ${alphaHex}, Alpha value: ${alphaValue}`);

            return {
              hex: hexColor.toUpperCase(),
              opacity: alphaValue < 1 ? alphaValue : undefined,
            };
          } else {
            // 3 or 6 char hex - no alpha
            const colorWithHash = Color("#" + trimmed);
            return {
              hex: colorWithHash.hex().toUpperCase(),
              opacity: undefined,
            };
          }
        }
      } catch (e2) {
        // Still invalid
      }

      // Invalid color input
      return null;
    }
  };

  const handleBlur = () => {
    setIsFocused(false);

    const parsed = parseColorToHex(inputValue);

    if (parsed) {
      // Valid color - update both local state and parent
      const displayValue = parsed.hex.slice(1); // Remove # for display
      setInputValue(displayValue);
      setLastValidValue(parsed.hex);
      onChange(parsed.hex);

      // Update opacity if alpha was provided and callback exists
      if (parsed.opacity !== undefined && onOpacityChange) {
        const percentageValue = parsed.opacity * 100; // Convert to 0-100 range for consistency with opacity input
        // console.log(`🎨 [HexInput] Setting opacity from alpha: ${parsed.opacity} -> ${percentageValue}% (for callback)`);
        onOpacityChange(percentageValue);
      }
    } else {
      // Invalid color - restore last valid value
      const displayValue = lastValidValue.startsWith("#")
        ? lastValidValue.slice(1)
        : lastValidValue;
      setInputValue(displayValue.toUpperCase());
    }
  };

  // Sync with external value changes (only when not focused)
  React.useEffect(() => {
    if (!isFocused) {
      const displayValue = value.startsWith("#") ? value.slice(1) : value;
      const uppercaseDisplayValue = displayValue.toUpperCase();
      if (uppercaseDisplayValue !== inputValue) {
        setInputValue(uppercaseDisplayValue);
        setLastValidValue(value);
      }
    }
  }, [value, inputValue, isFocused]);

  return (
    <input
      type="text"
      value={inputValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className="h-6 px-2 w-full text-[11px] bg-transparent focus:outline-none disabled:opacity-50"
      placeholder="FF0000, red, rgba(255,0,0,0.5)"
    />
  );
}

// Enhanced opacity input component
interface OpacityInputProps {
  value: number; // 0-1 range (opacity from fill object)
  onChange: (value: number) => void; // Expects percentage value (0-100) - will be converted to 0-1 by parent
  disabled?: boolean;
}

function OpacityInput({ value, onChange, disabled }: OpacityInputProps) {
  const [inputValue, setInputValue] = useState(() => {
    // Display as percentage without % symbol
    return parseFloat((value * 100).toFixed(2)).toString();
  });
  const [lastValidValue, setLastValidValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow free editing - users can type anything
    setInputValue(e.target.value);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // Select all text on focus for easy replacement
    e.target.select();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur(); // This will trigger handleBlur
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();

      // Get current numeric value
      const currentValue = parseFloat(inputValue) || 0;
      const increment = e.shiftKey ? 10 : 1;
      const newValue =
        e.key === "ArrowUp"
          ? Math.min(100, currentValue + increment)
          : Math.max(0, currentValue - increment);

      // Update local value and dispatch immediately
      const newValueStr = newValue.toString();
      setInputValue(newValueStr);
      setLastValidValue(newValue / 100); // Convert to 0-1 range for internal storage
      onChange(newValue); // Pass percentage value (0-100) to parent, consistent with blur
    }
  };

  const parseOpacityValue = (input: string): number | null => {
    const trimmed = input.trim();

    if (!trimmed) return null;

    // Parse as number
    const numValue = parseFloat(trimmed);

    if (isNaN(numValue)) return null;

    // Clamp to 0-100 range
    return Math.max(0, Math.min(100, numValue));
  };

  const handleBlur = () => {
    setIsFocused(false);

    const parsed = parseOpacityValue(inputValue);

    if (parsed !== null) {
      // Valid opacity - update both local state and parent
      const displayValue = parseFloat(parsed.toFixed(2)).toString();
      setInputValue(displayValue);
      setLastValidValue(parsed / 100); // Convert to 0-1 range for storage
      onChange(parsed); // Pass percentage value (0-100) to callback
    } else {
      // Invalid opacity - restore last valid value
      const displayValue = parseFloat(
        (lastValidValue * 100).toFixed(2)
      ).toString();
      setInputValue(displayValue);
    }
  };

  // Sync with external value changes (only when not focused)
  React.useEffect(() => {
    if (!isFocused) {
      const displayValue = parseFloat((value * 100).toFixed(2)).toString();
      if (displayValue !== inputValue) {
        setInputValue(displayValue);
        setLastValidValue(value);
      }
    }
  }, [value, inputValue, isFocused]);

  return (
    <input
      type="text" // Use text to avoid spinner arrows
      value={inputValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className="h-6 pl-2 w-[38px] text-[11px] border-l border-[var(--color-bg)] bg-transparent focus:outline-none disabled:opacity-50 text-ellipsis"
      placeholder="100"
    />
  );
}

export default FillTrigger;
