"use client";

import { useRef, useEffect } from "react";

interface FigToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function FigToggle({ checked, onChange }: FigToggleProps) {
  const ref = useRef<HTMLElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement & { checked: boolean };
      onChangeRef.current(target.checked);
    };
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (checked) {
      el.setAttribute("checked", "");
    } else {
      el.removeAttribute("checked");
    }
  }, [checked]);

  return <fig-switch ref={ref} checked={checked ? "" : undefined} />;
}
