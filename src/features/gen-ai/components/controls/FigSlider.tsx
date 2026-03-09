"use client";

import { useRef, useEffect } from "react";

interface FigSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function FigSlider({ value, onChange, min = 0, max = 100, step = 1 }: FigSliderProps) {
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
    <fig-slider
      ref={ref}
      min={String(min)}
      max={String(max)}
      step={String(step)}
      value={String(value)}
      text="true"
    />
  );
}
