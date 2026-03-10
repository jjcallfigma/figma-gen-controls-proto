"use client";

import { useRef, useEffect } from "react";

interface FigAngleProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function FigAngle({ value, onChange, min = -180, max = 180 }: FigAngleProps) {
  const ref = useRef<HTMLElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const safeValue = typeof value === "number" && isFinite(value) ? value : 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      const v = parseFloat((e.target as HTMLElement & { value: string }).value);
      if (!isNaN(v)) onChangeRef.current(v);
    };
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el) el.setAttribute("value", String(safeValue));
  }, [safeValue]);

  return (
    <fig-input-angle
      ref={ref}
      value={String(safeValue)}
      min={String(min)}
      max={String(max)}
      text="true"
    />
  );
}
