"use client";

import { useCallback } from "react";

type GridOption = {
  value: string;
  label: string;
  svg: string;
};

interface FigGridSelectorProps {
  value: string;
  onChange: (value: string) => void;
  options: GridOption[];
  columns?: 3 | 2;
}

const CELL_SIZE = 32;
const COL_GAP = 4;
const ROW_GAP = 6;

export function FigGridSelector({
  value,
  onChange,
  options,
  columns = 3,
}: FigGridSelectorProps) {
  const handleSelect = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
    },
    [onChange],
  );

  const gridWidth = columns * CELL_SIZE + (columns - 1) * COL_GAP;

  const stopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  }, []);

  return (
    <div
      onMouseDown={stopPropagation}
      onMouseUp={stopPropagation}
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      onPointerUp={stopPropagation}
      style={{
        display: "grid",
        placeContent: "center",
        width: "100%",
        backgroundColor: "var(--color-bg-secondary, #F5F5F5)",
        borderRadius: 5,
        padding: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: `${ROW_GAP}px ${COL_GAP}px`,
          width: gridWidth,
        }}
      >
        {options.slice(0, 6).map((opt) => {
          const isSelected = value === opt.value;

          return (
            <button
              key={opt.value}
              type="button"
              aria-label={opt.label}
              aria-pressed={isSelected}
              onClick={() => handleSelect(opt.value)}
              className="fig-grid-cell"
              data-selected={isSelected || undefined}
              style={{
                "--gs-stroke": isSelected ? "#0D99FF" : "var(--color-border, #E6E6E6)",
                "--gs-stroke-width": isSelected ? "0.5" : "1",
                "--gs-fill": isSelected ? "#E5F4FF" : "#DCDCDC",
                width: CELL_SIZE,
                height: CELL_SIZE,
                padding: 0,
                border: "none",
                background: "none",
                cursor: "pointer",
                flexShrink: 0,
              } as React.CSSProperties}
              dangerouslySetInnerHTML={{ __html: opt.svg }}
            />
          );
        })}
      </div>
    </div>
  );
}
