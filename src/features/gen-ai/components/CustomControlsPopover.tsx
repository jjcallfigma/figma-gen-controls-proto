"use client";

import { useState, useCallback, useEffect, useRef, useMemo, type RefObject } from "react";
import { useAppStore } from "@/core/state/store";
import type { UISpec, UIControl, ActionDescriptor } from "../types";
import { compileGenerator, executeGenerator } from "../runtime/codegen";
import { executeActions, shrinkFrameToChildren } from "../adapter/action-adapter";
import "./figui3-scoped.css";
import PropertyPopover from "@/components/ui/PropertyPopover";
import PropertyPopoverHeader from "@/components/ui/PropertyPopoverHeader";
import { Icon24RewriteSmall } from "@/components/icons/icon-24-rewrite-small";
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
} from "./controls";

if (typeof window !== "undefined") {
  import("@rogieking/figui3");
}

interface Props {
  spec: UISpec;
  frameId: string;
  isOpen: boolean;
  position: { x: number; y: number };
  onPositionChange: (position: { x: number; y: number }) => void;
  protectedZoneRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}

function resolveSize(control: UIControl): "large" | "small" | "xl" {
  return control.size ?? "large";
}

const labelStyle = { fontWeight: 450, color: "var(--color-text-secondary)", letterSpacing: "0.055px" } as const;

function FieldRow({
  label,
  children,
  size = "large",
}: {
  label: string;
  children: React.ReactNode;
  size?: "large" | "small" | "xl";
}) {
  if (size === "xl") {
    return (
      <div className="flex flex-col gap-1 px-4 py-1">
        <span className="text-[11px] h-6 flex items-center truncate" style={labelStyle}>
          {label}
        </span>
        {children}
      </div>
    );
  }
  const controlWidth = size === "small" ? 100 : 132;
  return (
    <div className="flex items-start gap-2 px-4 py-1">
      <span className="flex-1 text-[11px] h-6 flex items-center truncate min-w-0 shrink-0" style={labelStyle}>
        {label}
      </span>
      <div className="flex items-center shrink-0 overflow-hidden" style={{ width: controlWidth }}>
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
      if (props.defaultValue != null) return props.defaultValue;
      return props.stops ?? [];
    case "curve":
      return props.defaultValue ?? [0.42, 0, 0.58, 1];
    case "3d-preview":
      return props.defaultValue ?? { rx: 0, ry: 0, rz: 0 };
    default:
      return props.defaultValue;
  }
}

function readFillFromCanvas(control: UIControl, frameId: string): unknown | null {
  if (control.type !== "fill" && control.type !== "gradient-bar") return null;

  const act = (control as unknown as Record<string, unknown>).action as
    | { method?: string; nodeId?: string } | undefined;
  if (!act || act.method !== "setFill") return null;

  const nodeId = act.nodeId ?? frameId;
  const objects = useAppStore.getState().objects;
  const obj = objects[nodeId] ?? objects[frameId];
  if (!obj?.fills?.length) return null;

  const fill = obj.fills[0];
  if (fill.type === "linear-gradient" && "stops" in fill && "angle" in fill) {
    const gf = fill as { stops: { position: number; color: string; opacity?: number }[]; angle: number };
    return {
      stops: gf.stops.map((s, i) => ({ id: `stop-${i}`, position: s.position, color: s.color })),
      gradientType: "linear",
      angle: gf.angle,
    };
  }
  if (fill.type === "radial-gradient" && "stops" in fill) {
    const gf = fill as { stops: { position: number; color: string; opacity?: number }[] };
    return {
      stops: gf.stops.map((s, i) => ({ id: `stop-${i}`, position: s.position, color: s.color })),
      gradientType: "radial",
      angle: 0,
    };
  }
  if (fill.type === "solid" && "color" in fill) {
    const sf = fill as { color: string };
    return {
      stops: [
        { id: "stop-0", position: 0, color: sf.color },
        { id: "stop-1", position: 1, color: sf.color },
      ],
      gradientType: "linear",
      angle: 180,
    };
  }
  return null;
}

function flattenColorStops(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      "stops" in v &&
      Array.isArray((v as Record<string, unknown>).stops)
    ) {
      const fv = v as { stops: unknown[]; gradientType?: string; angle?: number };
      out[k] = fv.stops;
      out[`${k}_type`] = fv.gradientType ?? "linear";
      out[`${k}_angle`] = fv.angle ?? 0;
      out[`${k}_fill`] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Stamps current control values into the UISpec's defaultValue fields so that
 * persisted specs restore with the user's last-applied settings.
 */
function specWithCurrentValues(spec: UISpec, values: Record<string, unknown>): UISpec {
  function updateControl(c: UIControl): UIControl {
    const val = values[c.id];
    return val !== undefined
      ? { ...c, props: { ...c.props, defaultValue: val } }
      : c;
  }
  return { ...spec, controls: spec.controls.map(updateControl) };
}

/**
 * Load control values from the spec's defaultValue fields (which are stamped
 * with current values on every change). Falls back to genAiValues and canvas
 * readback as secondary sources.
 */
function loadPersistedValues(
  controls: UIControl[],
  frameId: string,
): Record<string, unknown> {
  const obj = useAppStore.getState().objects[frameId];

  // Secondary fallback: genAiValues (kept for backward compatibility)
  let genAiValues: Record<string, unknown> = {};
  if (obj?.genAiValues) {
    try {
      genAiValues = JSON.parse(obj.genAiValues) as Record<string, unknown>;
    } catch { /* ignore */ }
  }

  const result: Record<string, unknown> = {};
  for (const c of controls) {
    const props = c.props ?? {};
    const hasStampedValue = props.defaultValue !== undefined;

    if (hasStampedValue) {
      // Primary: spec's defaultValue (stamped by specWithCurrentValues)
      result[c.id] = getDefaultValue(c);
    } else if (c.id in genAiValues) {
      // Secondary: genAiValues fallback for controls that were never stamped
      result[c.id] = genAiValues[c.id];
    } else {
      // Tertiary: canvas readback for fills, then spec defaults
      const canvasVal = readFillFromCanvas(c, frameId);
      result[c.id] = canvasVal ?? getDefaultValue(c);
    }
  }
  return result;
}

export function CustomControlsPopover({ spec, frameId, isOpen, position, onPositionChange, protectedZoneRef, onClose }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    loadPersistedValues(spec.controls, frameId),
  );

  const rerunTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only reload values when the control structure (ids + types) actually changes
  // or when the popover reopens. This prevents unnecessary resets when the spec
  // updates for non-structural reasons (e.g., label changes, generate function).
  const controlStructureKey = useMemo(
    () => spec.controls.map((c) => `${c.id}:${c.type}`).join(","),
    [spec.controls],
  );

  useEffect(() => {
    if (!isOpen) return;
    setValues(() => loadPersistedValues(spec.controls, frameId));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, controlStructureKey, frameId]);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistValues = useCallback(
    (vals: Record<string, unknown>) => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        const stamped = specWithCurrentValues(spec, vals);
        useAppStore.getState().dispatch({
          type: "object.updated",
          payload: {
            id: frameId,
            changes: {
              genAiSpec: JSON.stringify(stamped),
              genAiValues: JSON.stringify(vals),
            },
            previousValues: {},
          },
        });
      }, 500);
    },
    [frameId, spec],
  );

  const handleControlChange = useCallback(
    (controlId: string, value: unknown) => {
      setValues((prev) => {
        const next = { ...prev, [controlId]: value };

        if (rerunTimeoutRef.current) {
          clearTimeout(rerunTimeoutRef.current);
        }

        rerunTimeoutRef.current = setTimeout(() => {
          try {
            if (spec.generate) {
              const storeObjects = useAppStore.getState().objects;
              const fn = compileGenerator(spec.generate, frameId, storeObjects);
              const params = flattenColorStops(next);
              const generated = executeGenerator(fn, params);

              let rootIdx = generated.findIndex(
                (a: ActionDescriptor) => a.method === "createFrame" && !a.parentId,
              );

              // Fallback: treat any root create* as the root object
              if (rootIdx === -1) {
                rootIdx = generated.findIndex(
                  (a: ActionDescriptor) => a.method.startsWith("create") && !a.parentId,
                );
              }

              const finalActions: ActionDescriptor[] = [];

              if (rootIdx !== -1) {
                const rootAction = generated[rootIdx];
                const rootTempId = rootAction.tempId;
                const rootArgs = rootAction.args ?? {};
                const hasChildren = generated.some(
                  (a, i) => i !== rootIdx && a.parentId === rootTempId,
                );

                // Apply all root frame properties to the existing frame
                if (
                  typeof rootArgs.width === "number" &&
                  typeof rootArgs.height === "number"
                ) {
                  finalActions.push({
                    method: "resize",
                    nodeId: frameId,
                    args: { width: rootArgs.width, height: rootArgs.height },
                  });
                }

                if (rootArgs.cornerRadius != null) {
                  finalActions.push({
                    method: "setCornerRadius",
                    nodeId: frameId,
                    args: { radius: rootArgs.cornerRadius as number },
                  });
                }

                if (rootArgs.fills) {
                  finalActions.push({
                    method: "setFill",
                    nodeId: frameId,
                    args: { fills: rootArgs.fills },
                  });
                }

                if (hasChildren) {
                  finalActions.push({
                    method: "deleteChildren",
                    nodeId: frameId,
                    args: {},
                  });
                }

                for (let i = 0; i < generated.length; i++) {
                  if (i === rootIdx) continue;
                  const action = { ...generated[i], args: { ...generated[i].args } };
                  if (action.parentId === rootTempId) action.parentId = frameId;
                  if (action.nodeId === rootTempId) action.nodeId = frameId;
                  if (action.args?.targetNodeId === rootTempId || action.args?.targetNodeId === "root") {
                    action.args.targetNodeId = frameId;
                  }
                  finalActions.push(action);
                }
              } else {
                for (const action of generated) {
                  const a = { ...action, args: { ...action.args } };
                  if (a.nodeId && !useAppStore.getState().objects[a.nodeId]) {
                    a.nodeId = frameId;
                  }
                  finalActions.push(a);
                }
              }

              executeActions(finalActions);
              shrinkFrameToChildren(frameId);
            } else {
              const control = spec.controls.find((c) => c.id === controlId);
              const actionTemplate = (control as Record<string, unknown> | undefined)?.action as
                | { method: string; nodeId?: string; args?: Record<string, unknown> }
                | undefined;

              if (actionTemplate) {
                const action: ActionDescriptor = {
                  method: actionTemplate.method,
                  nodeId: actionTemplate.nodeId ?? frameId,
                  args: { ...actionTemplate.args, value },
                };

                if (action.method === "resize" && action.args?.property) {
                  const prop = action.args.property as string;
                  delete action.args.property;
                  action.args[prop] = value;
                }

                executeActions([action]);
              }
            }

            persistValues(next);
          } catch (err) {
            console.error("[gen-ai] Control re-run error:", err);
          }
        }, 50);

        return next;
      });
    },
    [spec, frameId, persistValues],
  );

  useEffect(() => {
    return () => {
      if (rerunTimeoutRef.current) clearTimeout(rerunTimeoutRef.current);
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  const handleModifyControls = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("gen-ai-open-modify", {
        detail: { frameId },
      }),
    );
  }, [frameId]);

  return (
    <PropertyPopover
      isOpen={isOpen}
      onClose={onClose}
      position={position}
      onPositionChange={onPositionChange}
      width={260}
      protectedZoneRef={protectedZoneRef}
    >
      <PropertyPopoverHeader
        title="Custom"
        onClose={onClose}
        onAction={handleModifyControls}
        actionIcon={<Icon24RewriteSmall />}
        actionTitle="Modify controls"
      />

      {/* Controls */}
      <div className="figui3-scope overflow-y-auto overflow-x-hidden py-2" style={{ maxHeight: 600 }}>
        <div className="flex flex-col">
          {spec.controls.map((control) => {
            const label = (control.type === "fill" || control.type === "gradient-bar") ? "Fill" : (control.label || control.id);
            return (
            <FieldRow key={control.id} label={label} size={resolveSize(control)}>
              {renderControl(control, values[control.id] ?? getDefaultValue(control), (val) =>
                handleControlChange(control.id, val),
              )}
            </FieldRow>
            );
          })}
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
