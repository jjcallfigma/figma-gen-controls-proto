"use client";

import { useState, useCallback, useEffect, useRef, type RefObject } from "react";
import { useAppStore } from "@/core/state/store";
import type { UISpec, UIControl, ActionDescriptor } from "../types";
import { compileGenerator, executeGenerator } from "../runtime/codegen";
import { executeActions } from "../adapter/action-adapter";
import "./figui3-scoped.css";
import PropertyPopover from "@/components/ui/PropertyPopover";
import PropertyPopoverHeader from "@/components/ui/PropertyPopoverHeader";
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

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "4px 0",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "var(--color-text-secondary)",
        }}
      >
        {label}
      </span>
      {children}
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
      return props.stops ?? [];
    case "curve":
      return props.defaultValue ?? [0.42, 0, 0.58, 1];
    case "3d-preview":
      return props.defaultValue ?? { rx: 0, ry: 0, rz: 0 };
    default:
      return props.defaultValue;
  }
}

function flattenColorStops(params: Record<string, unknown>): Record<string, unknown> {
  return { ...params };
}

export function CustomControlsPopover({ spec, frameId, isOpen, position, onPositionChange, protectedZoneRef, onClose }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {};
    for (const c of spec.controls) {
      defaults[c.id] = getDefaultValue(c);
    }
    return defaults;
  });

  const rerunTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync values when spec controls change (e.g. new control added via modify)
  useEffect(() => {
    setValues((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const c of spec.controls) {
        if (!(c.id in next)) {
          next[c.id] = getDefaultValue(c);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [spec]);

  const handleControlChange = useCallback(
    (controlId: string, value: unknown) => {
      setValues((prev) => {
        const next = { ...prev, [controlId]: value };

        if (rerunTimeoutRef.current) {
          clearTimeout(rerunTimeoutRef.current);
        }

        rerunTimeoutRef.current = setTimeout(() => {
          try {
            // When a generator exists, always re-run it so all control
            // values stay coherent (avoids one control's direct dispatch
            // being overwritten by the next control's generator re-run).
            if (spec.generate) {
              const fn = compileGenerator(spec.generate);
              const params = flattenColorStops(next);
              const generated = executeGenerator(fn, params);

              const rootIdx = generated.findIndex(
                (a: ActionDescriptor) => a.method === "createFrame" && !a.parentId,
              );

              const finalActions: ActionDescriptor[] = [];

              if (rootIdx !== -1) {
                const rootAction = generated[rootIdx];
                const rootTempId = rootAction.tempId;

                if (
                  typeof rootAction.args?.width === "number" &&
                  typeof rootAction.args?.height === "number"
                ) {
                  finalActions.push({
                    method: "resize",
                    nodeId: frameId,
                    args: {
                      width: rootAction.args.width as number,
                      height: rootAction.args.height as number,
                    },
                  });
                }

                finalActions.push({
                  method: "deleteChildren",
                  nodeId: frameId,
                  args: {},
                });

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
                // No createFrame: remap any temp nodeId references to the
                // root object so setFill/setStroke/etc. hit the real object.
                for (const action of generated) {
                  const a = { ...action, args: { ...action.args } };
                  if (a.nodeId && !useAppStore.getState().objects[a.nodeId]) {
                    a.nodeId = frameId;
                  }
                  finalActions.push(a);
                }
              }

              executeActions(finalActions);
            } else {
              // Fallback: no generator, use action templates for direct dispatch
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
          } catch (err) {
            console.error("[gen-ai] Control re-run error:", err);
          }
        }, 50);

        return next;
      });
    },
    [spec, frameId],
  );

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (rerunTimeoutRef.current) clearTimeout(rerunTimeoutRef.current);
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
      width={280}
      protectedZoneRef={protectedZoneRef}
    >
      <PropertyPopoverHeader title="Controls" onClose={onClose} />

      {/* Controls */}
      <div className="overflow-y-auto px-2 py-2" style={{ maxHeight: 400 }}>
        <div className="flex flex-col gap-1">
          {spec.controls.map((control) => (
            <FieldRow key={control.id} label={control.label || control.id}>
              {renderControl(control, values[control.id] ?? getDefaultValue(control), (val) =>
                handleControlChange(control.id, val),
              )}
            </FieldRow>
          ))}
        </div>
      </div>

      {/* Modify controls link */}
      <div className="px-3 py-2 flex justify-center border-t">
        <button
          onClick={handleModifyControls}
          className="text-[11px] font-medium hover:underline"
          style={{ color: "var(--color-text-brand, #7B61FF)", cursor: "pointer" }}
        >
          Modify controls
        </button>
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
      return (
        <GradientBar
          label={label}
          value={value as { id: string; position: number; color: string }[]}
          onChange={onChange as (v: { id: string; position: number; color: string }[]) => void}
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
