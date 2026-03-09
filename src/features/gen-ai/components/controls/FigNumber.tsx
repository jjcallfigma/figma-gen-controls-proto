"use client";

import { useRef, useEffect } from "react";

interface FigNumberProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function FigNumber({ value, onChange, min, max, step = 1 }: FigNumberProps) {
  const ref = useRef<HTMLElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
    if (el) el.setAttribute("value", String(value));
  }, [value]);

  return (
    <fig-input-number
      ref={ref}
      value={String(value)}
      min={min != null ? String(min) : undefined}
      max={max != null ? String(max) : undefined}
      step={String(step)}
    />
  );
}
