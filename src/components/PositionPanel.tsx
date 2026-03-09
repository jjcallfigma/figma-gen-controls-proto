"use client";

import AlignmentControls from "@/components/AlignmentControls";
import { useAppStore } from "@/core/state/store";
import { convertToParentSpace } from "@/core/utils/coordinates";
import { resolvePositionSizeValues } from "@/core/utils/propertyUtils";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Icon24AlAbsolutePosition } from "./icons/icon-24-al-absolute-position";
import { Button } from "./ui/button";
import { PropertyInput } from "./ui/PropertyInput";

/**
 * Position Panel - X, Y coordinates and absolute positioning
 */
interface PositionPanelProps {
  objects: any[];
  dragCurrentPositions?: Record<string, { x: number; y: number }>;
  isDragging?: boolean;
  setShowSelectionUI?: ((show: boolean) => void) | null;
}

export default function PositionPanel({
  objects,
  dragCurrentPositions,
  isDragging,
  setShowSelectionUI,
}: PositionPanelProps) {
  const dispatch = useAppStore((state) => state.dispatch);
  const allObjects = useAppStore((state) => state.objects);

  // Ref to track the selection hiding timeout
  const selectionHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function to temporarily hide selection UI during property changes (debounced)
  const withTemporarySelectionHiding = useCallback(
    (callback: () => void) => {
      // Execute the actual property change first
      callback();

      // Debounced selection hiding - clear any existing timeout
      if (setShowSelectionUI) {
        // Clear previous timeout if it exists
        if (selectionHideTimeoutRef.current) {
          clearTimeout(selectionHideTimeoutRef.current);
        }

        // Hide selection immediately if not already hidden
        setShowSelectionUI(false);

        // Set new timeout to show selection again
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

  // Use useMemo to recalculate values whenever objects change
  const values = useMemo(() => {
    // Create modified objects with drag positions during dragging
    const objectsWithDragPositions = objects.map((obj) => {
      if (isDragging && dragCurrentPositions && dragCurrentPositions[obj.id]) {
        const worldDragPosition = dragCurrentPositions[obj.id];

        // Convert world drag position to appropriate coordinate space
        let displayX = worldDragPosition.x;
        let displayY = worldDragPosition.y;

        if (obj.parentId) {
          // Object has a parent - convert world position to parent-relative coordinates
          const relativePosition = convertToParentSpace(
            worldDragPosition,
            obj.parentId,
            allObjects
          );
          displayX = relativePosition.x;
          displayY = relativePosition.y;
        } else {
          // Top-level object - use world coordinates directly
        }

        return {
          ...obj,
          x: displayX,
          y: displayY,
        };
      }
      return obj;
    });

    return resolvePositionSizeValues(objectsWithDragPositions);
  }, [objects, dragCurrentPositions, isDragging, allObjects]);

  // Check if any selected object is a child of an auto layout frame
  const autoLayoutChildren = useMemo(() => {
    return objects.filter((obj) => {
      const parent = obj.parentId ? allObjects[obj.parentId] : null;
      return (
        parent?.type === "frame" &&
        parent.properties?.type === "frame" &&
        parent.properties.autoLayout?.mode !== "none"
      );
    });
  }, [objects, allObjects]);

  // Get absolute positioning state
  const absolutePositionState = useMemo(() => {
    if (autoLayoutChildren.length === 0) return null;

    const absoluteValues = autoLayoutChildren.map(
      (obj) => !!obj.absolutePositioned
    );
    const allSame = absoluteValues.every((val) => val === absoluteValues[0]);

    return {
      value: allSame ? absoluteValues[0] : "mixed",
      hasAutoLayoutChildren: true,
    };
  }, [autoLayoutChildren]);

  const handleChange = useCallback(
    (property: string, value: number) => {
      withTemporarySelectionHiding(() => {
        objects.forEach((object) => {
          dispatch({
            type: "object.updated",
            payload: {
              id: object.id,
              changes: { [property]: value },
              previousValues: { [property]: object[property] },
            },
          });
        });
      });
    },
    [objects, dispatch, withTemporarySelectionHiding]
  );

  const handleAbsolutePositionChange = useCallback(
    (checked: boolean) => {
      console.log("🔘 [ABSOLUTE-DEBUG] POSITION TOGGLE:", {
        checked,
        autoLayoutChildren: autoLayoutChildren.map((obj) => ({
          id: obj.id,
          type: obj.type,
          currentAbsolutePositioned: obj.absolutePositioned,
          currentAutoLayoutSizing: obj.autoLayoutSizing,
          parentId: obj.parentId,
        })),
      });

      autoLayoutChildren.forEach((object) => {
        console.log(
          "🔘 [ABSOLUTE-DEBUG] Dispatching absolute position change:",
          {
            objectId: object.id,
            fromValue: object.absolutePositioned || false,
            toValue: checked,
            currentSizing: object.autoLayoutSizing,
          }
        );

        // Prepare changes object
        const changes: any = { absolutePositioned: checked };
        const previousValues: any = {
          absolutePositioned: object.absolutePositioned || false,
        };

        // If setting to absolute positioning, convert any "fill" sizing to "fixed"
        // because absolutely positioned objects can't participate in auto-layout flow
        if (checked && object.autoLayoutSizing) {
          const currentSizing = object.autoLayoutSizing;
          const newSizing = { ...currentSizing };

          // Convert any "fill" sizing to "fixed"
          if (currentSizing.horizontal === "fill") {
            newSizing.horizontal = "fixed";
            console.log(
              "🔘 [ABSOLUTE-DEBUG] Converting horizontal sizing from 'fill' to 'fixed'"
            );
          }
          if (currentSizing.vertical === "fill") {
            newSizing.vertical = "fixed";
            console.log(
              "🔘 [ABSOLUTE-DEBUG] Converting vertical sizing from 'fill' to 'fixed'"
            );
          }

          // Only update if sizing actually changed
          if (
            newSizing.horizontal !== currentSizing.horizontal ||
            newSizing.vertical !== currentSizing.vertical
          ) {
            changes.autoLayoutSizing = newSizing;
            previousValues.autoLayoutSizing = currentSizing;
          }
        }

        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes,
            previousValues,
          },
        });
      });
    },
    [autoLayoutChildren, dispatch]
  );

  return (
    <div className="pl-4 pr-2 pb-3">
      <div
        className="text-xs font-medium h-10 flex items-center justify-between w-full"
        style={{ color: "var(--color-text)" }}
      >
        Position
        {absolutePositionState && (
          <div className="flex items-center space-x-2 h-8">
            <Button
              id="absolute-position"
              onClick={() =>
                handleAbsolutePositionChange(!absolutePositionState.value)
              }
              size="icon"
              variant="icon"
              className={cn(
                "h-6 w-6",
                absolutePositionState.value === true &&
                  "bg-selected hover:bg-selected-secondary"
              )}
            >
              <Icon24AlAbsolutePosition
                className={cn(
                  "w-6 h-6",
                  absolutePositionState.value === true && "text-brand"
                )}
              />
            </Button>
            {/*             
            {absolutePositionState.value === "mixed" && (
              <span className="text-xs text-gray-500">(mixed)</span>
            )} */}
          </div>
        )}
      </div>

      {/* Alignment Controls */}
      <AlignmentControls selectedObjects={objects} />

      {/* X and Y inputs */}
      <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
        <div>
          <PropertyInput
            label="X"
            value={values.x}
            onChange={(value) => handleChange("x", value)}
            type="number"
            leadingLabel="X"
          />
        </div>
        <div>
          <PropertyInput
            label="Y"
            value={values.y}
            onChange={(value) => handleChange("y", value)}
            type="number"
            leadingLabel="Y"
          />
        </div>
      </div>
    </div>
  );
}
