"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";

import { cn } from "@/lib/utils";

interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  defaultToMiddle?: boolean;
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(
  (
    { className, defaultToMiddle = false, min = 0, max = 100, value, ...props },
    ref
  ) => {
    // Calculate the position and width for centered sliders
    const currentValue = Array.isArray(value) ? value[0] : value || 0;
    const midpoint = (min + max) / 2;

    // For centered sliders, calculate the visual range from midpoint
    let rangeStyle = {};
    if (defaultToMiddle) {
      const totalRange = max - min;
      const midpointPercent = ((midpoint - min) / totalRange) * 100;

      if (currentValue >= midpoint) {
        // Value is to the right of center - offset left by 8px to center the border radius
        const valuePercent =
          ((currentValue - min + 8) / (totalRange + 8)) * 100;
        rangeStyle = {
          left: `calc(${midpointPercent}% - 8px)`,
          width: `max(calc(${valuePercent - midpointPercent}% + 8px), 16px)`,
        };
      } else {
        // Value is to the left of center - extend right by 8px to center the border radius
        const valuePercent =
          ((currentValue - min + 0) / (totalRange + 16)) * 100;
        rangeStyle = {
          right: `calc(${midpointPercent}% - 8px)`,
          width: `max(calc(${midpointPercent - valuePercent}% + 8px), 16px)`,
        };
      }
    }

    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn(
          "relative flex w-full touch-none select-none items-center",
          className
        )}
        min={min}
        max={max}
        value={value}
        {...props}
      >
        <SliderPrimitive.Track className="relative h-4 w-full grow overflow-hidden rounded-full bg-secondary outline outline-1 outline-[--color-bordertranslucent] outline-offset-[-1px]">
          {defaultToMiddle ? (
            <>
              {/* Center line indicator */}

              {/* Custom range that starts from center */}
              <div
                className="absolute h-full bg-brand rounded-[16px] "
                style={rangeStyle}
              />
              <div
                className="absolute top-[6px] -translate-x-[2px] w-[4px] h-[4px] rounded-full bg-black"
                style={{ left: `${((midpoint - min) / (max - min)) * 100}%` }}
              />
            </>
          ) : (
            <SliderPrimitive.Range className="absolute h-full bg-selected" />
          )}
        </SliderPrimitive.Track>
        {currentValue !== midpoint ? (
          <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full bg-transparent border-4 border-white shadow-200  disabled:pointer-events-none disabled:opacity-50" />
        ) : (
          <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full bg-default ring-offset-background shadow-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
        )}
      </SliderPrimitive.Root>
    );
  }
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
