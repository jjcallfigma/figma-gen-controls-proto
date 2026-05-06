"use client";

import { useCallback } from "react";
import { toast } from "sonner";

interface PaletteOption {
  value: string;
  label: string;
  colors: string[];
}

interface FigPaletteCarouselProps {
  value: string;
  onChange: (value: string) => void;
  options: PaletteOption[];
  toastMessage?: string;
}

const CHEVRON_LEFT = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.23223 5.52512C9.03697 5.32986 8.72046 5.32986 8.5252 5.52512L6.40411 7.64622C6.20885 7.84148 6.20885 8.15799 6.40411 8.35325L8.5252 10.4753C8.7204 10.6702 9.03703 10.6702 9.23223 10.4753C9.42749 10.2801 9.42749 9.96257 9.23223 9.76731L7.46465 7.99973L9.23223 6.23216C9.42749 6.03689 9.42749 5.72039 9.23223 5.52512Z" fill="currentColor" fill-opacity="0.5"/></svg>`;

const CHEVRON_RIGHT = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.76777 5.52512C6.96303 5.32986 7.27954 5.32986 7.4748 5.52512L9.59589 7.64622C9.79115 7.84148 9.79115 8.15799 9.59589 8.35325L7.4748 10.4753C7.2796 10.6702 6.96297 10.6702 6.76777 10.4753C6.57251 10.2801 6.57251 9.96257 6.76777 9.76731L8.53535 7.99973L6.76777 6.23216C6.57251 6.03689 6.57251 5.72039 6.76777 5.52512Z" fill="currentColor" fill-opacity="0.5"/></svg>`;

export function FigPaletteCarousel({
  value,
  onChange,
  options,
  toastMessage,
}: FigPaletteCarouselProps) {
  const currentIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[currentIndex];

  const goPrev = useCallback(() => {
    const prev = (currentIndex - 1 + options.length) % options.length;
    onChange(options[prev].value);
  }, [currentIndex, options, onChange]);

  const goNext = useCallback(() => {
    const next = (currentIndex + 1) % options.length;
    onChange(options[next].value);
  }, [currentIndex, options, onChange]);

  const handleAdd = useCallback(() => {
    if (toastMessage) toast.success(toastMessage);
  }, [toastMessage]);

  const colors = current?.colors ?? [];
  const stripeHeight = 28;

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Color stripes */}
      <div
        style={{
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid var(--color-border, #E6E6E6)",
        }}
      >
        {colors.map((color, i) => (
          <div
            key={i}
            style={{
              height: stripeHeight,
              backgroundColor: color,
            }}
          />
        ))}
      </div>

      {/* Navigation + Add button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: "1px solid var(--color-border, #D4D4D4)",
          borderRadius: 5,
          overflow: "hidden",
          height: 24,
        }}
      >
        <button
          onClick={goPrev}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            width: 24,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text, #333)",
            flexShrink: 0,
          }}
          dangerouslySetInnerHTML={{ __html: CHEVRON_LEFT }}
        />
        <button
          onClick={handleAdd}
          style={{
            background: "none",
            border: "none",
            borderLeft: "1px solid var(--color-border, #D4D4D4)",
            borderRight: "1px solid var(--color-border, #D4D4D4)",
            cursor: "pointer",
            flex: 1,
            fontSize: 11,
            fontWeight: 500,
            color: "var(--color-text, #333)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            height: "100%",
          }}
        >
          Add mode 
        </button>
        <button
          onClick={goNext}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            width: 24,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text, #333)",
            flexShrink: 0,
          }}
          dangerouslySetInnerHTML={{ __html: CHEVRON_RIGHT }}
        />
      </div>
    </div>
  );
}
