"use client";

import { useRef, useEffect, useCallback } from "react";

export interface GradientStop {
  id: string;
  position: number;
  color: string;
}

export interface FillValue {
  stops: GradientStop[];
  gradientType: string;
  angle: number;
}

interface FigGradientProps {
  label: string;
  value: GradientStop[] | FillValue;
  onChange: (value: FillValue) => void;
}

interface GradientMeta {
  type: string;
  angle: number;
}

function stopsToFillValue(stops: GradientStop[], meta: GradientMeta): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const gradientStops = sorted.map((s) => ({
    color: s.color,
    position: s.position <= 1 ? Math.round(s.position * 100) : s.position,
    opacity: 100,
  }));
  return JSON.stringify({
    type: "gradient",
    gradient: {
      type: meta.type,
      angle: meta.angle,
      stops: gradientStops,
    },
  });
}

function parseFillValue(raw: unknown): { stops: GradientStop[]; meta: GradientMeta } | null {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed?.gradient?.stops && Array.isArray(parsed.gradient.stops)) {
      const stops = parsed.gradient.stops.map(
        (s: { color: string; position: number }, i: number) => ({
          id: `stop-${i}`,
          position: s.position > 1 ? s.position / 100 : s.position,
          color: s.color,
        })
      );
      const meta: GradientMeta = {
        type: parsed.gradient.type ?? "linear",
        angle: parsed.gradient.angle ?? 90,
      };
      return { stops, meta };
    }
  } catch {
    // not JSON
  }
  return null;
}

const DEFAULT_META: GradientMeta = { type: "linear", angle: 90 };

function normalizeValue(value: GradientStop[] | FillValue): { stops: GradientStop[]; meta: GradientMeta } {
  if (Array.isArray(value)) {
    return { stops: value, meta: DEFAULT_META };
  }
  return {
    stops: value.stops,
    meta: { type: value.gradientType, angle: value.angle },
  };
}

export function FigGradient({ value, onChange }: FigGradientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const metaRef = useRef<GradientMeta>(DEFAULT_META);

  const { stops: currentStops, meta: currentMeta } = normalizeValue(value);
  if (currentMeta.type !== DEFAULT_META.type || currentMeta.angle !== DEFAULT_META.angle) {
    metaRef.current = currentMeta;
  }

  const fillVal = stopsToFillValue(currentStops, metaRef.current);

  const handleRef = useCallback((div: HTMLDivElement | null) => {
    containerRef.current = div;
    if (!div || fillRef.current) return;

    const el = document.createElement("fig-input-fill");
    el.setAttribute("value", fillVal);
    div.appendChild(el);
    fillRef.current = el;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const raw = detail ?? (e.target as HTMLElement & { value: unknown }).value;
      const result = parseFillValue(raw);
      if (result) {
        metaRef.current = result.meta;
        onChangeRef.current({
          stops: result.stops,
          gradientType: result.meta.type,
          angle: result.meta.angle,
        });
      }
    };
    el.addEventListener("change", handler);
    el.addEventListener("input", handler);
  }, []);

  useEffect(() => {
    const el = fillRef.current;
    if (el) el.setAttribute("value", fillVal);
  }, [fillVal]);

  return <div ref={handleRef} style={{ display: "contents" }} />;
}
