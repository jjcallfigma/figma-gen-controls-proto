"use client";

import { useRef, useEffect } from "react";

type SelectOption = string | { value: string; label: string };

interface FigSelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

function normalize(opt: SelectOption): { value: string; label: string } {
  return typeof opt === "string" ? { value: opt, label: opt } : opt;
}

export function FigSelect({ value, options, onChange }: FigSelectProps) {
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

  const normalized = options.map(normalize);

  return (
    <fig-dropdown ref={ref} value={value}>
      {normalized.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </fig-dropdown>
  );
}
