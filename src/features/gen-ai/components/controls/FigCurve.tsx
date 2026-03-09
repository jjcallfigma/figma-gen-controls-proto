"use client";

import { useRef, useEffect } from "react";

interface FigCurveProps {
  label: string;
  value: [number, number, number, number];
  onChange: (value: [number, number, number, number]) => void;
}

function tupleToString(v: [number, number, number, number]): string {
  return v.map((n) => n.toFixed(2)).join(", ");
}

function stringToTuple(s: string): [number, number, number, number] | null {
  const parts = s.split(",").map((p) => parseFloat(p.trim()));
  if (parts.length >= 4 && parts.every((n) => !isNaN(n))) {
    return [parts[0], parts[1], parts[2], parts[3]];
  }
  return null;
}

export function FigCurve({ value, onChange }: FigCurveProps) {
  const ref = useRef<HTMLElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const raw = detail?.value ?? (e.target as HTMLElement & { value: string }).value;
      if (typeof raw === "string") {
        const tuple = stringToTuple(raw);
        if (tuple) onChangeRef.current(tuple);
      }
    };
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, []);

  const strVal = tupleToString(value);

  useEffect(() => {
    const el = ref.current;
    if (el) el.setAttribute("value", strVal);
  }, [strVal]);

  return (
    <fig-easing-curve
      ref={ref}
      value={strVal}
      precision="2"
      dropdown="true"
    />
  );
}
