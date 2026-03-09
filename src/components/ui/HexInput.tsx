"use client";

import Color from "color";
import React, { useState } from "react";

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
        onOpacityChange(parsed.opacity); // Pass 0-1 range value
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

export default HexInput;
