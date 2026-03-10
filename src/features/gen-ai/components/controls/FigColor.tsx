"use client";

import React, { useCallback, useRef, useState } from "react";
import PropertyPopover from "@/components/ui/PropertyPopover";
import ColorPickerContent from "@/components/ui/ColorPickerContent";
import { Icon24CloseSmall } from "@/components/icons/icon-24-close-small";
import { Icon24FillSolidSmall } from "@/components/icons/icon-24-fill-solid-small";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Color from "color";

interface ColorStop {
  id: string;
  label: string;
  defaultValue?: string;
}

interface FigColorProps {
  label: string;
  value: string | Record<string, string>;
  onChange: (value: string | Record<string, string>) => void;
  colors?: ColorStop[];
}

function normalizeHex(hex: string): string {
  if (!hex.startsWith("#")) hex = "#" + hex;
  if (hex.length === 4) {
    hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex.toUpperCase();
}

function parseColorInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return Color(trimmed.startsWith("#") ? trimmed : "#" + trimmed)
      .hex()
      .toUpperCase();
  } catch {
    try {
      return Color(trimmed).hex().toUpperCase();
    } catch {
      return null;
    }
  }
}

function SingleColor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const hex = normalizeHex(value);
  const displayHex = hex.replace("#", "");

  const [hexInput, setHexInput] = useState(displayHex);
  const [opacityInput, setOpacityInput] = useState("100");
  const [hexFocused, setHexFocused] = useState(false);

  React.useEffect(() => {
    if (!hexFocused) {
      const newDisplay = normalizeHex(value).replace("#", "");
      if (newDisplay !== hexInput) setHexInput(newDisplay);
    }
  }, [value, hexFocused]);

  const handleOpen = useCallback(() => {
    if (swatchRef.current) {
      const rect = swatchRef.current.getBoundingClientRect();
      setPosition({ x: rect.left - 248, y: rect.top });
    }
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => setIsOpen(false), []);

  const handleHexBlur = () => {
    setHexFocused(false);
    const parsed = parseColorInput(hexInput);
    if (parsed) {
      setHexInput(parsed.replace("#", ""));
      onChange(parsed);
    } else {
      setHexInput(displayHex);
    }
  };

  const handleHexKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  return (
    <>
      {/* Fill-trigger-style row: swatch | hex input | opacity input | % */}
      <div className="flex w-full items-center rounded-[5px] border border-transparent bg-secondary pl-[5px] h-6 overflow-hidden focus-within:border-selected hover:focus-within:border-selected hover:border-default">
        <button
          ref={swatchRef}
          onClick={handleOpen}
          className="h-[14px] w-[14px] rounded-[3px] outline outline-1 outline-[--color-bordertranslucent] outline-offset-[-1px] shrink-0 cursor-default"
          style={{ backgroundColor: hex }}
        />
        <input
          type="text"
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onFocus={(e) => { setHexFocused(true); e.target.select(); }}
          onBlur={handleHexBlur}
          onKeyDown={handleHexKeyDown}
          className="h-6 px-2 w-full text-[11px] bg-transparent focus:outline-none"
          placeholder="FF0000"
        />
        <input
          type="text"
          value={opacityInput}
          onChange={(e) => setOpacityInput(e.target.value)}
          className="h-6 pl-2 w-[38px] text-[11px] border-l border-[var(--color-bg)] bg-transparent focus:outline-none text-ellipsis"
          placeholder="100"
        />
        <span className="text-xs text-secondary w-[14px] shrink-0">%</span>
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
          onColorChange={onChange}
          showOpacity={false}
        />
      </PropertyPopover>
    </>
  );
}

export function FigColor({ value, onChange, colors }: FigColorProps) {
  if (colors && Array.isArray(colors) && colors.length > 0) {
    const record = value as Record<string, string>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {colors.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", minWidth: 40 }}>
              {c.label}
            </span>
            <SingleColor
              value={record[c.id] ?? c.defaultValue ?? "#000000"}
              onChange={(hex) => {
                onChange({ ...record, [c.id]: hex });
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <SingleColor
      value={value as string}
      onChange={(hex) => onChange(hex)}
    />
  );
}
