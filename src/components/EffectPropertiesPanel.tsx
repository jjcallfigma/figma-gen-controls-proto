"use client";

import { useColorChange } from "@/core/hooks/useColorChange";
import { useAppStore } from "@/core/state/store";
import {
  addEffect,
  createDropShadow,
  createInnerShadow,
  createLayerBlur,
  getEffectTypeLabel,
} from "@/core/utils/effects";
import {
  CanvasObject,
  DropShadowEffect,
  Effect,
  InnerShadowEffect,
  LayerBlurEffect,
  SolidFill,
} from "@/types/canvas";
import Color from "color";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon24DropShadowMidSmall } from "./icons/icon-24-drop-shadow-mid-small";
import { Icon24DropShadowRightSmall } from "./icons/icon-24-drop-shadow-right-small";
import { Icon24EyeSmall } from "./icons/icon-24-eye-small";
import { Icon24HiddenSmall } from "./icons/icon-24-hidden-small";
import { Icon24InnerShadowRightSmall } from "./icons/icon-24-inner-shadow-right-small";
import { Icon24LayerBlurSmall } from "./icons/icon-24-layer-blur-small";
import { Icon24MinusSmall } from "./icons/icon-24-minus-small";
import { Icon24Plus } from "./icons/icon-24-plus";
import { Icon24SpreadSmall } from "./icons/icon-24-spread-small";
import ColorPickerContent from "./ui/ColorPickerContent";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import FillTrigger from "./ui/FillTrigger";
import { PropertyInput } from "./ui/PropertyInput";
import PropertyPopover from "./ui/PropertyPopover";
import PropertyPopoverHeader from "./ui/PropertyPopoverHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface EffectPropertiesPanelProps {
  objects: CanvasObject[];
  setShowSelectionUI?: ((show: boolean) => void) | null;
}

// Helper functions to convert between hex and rgba
const hexToRgba = (hex: string, alpha: number = 1) => {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b, a: alpha };
  } catch {
    return { r: 0, g: 0, b: 0, a: alpha };
  }
};

const rgbaToHex = (rgba: { r: number; g: number; b: number; a: number }) => {
  return Color.rgb(rgba.r, rgba.g, rgba.b).hex().toUpperCase();
};

// Create a fake SolidFill from a shadow effect for use with FillTrigger
function shadowToFill(effect: DropShadowEffect | InnerShadowEffect): SolidFill {
  return {
    id: effect.id,
    type: "solid",
    color: effect.color,
    opacity: effect.opacity,
    visible: effect.visible,
  };
}

export default function EffectPropertiesPanel({
  objects,
  setShowSelectionUI,
}: EffectPropertiesPanelProps) {
  const dispatch = useAppStore((state) => state.dispatch);
  const colorChange = useColorChange({ undoDelay: 500 });
  const effectSectionRef = useRef<HTMLDivElement>(null);
  const selectionHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to temporarily hide the selection box during property changes
  const withTemporarySelectionHiding = useCallback(
    (callback: () => void) => {
      callback();

      if (setShowSelectionUI) {
        if (selectionHideTimeoutRef.current) {
          clearTimeout(selectionHideTimeoutRef.current);
        }
        setShowSelectionUI(false);
        selectionHideTimeoutRef.current = setTimeout(() => {
          setShowSelectionUI(true);
          selectionHideTimeoutRef.current = null;
        }, 1000);
      }
    },
    [setShowSelectionUI]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (selectionHideTimeoutRef.current) {
        clearTimeout(selectionHideTimeoutRef.current);
      }
    };
  }, []);

  // Popover state — detail panel for editing effect parameters
  const [activeDetailPopover, setActiveDetailPopover] = useState<string | null>(
    null,
  );
  const [detailPosition, setDetailPosition] = useState({ x: 0, y: 0 });

  // Color picker popover state (sub-panel of the detail panel)
  const [activeColorPopover, setActiveColorPopover] = useState<string | null>(
    null,
  );
  const [colorPosition, setColorPosition] = useState({ x: 0, y: 0 });

  // Get effects from selected objects
  const { effects, hasMixedEffects } = useMemo(() => {
    if (objects.length === 0) return { effects: [], hasMixedEffects: false };

    if (objects.length === 1) {
      return {
        effects: (objects[0].effects || []) as Effect[],
        hasMixedEffects: false,
      };
    }

    const firstObjectEffects = objects[0].effects || [];
    const allSame = objects.every((obj) => {
      const objEffects = obj.effects || [];
      if (objEffects.length !== firstObjectEffects.length) return false;
      return objEffects.every((effect, index) => {
        const firstEffect = firstObjectEffects[index];
        if (!firstEffect) return false;
        return effect.type === firstEffect.type;
      });
    });

    if (allSame) {
      return {
        effects: firstObjectEffects as Effect[],
        hasMixedEffects: false,
      };
    } else {
      return {
        effects: firstObjectEffects as Effect[],
        hasMixedEffects: true,
      };
    }
  }, [objects]);

  // ── Handlers ────────────────────────────────────────────────────────

  const handleAddEffect = (type: Effect["type"]) => {
    let newEffect: Effect;
    switch (type) {
      case "drop-shadow":
        newEffect = createDropShadow();
        break;
      case "inner-shadow":
        newEffect = createInnerShadow();
        break;
      case "layer-blur":
        newEffect = createLayerBlur();
        break;
    }

    objects.forEach((object) => {
      const updated = addEffect(object, newEffect);
      dispatch({
        type: "object.updated",
        payload: {
          id: object.id,
          changes: { effects: updated.effects },
          previousValues: { effects: object.effects },
        },
      });
    });
  };

  const handleRemoveEffect = (effectId: string) => {
    objects.forEach((object) => {
      const currentEffects = object.effects || [];
      const updatedEffects = currentEffects.filter((e) => e.id !== effectId);
      dispatch({
        type: "object.updated",
        payload: {
          id: object.id,
          changes: { effects: updatedEffects },
          previousValues: { effects: object.effects },
        },
      });
    });

    if (activeDetailPopover === effectId) {
      setActiveDetailPopover(null);
    }
    if (activeColorPopover === effectId) {
      setActiveColorPopover(null);
    }
  };

  const handleToggleEffectVisibility = (effectId: string) => {
    const unifiedIndex = effects.findIndex((e) => e.id === effectId);
    if (unifiedIndex === -1) return;

    withTemporarySelectionHiding(() => {
      objects.forEach((object) => {
        const objectEffects = object.effects || [];
        if (unifiedIndex < objectEffects.length) {
          const updatedEffects = objectEffects.map((effect, index) =>
            index === unifiedIndex
              ? { ...effect, visible: !effect.visible }
              : effect,
          );
          dispatch({
            type: "object.updated",
            payload: {
              id: object.id,
              changes: { effects: updatedEffects },
              previousValues: { effects: object.effects },
            },
          });
        }
      });
    });
  };

  const handleUpdateEffect = (effectId: string, changes: Partial<Effect>) => {
    const unifiedIndex = effects.findIndex((e) => e.id === effectId);
    if (unifiedIndex === -1) return;

    withTemporarySelectionHiding(() => {
      objects.forEach((object) => {
        const objectEffects = object.effects || [];
        if (unifiedIndex < objectEffects.length) {
          const updatedEffects = objectEffects.map((effect, index) =>
            index === unifiedIndex ? { ...effect, ...changes } : effect,
          );
          dispatch({
            type: "object.updated",
            payload: {
              id: object.id,
              changes: { effects: updatedEffects },
              previousValues: { effects: object.effects },
            },
          });
        }
      });
    });
  };

  // Switch the type of an existing effect, preserving shared properties
  const handleSwitchEffectType = (
    effectId: string,
    newType: Effect["type"],
  ) => {
    const unifiedIndex = effects.findIndex((e) => e.id === effectId);
    if (unifiedIndex === -1) return;
    const currentEffect = effects[unifiedIndex];

    // Don't do anything if same type
    if (currentEffect.type === newType) return;

    withTemporarySelectionHiding(() => {
      objects.forEach((object) => {
        const objectEffects = object.effects || [];
        if (unifiedIndex < objectEffects.length) {
          const existing = objectEffects[unifiedIndex];
          let newEffect: Effect;

          if (newType === "layer-blur") {
            // Switching to blur — only keep blur value
            const blurVal =
              existing.type === "drop-shadow" ||
              existing.type === "inner-shadow"
                ? (existing as DropShadowEffect).blur
                : (existing as LayerBlurEffect).blur;
            newEffect = {
              id: existing.id,
              type: "layer-blur",
              visible: existing.visible,
              blur: blurVal ?? 4,
            } as LayerBlurEffect;
          } else {
            // Switching between drop-shadow and inner-shadow or from blur
            const isShadow =
              existing.type === "drop-shadow" ||
              existing.type === "inner-shadow";
            const shadow = isShadow
              ? (existing as DropShadowEffect | InnerShadowEffect)
              : null;
            newEffect = {
              id: existing.id,
              type: newType,
              visible: existing.visible,
              color: shadow?.color ?? "#000000",
              opacity: shadow?.opacity ?? 0.25,
              offsetX: shadow?.offsetX ?? 0,
              offsetY: shadow?.offsetY ?? 4,
              blur: shadow?.blur ?? (existing as any).blur ?? 8,
              spread: shadow?.spread ?? 0,
            } as DropShadowEffect | InnerShadowEffect;
          }

          const updatedEffects = objectEffects.map((e, index) =>
            index === unifiedIndex ? newEffect : e,
          );
          dispatch({
            type: "object.updated",
            payload: {
              id: object.id,
              changes: { effects: updatedEffects },
              previousValues: { effects: object.effects },
            },
          });
        }
      });
    });
  };

  // Color change via the FillTrigger hex input
  const handleShadowHexChange = (effectId: string, color: string) => {
    handleUpdateEffect(effectId, { color } as any);
  };

  // Color change via the FillTrigger opacity input
  const handleShadowOpacityChange = (effectId: string, opacity: number) => {
    // FillTrigger passes percentage (0-100), we store as 0-1
    handleUpdateEffect(effectId, { opacity: opacity / 100 } as any);
  };

  // Color change via full RGBA color picker
  const handleShadowRgbaChange = (
    effectId: string,
    rgba: { r: number; g: number; b: number; a: number },
  ) => {
    const hexColor = rgbaToHex(rgba);
    const unifiedIndex = effects.findIndex((e) => e.id === effectId);
    if (unifiedIndex === -1) return;

    withTemporarySelectionHiding(() => {
      objects.forEach((object) => {
        const objectEffects = object.effects || [];
        if (unifiedIndex < objectEffects.length) {
          const updatedEffects = objectEffects.map((e, index) =>
            index === unifiedIndex
              ? { ...e, color: hexColor, opacity: rgba.a }
              : e,
          );
          const action = {
            type: "object.updated",
            payload: {
              id: object.id,
              changes: { effects: updatedEffects },
              previousValues: { effects: object.effects },
            },
          };
          colorChange.updateColor(action, `${object.id}_effects`);
        }
      });
    });
  };

  const handleColorPickerStart = (effectId: string) => {
    const unifiedIndex = effects.findIndex((e) => e.id === effectId);
    if (unifiedIndex === -1) return;

    objects.forEach((object) => {
      const objectEffects = object.effects || [];
      if (unifiedIndex < objectEffects.length) {
        colorChange.startColorChange(`${object.id}_effects`, {
          effects: object.effects,
        });
      }
    });
  };

  const handleColorPickerEnd = () => {
    colorChange.finishColorChange();
  };

  // ── Popover management ──────────────────────────────────────────────

  const openDetailPopover = (effectId: string) => {
    if (!effectSectionRef.current) return;
    const rect = effectSectionRef.current.getBoundingClientRect();
    setDetailPosition({ x: rect.left - 240, y: rect.top });
    setActiveDetailPopover(effectId);
  };

  const closeDetailPopover = () => {
    setActiveDetailPopover(null);
    setActiveColorPopover(null);
  };

  const openColorPopover = (effectId: string) => {
    if (!effectSectionRef.current) return;
    const rect = effectSectionRef.current.getBoundingClientRect();
    // Position further left so it doesn't overlap the detail panel
    setColorPosition({ x: rect.left - 496, y: rect.top });
    setActiveColorPopover(effectId);
  };

  const closeColorPopover = () => {
    setActiveColorPopover(null);
  };

  // Active effect objects
  const activeDetailEffect = activeDetailPopover
    ? effects.find((e) => e.id === activeDetailPopover)
    : null;
  const activeColorEffect = activeColorPopover
    ? effects.find((e) => e.id === activeColorPopover)
    : null;

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div ref={effectSectionRef}>
      {/* Section header */}
      <div className="text-xs font-medium h-10 grid grid-cols-[1fr_auto] items-center pl-4 pr-2">
        <div
          className="hover:text-default"
          style={{
            color:
              effects.length > 0 || hasMixedEffects
                ? "var(--color-text)"
                : "var(--color-text-secondary)",
          }}
        >
          Effects
        </div>

        {/* Add Effect dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-6 h-6 rounded-[5px] hover:bg-secondary">
              <Icon24Plus />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem onClick={() => handleAddEffect("drop-shadow")}>
              <span className="text-xs">Drop shadow</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddEffect("inner-shadow")}>
              <span className="text-xs">Inner shadow</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddEffect("layer-blur")}>
              <span className="text-xs">Layer blur</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Detail popover (parameters panel) ──────────────────────── */}
      {activeDetailEffect && (
        <PropertyPopover
          isOpen={!!activeDetailPopover}
          onClose={closeDetailPopover}
          position={detailPosition}
          onPositionChange={setDetailPosition}
          width={240}
          protectedZoneRef={effectSectionRef}
          debug={false}
        >
          <PropertyPopoverHeader
            title={getEffectTypeLabel(activeDetailEffect.type)}
            onClose={closeDetailPopover}
          />

          {/* Shadow parameters — one input per row with labels */}
          {(activeDetailEffect.type === "drop-shadow" ||
            activeDetailEffect.type === "inner-shadow") && (
            <div className="px-3 pb-3 pt-1 flex flex-col gap-0">
              {/* Position X */}
              <div className="grid grid-cols-[56px_1fr] items-center h-8 gap-x-3">
                <span className="text-[11px] text-secondary">Position</span>
                <PropertyInput
                  label="X"
                  value={
                    (activeDetailEffect as DropShadowEffect | InnerShadowEffect)
                      .offsetX
                  }
                  onChange={(val) =>
                    handleUpdateEffect(activeDetailEffect.id, {
                      offsetX: val,
                    } as any)
                  }
                  type="number"
                  leadingLabel="X"
                />
              </div>
              {/* Position Y */}
              <div className="grid grid-cols-[56px_1fr] items-center h-8 gap-x-3">
                <span />
                <PropertyInput
                  label="Y"
                  value={
                    (activeDetailEffect as DropShadowEffect | InnerShadowEffect)
                      .offsetY
                  }
                  onChange={(val) =>
                    handleUpdateEffect(activeDetailEffect.id, {
                      offsetY: val,
                    } as any)
                  }
                  type="number"
                  leadingLabel="Y"
                />
              </div>
              {/* Blur */}
              <div className="grid grid-cols-[56px_1fr] items-center h-8 gap-x-3">
                <span className="text-[11px] text-secondary">Blur</span>
                <PropertyInput
                  label="Blur"
                  value={
                    (activeDetailEffect as DropShadowEffect | InnerShadowEffect)
                      .blur
                  }
                  onChange={(val) =>
                    handleUpdateEffect(activeDetailEffect.id, {
                      blur: val,
                    } as any)
                  }
                  type="number"
                  leadingIcon={<Icon24LayerBlurSmall />}
                  min={0}
                />
              </div>
              {/* Spread */}
              <div className="grid grid-cols-[56px_1fr] items-center h-8 gap-x-3">
                <span className="text-[11px] text-secondary">Spread</span>
                <PropertyInput
                  label="Spread"
                  value={
                    (activeDetailEffect as DropShadowEffect | InnerShadowEffect)
                      .spread
                  }
                  onChange={(val) =>
                    handleUpdateEffect(activeDetailEffect.id, {
                      spread: val,
                    } as any)
                  }
                  type="number"
                  leadingIcon={<Icon24SpreadSmall />}
                />
              </div>
              {/* Color */}
              <div className="grid grid-cols-[56px_1fr] items-center h-8 gap-x-3">
                <span className="text-[11px] text-secondary">Color</span>
                <FillTrigger
                  fill={shadowToFill(
                    activeDetailEffect as DropShadowEffect | InnerShadowEffect,
                  )}
                  onTriggerClick={() => openColorPopover(activeDetailEffect.id)}
                  onColorChange={(color) =>
                    handleShadowHexChange(activeDetailEffect.id, color)
                  }
                  onOpacityChange={(opacity) =>
                    handleShadowOpacityChange(activeDetailEffect.id, opacity)
                  }
                  size="sm"
                  showLabel={true}
                  showOpacity={true}
                />
              </div>
            </div>
          )}

          {/* Layer blur parameters */}
          {activeDetailEffect.type === "layer-blur" && (
            <div className="px-3 pb-3 pt-1">
              <div className="grid grid-cols-[56px_1fr] items-center h-8">
                <span className="text-[11px] text-secondary">Blur</span>
                <PropertyInput
                  label="Blur"
                  value={(activeDetailEffect as LayerBlurEffect).blur}
                  onChange={(val) =>
                    handleUpdateEffect(activeDetailEffect.id, {
                      blur: val,
                    } as any)
                  }
                  type="number"
                  leadingIcon={<Icon24DropShadowMidSmall />}
                  min={0}
                />
              </div>
            </div>
          )}
        </PropertyPopover>
      )}

      {/* ── Color picker sub-panel ─────────────────────────────────── */}
      {activeColorEffect &&
        (activeColorEffect.type === "drop-shadow" ||
          activeColorEffect.type === "inner-shadow") && (
          <PropertyPopover
            isOpen={!!activeColorPopover}
            onClose={closeColorPopover}
            position={colorPosition}
            onPositionChange={setColorPosition}
            width={240}
            protectedZoneRef={effectSectionRef}
            debug={false}
          >
            <PropertyPopoverHeader onClose={closeColorPopover} />
            <div className="p-3">
              <ColorPickerContent
                color={
                  (activeColorEffect as DropShadowEffect | InnerShadowEffect)
                    .color
                }
                opacity={
                  (activeColorEffect as DropShadowEffect | InnerShadowEffect)
                    .opacity
                }
                onRgbaChange={(rgba) =>
                  handleShadowRgbaChange(activeColorEffect.id, rgba)
                }
                onColorPickerStart={() =>
                  handleColorPickerStart(activeColorEffect.id)
                }
                onColorPickerEnd={handleColorPickerEnd}
                showOpacity={true}
              />
            </div>
          </PropertyPopover>
        )}

      {/* ── Effects list ───────────────────────────────────────────── */}
      <div>
        {hasMixedEffects ? (
          <div className="text-xs text-tertiary px-4 pb-4 pt-2">
            Click + to replace mixed content
          </div>
        ) : (
          effects
            .slice()
            .reverse()
            .map((effect) => {
              const isShadow =
                effect.type === "drop-shadow" || effect.type === "inner-shadow";

              return (
                <div key={effect.id} className="last:pb-2">
                  {/* Effect row: [type icon] [type dropdown ▾] [eye] [—] */}
                  <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center pl-4 pr-2 h-8">
                    {/* Type icon — opens detail panel */}
                    <button
                      onClick={() => openDetailPopover(effect.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-[5px] hover:bg-secondary flex-shrink-0"
                      title="Edit effect details"
                    >
                      {effect.type === "drop-shadow" && (
                        <Icon24DropShadowRightSmall />
                      )}
                      {effect.type === "inner-shadow" && (
                        <Icon24InnerShadowRightSmall />
                      )}
                      {effect.type === "layer-blur" && <Icon24LayerBlurSmall />}
                    </button>

                    {/* Type selector dropdown */}
                    <Select
                      value={effect.type}
                      onValueChange={(val) =>
                        handleSwitchEffectType(effect.id, val as Effect["type"])
                      }
                    >
                      <SelectTrigger className="">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="item-aligned">
                        <SelectItem value="drop-shadow">Drop shadow</SelectItem>
                        <SelectItem value="inner-shadow">
                          Inner shadow
                        </SelectItem>
                        <SelectItem value="layer-blur">Layer blur</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                      {/* Visibility toggle */}
                      <button
                        onClick={() => handleToggleEffectVisibility(effect.id)}
                        className="w-6 h-6 rounded-[5px] text-xs flex items-center justify-center hover:bg-secondary"
                        title={effect.visible ? "Hide effect" : "Show effect"}
                      >
                        {effect.visible ? (
                          <Icon24EyeSmall />
                        ) : (
                          <Icon24HiddenSmall />
                        )}
                      </button>

                      {/* Remove */}
                      <button
                        onClick={() => handleRemoveEffect(effect.id)}
                        className="w-6 h-6 rounded-[5px] text-xs flex items-center justify-center hover:bg-secondary"
                        title="Remove effect"
                      >
                        <Icon24MinusSmall />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
