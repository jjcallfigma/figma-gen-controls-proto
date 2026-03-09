"use client";

import { useRef, useEffect } from "react";

interface FigTextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function FigText({ value, onChange, placeholder }: FigTextProps) {
  const ref = useRef<HTMLElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      const v = (e.target as HTMLElement & { value: string }).value;
      onChangeRef.current(v);
    };
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el) el.setAttribute("value", value);
  }, [value]);

  return <fig-input-text ref={ref} value={value} placeholder={placeholder} />;
}
