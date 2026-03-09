"use client";

import { useRef, useEffect } from "react";

interface FigRangeProps {
  label: string;
  value: { low: number; high: number };
  onChange: (value: { low: number; high: number }) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function FigRange({ value, onChange, min = 0, max = 100, step = 1 }: FigRangeProps) {
  const lowRef = useRef<HTMLElement>(null);
  const highRef = useRef<HTMLElement>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;

  useEffect(() => {
    const lowEl = lowRef.current;
    const highEl = highRef.current;
    if (!lowEl || !highEl) return;

    const lowHandler = (e: Event) => {
      const v = parseFloat((e.target as HTMLElement & { value: string }).value);
      if (!isNaN(v)) {
        onChangeRef.current({
          low: Math.min(v, valueRef.current.high),
          high: valueRef.current.high,
        });
      }
    };
    const highHandler = (e: Event) => {
      const v = parseFloat((e.target as HTMLElement & { value: string }).value);
      if (!isNaN(v)) {
        onChangeRef.current({
          low: valueRef.current.low,
          high: Math.max(v, valueRef.current.low),
        });
      }
    };

    lowEl.addEventListener("input", lowHandler);
    highEl.addEventListener("input", highHandler);
    return () => {
      lowEl.removeEventListener("input", lowHandler);
      highEl.removeEventListener("input", highHandler);
    };
  }, []);

  useEffect(() => {
    if (lowRef.current) lowRef.current.setAttribute("value", String(value.low));
    if (highRef.current) highRef.current.setAttribute("value", String(value.high));
  }, [value.low, value.high]);

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <fig-slider
        ref={lowRef}
        value={String(value.low)}
        min={String(min)}
        max={String(max)}
        step={String(step)}
        text="true"
        style={{ flex: 1 }}
      />
      <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>–</span>
      <fig-slider
        ref={highRef}
        value={String(value.high)}
        min={String(min)}
        max={String(max)}
        step={String(step)}
        text="true"
        style={{ flex: 1 }}
      />
    </div>
  );
}
