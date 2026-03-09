"use client";

import { useRef, useEffect } from "react";

interface FigSegmentedProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

export function FigSegmented({ value, onChange, options }: FigSegmentedProps) {
  const ref = useRef<HTMLElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      const v = (e as CustomEvent).detail ?? (e.target as HTMLElement & { value: string }).value;
      if (typeof v === "string") onChangeRef.current(v);
    };
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el) el.setAttribute("value", value);
  }, [value]);

  return (
    <fig-segmented-control ref={ref} value={value}>
      {options.map((o) => (
        <fig-segment key={o.value} value={o.value}>
          {o.label}
        </fig-segment>
      ))}
    </fig-segmented-control>
  );
}
