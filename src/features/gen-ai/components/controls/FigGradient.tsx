"use client";

import { useRef, useEffect } from "react";

export interface GradientStop {
  id: string;
  position: number;
  color: string;
}

interface FigGradientProps {
  label: string;
  value: GradientStop[];
  onChange: (value: GradientStop[]) => void;
}

function stopsToFillValue(stops: GradientStop[]): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const gradientStops = sorted.map((s) => ({
    color: s.color,
    position: s.position,
  }));
  return JSON.stringify({
    type: "gradient",
    gradient: {
      type: "linear",
      angle: 90,
      stops: gradientStops,
    },
  });
}

function fillValueToStops(raw: string): GradientStop[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.gradient?.stops && Array.isArray(parsed.gradient.stops)) {
      return parsed.gradient.stops.map((s: { color: string; position: number }, i: number) => ({
        id: `stop-${i}`,
        position: s.position,
        color: s.color,
      }));
    }
  } catch {
    // not JSON
  }
  return null;
}

export function FigGradient({ value, onChange }: FigGradientProps) {
  const ref = useRef<HTMLElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      const raw = (e as CustomEvent).detail ?? (e.target as HTMLElement & { value: string }).value;
      const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw);
      const stops = fillValueToStops(rawStr);
      if (stops) onChangeRef.current(stops);
    };
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, []);

  const fillVal = stopsToFillValue(value);

  useEffect(() => {
    const el = ref.current;
    if (el) el.setAttribute("value", fillVal);
  }, [fillVal]);

  return <fig-input-fill ref={ref} value={fillVal} />;
}
