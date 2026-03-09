"use client";

import { useRef, useEffect } from "react";

interface Fig3DRotateProps {
  rx: number;
  ry: number;
  rz?: number;
  onRotate: (rx: number, ry: number) => void;
}

function toTransformString(rx: number, ry: number, rz: number): string {
  return `rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg)`;
}

export function Fig3DRotate({ rx, ry, rz = 0, onRotate }: Fig3DRotateProps) {
  const ref = useRef<HTMLElement>(null);
  const onRotateRef = useRef(onRotate);
  onRotateRef.current = onRotate;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.rotateX === "number" && typeof detail.rotateY === "number") {
        onRotateRef.current(Math.round(detail.rotateX), Math.round(detail.rotateY));
      }
    };
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, []);

  const transformVal = toTransformString(rx, ry, rz);

  useEffect(() => {
    const el = ref.current;
    if (el) el.setAttribute("value", transformVal);
  }, [transformVal]);

  return (
    <fig-3d-rotate
      ref={ref}
      value={transformVal}
      fields="rotateX,rotateY,rotateZ"
      precision="1"
    />
  );
}
