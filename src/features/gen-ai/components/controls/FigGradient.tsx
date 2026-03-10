"use client";

import { useCallback, useRef, useState } from "react";
import PropertyPopover from "@/components/ui/PropertyPopover";
import ColorPickerContent from "@/components/ui/ColorPickerContent";
import { Icon24CloseSmall } from "@/components/icons/icon-24-close-small";
import { Icon24FillSolidSmall } from "@/components/icons/icon-24-fill-solid-small";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

function normalizeHex(hex: string): string {
  if (!hex.startsWith("#")) hex = "#" + hex;
  if (hex.length === 4) {
    hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex.toUpperCase();
}

function buildGradientCSS(stops: GradientStop[]): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const parts = sorted.map((s) => `${normalizeHex(s.color)} ${Math.round(s.position * 100)}%`);
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

function StopRow({
  stop,
  onColorChange,
  onPositionChange,
  onRemove,
  canRemove,
}: {
  stop: GradientStop;
  onColorChange: (color: string) => void;
  onPositionChange: (position: number) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const hex = normalizeHex(stop.color);

  const handleOpen = useCallback(() => {
    if (swatchRef.current) {
      const rect = swatchRef.current.getBoundingClientRect();
      setPosition({ x: rect.left - 248, y: rect.top });
    }
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <div className="flex items-center gap-1.5" style={{ fontSize: 11 }}>
        <input
          type="number"
          min={0}
          max={100}
          value={Math.round(stop.position * 100)}
          onChange={(e) => onPositionChange(Math.min(1, Math.max(0, parseInt(e.target.value, 10) / 100)))}
          className="w-10 text-right tabular-nums bg-transparent border-none outline-none"
          style={{ fontSize: 11, color: "var(--color-text)", padding: "2px 0" }}
        />
        <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>%</span>

        <button
          ref={swatchRef}
          onClick={handleOpen}
          className="rounded-[3px] border border-black/10 flex-shrink-0 cursor-pointer"
          style={{ width: 16, height: 16, backgroundColor: hex, padding: 0 }}
        />

        <span className="flex-1 truncate" style={{ fontSize: 11, color: "var(--color-text)" }}>
          {hex.replace("#", "")}
        </span>

        {canRemove && (
          <button
            onClick={onRemove}
            className="flex-shrink-0 hover:text-red-500"
            style={{ fontSize: 11, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            &minus;
          </button>
        )}
      </div>

      <PropertyPopover
        isOpen={isOpen}
        onClose={handleClose}
        position={position}
        onPositionChange={setPosition}
        width={240}
      >
        <div
          className="flex items-center justify-between pr-2 pl-1 py-2 border-b popover-header"
          data-draggable="true"
        >
          <Tabs defaultValue="custom">
            <TabsList>
              <TabsTrigger value="custom">Custom</TabsTrigger>
              <TabsTrigger value="libraries">Libraries</TabsTrigger>
            </TabsList>
          </Tabs>
          <button
            onClick={handleClose}
            className="w-6 h-6 rounded-[5px] hover:bg-secondary flex items-center justify-center"
          >
            <Icon24CloseSmall />
          </button>
        </div>

        <div
          className="flex items-center justify-between p-2 border-b"
          data-draggable="true"
        >
          <div className="flex gap-1">
            <button className="text-xs rounded-[5px] bg-secondary">
              <Icon24FillSolidSmall />
            </button>
          </div>
        </div>

        <ColorPickerContent
          color={hex}
          opacity={1}
          onColorChange={onColorChange}
          showOpacity={false}
        />
      </PropertyPopover>
    </>
  );
}

export function FigGradient({ value, onChange }: FigGradientProps) {
  const sorted = [...value].sort((a, b) => a.position - b.position);

  const handleStopColor = (idx: number, color: string) => {
    const next = [...value];
    next[idx] = { ...next[idx], color };
    onChange(next);
  };

  const handleStopPosition = (idx: number, position: number) => {
    const next = [...value];
    next[idx] = { ...next[idx], position };
    onChange(next);
  };

  const handleRemove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const handleAdd = () => {
    const last = sorted[sorted.length - 1];
    const newStop: GradientStop = {
      id: `stop-${Date.now()}`,
      position: Math.min(1, (last?.position ?? 0) + 0.1),
      color: last?.color ?? "#000000",
    };
    onChange([...value, newStop]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Gradient preview bar */}
      <div
        className="rounded-[5px] border border-black/10"
        style={{
          height: 24,
          background: buildGradientCSS(sorted),
          width: "100%",
        }}
      />

      {/* Stops header */}
      <div className="flex items-center justify-between" style={{ fontSize: 11 }}>
        <span style={{ color: "var(--color-text-secondary)" }}>Stops</span>
        <button
          onClick={handleAdd}
          className="hover:text-blue-500"
          style={{ fontSize: 14, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
        >
          +
        </button>
      </div>

      {/* Stop rows */}
      {sorted.map((stop) => {
        const origIdx = value.indexOf(stop);
        return (
          <StopRow
            key={stop.id}
            stop={stop}
            onColorChange={(c) => handleStopColor(origIdx, c)}
            onPositionChange={(p) => handleStopPosition(origIdx, p)}
            onRemove={() => handleRemove(origIdx)}
            canRemove={value.length > 2}
          />
        );
      })}
    </div>
  );
}
