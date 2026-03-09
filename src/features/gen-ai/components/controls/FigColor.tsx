"use client";

import { useRef, useEffect } from "react";

interface ColorStop {
  id: string;
  label: string;
  defaultValue?: string;
}

interface FigColorProps {
  label: string;
  value: string | Record<string, string>;
  onChange: (value: string | Record<string, string>) => void;
  colors?: ColorStop[];
}

function SingleColor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
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

  return <fig-input-color ref={ref} value={value} text="true" />;
}

export function FigColor({ value, onChange, colors }: FigColorProps) {
  if (colors && Array.isArray(colors) && colors.length > 0) {
    const record = value as Record<string, string>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {colors.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", minWidth: 40 }}>
              {c.label}
            </span>
            <SingleColor
              value={record[c.id] ?? c.defaultValue ?? "#000000"}
              onChange={(hex) => {
                onChange({ ...record, [c.id]: hex });
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <SingleColor
      value={value as string}
      onChange={(hex) => onChange(hex)}
    />
  );
}
