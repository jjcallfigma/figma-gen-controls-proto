"use client";

import { useAppStore } from "@/core/state/store";
import { CanvasObject, SolidFill, SolidStroke } from "@/types/canvas";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Icon24AdjustSmall } from "./icons/icon-24-adjust-small";
import { Icon24BorderBottomSmall } from "./icons/icon-24-border-bottom-small";
import { Icon24BorderLeftSmall } from "./icons/icon-24-border-left-small";
import { Icon24BorderRightSmall } from "./icons/icon-24-border-right-small";
import { Icon24BorderSmall } from "./icons/icon-24-border-small";
import { Icon24BorderTopSmall } from "./icons/icon-24-border-top-small";
import { Icon24EyeSmall } from "./icons/icon-24-eye-small";
import { Icon24HiddenSmall } from "./icons/icon-24-hidden-small";
import { Icon24MinusSmall } from "./icons/icon-24-minus-small";
import { Icon24Plus } from "./icons/icon-24-plus";
import { Icon24StrokeWeight } from "./icons/icon-24-stroke-weight";
import { Button } from "./ui/button";
import FillPopoverContent from "./ui/FillPopoverContent";
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

interface StrokePropertiesPanelProps {
  objects: CanvasObject[];
}

export default function StrokePropertiesPanel({
  objects,
}: StrokePropertiesPanelProps) {
  const dispatch = useAppStore((state) => state.dispatch);
  const strokeSectionRef = useRef<HTMLDivElement>(null);

  // State for stroke popover (reused as-is, solid colors only)
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 });

  // State for individual stroke widths toggle
  const [showIndividualWidths, setShowIndividualWidths] = useState(false);

  // Auto-detect if individual widths are being used
  const hasIndividualWidths = useMemo(() => {
    return objects.some((obj) => {
      const widths = obj.strokeWidths;
      return (
        widths &&
        (widths.top !== undefined ||
          widths.right !== undefined ||
          widths.bottom !== undefined ||
          widths.left !== undefined)
      );
    });
  }, [objects]);

  // Update showIndividualWidths when individual widths are detected
  React.useEffect(() => {
    if (hasIndividualWidths && !showIndividualWidths) {
      setShowIndividualWidths(true);
    }
  }, [hasIndividualWidths, showIndividualWidths]);

  // Toggle between unified and individual stroke widths
  const handleToggleIndividualWidths = () => {
    if (showIndividualWidths) {
      // Switching to unified - clear individual widths and use the strokeWidth
      setShowIndividualWidths(false);
      objects.forEach((obj) => {
        if (
          obj.type === "rectangle" ||
          obj.type === "ellipse" ||
          obj.type === "frame"
        ) {
          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: { strokeWidths: undefined },
              previousValues: { strokeWidths: obj.strokeWidths },
            },
          });
        }
      });
    } else {
      // Switching to individual - set all sides to current strokeWidth
      setShowIndividualWidths(true);
      objects.forEach((obj) => {
        if (
          obj.type === "rectangle" ||
          obj.type === "ellipse" ||
          obj.type === "frame"
        ) {
          const currentWidth = obj.strokeWidth || 1;
          const newIndividualWidths = {
            top: currentWidth,
            right: currentWidth,
            bottom: currentWidth,
            left: currentWidth,
          };

          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: { strokeWidths: newIndividualWidths },
              previousValues: { strokeWidths: obj.strokeWidths },
            },
          });
        }
      });
    }
  };

  // Get strokes from selected objects, handle mixed states
  const { strokes, hasMixedStrokes } = useMemo(() => {
    if (objects.length === 0) return { strokes: [], hasMixedStrokes: false };

    if (objects.length === 1) {
      // Single object - show its strokes or convert legacy stroke
      const obj = objects[0];
      if (obj.strokes && obj.strokes.length > 0) {
        return {
          strokes: obj.strokes,
          hasMixedStrokes: false,
        };
      } else if (obj.stroke) {
        // Convert legacy stroke to new format for display
        const legacyStroke: SolidStroke = {
          id: "legacy-stroke",
          type: "solid",
          color: obj.stroke,
          opacity: obj.strokeOpacity || 1,
          visible: true,
          blendMode: "normal",
        };
        return {
          strokes: [legacyStroke],
          hasMixedStrokes: false,
        };
      }
      return { strokes: [], hasMixedStrokes: false };
    }

    // Multiple objects - check if all have the same strokes
    const firstObjectStrokes = objects[0].strokes || [];

    const allSame = objects.every((obj) => {
      const objStrokes = obj.strokes || [];

      if (objStrokes.length !== firstObjectStrokes.length) return false;

      return objStrokes.every((stroke, index) => {
        const firstStroke = firstObjectStrokes[index];
        if (!firstStroke) return false;

        if (stroke.type !== firstStroke.type) return false;

        if (stroke.type === "solid" && firstStroke.type === "solid") {
          return (
            stroke.color === firstStroke.color &&
            Math.abs(stroke.opacity - firstStroke.opacity) < 0.001 &&
            stroke.visible === firstStroke.visible
          );
        }

        return false; // Other stroke types not supported yet
      });
    });

    return {
      strokes: allSame ? firstObjectStrokes : [],
      hasMixedStrokes:
        !allSame &&
        objects.some(
          (obj) => (obj.strokes && obj.strokes.length > 0) || obj.stroke
        ),
    };
  }, [objects]);

  // Get first stroke for popover (when editing)
  const firstStroke = strokes.length > 0 ? strokes[0] : null;

  // Check if objects have strokes (new or legacy) - regardless of visibility
  const hasStrokes = useMemo(() => {
    return objects.some(
      (obj) =>
        // New stroke system - any stroke exists (regardless of width)
        (obj.strokes &&
          obj.strokes.length > 0 &&
          (obj.strokeWidth !== undefined || obj.strokeWidths)) ||
        // Legacy stroke system - stroke exists (regardless of width)
        (obj.stroke && obj.strokeWidth !== undefined)
    );
  }, [objects]);

  // Get stroke configuration values (shared across all strokes)
  const strokeConfig = useMemo(() => {
    const strokeWidths = objects
      .map((obj) => obj.strokeWidth)
      .filter((w) => w !== undefined);
    const positions = objects
      .map((obj) => obj.strokePosition)
      .filter((p) => p !== undefined);
    const individualWidths = objects
      .map((obj) => obj.strokeWidths)
      .filter((w) => w !== undefined);

    // Handle individual widths with proper typing
    let resolvedIndividualWidths:
      | { top?: number; right?: number; bottom?: number; left?: number }
      | "Mixed"
      | undefined = undefined;
    if (individualWidths.length > 0) {
      const allSame = individualWidths.every(
        (w) => JSON.stringify(w) === JSON.stringify(individualWidths[0])
      );
      resolvedIndividualWidths = allSame ? individualWidths[0] : "Mixed";
    }

    return {
      strokeWidth:
        strokeWidths.length > 0
          ? new Set(strokeWidths).size === 1
            ? strokeWidths[0]
            : ("Mixed" as const)
          : 1,
      strokePosition:
        positions.length > 0
          ? new Set(positions).size === 1
            ? positions[0]
            : ("Mixed" as const)
          : ("inside" as const),
      strokeWidths: resolvedIndividualWidths,
    };
  }, [objects]);

  // Convert active stroke to fill for UI compatibility
  const activeStrokeAsFill = useMemo((): SolidFill | undefined => {
    if (!activePopover) return undefined;

    const stroke = strokes.find((s) => s.id === activePopover);
    if (!stroke || stroke.type !== "solid") return undefined;

    const solidStroke = stroke as SolidStroke;

    return {
      id: solidStroke.id,
      type: "solid",
      color: solidStroke.color,
      opacity: solidStroke.opacity,
      visible: solidStroke.visible,
      blendMode: (solidStroke.blendMode as any) || "normal",
    };
  }, [activePopover, strokes]);

  const handleStrokeConfigChange = useCallback(
    (property: string, value: any) => {
      objects.forEach((obj) => {
        if (
          obj.type === "rectangle" ||
          obj.type === "ellipse" ||
          obj.type === "frame"
        ) {
          const previousValue = (obj as any)[property];
          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: { [property]: value },
              previousValues: { [property]: previousValue },
            },
          });
        }
      });
    },
    [objects, dispatch]
  );

  // Add stroke (create new strokes array if needed)
  const handleAddStroke = () => {
    objects.forEach((obj) => {
      if (
        obj.type === "rectangle" ||
        obj.type === "ellipse" ||
        obj.type === "frame"
      ) {
        const newStroke: SolidStroke = {
          id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: "solid",
          color: "#000000",
          opacity: 1,
          visible: true,
          blendMode: "normal",
        };

        const existingStrokes = obj.strokes || [];
        const newStrokes = [...existingStrokes, newStroke];

        // Check if this is the first stroke after all strokes were deleted
        const wasEmpty = existingStrokes.length === 0;

        dispatch({
          type: "object.updated",
          payload: {
            id: obj.id,
            changes: {
              strokes: newStrokes,
              // Reset stroke configuration if this is the first stroke after deletion
              strokeWidth: wasEmpty ? 1 : obj.strokeWidth || 1,
              strokePosition: wasEmpty
                ? "inside"
                : obj.strokePosition || "inside",
              strokeWidths: wasEmpty ? undefined : obj.strokeWidths,
            },
            previousValues: {
              strokes: obj.strokes,
              strokeWidth: obj.strokeWidth,
              strokePosition: obj.strokePosition,
              strokeWidths: obj.strokeWidths,
            },
          },
        });
      }
    });
  };

  // Remove all strokes
  const handleRemoveStrokes = () => {
    objects.forEach((obj) => {
      if (
        obj.type === "rectangle" ||
        obj.type === "ellipse" ||
        obj.type === "frame"
      ) {
        dispatch({
          type: "object.updated",
          payload: {
            id: obj.id,
            changes: {
              strokes: undefined,
              // Also clear legacy stroke properties
              stroke: undefined,
              strokeOpacity: undefined,
            },
            previousValues: {
              strokes: obj.strokes,
              stroke: obj.stroke,
              strokeOpacity: obj.strokeOpacity,
            },
          },
        });
      }
    });
  };

  // Handle stroke popover trigger click
  const openPopover = (strokeId: string, event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPickerPosition({ x: rect.right + 8, y: rect.top });
    setActivePopover(strokeId);
  };

  // Close popover
  const closePopover = () => {
    setActivePopover(null);
  };

  // Handle individual stroke operations
  const handleStrokeColorChange = (strokeId: string, color: string) => {
    objects.forEach((obj) => {
      if (
        obj.type === "rectangle" ||
        obj.type === "ellipse" ||
        obj.type === "frame"
      ) {
        if (obj.strokes && obj.strokes.length > 0) {
          const updatedStrokes = obj.strokes.map((stroke) =>
            stroke.id === strokeId && stroke.type === "solid"
              ? { ...stroke, color }
              : stroke
          );

          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: { strokes: updatedStrokes },
              previousValues: { strokes: obj.strokes },
            },
          });
        } else if (obj.stroke && strokeId === "legacy-stroke") {
          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: { stroke: color },
              previousValues: { stroke: obj.stroke },
            },
          });
        }
      }
    });
  };

  const handleStrokeOpacityChange = (strokeId: string, opacity: number) => {
    objects.forEach((obj) => {
      if (
        obj.type === "rectangle" ||
        obj.type === "ellipse" ||
        obj.type === "frame"
      ) {
        if (obj.strokes && obj.strokes.length > 0) {
          const updatedStrokes = obj.strokes.map((stroke) =>
            stroke.id === strokeId ? { ...stroke, opacity } : stroke
          );

          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: { strokes: updatedStrokes },
              previousValues: { strokes: obj.strokes },
            },
          });
        } else if (obj.stroke && strokeId === "legacy-stroke") {
          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: { strokeOpacity: opacity },
              previousValues: { strokeOpacity: obj.strokeOpacity },
            },
          });
        }
      }
    });
  };

  const handleToggleStrokeVisibility = (strokeId: string) => {
    objects.forEach((obj) => {
      if (
        obj.type === "rectangle" ||
        obj.type === "ellipse" ||
        obj.type === "frame"
      ) {
        if (obj.strokes && obj.strokes.length > 0) {
          const updatedStrokes = obj.strokes.map((stroke) =>
            stroke.id === strokeId
              ? { ...stroke, visible: !stroke.visible }
              : stroke
          );

          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: { strokes: updatedStrokes },
              previousValues: { strokes: obj.strokes },
            },
          });
        }
        // Legacy strokes don't support visibility toggle
      }
    });
  };

  const handleRemoveStroke = (strokeId: string) => {
    objects.forEach((obj) => {
      if (
        obj.type === "rectangle" ||
        obj.type === "ellipse" ||
        obj.type === "frame"
      ) {
        if (obj.strokes && obj.strokes.length > 0) {
          const updatedStrokes = obj.strokes.filter(
            (stroke) => stroke.id !== strokeId
          );

          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: {
                strokes: updatedStrokes.length > 0 ? updatedStrokes : undefined,
              },
              previousValues: { strokes: obj.strokes },
            },
          });
        } else if (obj.stroke && strokeId === "legacy-stroke") {
          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: {
                stroke: undefined,
                strokeOpacity: undefined,
              },
              previousValues: {
                stroke: obj.stroke,
                strokeOpacity: obj.strokeOpacity,
              },
            },
          });
        }
      }
    });
  };

  // Handle color changes from stroke popover (for active stroke)
  const handleColorChange = (color: string) => {
    if (!activePopover) return;
    handleStrokeColorChange(activePopover, color);
  };

  const handleStrokeBlendModeChange = (strokeId: string, blendMode: string) => {
    objects.forEach((obj) => {
      if (
        obj.type === "rectangle" ||
        obj.type === "ellipse" ||
        obj.type === "frame"
      ) {
        if (obj.strokes && obj.strokes.length > 0) {
          const updatedStrokes = obj.strokes.map((stroke) =>
            stroke.id === strokeId
              ? {
                  ...stroke,
                  blendMode:
                    blendMode === "pass-through"
                      ? undefined
                      : (blendMode as any),
                }
              : stroke
          );

          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: { strokes: updatedStrokes },
              previousValues: { strokes: obj.strokes },
            },
          });
        }
        // Legacy strokes don't support blend modes
      }
    });
  };

  const handleRgbaChange = (rgba: {
    r: number;
    g: number;
    b: number;
    a: number;
  }) => {
    const hex = `#${Math.round(rgba.r)
      .toString(16)
      .padStart(2, "0")}${Math.round(rgba.g)
      .toString(16)
      .padStart(2, "0")}${Math.round(rgba.b)
      .toString(16)
      .padStart(2, "0")}`.toUpperCase();

    if (!activePopover) return;

    objects.forEach((obj) => {
      if (
        obj.type === "rectangle" ||
        obj.type === "ellipse" ||
        obj.type === "frame"
      ) {
        if (obj.strokes && obj.strokes.length > 0) {
          // Update the active stroke in new system
          const updatedStrokes = obj.strokes.map((stroke) =>
            stroke.id === activePopover && stroke.type === "solid"
              ? { ...stroke, color: hex, opacity: rgba.a }
              : stroke
          );

          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: { strokes: updatedStrokes },
              previousValues: { strokes: obj.strokes },
            },
          });
        } else if (obj.stroke && activePopover === "legacy-stroke") {
          // Update legacy stroke
          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: {
                stroke: hex,
                strokeOpacity: rgba.a,
              },
              previousValues: {
                stroke: obj.stroke,
                strokeOpacity: obj.strokeOpacity,
              },
            },
          });
        }
      }
    });
  };

  // Check if any selected objects support strokes
  const supportsStroke = objects.some(
    (obj) =>
      obj.type === "rectangle" || obj.type === "ellipse" || obj.type === "frame" || obj.type === "vector"
  );

  if (!supportsStroke) {
    return null;
  }

  return (
    <div className="" ref={strokeSectionRef}>
      <div
        className="text-xs font-medium text-gray-900 h-10 grid grid-cols-[1fr_auto] items-center pl-4 pr-2"
        style={{
          color: hasStrokes
            ? "var(--color-text)"
            : "var(--color-text-secondary)",
        }}
        onClick={() => {
          if (!hasStrokes) {
            handleAddStroke();
          }
        }}
      >
        <div className="hover:text-default">Stroke</div>

        {/* Add Stroke Button */}
        <button
          onClick={handleAddStroke}
          className="w-6 h-6 rounded-[5px] hover:bg-secondary"
        >
          <Icon24Plus />
        </button>
      </div>

      {/* Stroke Color Popover */}
      <PropertyPopover
        isOpen={activePopover !== null}
        onClose={closePopover}
        position={pickerPosition}
        onPositionChange={setPickerPosition}
        width={240}
        protectedZoneRef={strokeSectionRef}
        debug={true}
      >
        <PropertyPopoverHeader onClose={closePopover} />

        <FillPopoverContent
          activeTab="solid"
          onTabChange={() => {
            // Only solid colors supported for strokes for now
          }}
          activeFill={activeStrokeAsFill}
          onBlendModeChange={(blendMode) => {
            if (activePopover) {
              handleStrokeBlendModeChange(activePopover, blendMode);
            }
          }}
          onColorChange={handleColorChange}
          onRgbaChange={handleRgbaChange}
          onImageFitChange={() => {}}
          onImageRotation={() => {}}
          onImageUpload={() => {}}
          onImageAdjustmentChange={() => {}}
        />
      </PropertyPopover>

      <div className="">
        {hasMixedStrokes ? (
          <div className="text-xs text-tertiary px-4 pb-4 pt-2">
            Click + to replace mixed content
          </div>
        ) : strokes.length === 0 ? (
          <></>
        ) : (
          strokes
            .slice()
            .reverse()
            .map((stroke, index) => (
              <div key={stroke.id} className="last:pb-2">
                {/* Main stroke control grid */}
                <div className="grid grid-cols-[1fr_auto] gap-2 items-center pl-4 pr-2 h-8">
                  <FillTrigger
                    fill={{
                      id: stroke.id,
                      type: "solid",
                      color: stroke.type === "solid" ? stroke.color : "#000000",
                      opacity: stroke.opacity,
                      visible: stroke.visible,
                      blendMode: (stroke.blendMode as any) || "normal",
                    }}
                    onTriggerClick={(e) => openPopover(stroke.id, e)}
                    onColorChange={(color) =>
                      handleStrokeColorChange(stroke.id, color)
                    }
                    onOpacityChange={(opacity) =>
                      handleStrokeOpacityChange(stroke.id, opacity)
                    }
                    size="sm"
                    showLabel={true}
                    showOpacity={true}
                  />

                  <div className="flex items-center gap-1">
                    {/* Visibility toggle */}
                    <button
                      onClick={() => handleToggleStrokeVisibility(stroke.id)}
                      className="w-6 h-6 rounded-[5px] text-xs flex items-center justify-center hover:bg-secondary"
                      title={stroke.visible ? "Hide stroke" : "Show stroke"}
                    >
                      {stroke.visible ? (
                        <Icon24EyeSmall />
                      ) : (
                        <Icon24HiddenSmall />
                      )}
                    </button>

                    {/* Remove stroke */}
                    <button
                      onClick={() => handleRemoveStroke(stroke.id)}
                      className="w-6 h-6 rounded-[5px] text-xs flex items-center justify-center hover:bg-secondary"
                      title="Remove stroke"
                    >
                      <Icon24MinusSmall />
                    </button>
                  </div>
                </div>
              </div>
            ))
        )}

        {/* Stroke configuration - shown when there are strokes */}
        {hasStrokes && !hasMixedStrokes && (
          <div className="space-y-0 pb-3">
            <div className="grid grid-cols-[1fr_1fr_auto] grid-rows-[32px] gap-2 items-center pl-4 pr-2">
              {/* Stroke Position */}
              <Select
                value={
                  strokeConfig.strokePosition === "Mixed"
                    ? undefined
                    : strokeConfig.strokePosition || "inside"
                }
                onValueChange={(value) =>
                  handleStrokeConfigChange("strokePosition", value)
                }
              >
                <SelectTrigger className="w-full h-6">
                  <SelectValue
                    placeholder={
                      strokeConfig.strokePosition === "Mixed"
                        ? "Mixed"
                        : "Select position"
                    }
                  />
                </SelectTrigger>
                <SelectContent position="item-aligned">
                  <SelectItem value="inside">Inside</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="outside">Outside</SelectItem>
                </SelectContent>
              </Select>

              {/* Stroke Width - placed below the main control like other properties */}

              <PropertyInput
                label="Stroke Width"
                value={strokeConfig.strokeWidth}
                onChange={(value) =>
                  handleStrokeConfigChange("strokeWidth", value)
                }
                type="number"
                leadingIcon={<Icon24StrokeWeight className="text-secondary" />}
                min={0}
              />
              <div className="flex items-center gap-1">
                <Icon24AdjustSmall />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleIndividualWidths}
                  title={
                    showIndividualWidths
                      ? "Use unified stroke width"
                      : "Use individual stroke widths"
                  }
                >
                  <Icon24BorderSmall />
                </Button>
              </div>
            </div>

            {/* Individual Stroke Widths */}
            {showIndividualWidths && (
              <div className="px-4 pt-2">
                <div className="grid grid-cols-2 gap-2 pr-6">
                  <PropertyInput
                    label="Left"
                    value={
                      strokeConfig.strokeWidths === "Mixed"
                        ? "Mixed"
                        : typeof strokeConfig.strokeWidths === "object"
                        ? strokeConfig.strokeWidths?.left
                        : undefined
                    }
                    onChange={(value) => {
                      const currentWidths =
                        strokeConfig.strokeWidths === "Mixed" ||
                        typeof strokeConfig.strokeWidths !== "object"
                          ? {}
                          : strokeConfig.strokeWidths || {};
                      const newWidths = { ...currentWidths, left: value };
                      handleStrokeConfigChange("strokeWidths", newWidths);
                    }}
                    type="number"
                    leadingIcon={
                      <Icon24BorderLeftSmall className="text-secondary" />
                    }
                    min={0}
                  />
                  <PropertyInput
                    label="Top"
                    value={
                      strokeConfig.strokeWidths === "Mixed"
                        ? "Mixed"
                        : typeof strokeConfig.strokeWidths === "object"
                        ? strokeConfig.strokeWidths?.top
                        : undefined
                    }
                    onChange={(value) => {
                      const currentWidths =
                        strokeConfig.strokeWidths === "Mixed" ||
                        typeof strokeConfig.strokeWidths !== "object"
                          ? {}
                          : strokeConfig.strokeWidths || {};
                      const newWidths = { ...currentWidths, top: value };
                      handleStrokeConfigChange("strokeWidths", newWidths);
                    }}
                    type="number"
                    leadingIcon={
                      <Icon24BorderTopSmall className="text-secondary" />
                    }
                    min={0}
                  />
                  <PropertyInput
                    label="Right"
                    value={
                      strokeConfig.strokeWidths === "Mixed"
                        ? "Mixed"
                        : typeof strokeConfig.strokeWidths === "object"
                        ? strokeConfig.strokeWidths?.right
                        : undefined
                    }
                    onChange={(value) => {
                      const currentWidths =
                        strokeConfig.strokeWidths === "Mixed" ||
                        typeof strokeConfig.strokeWidths !== "object"
                          ? {}
                          : strokeConfig.strokeWidths || {};
                      const newWidths = { ...currentWidths, right: value };
                      handleStrokeConfigChange("strokeWidths", newWidths);
                    }}
                    type="number"
                    leadingIcon={
                      <Icon24BorderRightSmall className="text-secondary" />
                    }
                    min={0}
                  />
                  <PropertyInput
                    label="Bottom"
                    value={
                      strokeConfig.strokeWidths === "Mixed"
                        ? "Mixed"
                        : typeof strokeConfig.strokeWidths === "object"
                        ? strokeConfig.strokeWidths?.bottom
                        : undefined
                    }
                    onChange={(value) => {
                      const currentWidths =
                        strokeConfig.strokeWidths === "Mixed" ||
                        typeof strokeConfig.strokeWidths !== "object"
                          ? {}
                          : strokeConfig.strokeWidths || {};
                      const newWidths = { ...currentWidths, bottom: value };
                      handleStrokeConfigChange("strokeWidths", newWidths);
                    }}
                    type="number"
                    leadingIcon={
                      <Icon24BorderBottomSmall className="text-secondary" />
                    }
                    min={0}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
