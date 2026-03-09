"use client";

import { useSettingsStore } from "@/core/state/settingsStore";
import { Viewport } from "@/types/canvas";

interface RulerProps {
  type: "horizontal" | "vertical";
  viewport: Viewport;
  size: number;
  offset?: number; // Offset for panels (layers panel width for horizontal, height for vertical)
}

/**
 * Ruler component that displays measurement ticks and labels.
 * The ruler adjusts its tick intervals based on the current zoom level
 * to maintain a readable density of ticks.
 */
export default function Ruler({
  type,
  viewport,
  size,
  offset = 0,
}: RulerProps) {
  const showRulers = useSettingsStore((state) => state.showRulers);
  
  if (!showRulers) {
    return null;
  }
  
  const isHorizontal = type === "horizontal";
  const rulerSize = 20; // Width/height of the ruler

  const calculateTickIntervals = (zoom: number) => {
    // Extended intervals to support extreme zoom levels (from 2% to 25600%)
    const intervals = [
      1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
      50000, 100000, 200000, 500000, 1000000,
    ];

    // We want major ticks to be roughly 50 pixels apart on screen
    const targetScreenDistance = 50;
    const worldDistance = targetScreenDistance / zoom;

    // Find the closest interval that gives us approximately the target distance
    let majorInterval = intervals.find((interval) => interval >= worldDistance);

    // If no interval is large enough, calculate a power-of-10 based interval
    if (!majorInterval) {
      const magnitude = Math.pow(10, Math.ceil(Math.log10(worldDistance)));
      // Choose between 1x, 2x, or 5x the magnitude
      if (worldDistance <= magnitude * 0.2) {
        majorInterval = magnitude * 0.2;
      } else if (worldDistance <= magnitude * 0.5) {
        majorInterval = magnitude * 0.5;
      } else {
        majorInterval = magnitude;
      }
    }

    // Choose minor interval based on major interval
    let minorInterval: number;
    if (majorInterval >= 100000) {
      minorInterval = majorInterval / 10;
    } else if (majorInterval >= 10000) {
      minorInterval = majorInterval / 10;
    } else if (majorInterval >= 1000) {
      minorInterval = majorInterval / 10;
    } else if (majorInterval >= 100) {
      minorInterval = majorInterval / 10;
    } else if (majorInterval >= 10) {
      minorInterval = majorInterval / 5;
    } else if (majorInterval >= 5) {
      minorInterval = majorInterval / 2;
    } else {
      minorInterval = majorInterval;
    }

    return { majorInterval, minorInterval };
  };

  const { majorInterval, minorInterval } = calculateTickIntervals(
    viewport.zoom
  );

  // Calculate visible range in world coordinates
  const start = isHorizontal
    ? (-viewport.panX + rulerSize + offset) / viewport.zoom
    : (-viewport.panY + rulerSize) / viewport.zoom;
  const end = isHorizontal
    ? (size - viewport.panX - rulerSize) / viewport.zoom
    : (size - viewport.panY - rulerSize) / viewport.zoom;

  // Calculate tick positions
  const ticks: Array<{ pos: number; isMajor: boolean; label?: string }> = [];
  const startTick = Math.floor(start / minorInterval) * minorInterval;
  const endTick = Math.ceil(end / minorInterval) * minorInterval;

  for (let pos = startTick; pos <= endTick; pos += minorInterval) {
    const isMajor = Math.abs(pos % majorInterval) < 0.1;
    ticks.push({
      pos,
      isMajor,
      label: isMajor ? formatLabel(pos, majorInterval) : undefined,
    });
  }

  /**
   * Formats the tick label based on the interval size
   * @param value - The tick position value
   * @param interval - The major interval size
   * @returns Formatted label string
   */
  function formatLabel(value: number, interval: number): string {
    if (interval < 1) {
      return value.toFixed(1);
    }
    return Math.round(value).toString();
  }

  return (
    <>
      <div
        className={`absolute z-50 bg-white backdrop-blur-sm pointer-events-none ${
          isHorizontal ? "h-5" : "w-5"
        }`}
        style={{
          [isHorizontal ? "top" : "left"]: isHorizontal ? 0 : `${offset}px`,
          [isHorizontal ? "left" : "top"]: isHorizontal
            ? `${rulerSize + offset}px`
            : rulerSize,
          [isHorizontal ? "width" : "height"]: isHorizontal
            ? `calc(100% - ${rulerSize + offset}px)`
            : `calc(100% - ${rulerSize}px)`,
          [isHorizontal ? "borderBottom" : "borderRight"]: "1px solid #e5e7eb",
          zIndex: 50,
        }}
      >
        {ticks.map(({ pos, isMajor, label }) => {
          const screenPos =
            pos * viewport.zoom +
            (isHorizontal ? viewport.panX : viewport.panY) -
            rulerSize -
            (isHorizontal ? offset : 0);
          const isVisible =
            screenPos >= 0 &&
            screenPos <= size - rulerSize - (isHorizontal ? offset : 0);

          if (!isVisible) return null;

          if (isMajor) {
            return (
              <div
                key={pos}
                className="absolute"
                style={{
                  [isHorizontal ? "left" : "top"]: `${screenPos}px`,
                }}
              >
                {/* Major tick mark */}
                <div
                  className="absolute bg-neutral-400"
                  style={{
                    [isHorizontal ? "left" : "top"]: "50%",
                    [isHorizontal ? "top" : "left"]: isHorizontal ? 16 : 16,
                    width: isHorizontal ? "1px" : "3px",
                    height: isHorizontal ? "3px" : "1px",
                    transform: isHorizontal
                      ? "translateX(-50%)"
                      : "translateY(-50%)",
                  }}
                />
                {/* Label */}
                {label && (
                  <div
                    className="absolute text-[10px] text-[var(--ramp-grey-400)]"
                    style={{
                      [isHorizontal ? "left" : "top"]: "50%",
                      [isHorizontal ? "top" : "left"]: 2,
                      writingMode: isHorizontal
                        ? "horizontal-tb"
                        : "vertical-rl",
                      transform: isHorizontal
                        ? "translateX(-50%)"
                        : "translateY(-50%) rotate(180deg)",
                      lineHeight: 1,
                      fontFamily: "Inter, sans-serif",
                      fontSize: "10px",
                      fontWeight: 400,
                    }}
                  >
                    {label}
                  </div>
                )}
              </div>
            );
          } else {
            // Minor tick mark
            return null;
          }
        })}
      </div>

      {/* Corner square - only render once for horizontal ruler */}
      {isHorizontal && (
        <div
          className="absolute top-0 w-5 h-5 bg-white backdrop-blur-sm pointer-events-none border-r border-b border-gray-200"
          style={{
            left: `${offset}px`,
            zIndex: 60,
          }}
        />
      )}
    </>
  );
}
