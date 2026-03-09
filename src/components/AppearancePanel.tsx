"use client";

import { useAppStore } from "@/core/state/store";
import {
  normalizeBorderRadius,
  simplifyBorderRadius,
} from "@/core/utils/borderRadius";
import { isMixed, resolveAppearanceValues } from "@/core/utils/propertyUtils";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Icon24BlendmodeActiveSmall } from "./icons/icon-24-blendmode-active-small";
import { Icon24BlendmodeSmall } from "./icons/icon-24-blendmode-small";
import { Icon24Corners } from "./icons/icon-24-corners";
import { Icon24EyeSmall } from "./icons/icon-24-eye-small";
import { Icon24HiddenSmall } from "./icons/icon-24-hidden-small";
import { Icon24Opacity } from "./icons/icon-24-opacity";
import { Icon24RadiusBottomLeft } from "./icons/icon-24-radius-bottom-left";
import { Icon24RadiusBottomRight } from "./icons/icon-24-radius-bottom-right";
import { Icon24RadiusTopLeft } from "./icons/icon-24-radius-top-left";
import { Icon24RadiusTopRight } from "./icons/icon-24-radius-top-right";
import { Button } from "./ui/button";
import { CustomSelect } from "./ui/CustomSelect";
import { PropertyInput } from "./ui/PropertyInput";
import { SelectItem, SelectSeparator } from "./ui/select";

/**
 * Appearance Panel - Universal visual properties for all object types
 */
export default function AppearancePanel({
  objects,
  setShowSelectionUI,
}: {
  objects: any[];
  setShowSelectionUI?: ((show: boolean) => void) | null;
}) {
  const dispatch = useAppStore((state) => state.dispatch);
  const [showIndividualCorners, setShowIndividualCorners] =
    React.useState<boolean>(false);

  // Ref to track the selection hiding timeout
  const selectionHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function to temporarily hide selection UI during property changes (debounced)
  const withTemporarySelectionHiding = useCallback(
    (callback: () => void) => {
      // Execute the actual property change first
      callback();

      // Debounced selection hiding - clear any existing timeout
      if (setShowSelectionUI) {
        if (selectionHideTimeoutRef.current) {
          clearTimeout(selectionHideTimeoutRef.current);
        }

        // Hide selection immediately
        setShowSelectionUI(false);

        // Set a new timeout to show it again
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

  // Get appearance values for all objects
  const values = useMemo(() => {
    const result = resolveAppearanceValues(objects);
    // console.log("🎨 [AppearancePanel] Resolved appearance values:", {
    //   objects: objects.length,
    //   opacity: result.opacity,
    //   objectOpacities: objects.map((obj) => ({
    //     id: obj.id,
    //     opacity: obj.opacity,
    //   })),
    // });
    return result;
  }, [objects]);

  // Check if any selected objects support border radius
  const supportsBorderRadius = objects.some(
    (obj) => obj.type === "rectangle" || obj.type === "frame" || obj.type === "make"
  );

  // Auto-show individual corners when object has non-uniform radii
  useEffect(() => {
    if (
      supportsBorderRadius &&
      !values.isUniformBorderRadius &&
      !isMixed(values.borderRadius)
    ) {
      setShowIndividualCorners(true);
    }
  }, [supportsBorderRadius, values.isUniformBorderRadius, values.borderRadius]);

  const handleOpacityChange = useCallback(
    (value: number) => {
      withTemporarySelectionHiding(() => {
        objects.forEach((obj) => {
          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: { opacity: value },
              previousValues: { opacity: obj.opacity },
            },
          });
        });
      });
    },
    [objects, dispatch, withTemporarySelectionHiding]
  );

  const handleBlendModeChange = useCallback(
    (blendMode: string) => {
      withTemporarySelectionHiding(() => {
        objects.forEach((obj) => {
          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: {
                blendMode: blendMode === "pass-through" ? undefined : blendMode,
              },
              previousValues: { blendMode: obj.blendMode },
            },
          });
        });
      });
    },
    [objects, dispatch, withTemporarySelectionHiding]
  );

  const handleVisibilityToggle = useCallback(() => {
    withTemporarySelectionHiding(() => {
      objects.forEach((obj) => {
        dispatch({
          type: "object.updated",
          payload: {
            id: obj.id,
            changes: { visible: !obj.visible },
            previousValues: { visible: obj.visible },
          },
        });
      });
    });
  }, [objects, dispatch, withTemporarySelectionHiding]);

  const handleBorderRadiusChange = useCallback(
    (value: number) => {
      withTemporarySelectionHiding(() => {
        objects.forEach((obj) => {
          if (obj.type === "rectangle" || obj.type === "frame" || obj.type === "make") {
            const currentProperties = obj.properties || {};
            dispatch({
              type: "object.updated",
              payload: {
                id: obj.id,
                changes: {
                  properties: {
                    ...currentProperties,
                    borderRadius: value,
                  },
                },
                previousValues: {
                  properties: currentProperties,
                },
              },
            });
          }
        });
      });
    },
    [objects, dispatch, withTemporarySelectionHiding]
  );

  const handleIndividualCornerChange = useCallback(
    (
      corner: "topLeft" | "topRight" | "bottomRight" | "bottomLeft",
      value: number
    ) => {
      withTemporarySelectionHiding(() => {
        objects.forEach((obj) => {
          if (obj.type === "rectangle" || obj.type === "frame" || obj.type === "make") {
            const currentProperties = obj.properties || {};
            const currentRadius = currentProperties.borderRadius;

            // Normalize current radius to individual corners
            const corners = normalizeBorderRadius(currentRadius);

            // Update the specific corner
            const newCorners = { ...corners, [corner]: value };

            // Simplify if all corners are the same
            const newBorderRadius = simplifyBorderRadius(newCorners);

            dispatch({
              type: "object.updated",
              payload: {
                id: obj.id,
                changes: {
                  properties: {
                    ...currentProperties,
                    borderRadius: newBorderRadius,
                  },
                },
                previousValues: {
                  properties: currentProperties,
                },
              },
            });
          }
        });
      });
    },
    [objects, dispatch, withTemporarySelectionHiding]
  );

  const handleToggleIndividualCorners = useCallback(() => {
    setShowIndividualCorners((prev: boolean) => !prev);
  }, []);

  return (
    <div className="pl-4 pr-2 pb-3">
      <div
        className="text-xs font-medium h-10 flex items-center justify-between"
        style={{ color: "var(--color-text)" }}
      >
        Appearance
        {/* Visibility toggle - Universal for all objects */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleVisibilityToggle}
            className="w-6 h-6 rounded-[5px] text-xs flex items-center justify-center hover:bg-secondary"
            title={
              objects.length === 1
                ? objects[0].visible
                  ? "Hide object"
                  : "Show object"
                : "Toggle visibility"
            }
          >
            {objects.length === 1 && !objects[0].visible ? (
              <Icon24HiddenSmall />
            ) : objects.every((obj) => obj.visible) ? (
              <Icon24EyeSmall />
            ) : (
              <Icon24HiddenSmall />
            )}
          </button>
          {/* Blend Mode - For all objects */}
          <CustomSelect
            value={
              isMixed(values.blendMode)
                ? "Mixed"
                : (values.blendMode as string) || "pass-through"
            }
            onValueChange={handleBlendModeChange}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="text-xs hover:bg-secondary rounded-[5px] inline-flex items-center justify-center"
              >
                {!values.blendMode ? (
                  <Icon24BlendmodeSmall />
                ) : (
                  <Icon24BlendmodeActiveSmall />
                )}
              </Button>
            }
          >
            <SelectItem value="pass-through">Pass through</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectSeparator />
            <SelectItem value="darken">Darken</SelectItem>
            <SelectItem value="multiply">Multiply</SelectItem>
            <SelectItem value="plus-darker">Plus darker</SelectItem>
            <SelectItem value="color-burn">Color Burn</SelectItem>
            <SelectSeparator />
            <SelectItem value="lighten">Lighten</SelectItem>
            <SelectItem value="screen">Screen</SelectItem>
            <SelectItem value="plus-lighter">Plus lighter</SelectItem>
            <SelectItem value="color-dodge">Color dodge</SelectItem>
            <SelectSeparator />
            <SelectItem value="overlay">Overlay</SelectItem>
            <SelectItem value="soft-light">Soft Light</SelectItem>
            <SelectItem value="hard-light">Hard Light</SelectItem>
            <SelectSeparator />
            <SelectItem value="difference">Difference</SelectItem>
            <SelectItem value="exclusion">Exclusion</SelectItem>
            <SelectSeparator />
            <SelectItem value="hue">Hue</SelectItem>
            <SelectItem value="saturation">Saturation</SelectItem>
            <SelectItem value="color">Color</SelectItem>
            <SelectItem value="luminosity">Luminosity</SelectItem>
          </CustomSelect>
        </div>
      </div>

      <div className="space-y-3">
        {/* Opacity and Visibility - Universal for all objects */}
        <div>
          <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
            <PropertyInput
              label="Opacity"
              value={
                isMixed(values.opacity)
                  ? values.opacity
                  : Math.round((values.opacity as number) * 100)
              }
              onChange={(value) => {
                const decimalValue = value / 100;
                handleOpacityChange(decimalValue);
              }}
              type="number"
              leadingIcon={<Icon24Opacity className="text-secondary" />}
              min={0}
              max={100}
            />

            {/* Border Radius - For rectangles and frames */}
            {supportsBorderRadius && (
              <PropertyInput
                label="Border Radius"
                value={
                  isMixed(values.borderRadius)
                    ? values.borderRadius
                    : typeof values.borderRadius === "number"
                    ? values.borderRadius
                    : "Mixed"
                }
                onChange={handleBorderRadiusChange}
                type="number"
                leadingIcon={<Icon24Corners />}
                min={0}
              />
            )}

            {/* Individual corners toggle - For rectangles and frames */}
            {supportsBorderRadius && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleIndividualCorners}
                className={
                  showIndividualCorners
                    ? "bg-selected hover:bg-selected-secondary"
                    : ""
                }
                title="Toggle individual corner controls"
              >
                <Icon24Corners
                  className={showIndividualCorners ? "text-brand" : ""}
                />
              </Button>
            )}
          </div>

          {/* Individual Corner Radius Controls - Show when toggled */}
          {supportsBorderRadius &&
            showIndividualCorners &&
            !isMixed(values.borderRadius) && (
              <div className="">
                <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
                  <PropertyInput
                    label="Top Left"
                    value={
                      isMixed(values.individualCorners.topLeft)
                        ? values.individualCorners.topLeft
                        : values.individualCorners.topLeft
                    }
                    onChange={(value) =>
                      handleIndividualCornerChange("topLeft", value)
                    }
                    type="number"
                    leadingIcon={<Icon24RadiusTopLeft />}
                    min={0}
                  />
                  <PropertyInput
                    label="Top Right"
                    value={
                      isMixed(values.individualCorners.topRight)
                        ? values.individualCorners.topRight
                        : values.individualCorners.topRight
                    }
                    onChange={(value) =>
                      handleIndividualCornerChange("topRight", value)
                    }
                    type="number"
                    leadingIcon={<Icon24RadiusTopRight />}
                    min={0}
                  />
                </div>
                <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
                  <PropertyInput
                    label="Bottom Left"
                    value={
                      isMixed(values.individualCorners.bottomLeft)
                        ? values.individualCorners.bottomLeft
                        : values.individualCorners.bottomLeft
                    }
                    onChange={(value) =>
                      handleIndividualCornerChange("bottomLeft", value)
                    }
                    type="number"
                    leadingIcon={<Icon24RadiusBottomLeft />}
                    min={0}
                  />
                  <PropertyInput
                    label="Bottom Right"
                    value={
                      isMixed(values.individualCorners.bottomRight)
                        ? values.individualCorners.bottomRight
                        : values.individualCorners.bottomRight
                    }
                    onChange={(value) =>
                      handleIndividualCornerChange("bottomRight", value)
                    }
                    type="number"
                    leadingIcon={<Icon24RadiusBottomRight />}
                    min={0}
                  />
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
