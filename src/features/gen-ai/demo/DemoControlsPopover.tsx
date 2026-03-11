"use client";

import { useState, useCallback, useEffect } from "react";
import type { UISpec, UIControl } from "../types";
import PropertyPopover from "@/components/ui/PropertyPopover";
import PropertyPopoverHeader from "@/components/ui/PropertyPopoverHeader";
import "../components/figui3-scoped.css";
import {
  Slider,
  Toggle,
  Select,
  ColorSwatch,
  TextInput,
  NumberInput,
  SegmentedControl,
  AngleWheel,
  XYPad,
  RangeSlider,
  GradientBar,
  CurveEditor,
  CubePreview,
} from "../components/controls";

if (typeof window !== "undefined") {
  import("@rogieking/figui3");
}

const POPOVER_WIDTH = 240;

const FULL_WIDTH_TYPES = new Set(["3d-preview", "curve", "gradient-bar", "fill", "xy-pad", "range"]);

function FieldRow({
  label,
  children,
  fullWidth = false,
}: {
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  if (fullWidth) {
    return (
      <div className="flex flex-col gap-1 px-4 py-1">
        <span className="text-[11px] h-6 flex items-center truncate" style={{ fontWeight: 450, color: "var(--color-text-secondary)", letterSpacing: "0.055px" }}>
          {label}
        </span>
        {children}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-4 py-1">
      <span className="flex-1 text-[11px] h-6 flex items-center truncate min-w-0" style={{ fontWeight: 450, color: "var(--color-text-secondary)", letterSpacing: "0.055px" }}>
        {label}
      </span>
      <div className="flex items-center shrink-0 overflow-hidden" style={{ width: 132 }}>
        {children}
      </div>
    </div>
  );
}

function getDefaultValue(control: UIControl): unknown {
  const props = control.props ?? {};
  switch (control.type) {
    case "slider":
    case "number":
      return props.defaultValue ?? props.min ?? 0;
    case "toggle":
      return props.defaultValue ?? false;
    case "select":
    case "segmented":
      return props.defaultValue ?? (Array.isArray(props.options) ? props.options[0] : "");
    case "color":
      if (Array.isArray(props.colors)) {
        const result: Record<string, string> = {};
        for (const c of props.colors as { id: string; defaultValue?: string }[]) {
          result[c.id] = c.defaultValue ?? "#000000";
        }
        return result;
      }
      return props.defaultValue ?? "#000000";
    case "text":
      return props.defaultValue ?? "";
    case "dial":
      return props.defaultValue ?? 0;
    case "xy-pad":
      return props.defaultValue ?? { x: 0, y: 0 };
    case "range":
      return props.defaultValue ?? { low: 0, high: 100 };
    case "gradient-bar":
    case "fill":
      return props.stops ?? [];
    case "curve":
      return props.defaultValue ?? [0.42, 0, 0.58, 1];
    case "3d-preview":
      return props.defaultValue ?? { rx: 0, ry: 0, rz: 0 };
    default:
      return props.defaultValue;
  }
}

export default function DemoControlsPopover() {
  const [spec, setSpec] = useState<UISpec | null>(null);
  const [title, setTitle] = useState("Controls");
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [values, setValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ spec: UISpec; label: string }>).detail;
      setSpec(detail.spec);
      setTitle(detail.label);
      setIsOpen(true);

      const x = window.innerWidth - 260 - POPOVER_WIDTH - 16;
      const y = 80;
      setPosition({ x, y });

      const defaults: Record<string, unknown> = {};
      for (const c of detail.spec.controls) {
        defaults[c.id] = getDefaultValue(c);
      }
      setValues(defaults);
    };

    window.addEventListener("demo-controls-open", handler);
    return () => window.removeEventListener("demo-controls-open", handler);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSpec(null);
  }, []);

  const handleChange = useCallback((controlId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [controlId]: value }));
  }, []);

  if (!spec) return null;

  return (
    <PropertyPopover
      isOpen={isOpen}
      onClose={handleClose}
      position={position}
      onPositionChange={setPosition}
      width={POPOVER_WIDTH}
    >
      <PropertyPopoverHeader title={title} onClose={handleClose} />

      <div className="figui3-scope overflow-y-auto overflow-x-hidden py-2" style={{ maxHeight: 500 }}>
        <div className="flex flex-col">
          {spec.controls.map((control) => (
            <FieldRow key={control.id} label={control.label || control.id} fullWidth={FULL_WIDTH_TYPES.has(control.type)}>
              {renderControl(control, values[control.id] ?? getDefaultValue(control), (val) =>
                handleChange(control.id, val),
              )}
            </FieldRow>
          ))}
        </div>
      </div>
    </PropertyPopover>
  );
}

function renderControl(
  control: UIControl,
  value: unknown,
  onChange: (val: unknown) => void,
) {
  const props = control.props ?? {};
  const label = control.label || control.id;

  switch (control.type) {
    case "slider":
      return (
        <Slider
          label={label}
          value={value as number}
          onChange={onChange as (v: number) => void}
          min={props.min as number ?? 0}
          max={props.max as number ?? 100}
          step={props.step as number ?? 1}
        />
      );
    case "toggle":
      return (
        <Toggle
          label={label}
          checked={value as boolean}
          onChange={onChange as (v: boolean) => void}
        />
      );
    case "select":
      return (
        <Select
          label={label}
          value={value as string}
          onChange={onChange as (v: string) => void}
          options={props.options as string[]}
        />
      );
    case "color":
      return (
        <ColorSwatch
          label={label}
          value={value as string | Record<string, string>}
          onChange={onChange as (v: string | Record<string, string>) => void}
          colors={props.colors as { id: string; label: string; defaultValue?: string }[]}
        />
      );
    case "text":
      return (
        <TextInput
          label={label}
          value={value as string}
          onChange={onChange as (v: string) => void}
          placeholder={props.placeholder as string}
        />
      );
    case "number":
      return (
        <NumberInput
          label={label}
          value={value as number}
          onChange={onChange as (v: number) => void}
          min={props.min as number}
          max={props.max as number}
          step={props.step as number ?? 1}
        />
      );
    case "segmented":
      return (
        <SegmentedControl
          value={value as string}
          onChange={onChange as (v: string) => void}
          options={props.options as { value: string; label: string }[]}
        />
      );
    case "dial":
      return (
        <AngleWheel
          label={label}
          value={value as number}
          onChange={onChange as (v: number) => void}
          min={props.min as number ?? -180}
          max={props.max as number ?? 180}
          step={props.step as number ?? 1}
        />
      );
    case "xy-pad":
      return (
        <XYPad
          label={label}
          value={value as { x: number; y: number }}
          onChange={onChange as (v: { x: number; y: number }) => void}
          minX={props.minX as number ?? -50}
          maxX={props.maxX as number ?? 50}
          minY={props.minY as number ?? -50}
          maxY={props.maxY as number ?? 50}
          stepX={props.stepX as number ?? 1}
          stepY={props.stepY as number ?? 1}
          coordinates={props.coordinates as "screen" | "math" | undefined}
          aspectRatio={props.aspectRatio as string | undefined}
          axisLabels={props.axisLabels as string | undefined}
        />
      );
    case "range":
      return (
        <RangeSlider
          label={label}
          value={value as { low: number; high: number }}
          onChange={onChange as (v: { low: number; high: number }) => void}
          min={props.min as number ?? 0}
          max={props.max as number ?? 100}
          step={props.step as number ?? 1}
        />
      );
    case "gradient-bar":
    case "fill":
      return (
        <GradientBar
          label={label}
          value={value as { id: string; position: number; color: string }[]}
          onChange={onChange}
        />
      );
    case "curve":
      return (
        <CurveEditor
          label={label}
          value={value as [number, number, number, number]}
          onChange={onChange as (v: [number, number, number, number]) => void}
        />
      );
    case "3d-preview": {
      const v3d = value as { rx: number; ry: number; rz?: number };
      return (
        <CubePreview
          rx={v3d.rx ?? 0}
          ry={v3d.ry ?? 0}
          rz={v3d.rz ?? 0}
          onRotate={(rx, ry) => onChange({ rx, ry, rz: v3d.rz ?? 0 })}
        />
      );
    }
    default:
      return (
        <div className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
          Unsupported: {control.type}
        </div>
      );
  }
}
