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
}

export function FigJoystick({
  value,
  onChange,
  minX = -50,
  maxX = 50,
  minY = -50,
  maxY = 50,
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
      const raw = (e.target as any).value;
      let parts: number[] | null = null;

      if (typeof raw === "string") {
        parts = raw.split(",").map((s: string) => parseFloat(s.trim()));
      } else if (Array.isArray(raw)) {
        parts = raw.map(Number);
      } else if (raw && typeof raw === "object" && "x" in raw && "y" in raw) {
        parts = [Number(raw.x), Number(raw.y)];
      } else if (typeof raw === "number") {
        parts = [raw, raw];
      }

      if (parts && parts.length >= 2 && parts.every((n) => !isNaN(n))) {
        const { minX: mnx, maxX: mxx, minY: mny, maxY: mxy } = rangeRef.current;
        onChangeRef.current({
          x: mnx + parts[0] * (mxx - mnx),
          y: mny + parts[1] * (mxy - mny),
        });
      }
    };
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, []);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const normX = ((value.x - minX) / rangeX).toFixed(3);
  const normY = ((value.y - minY) / rangeY).toFixed(3);

  useEffect(() => {
    const el = ref.current;
    if (el) el.setAttribute("value", `${normX},${normY}`);
  }, [normX, normY]);

  return (
    <fig-input-joystick
      ref={ref}
      value={`${normX},${normY}`}
      precision="3"
      text="true"
    />
  );
}
