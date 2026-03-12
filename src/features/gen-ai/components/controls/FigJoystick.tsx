"use client";

import { useRef, useEffect } from "react";

interface FigJoystickProps {
  label: string;
  value: { x: number; y: number };
  onChange: (value: { x: number; y: number }) => void;
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  stepX?: number;
  stepY?: number;
  coordinates?: "screen" | "math";
  aspectRatio?: string;
}

function parsePct(token: string): number {
  const numeric = parseFloat(token.replace(/%/g, "").trim());
  return Number.isFinite(numeric) ? numeric / 100 : 0.5;
}

export function FigJoystick({
  value,
  onChange,
  minX = -50,
  maxX = 50,
  minY = -50,
  maxY = 50,
  coordinates,
  aspectRatio,
}: FigJoystickProps) {
  const ref = useRef<HTMLElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const rangeRef = useRef({ minX, maxX, minY, maxY });
  rangeRef.current = { minX, maxX, minY, maxY };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      const raw = (e.target as HTMLElement & { value: string }).value;
      const parts = String(raw).split(/[\s,]+/).filter(Boolean);
      if (parts.length < 2) return;

      const normX = parsePct(parts[0]);
      const normY = parsePct(parts[1]);

      const { minX: mnx, maxX: mxx, minY: mny, maxY: mxy } = rangeRef.current;
      onChangeRef.current({
        x: mnx + normX * (mxx - mnx),
        y: mny + normY * (mxy - mny),
      });
    };
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, []);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const pctX = Math.round(((value.x - minX) / rangeX) * 100);
  const pctY = Math.round(((value.y - minY) / rangeY) * 100);
  const pctStr = `${pctX}% ${pctY}%`;

  useEffect(() => {
    const el = ref.current;
    if (el) el.setAttribute("value", pctStr);
  }, [pctStr]);

  return (
    <fig-joystick
      ref={ref}
      value={pctStr}
      fields="true"
      coordinates={coordinates}
      aspect-ratio={aspectRatio}
    />
  );
}
