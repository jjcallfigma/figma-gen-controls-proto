"use client";

import { useRef, useEffect, useCallback } from "react";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleRef = useCallback((div: HTMLDivElement | null) => {
    containerRef.current = div;
    if (!div || colorRef.current) return;

    const el = document.createElement("fig-input-color");
    el.setAttribute("text", "true");
    el.setAttribute("alpha", "true");
    el.setAttribute("picker", "figma");
    el.setAttribute("value", value);
    div.appendChild(el);
    colorRef.current = el;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.color) {
        onChangeRef.current(detail.color);
      } else {
        const v = detail ?? (e.target as HTMLElement & { value: string }).value;
        if (typeof v === "string") onChangeRef.current(v);
      }
    };
    el.addEventListener("change", handler);
    el.addEventListener("input", handler);
  }, []);

  useEffect(() => {
    const el = colorRef.current;
    if (el) el.setAttribute("value", value);
  }, [value]);

  return <div ref={handleRef} style={{ display: "contents" }} />;
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
