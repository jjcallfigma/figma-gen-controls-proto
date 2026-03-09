"use client";

import { isMixed, PropertyValue } from "@/core/utils/propertyUtils";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Enhanced Property Input Component with improved UX and validation
 */
export function PropertyInput({
  label,
  value,
  onChange,
  type = "text",
  updateMode = "blur",
  leadingLabel,
  leadingIcon,
  min,
  max,
}: {
  label: string;
  value: PropertyValue<any>;
  onChange?: (value: any) => void;
  type?: "text" | "number" | "color";
  updateMode?: "real-time" | "blur" | "enter";
  leadingLabel?: string; // Single character label like "X", "Y", "W", "H"
  leadingIcon?: React.ReactNode; // 24x14 icon
  min?: number; // Minimum value for number inputs
  max?: number; // Maximum value for number inputs
}) {
  const [localValue, setLocalValue] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const mixed = isMixed(value);
  const displayValue = mixed ? "Mixed" : String(value ?? "");

  // Helper function to clamp numeric values within min/max bounds
  const clampValue = useCallback(
    (numValue: number): number => {
      if (type !== "number") return numValue;
      let clampedValue = numValue;
      if (min !== undefined) clampedValue = Math.max(min, clampedValue);
      if (max !== undefined) clampedValue = Math.min(max, clampedValue);
      return clampedValue;
    },
    [type, min, max],
  );

  // Reset local value when the incoming value changes (e.g., when dragging objects)
  useEffect(() => {
    if (!isEditing) {
      setLocalValue(displayValue);
    }
  }, [displayValue, isEditing]);

  const handleChange = useCallback(
    (newValue: string) => {
      setLocalValue(newValue);

      // Apply immediately only if in real-time mode
      if (updateMode === "real-time" && onChange) {
        if (type === "number") {
          // Allow empty string without forcing to 0
          if (newValue === "") {
            return; // Don't update with empty value
          }
          const parsedValue = parseFloat(newValue);
          if (!isNaN(parsedValue)) {
            const clampedValue = clampValue(parsedValue);
            onChange(clampedValue);
          }
        } else {
          onChange(newValue);
        }
      }
    },
    [updateMode, onChange, type, clampValue],
  );

  const handleBlur = useCallback(() => {
    setIsEditing(false);

    if (onChange) {
      if (type === "number") {
        // Handle empty value - keep existing value instead of forcing 0
        if (localValue === "" || localValue === "Mixed") {
          setLocalValue(displayValue); // Reset to original value
          return;
        }
        const parsedValue = parseFloat(localValue);
        if (!isNaN(parsedValue)) {
          const clampedValue = clampValue(parsedValue);
          // Update local value to show the clamped result
          setLocalValue(clampedValue.toString());
          onChange(clampedValue);
        } else {
          setLocalValue(displayValue); // Reset to original value if invalid
        }
      } else {
        if (localValue !== displayValue) {
          onChange(localValue);
        }
      }
    }
  }, [onChange, localValue, displayValue, type, clampValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        // Apply the value on Enter and blur the input
        if (onChange) {
          if (type === "number") {
            if (localValue === "" || localValue === "Mixed") {
              (e.target as HTMLInputElement).blur();
              return;
            }
            const parsedValue = parseFloat(localValue);
            if (!isNaN(parsedValue)) {
              const clampedValue = clampValue(parsedValue);
              onChange(clampedValue);
            }
          } else {
            onChange(localValue);
          }
        }
        // Blur the input
        (e.target as HTMLInputElement).blur();
      } else if (
        type === "number" &&
        (e.key === "ArrowUp" || e.key === "ArrowDown")
      ) {
        e.preventDefault();

        // Get current numeric value - handle 0 properly
        const currentValue = isNaN(parseFloat(localValue))
          ? 0
          : parseFloat(localValue);
        const increment = e.shiftKey ? 10 : 1;
        const newValue =
          e.key === "ArrowUp"
            ? currentValue + increment
            : currentValue - increment;

        // Apply clamping
        const clampedValue = clampValue(newValue);

        // Update local value and dispatch immediately
        const newValueStr = clampedValue.toString();
        setLocalValue(newValueStr);

        if (onChange) {
          onChange(clampedValue);
        }
      }
    },
    [onChange, localValue, type, clampValue],
  );

  const handleFocus = useCallback(() => {
    setIsEditing(true);
    setLocalValue(mixed ? "" : displayValue);

    // Auto-select all content on focus
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.select();
      }
    }, 0);
  }, [mixed, displayValue]);

  const hasLeading = leadingLabel || leadingIcon;

  return (
    <div className="">
      <div className="relative">
        {/* Leading label or icon */}
        {hasLeading && (
          <div className="absolute top-0 h-6 flex items-center pointer-events-none z-[1]">
            {leadingIcon ? (
              <div className="w-6 h-6 flex items-center justify-center">
                {leadingIcon}
              </div>
            ) : (
              <span className="w-6 h-6 py-1 flex justify-center  text-xs text-secondary ">
                {leadingLabel}
              </span>
            )}
          </div>
        )}

        {/* Enhanced input with improved styling */}
        <input
          ref={inputRef}
          type={type}
          value={isEditing ? localValue : displayValue}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={mixed ? "Mixed" : undefined}
          className={cn(
            "flex h-6 w-full rounded-[5px] text-[11px] border border-transparent hover:border-default bg-secondary ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border focus-visible:border-selected disabled:cursor-not-allowed disabled:opacity-50",
            // Hide number input spinners
            "appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0",
            // Dynamic padding based on leading content
            hasLeading ? "pl-6 pr-2" : "px-2",
            "py-1",
          )}
          style={{
            // Ensure spinners are hidden in all browsers
            MozAppearance: type === "number" ? "textfield" : undefined,
          }}
        />
      </div>
    </div>
  );
}
