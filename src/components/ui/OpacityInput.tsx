"use client";

import React, { useState } from "react";

// Enhanced opacity input component
interface OpacityInputProps {
  value: number; // 0-1 range (opacity)
  onChange: (value: number) => void; // Expects 0-1 range value
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
      setLastValidValue(newValue / 100); // Convert to 0-1 range
      onChange(newValue / 100); // Pass 0-1 range to parent
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
      onChange(parsed / 100); // Pass 0-1 range value to callback
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
      className="h-6 pl-2 w-[38px] text-[11px] border-l border-white bg-transparent focus:outline-none disabled:opacity-50 text-ellipsis"
      placeholder="100"
    />
  );
}

export default OpacityInput;
