"use client";

import { useAppStore } from "@/core/state/store";
import {
  AutoLayoutObserverAPI,
  syncAutoLayoutPositionsFromDOM,
} from "@/core/utils/autoLayout";
import {
  isMixed,
  resolveFrameValues,
  resolvePositionSizeValues,
} from "@/core/utils/propertyUtils";
import { FrameProperties } from "@/types/canvas";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Icon24AlLayoutGridHorizontalSmall } from "./icons/icon-24-al-layout-grid-horizontal-small";
import { Icon24AlLayoutGridNoneSmall } from "./icons/icon-24-al-layout-grid-none-small";
import { Icon24AlLayoutGridVerticalSmall } from "./icons/icon-24-al-layout-grid-vertical-small";
import { Icon24AlPaddingBottom } from "./icons/icon-24-al-padding-bottom";
import { Icon24AlPaddingHorizontal } from "./icons/icon-24-al-padding-horizontal";
import { Icon24AlPaddingLeft } from "./icons/icon-24-al-padding-left";
import { Icon24AlPaddingRight } from "./icons/icon-24-al-padding-right";
import { Icon24AlPaddingSides } from "./icons/icon-24-al-padding-sides";
import { Icon24AlPaddingTop } from "./icons/icon-24-al-padding-top";
import { Icon24AlPaddingVertical } from "./icons/icon-24-al-padding-vertical";
import { Icon24AlSpacingHorizontal } from "./icons/icon-24-al-spacing-horizontal";
import { Icon24AlSpacingVertical } from "./icons/icon-24-al-spacing-vertical";
import { Icon24GridRow } from "./icons/icon-24-grid-row";
import { Icon24GridView } from "./icons/icon-24-grid-view";

import { applyAutoLayout } from "@/core/utils/applyAutoLayout";
import { Icon24AutolayoutAddVertical } from "./icons/icon-24-autolayout-add-vertical";
import { Icon24TextResizeFixed } from "./icons/icon-24-text-resize-fixed";
import { Icon24TextResizeHeight } from "./icons/icon-24-text-resize-height";
import { Icon24TextResizeWidth } from "./icons/icon-24-text-resize-width";
import { Icon24ThreecolumnsSmall } from "./icons/icon-24-threecolumns-small";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { PropertyInput } from "./ui/PropertyInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

interface LayoutPanelProps {
  objects: any[];
  setShowSelectionUI?: ((show: boolean) => void) | null;
}

// Type guard to check if an object has frame properties with autoLayout
function hasAutoLayout(obj: any): obj is { properties: { autoLayout?: any } } {
  return (
    obj?.properties?.type === "frame" &&
    obj?.properties?.autoLayout !== undefined
  );
}

// Type guard for frame objects
function isFrameObject(obj: any): obj is { properties: FrameProperties } {
  return obj?.properties?.type === "frame";
}

// Safe getter for autoLayout properties
function getAutoLayout(obj: any) {
  if (isFrameObject(obj)) {
    return obj.properties.autoLayout;
  }
  return undefined;
}

// Safe getter for autoLayout from properties object
function getAutoLayoutFromProperties(properties: any) {
  if (properties?.type === "frame") {
    return (properties as FrameProperties).autoLayout;
  }
  return undefined;
}

// Default autoLayout object for fallbacks
function getDefaultAutoLayout() {
  return {
    mode: "none" as const,
    direction: "normal" as const,
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    alignItems: "start" as const,
    justifyContent: "start" as const,
  };
}

/**
 * Capture child positions from the DOM while flexbox layout is still active.
 * Must be called BEFORE changing the auto layout mode to "none".
 * Returns relative positions (child position relative to the frame's top-left).
 */
function captureChildPositionsFromDOM(
  frameId: string,
  viewport: { zoom: number },
  childIds?: string[],
): Array<{ childId: string; x: number; y: number }> {
  const frameElement = document.querySelector(`[data-object-id="${frameId}"]`);
  if (!frameElement) return [];

  const frameRect = frameElement.getBoundingClientRect();
  const results: Array<{ childId: string; x: number; y: number }> = [];

  // Query each child element individually by data-object-id.
  // Children are nested inside StrokeWrapper's content div, so :scope > won't work.
  const ids =
    childIds ??
    Array.from(frameElement.querySelectorAll("[data-object-id]"))
      .filter((el) => {
        // Only include elements whose closest parent with data-object-id is the frame
        const parent = el.parentElement?.closest("[data-object-id]");
        return parent === frameElement;
      })
      .map((el) => el.getAttribute("data-object-id")!)
      .filter(Boolean);

  ids.forEach((childId) => {
    const childElement = frameElement.querySelector(
      `[data-object-id="${childId}"]`,
    );
    if (!childElement) return;

    const childRect = childElement.getBoundingClientRect();
    const relativeX = (childRect.left - frameRect.left) / viewport.zoom;
    const relativeY = (childRect.top - frameRect.top) / viewport.zoom;

    results.push({
      childId,
      x: Math.round(relativeX),
      y: Math.round(relativeY),
    });
  });

  return results;
}

/**
 * Layout Panel - Width, Height, and frame-specific layout properties (overflow)
 */
export default function LayoutPanel({
  objects,
  setShowSelectionUI,
}: LayoutPanelProps) {
  const dispatch = useAppStore((state) => state.dispatch);

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
    [setShowSelectionUI],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (selectionHideTimeoutRef.current) {
        clearTimeout(selectionHideTimeoutRef.current);
      }
    };
  }, []);

  // Get basic position/size values
  const values = useMemo(() => {
    return resolvePositionSizeValues(objects);
  }, [objects]);

  // Get frame-specific values for overflow
  const frameValues = useMemo(() => {
    const frameObjects = objects.filter((obj) => obj.type === "frame");
    return frameObjects.length > 0 ? resolveFrameValues(frameObjects) : null;
  }, [objects]);

  // Get text-specific objects for resize mode toggle
  const textObjects = useMemo(() => {
    return objects.filter((obj) => obj.type === "text");
  }, [objects]);

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
    [objects, dispatch, withTemporarySelectionHiding],
  );

  const handleOverflowChange = useCallback(
    (newOverflow: "visible" | "hidden") => {
      objects.forEach((object) => {
        if (object.type === "frame") {
          const currentProperties = object.properties || {};
          dispatch({
            type: "object.updated",
            payload: {
              id: object.id,
              changes: {
                properties: {
                  ...currentProperties,
                  overflow: newOverflow,
                },
              },
              previousValues: {
                properties: currentProperties,
              },
            },
          });
        }
      });
    },
    [objects, dispatch],
  );

  const handleAddAutoLayout = useCallback(() => {
    applyAutoLayout(dispatch);
  }, [dispatch]);

  // Check if any selected frame has active auto layout
  const hasActiveAutoLayout = useMemo(() => {
    return objects.some(
      (obj) =>
        obj.type === "frame" &&
        obj.properties?.type === "frame" &&
        obj.properties.autoLayout?.mode !== undefined &&
        obj.properties.autoLayout?.mode !== "none",
    );
  }, [objects]);

  return (
    <div className="pl-4 pr-2 pb-3">
      <div className="text-xs font-medium text-gray-900 h-10 flex items-center justify-between">
        <span>{hasActiveAutoLayout ? "Auto layout" : "Layout"}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleAddAutoLayout}
          className="h-6 w-6"
          title="Add auto layout (⇧A)"
        >
          <Icon24AutolayoutAddVertical className="w-4 h-4" />
        </Button>
      </div>

      {/* Mode Toggle Group - Auto Layout for frames, Text Resize for text */}
      {frameValues && textObjects.length === 0 && (
        <div className="grid grid-cols-[1fr_24px] w-full gap-2 h-8 items-center">
          <AutoLayoutModeToggle
            objects={objects}
            frameValues={frameValues}
            dispatch={dispatch}
          />
        </div>
      )}

      {textObjects.length > 0 && (
        <div className="grid grid-cols-[1fr_24px] w-full gap-2 h-8 items-center">
          <TextResizeModeToggle objects={objects} dispatch={dispatch} />
        </div>
      )}

      {/* Width and Height inputs */}
      <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
        <div>
          <PropertyInput
            label="Width"
            value={values.width}
            onChange={(value) => handleChange("width", value)}
            type="number"
            leadingLabel="W"
            min={0}
          />
        </div>
        <div>
          <PropertyInput
            label="Height"
            value={values.height}
            onChange={(value) => handleChange("height", value)}
            type="number"
            leadingLabel="H"
            min={0}
          />
        </div>
      </div>

      {/* Alignment Grid - 3x3 visual alignment control
      {frameValues && (
        <div className="grid grid-cols-[1fr_1fr_24px] grid-rows-[32px_32px] w-full gap-x-2 h-full items-center py-1">
          <div className="row-span-2 h-full w-full ">
            <AlignmentGrid
              objects={objects}
              frameValues={frameValues}
              dispatch={dispatch}
            />
          </div>
        </div>
      )} */}

      {/* Unified Auto Layout Sizing Controls */}
      <UnifiedAutoLayoutControls objects={objects} dispatch={dispatch} />

      {/* Frame-specific controls (overflow, gap, padding) */}
      {frameValues && (
        <FrameSpecificControls
          objects={objects}
          frameValues={frameValues}
          handleOverflowChange={handleOverflowChange}
          dispatch={dispatch}
          setShowSelectionUI={setShowSelectionUI}
        />
      )}
    </div>
  );
}

/**
 * AutoLayoutModeToggle component - handles auto-layout mode selection with toggle group
 */
function AutoLayoutModeToggle({
  objects,
  frameValues,
  dispatch,
}: {
  objects: any[];
  frameValues: any;
  dispatch: any;
}) {
  const allObjects = useAppStore((state) => state.objects);

  // Get fresh frame objects for computation
  const freshFrames = useMemo(() => {
    return objects
      .filter((obj) => obj.type === "frame")
      .map((obj) => allObjects[obj.id])
      .filter((obj) => obj && obj.type === "frame");
  }, [objects, allObjects]);

  const autoLayoutValues = useMemo(() => {
    if (freshFrames.length === 0) return null;

    const firstFrame = freshFrames[0];
    const autoLayout =
      firstFrame.type === "frame" &&
      (firstFrame.properties?.type === "frame" ||
        getAutoLayoutFromProperties(firstFrame.properties))
        ? getAutoLayout(firstFrame)
        : null;

    const defaultGap = 8;
    const defaultPadding = { top: 16, right: 16, bottom: 16, left: 16 };

    if (!autoLayout) {
      return {
        mode: "none",
        gap: defaultGap,
        padding: defaultPadding,
      };
    }

    const allSameMode = freshFrames.every(
      (obj) =>
        obj.type === "frame" &&
        (obj.properties?.type === "frame" ||
          getAutoLayoutFromProperties(obj.properties)) &&
        getAutoLayout(obj)?.mode === autoLayout?.mode,
    );

    return {
      mode: allSameMode ? autoLayout.mode : "mixed",
      direction: autoLayout.direction ?? "normal",
      gap: autoLayout.gap ?? defaultGap,
      padding: autoLayout.padding ?? defaultPadding,
      alignItems: autoLayout.alignItems ?? "start",
      justifyContent: autoLayout.justifyContent ?? "start",
    };
  }, [freshFrames]);

  const handleAutoLayoutModeChange = useCallback(
    (newMode: string) => {
      objects
        .filter((obj) => obj.type === "frame")
        .forEach((object) => {
          const currentProperties = object.properties || {};
          const currentAutoLayout =
            getAutoLayoutFromProperties(currentProperties) ||
            getDefaultAutoLayout();
          const oldMode = currentAutoLayout.mode || "none";

          // When switching from AL to none, capture child DOM positions BEFORE
          // changing the mode. Once mode is "none", flexbox is removed and
          // children would revert to stale stored positions.
          let capturedChildPositions: Array<{
            childId: string;
            x: number;
            y: number;
          }> | null = null;

          if (oldMode !== "none" && newMode === "none") {
            const freshObject = allObjects[object.id];
            capturedChildPositions = captureChildPositionsFromDOM(
              object.id,
              useAppStore.getState().viewport,
              freshObject?.childIds,
            );

            // If the frame uses hug sizing, capture its current DOM
            // dimensions and lock them in as fixed size before removing AL.
            // Otherwise the frame collapses because fit-content has no
            // effect without a flex container.
            const isHugH = freshObject?.autoLayoutSizing?.horizontal === "hug";
            const isHugV = freshObject?.autoLayoutSizing?.vertical === "hug";

            if (isHugH || isHugV) {
              const frameEl = document.querySelector(
                `[data-object-id="${object.id}"]`,
              );
              if (frameEl) {
                const rect = frameEl.getBoundingClientRect();
                const sizeChanges: Record<string, any> = {
                  autoLayoutSizing: {
                    horizontal: "fixed",
                    vertical: "fixed",
                  },
                };
                if (isHugH)
                  sizeChanges.width = Math.round((rect.width / useAppStore.getState().viewport.zoom) * 100) / 100;
                if (isHugV)
                  sizeChanges.height = Math.round((rect.height / useAppStore.getState().viewport.zoom) * 100) / 100;

                dispatch({
                  type: "object.updated",
                  payload: {
                    id: object.id,
                    changes: sizeChanges,
                    previousValues: {
                      width: freshObject.width,
                      height: freshObject.height,
                      autoLayoutSizing: freshObject.autoLayoutSizing,
                    },
                  },
                });
              }
            }
          }

          // Smart align/justify swapping when changing direction
          let newAutoLayout = { ...currentAutoLayout, mode: newMode };

          // Set default grid dimensions when switching to grid mode
          if (newMode === "grid") {
            if (!(newAutoLayout as any).gridColumns)
              (newAutoLayout as any).gridColumns = 4;
            if (!(newAutoLayout as any).gridRows)
              (newAutoLayout as any).gridRows = 3;
          }

          // Swap align and justify when switching between horizontal and vertical
          if (
            (oldMode === "horizontal" && newMode === "vertical") ||
            (oldMode === "vertical" && newMode === "horizontal")
          ) {
            const oldJustify = currentAutoLayout.justifyContent;
            const oldAlign = currentAutoLayout.alignItems;

            // Handle swapping with proper type safety
            let newJustify: string;
            let newAlign: string;

            // If alignItems is "stretch", it should remain as alignItems (cross-axis)
            if (oldAlign === "stretch") {
              newAlign = "stretch";
              newJustify = oldJustify || "start";
            }
            // If justifyContent is a spacing value, it should become alignItems if possible
            else if (
              ["space-between", "space-around", "space-evenly"].includes(
                oldJustify || "",
              )
            ) {
              newJustify = oldAlign || "start"; // alignItems becomes justifyContent
              newAlign = "start"; // spacing values can't be alignItems, default to start
            }
            // Normal case: simple swap
            else {
              newJustify = oldAlign || "start";
              newAlign = oldJustify || "start";
            }

            newAutoLayout.justifyContent = newJustify as any;
            newAutoLayout.alignItems = newAlign as any;
          }

          dispatch({
            type: "object.updated",
            payload: {
              id: object.id,
              changes: {
                properties: {
                  ...currentProperties,
                  autoLayout: newAutoLayout,
                },
              },
              previousValues: {
                properties: currentProperties,
              },
            },
          });

          // Apply captured positions when switching from AL to none
          if (capturedChildPositions && capturedChildPositions.length > 0) {
            capturedChildPositions.forEach(({ childId, x, y }) => {
              const child = allObjects[childId];
              if (child) {
                dispatch({
                  type: "object.updated",
                  payload: {
                    id: childId,
                    changes: { x, y },
                    previousValues: { x: child.x, y: child.y },
                  },
                });
              }
            });
          }

          // Initialize autoLayoutSizing on all children when enabling auto layout
          if (newMode !== "none" && oldMode === "none") {
            const freshObject = allObjects[object.id];
            if (freshObject?.childIds) {
              freshObject.childIds.forEach((childId: string) => {
                const child = allObjects[childId];
                if (child && !child.autoLayoutSizing) {
                  dispatch({
                    type: "object.updated",
                    payload: {
                      id: childId,
                      changes: {
                        autoLayoutSizing: {
                          horizontal: "fixed",
                          vertical: "fixed",
                        },
                      },
                      previousValues: {
                        autoLayoutSizing: undefined,
                      },
                    },
                  });
                }
              });
            }
          }

          // Sync positions when auto layout mode changes
          if (oldMode !== newMode) {
            if (oldMode === "none" && newMode !== "none") {
              // Frame is becoming an auto layout frame - start observing it
              setTimeout(() => {
                const freshState = useAppStore.getState();
                syncAutoLayoutPositionsFromDOM(
                  object.id,
                  freshState.objects,
                  freshState.viewport,
                  dispatch,
                );
                AutoLayoutObserverAPI.observeFrame(
                  object.id,
                  freshState.objects,
                  freshState.viewport,
                  dispatch,
                );

                const parentId = freshState.objects[object.id]?.parentId;
                if (
                  parentId &&
                  freshState.objects[parentId]?.type === "frame"
                ) {
                  AutoLayoutObserverAPI.observeFrame(
                    parentId,
                    freshState.objects,
                    freshState.viewport,
                    dispatch,
                  );
                }
              }, 50);
            } else if (oldMode !== "none" && newMode === "none") {
              // Frame is no longer an auto layout frame - stop observing it
              AutoLayoutObserverAPI.unobserveFrame(object.id);
              // Positions already captured and applied above
            } else if (oldMode !== "none" && newMode !== "none") {
              // Mode changed but still auto layout - re-observe to pick up new mode
              setTimeout(() => {
                AutoLayoutObserverAPI.unobserveFrame(object.id);
                const freshState = useAppStore.getState();
                syncAutoLayoutPositionsFromDOM(
                  object.id,
                  freshState.objects,
                  freshState.viewport,
                  dispatch,
                );
                AutoLayoutObserverAPI.observeFrame(
                  object.id,
                  freshState.objects,
                  freshState.viewport,
                  dispatch,
                );
              }, 50);
            }
          }
        });
    },
    [objects, dispatch, allObjects],
  );

  if (!autoLayoutValues) return null;

  return (
    <div className="w-full">
      <ToggleGroup
        type="single"
        value={
          autoLayoutValues.mode === "mixed" ? undefined : autoLayoutValues.mode
        }
        onValueChange={handleAutoLayoutModeChange}
        className="w-full bg-secondary rounded-[5px] "
      >
        <ToggleGroupItem value="none">
          <Icon24AlLayoutGridNoneSmall />
        </ToggleGroupItem>

        <ToggleGroupItem value="vertical">
          <Icon24AlLayoutGridVerticalSmall />
        </ToggleGroupItem>
        <ToggleGroupItem value="horizontal">
          <Icon24AlLayoutGridHorizontalSmall />
        </ToggleGroupItem>
        <ToggleGroupItem value="grid">
          <Icon24GridView />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

/**
 * TextResizeModeToggle component - handles text resize mode selection
 */
function TextResizeModeToggle({
  objects,
  dispatch,
}: {
  objects: any[];
  dispatch: any;
}) {
  const textObjects = useMemo(() => {
    return objects.filter((obj) => obj.type === "text");
  }, [objects]);

  const resizeModeValue = useMemo(() => {
    if (textObjects.length === 0) return null;

    const firstTextProps = textObjects[0].properties;
    const firstResizeMode = firstTextProps?.resizeMode || "auto-width";

    // Check if all text objects have the same resize mode
    const allSameResizeMode = textObjects.every((obj) => {
      const resizeMode = obj.properties?.resizeMode || "auto-width";
      return resizeMode === firstResizeMode;
    });

    return allSameResizeMode ? firstResizeMode : undefined;
  }, [textObjects]);

  const handleTextResizeModeChange = useCallback(
    (newMode: string) => {
      textObjects.forEach((obj) => {
        const currentProperties = obj.properties || {};
        const currentSizing = obj.autoLayoutSizing || {
          horizontal: "fixed",
          vertical: "fixed",
        };

        // Determine what autoLayoutSizing must change to stay consistent
        let newSizing = { ...currentSizing };
        if (newMode === "auto-width") {
          // Auto width: both dimensions hug content
          newSizing.horizontal = "hug";
          newSizing.vertical = "hug";
        } else if (newMode === "auto-height") {
          // Auto height: width is fixed/fill, height hugs content
          if (currentSizing.horizontal === "hug") {
            newSizing.horizontal = "fixed";
          }
          newSizing.vertical = "hug";
        } else if (newMode === "fixed") {
          // Fixed: both dimensions can be fixed/fill but not hug
          if (currentSizing.horizontal === "hug") {
            newSizing.horizontal = "fixed";
          }
          if (currentSizing.vertical === "hug") {
            newSizing.vertical = "fixed";
          }
        }

        // Dispatch property change
        dispatch({
          type: "object.updated",
          payload: {
            id: obj.id,
            changes: {
              properties: {
                ...currentProperties,
                resizeMode: newMode,
              },
            },
            previousValues: {
              properties: currentProperties,
            },
          },
        });

        // Dispatch sizing change if needed
        const sizingChanged =
          newSizing.horizontal !== currentSizing.horizontal ||
          newSizing.vertical !== currentSizing.vertical;
        if (sizingChanged) {
          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: { autoLayoutSizing: newSizing },
              previousValues: { autoLayoutSizing: currentSizing },
            },
          });
        }
      });
    },
    [textObjects, dispatch],
  );

  if (textObjects.length === 0) return null;

  return (
    <div className="w-full">
      <ToggleGroup
        type="single"
        value={resizeModeValue}
        onValueChange={handleTextResizeModeChange}
        className="w-full bg-secondary rounded-[5px] "
      >
        <ToggleGroupItem value="auto-width">
          <Icon24TextResizeWidth />
        </ToggleGroupItem>
        <ToggleGroupItem value="auto-height">
          <Icon24TextResizeHeight />
        </ToggleGroupItem>
        <ToggleGroupItem value="fixed">
          <Icon24TextResizeFixed />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

/**
 * AlignmentGrid component - 3x3 visual grid for alignment control
 */
function AlignmentGrid({
  objects,
  frameValues,
  dispatch,
}: {
  objects: any[];
  frameValues: any;
  dispatch: any;
}) {
  const allObjects = useAppStore((state) => state.objects);

  // Get fresh frame objects for computation
  const freshFrames = useMemo(() => {
    return objects
      .filter((obj) => obj.type === "frame")
      .map((obj) => allObjects[obj.id])
      .filter((obj) => obj && obj.type === "frame");
  }, [objects, allObjects]);

  const autoLayoutValues = useMemo(() => {
    if (freshFrames.length === 0) return null;

    const firstFrame = freshFrames[0];
    const autoLayout =
      firstFrame.type === "frame" &&
      (firstFrame.properties?.type === "frame" ||
        getAutoLayoutFromProperties(firstFrame.properties))
        ? getAutoLayout(firstFrame)
        : null;

    if (!autoLayout || autoLayout.mode === "none") {
      return null;
    }

    const allSameMode = freshFrames.every(
      (obj) =>
        obj.type === "frame" &&
        (obj.properties?.type === "frame" ||
          getAutoLayoutFromProperties(obj.properties)) &&
        getAutoLayout(obj)?.mode === autoLayout?.mode,
    );

    // Normalize "stretch" → "start" for the alignment grid.
    // CSS stretch is modeled by child sizing ("fill"), not parent alignment.
    const normalizedAlign =
      autoLayout.alignItems === "stretch"
        ? "start"
        : (autoLayout.alignItems ?? "start");

    return {
      mode: allSameMode ? autoLayout.mode : "mixed",
      alignItems: normalizedAlign,
      justifyContent: autoLayout.justifyContent ?? "start",
    };
  }, [freshFrames]);

  const handleAlignmentChange = useCallback(
    (gridJustify: string, gridAlign: string) => {
      objects
        .filter((obj) => obj.type === "frame")
        .forEach((object) => {
          const currentProperties = object.properties || {};
          const currentAutoLayout =
            getAutoLayoutFromProperties(currentProperties) ||
            getDefaultAutoLayout();

          // Map grid position to actual justify/align values based on auto-layout direction
          let actualJustifyContent: string;
          let actualAlignItems: string;

          if (autoLayoutValues?.mode === "vertical") {
            // In vertical mode, the grid mapping is swapped:
            // - Grid columns (gridJustify) represent alignItems (cross-axis)
            // - Grid rows (gridAlign) represent justifyContent (main-axis)
            actualJustifyContent = gridAlign;
            actualAlignItems = gridJustify;
          } else {
            // In horizontal mode (or other modes), normal mapping:
            // - Grid columns (gridJustify) represent justifyContent (main-axis)
            // - Grid rows (gridAlign) represent alignItems (cross-axis)
            actualJustifyContent = gridJustify;
            actualAlignItems = gridAlign;
          }

          dispatch({
            type: "object.updated",
            payload: {
              id: object.id,
              changes: {
                properties: {
                  ...currentProperties,
                  autoLayout: {
                    ...currentAutoLayout,
                    justifyContent: actualJustifyContent,
                    alignItems: actualAlignItems,
                  },
                },
              },
              previousValues: {
                properties: currentProperties,
              },
            },
          });
        });
    },
    [objects, dispatch, autoLayoutValues?.mode],
  );

  if (!autoLayoutValues) return null;

  // Grid positions mapping justify x align combinations
  const gridPositions = [
    // Top row
    { justify: "start", align: "start", position: "top-left" },
    { justify: "center", align: "start", position: "top-center" },
    { justify: "end", align: "start", position: "top-right" },
    // Middle row
    { justify: "start", align: "center", position: "middle-left" },
    { justify: "center", align: "center", position: "middle-center" },
    { justify: "end", align: "center", position: "middle-right" },
    // Bottom row
    { justify: "start", align: "end", position: "bottom-left" },
    { justify: "center", align: "end", position: "bottom-center" },
    { justify: "end", align: "end", position: "bottom-right" },
  ];

  const isActive = (justify: string, align: string) => {
    // For horizontal auto-layout: justify=columns, align=rows (normal)
    // For vertical auto-layout: justify=rows, align=columns (swapped)
    if (autoLayoutValues.mode === "vertical") {
      // In vertical mode, the grid mapping is swapped:
      // - Grid columns represent alignItems (cross-axis)
      // - Grid rows represent justifyContent (main-axis)
      return (
        autoLayoutValues.justifyContent === align &&
        autoLayoutValues.alignItems === justify
      );
    } else {
      // In horizontal mode (or other modes), normal mapping:
      // - Grid columns represent justifyContent (main-axis)
      // - Grid rows represent alignItems (cross-axis)
      return (
        autoLayoutValues.justifyContent === justify &&
        autoLayoutValues.alignItems === align
      );
    }
  };

  // Special justify-content options
  const specialJustifyOptions = [
    { value: "space-between", label: "Space Between", icon: "⌯" },
    { value: "space-around", label: "Space Around", icon: "⌬" },
    { value: "space-evenly", label: "Space Evenly", icon: "⌮" },
  ];

  const hasSpecialJustify = specialJustifyOptions.some(
    (opt) => opt.value === autoLayoutValues.justifyContent,
  );

  return (
    <div className="w-full h-full">
      {/* Main 3x3 Grid */}
      <div className="grid grid-cols-3 grid-rows-3 gap-0 w-full h-full  bg-secondary rounded-[5px] py-1">
        {gridPositions.map(({ justify, align, position }) => (
          <button
            key={position}
            onClick={() => handleAlignmentChange(justify, align)}
            className={`
              w-full h-full rounded-[2px] border border-transparent group
               flex items-center justify-center
              
            `}
            title={
              autoLayoutValues.mode === "vertical"
                ? `Justify: ${align}, Align: ${justify}`
                : `Justify: ${justify}, Align: ${align}`
            }
          >
            {!isActive(justify, align) && (
              <div className=" w-[2px] h-[2px] bg-[var(--color-icon-tertiary)] rounded-[2px] border-1 border-[var(--color-icon-tertiary)] group-hover:hidden block"></div>
            )}

            {isActive(justify, align) && (
              <div
                className="w-max h-max flex gap-[2px]"
                style={{
                  flexDirection:
                    autoLayoutValues.mode === "horizontal" ? "row" : "column",
                  justifyContent:
                    autoLayoutValues.mode === "horizontal" ? justify : align,
                  alignItems:
                    autoLayoutValues.mode === "horizontal" ? align : justify,
                }}
              >
                <div
                  className=" bg-[var(--color-icon-brand)] rounded-[2px] border-1 border-[var(--color-icon-brand)]"
                  style={{
                    width:
                      autoLayoutValues.mode !== "horizontal" ? "7px" : "2px",
                    height:
                      autoLayoutValues.mode !== "horizontal" ? "2px" : "7px",
                  }}
                ></div>
                <div
                  className=" bg-[var(--color-icon-brand)] rounded-[2px] border-1 border-[var(--color-icon-brand)]"
                  style={{
                    width:
                      autoLayoutValues.mode !== "horizontal" ? "10px" : "2px",
                    height:
                      autoLayoutValues.mode !== "horizontal" ? "2px" : "10px",
                  }}
                ></div>
                <div
                  className="bg-[var(--color-icon-brand)] rounded-[2px] border-1 border-[var(--color-icon-brand)]"
                  style={{
                    width:
                      autoLayoutValues.mode !== "horizontal" ? "5px" : "2px",
                    height:
                      autoLayoutValues.mode !== "horizontal" ? "2px" : "5px",
                  }}
                ></div>
              </div>
            )}

            {!isActive(justify, align) && (
              <div
                className="w-max h-max  gap-[2px] group-hover:flex hidden "
                style={{
                  flexDirection:
                    autoLayoutValues.mode === "horizontal" ? "row" : "column",
                  justifyContent:
                    autoLayoutValues.mode === "horizontal" ? justify : align,
                  alignItems:
                    autoLayoutValues.mode === "horizontal" ? align : justify,
                }}
              >
                <div
                  className=" bg-[var(--color-icon-secondary)] rounded-[2px] border-1 border-[var(--color-icon-secondary)]"
                  style={{
                    width:
                      autoLayoutValues.mode !== "horizontal" ? "7px" : "2px",
                    height:
                      autoLayoutValues.mode !== "horizontal" ? "2px" : "7px",
                  }}
                ></div>
                <div
                  className=" bg-[var(--color-icon-secondary)] rounded-[2px] border-1 border-[var(--color-icon-secondary)]"
                  style={{
                    width:
                      autoLayoutValues.mode !== "horizontal" ? "10px" : "2px",
                    height:
                      autoLayoutValues.mode !== "horizontal" ? "2px" : "10px",
                  }}
                ></div>
                <div
                  className="bg-[var(--color-icon-secondary)] rounded-[2px] border-1 border-[var(--color-icon-secondary)]"
                  style={{
                    width:
                      autoLayoutValues.mode !== "horizontal" ? "5px" : "2px",
                    height:
                      autoLayoutValues.mode !== "horizontal" ? "2px" : "5px",
                  }}
                ></div>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Special Justify Options */}
      {/* <div className="flex gap-1 mt-2 justify-center">
        {specialJustifyOptions.map(({ value, label, icon }) => (
          <button
            key={value}
            onClick={() =>
              handleAlignmentChange(value, autoLayoutValues.alignItems)
            }
            className={`
              px-2 py-1 text-xs rounded border border-transparent transition-all duration-150
              hover:bg-white hover:border-gray-300
              ${
                autoLayoutValues.justifyContent === value
                  ? "bg-white border-blue-500 shadow-sm text-blue-700"
                  : "bg-gray-100 text-gray-600"
              }
            `}
            title={label}
          >
            {icon}
          </button>
        ))}

        <button
          onClick={() =>
            handleAlignmentChange(autoLayoutValues.justifyContent, "stretch")
          }
          className={`
            px-2 py-1 text-xs rounded border border-transparent transition-all duration-150
            hover:bg-white hover:border-gray-300
            ${
              autoLayoutValues.alignItems === "stretch"
                ? "bg-white border-blue-500 shadow-sm text-blue-700"
                : "bg-gray-100 text-gray-600"
            }
          `}
          title="Stretch (fill cross axis)"
        >
          ↕
        </button>
      </div> */}
    </div>
  );
}

/**
 * GridSizePicker - mini grid preview + popover for selecting grid columns/rows
 */
function GridSizePicker({
  columns,
  rows,
  onDimensionChange,
}: {
  columns: number;
  rows: number;
  onDimensionChange: (cols: number, rows: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  const MAX_GRID = 12;
  const CELL_SIZE = 14;
  const CELL_GAP = 2;
  const CELL_STEP = CELL_SIZE + CELL_GAP;

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleOpen = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopoverPos({
        top: rect.top - 4,
        left: rect.left - 4,
      });
    }
    setIsOpen((prev) => !prev);
    setHoverCol(null);
    setHoverRow(null);
  }, []);

  const handleCellClick = useCallback(
    (col: number, row: number) => {
      onDimensionChange(col, row);
      setIsOpen(false);
    },
    [onDimensionChange],
  );

  const handleCellHover = useCallback((col: number, row: number) => {
    setHoverCol(col);
    setHoverRow(row);
  }, []);

  const handleGridMouseLeave = useCallback(() => {
    setHoverCol(null);
    setHoverRow(null);
  }, []);

  const previewMaxCells = 6;
  const previewCols = Math.min(columns, previewMaxCells);
  const previewRows = Math.min(rows, previewMaxCells);

  return (
    <div className="h-full w-full">
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className="h-full w-full bg-secondary rounded-[5px] flex flex-col items-center justify-center hover:border hover:border-default transition-colors relative"
        title={`Grid: ${columns} columns × ${rows} rows`}
      >
        <div
          className="grid gap-[2px] w-full h-full px-[3px] py-[3px]"
          style={{ gridTemplateColumns: `repeat(${previewCols}, 1fr)` }}
        >
          {Array.from({ length: previewCols * previewRows }).map((_, i) => (
            <div key={i} className="w-full h-full rounded-[1.5px] bg-default" />
          ))}
        </div>
        <span className="text-[11px]  leading-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {columns} × {rows}
        </span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            data-property-popover="true"
            className="fixed z-50 bg-default rounded-xl shadow-500 p-2 w-[210px] flex flex-col gap-2"
            style={{
              top: popoverPos.top - 32,
              left: popoverPos.left - 2,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header: Column × Row inputs */}
            <div className="flex items-center gap-1">
              <div className="flex-1">
                <PropertyInput
                  label="Columns"
                  value={columns}
                  onChange={(v: number) => onDimensionChange(v, rows)}
                  type="number"
                  min={1}
                  max={20}
                  leadingIcon={
                    <Icon24ThreecolumnsSmall className="text-secondary" />
                  }
                />
              </div>
              <span className="text-[11px] text-secondary px-0.5">×</span>
              <div className="flex-1">
                <PropertyInput
                  label="Rows"
                  value={rows}
                  onChange={(v: number) => onDimensionChange(columns, v)}
                  type="number"
                  min={1}
                  max={20}
                  leadingIcon={<Icon24GridRow className="text-secondary" />}
                />
              </div>
            </div>

            {/* Interactive Grid */}
            <div className="relative">
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${MAX_GRID}, 1fr)`,
                  gap: `${CELL_GAP}px`,
                }}
                onMouseLeave={handleGridMouseLeave}
              >
                {Array.from({ length: 12 * 8 }).map((_, i) => {
                  const col = (i % MAX_GRID) + 1;
                  const row = Math.floor(i / MAX_GRID) + 1;
                  const isHighlighted =
                    hoverCol !== null && hoverRow !== null
                      ? col <= hoverCol && row <= hoverRow
                      : col <= columns && row <= rows;

                  return (
                    <div
                      key={i}
                      className={`rounded-[3px]  ${
                        isHighlighted
                          ? "bg-[var(--color-bg-selected)] border border-[var(--color-bg-brand)]"
                          : "bg-[var(--color-bg-secondary)]"
                      }`}
                      style={{ width: CELL_SIZE, height: CELL_SIZE }}
                      onMouseEnter={() => handleCellHover(col, row)}
                      onClick={() => handleCellClick(col, row)}
                    />
                  );
                })}
              </div>

              {/* Floating dimension tooltip near the hover position */}
              {hoverCol !== null && hoverRow !== null && (
                <div
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: `${(hoverCol - 1) * CELL_STEP + CELL_SIZE / 2}px`,
                    top: `${hoverRow * CELL_STEP}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <div className="bg-gray-800 text-white text-[11px] px-2 py-0.5 rounded-[5px] whitespace-nowrap shadow-lg mt-1">
                    {hoverCol} × {hoverRow}
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * UnifiedAutoLayoutControls component - handles sizing for both frames and children
 */
function UnifiedAutoLayoutControls({
  objects,
  dispatch,
}: {
  objects: any[];
  dispatch: any;
}) {
  const allObjects = useAppStore((state) => state.objects);

  // Analyze what types of objects we have selected
  // Get fresh objects that can have auto layout sizing (frames or children of auto layout frames)
  const freshObjects = useMemo(() => {
    const mappedObjects = objects.map((obj) => allObjects[obj.id]);

    return mappedObjects.filter((obj) => {
      if (!obj) {
        return false;
      }

      // Include any object that is a child of an auto layout frame OR is a frame itself
      const parent = obj.parentId ? allObjects[obj.parentId] : null;
      const isChildOfAutoLayout =
        parent?.type === "frame" &&
        // Check if parent has properties.autoLayout (for regular frames)
        ((parent.properties?.type === "frame" &&
          getAutoLayoutFromProperties(parent.properties)?.mode &&
          getAutoLayoutFromProperties(parent.properties)?.mode !== "none") ||
          // OR check if parent has properties.autoLayout WITHOUT properties.type (for instances)
          (getAutoLayoutFromProperties(parent.properties)?.mode &&
            getAutoLayoutFromProperties(parent.properties)?.mode !== "none"));

      // Always include frames OR children of auto layout frames
      if (obj.type === "frame") {
        return true;
      }

      return isChildOfAutoLayout;
    });
  }, [objects, allObjects]);

  // Get unified sizing values for frames
  const sizingValues = useMemo(() => {
    // Collect width and height values from selected frames
    const widthValues: string[] = [];
    const heightValues: string[] = [];

    freshObjects.forEach((obj: any) => {
      // Check if object is child of auto layout (can use FILL)
      const parent = obj.parentId ? allObjects[obj.parentId] : null;
      const isChildOfAutoLayout =
        parent?.type === "frame" &&
        // Check if parent has properties.autoLayout (for regular frames)
        ((parent.properties?.type === "frame" &&
          getAutoLayoutFromProperties(parent.properties)?.mode &&
          getAutoLayoutFromProperties(parent.properties)?.mode !== "none") ||
          // OR check if parent has properties.autoLayout WITHOUT properties.type (for instances)
          (getAutoLayoutFromProperties(parent.properties)?.mode &&
            getAutoLayoutFromProperties(parent.properties)?.mode !== "none"));

      // Check if object has auto layout (can use HUG) - only frames can have auto layout
      const hasAutoLayout =
        obj.type === "frame" &&
        ((obj.properties?.type === "frame" &&
          getAutoLayout(obj)?.mode &&
          getAutoLayout(obj)?.mode !== "none") ||
          ((obj as any).autoLayout?.mode &&
            (obj as any).autoLayout.mode !== "none") ||
          // CRITICAL: Also check properties.autoLayout for instances (without properties.type)
          (getAutoLayoutFromProperties(obj.properties)?.mode &&
            getAutoLayout(obj)?.mode !== "none"));

      // For any object that can have auto layout sizing
      let widthValue = "fixed";
      let heightValue = "fixed";

      // Universal approach - everyone uses autoLayoutSizing
      const objectSizing = obj.autoLayoutSizing || {
        horizontal: "fixed",
        vertical: "fixed",
      };

      widthValue = objectSizing.horizontal;
      heightValue = objectSizing.vertical;

      widthValues.push(widthValue);
      heightValues.push(heightValue);
    });

    if (widthValues.length === 0) {
      return null;
    }

    const width = isMixed({ value: widthValues }) ? "mixed" : widthValues[0];
    const height = isMixed({ value: heightValues }) ? "mixed" : heightValues[0];

    return { width, height };
  }, [freshObjects, allObjects]);

  // Get available options based on selected frames
  const availableOptions = useMemo(() => {
    const options = ["fixed"]; // Always available

    let canFill = false;
    let canHug = false;

    freshObjects.forEach((obj: any) => {
      // Check if object is child of auto layout (can use FILL)
      const parent = obj.parentId ? allObjects[obj.parentId] : null;
      const isChildOfAutoLayout =
        parent?.type === "frame" &&
        // Check if parent has properties.autoLayout (for regular frames)
        ((parent.properties?.type === "frame" &&
          getAutoLayoutFromProperties(parent.properties)?.mode &&
          getAutoLayoutFromProperties(parent.properties)?.mode !== "none") ||
          // OR check if parent has properties.autoLayout WITHOUT properties.type (for instances)
          (getAutoLayoutFromProperties(parent.properties)?.mode &&
            getAutoLayoutFromProperties(parent.properties)?.mode !== "none"));

      // IMPORTANT: Absolutely positioned objects cannot use FILL
      // They are taken out of the auto-layout flow and don't participate in sizing
      const isAbsolutelyPositioned = obj.absolutePositioned === true;

      // Only allow FILL for auto-layout children that are NOT absolutely positioned
      const canUseFill = isChildOfAutoLayout && !isAbsolutelyPositioned;

      // Check if object has auto layout AND children (can use HUG)
      const hasAutoLayout =
        obj.type === "frame" &&
        ((obj.properties?.type === "frame" &&
          getAutoLayout(obj)?.mode &&
          getAutoLayout(obj)?.mode !== "none") ||
          ((obj as any).autoLayout?.mode &&
            (obj as any).autoLayout.mode !== "none") ||
          // CRITICAL: Also check properties.autoLayout for instances (without properties.type)
          (getAutoLayoutFromProperties(obj.properties)?.mode &&
            getAutoLayout(obj)?.mode !== "none"));

      // Check for children that participate in auto layout (non-absolutely positioned)
      const hasLayoutChildren =
        obj.childIds &&
        obj.childIds.some((childId: string) => {
          const child = allObjects[childId];
          return child && !child.absolutePositioned;
        });

      // Text nodes can use HUG for their height sizing (auto-height text resize)
      const isTextNode = obj.type === "text";

      if (canUseFill) canFill = true;
      if ((hasAutoLayout && hasLayoutChildren) || isTextNode) canHug = true;
    });

    if (canFill) options.push("fill");
    if (canHug) options.push("hug");

    return options;
  }, [freshObjects, allObjects]);

  const handleSizeChange = useCallback(
    (dimension: "width" | "height", value: string) => {
      const direction = dimension === "width" ? "horizontal" : "vertical";

      freshObjects.forEach((obj: any) => {
        // DEFENSIVE: Prevent setting "fill" on absolutely positioned objects
        if (value === "fill" && obj.absolutePositioned) {
          return; // Skip this object
        }

        // Check what type of object this is
        const parent = obj.parentId ? allObjects[obj.parentId] : null;
        const isChildOfAutoLayout =
          parent?.type === "frame" &&
          ((parent.properties?.type === "frame" &&
            getAutoLayoutFromProperties(parent.properties)?.mode !== "none") ||
            getAutoLayoutFromProperties(parent.properties)?.mode !== "none");
        const hasAutoLayout =
          obj.type === "frame" &&
          ((obj.properties?.type === "frame" &&
            (obj.properties as any).autoLayout?.mode !== "none") ||
            (obj as any).autoLayout?.mode !== "none" ||
            // CRITICAL: Also check properties.autoLayout for instances (without properties.type)
            (getAutoLayoutFromProperties(obj.properties)?.mode &&
              getAutoLayout(obj)?.mode !== "none"));

        // Universal approach - everyone uses autoLayoutSizing
        const currentSizing = obj.autoLayoutSizing || {
          horizontal: "fixed",
          vertical: "fixed",
        };
        const newSizing = { ...currentSizing, [direction]: value };

        // For instance frames, we should NOT skip override creation
        const shouldCreateOverrides =
          obj.isComponentInstance || (obj.componentId && !obj.isMainComponent);

        dispatch({
          type: "object.updated",
          payload: {
            id: obj.id,
            changes: { autoLayoutSizing: newSizing },
            previousValues: { autoLayoutSizing: currentSizing },
            skipOverrideCreation: !shouldCreateOverrides,
          },
        });

        // Sync text resizeMode when autoLayoutSizing changes
        if (obj.type === "text" && obj.properties?.type === "text") {
          const textProps = obj.properties;
          const currentResizeMode = textProps.resizeMode || "auto-width";
          let newResizeMode: string = currentResizeMode;

          // The full sizing state after this change
          const effectiveHorizontal =
            dimension === "width" ? value : newSizing.horizontal;
          const effectiveVertical =
            dimension === "height" ? value : newSizing.vertical;

          if (effectiveHorizontal === "hug" && effectiveVertical === "hug") {
            // Both hug → auto-width (text auto-sizes in all directions)
            newResizeMode = "auto-width";
          } else if (
            effectiveVertical === "hug" &&
            effectiveHorizontal !== "hug"
          ) {
            // Width is fixed/fill, height hugs → auto-height
            newResizeMode = "auto-height";
          } else if (effectiveVertical !== "hug") {
            // Height is fixed/fill → text must be fixed
            if (currentResizeMode === "auto-width") {
              newResizeMode = "auto-height";
              // But if horizontal also isn't hug, go to fixed
              if (effectiveHorizontal !== "hug") {
                newResizeMode = "fixed";
              }
            } else if (currentResizeMode === "auto-height") {
              newResizeMode = "fixed";
            }
          }

          if (newResizeMode !== currentResizeMode) {
            dispatch({
              type: "object.updated",
              payload: {
                id: obj.id,
                changes: {
                  properties: {
                    ...textProps,
                    resizeMode: newResizeMode,
                  },
                },
                previousValues: {
                  properties: {
                    ...textProps,
                    resizeMode: currentResizeMode,
                  },
                },
                skipOverrideCreation: !shouldCreateOverrides,
              },
            });
          }
        }

        // Trigger DOM sync if the object has a parent with auto layout
        if (isChildOfAutoLayout) {
          setTimeout(() => {
            const freshObjects = useAppStore.getState().objects;
            const freshViewport = useAppStore.getState().viewport;

            // CRITICAL: Re-observe the parent frame with fresh objects to detect new autoLayoutSizing
            AutoLayoutObserverAPI.observeFrame(
              obj.parentId!,
              freshObjects,
              freshViewport,
              dispatch,
            );

            syncAutoLayoutPositionsFromDOM(
              obj.parentId!,
              freshObjects,
              freshViewport,
              dispatch,
            );
          }, 50);
        }

        // Trigger DOM sync if this frame itself has auto layout and was changed to/from hug
        // When switching to hug, the CSS changes to fit-content and the DOM resizes,
        // but the stored width/height needs to be updated to match the new DOM size
        if (
          hasAutoLayout &&
          (value === "hug" || currentSizing[direction] === "hug")
        ) {
          setTimeout(() => {
            const freshObjects = useAppStore.getState().objects;
            const freshViewport = useAppStore.getState().viewport;
            syncAutoLayoutPositionsFromDOM(
              obj.id,
              freshObjects,
              freshViewport,
              dispatch,
            );
          }, 50);
        }
      });
    },
    [freshObjects, dispatch, allObjects],
  );

  if (!sizingValues || availableOptions.length <= 1) {
    return null;
  }

  return (
    <div className="space-y-2 ">
      <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center">
        <div>
          <Select
            value={
              sizingValues.width === "mixed" ? undefined : sizingValues.width
            }
            onValueChange={(value) => handleSizeChange("width", value)}
          >
            <SelectTrigger className="h-6 text-xs">
              <SelectValue
                placeholder={
                  sizingValues.width === "mixed" ? "Mixed" : "Select size"
                }
              />
            </SelectTrigger>
            <SelectContent position="item-aligned">
              {availableOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Select
            value={
              sizingValues.height === "mixed" ? undefined : sizingValues.height
            }
            onValueChange={(value) => handleSizeChange("height", value)}
          >
            <SelectTrigger className="h-6 text-xs">
              <SelectValue
                placeholder={
                  sizingValues.height === "mixed" ? "Mixed" : "Select size"
                }
              />
            </SelectTrigger>
            <SelectContent position="item-aligned">
              {availableOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

/**
 * FrameSpecificControls component - handles frame-only properties (mode, gap, padding, overflow)
 */
function FrameSpecificControls({
  objects,
  frameValues,
  handleOverflowChange,
  dispatch,
  setShowSelectionUI,
}: {
  objects: any[];
  frameValues: any;
  handleOverflowChange: (overflow: "visible" | "hidden") => void;
  dispatch: any;
  setShowSelectionUI?: ((show: boolean) => void) | null;
}) {
  const allObjects = useAppStore((state) => state.objects);

  // Ref to track the selection hiding timeout
  const selectionHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to temporarily hide the selection box during gap/padding changes
  const temporarilyHideSelection = useCallback(() => {
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
  }, [setShowSelectionUI]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (selectionHideTimeoutRef.current) {
        clearTimeout(selectionHideTimeoutRef.current);
      }
    };
  }, []);

  // State for padding mode toggle
  const [showIndividualPadding, setShowIndividualPadding] =
    React.useState<boolean>(false);

  // Get fresh frame objects for computation
  const freshFrames = useMemo(() => {
    return objects
      .filter((obj) => obj.type === "frame")
      .map((obj) => allObjects[obj.id])
      .filter((obj) => obj && obj.type === "frame");
  }, [objects, allObjects]);

  const autoLayoutValues = useMemo(() => {
    if (freshFrames.length === 0) return null;

    const firstFrame = freshFrames[0];
    const autoLayout =
      firstFrame.type === "frame" &&
      (firstFrame.properties?.type === "frame" ||
        getAutoLayoutFromProperties(firstFrame.properties))
        ? getAutoLayout(firstFrame)
        : null;

    // Removed: Auto layout values calculation logging

    const defaultGap = 8;
    const defaultPadding = { top: 16, right: 16, bottom: 16, left: 16 };

    if (!autoLayout) {
      return {
        mode: "none",
        gap: defaultGap,
        padding: defaultPadding,
      };
    }

    const allSameMode = freshFrames.every(
      (obj) =>
        obj.type === "frame" &&
        (obj.properties?.type === "frame" ||
          getAutoLayoutFromProperties(obj.properties)) &&
        getAutoLayout(obj)?.mode === autoLayout?.mode,
    );

    const padding = autoLayout.padding ?? defaultPadding;

    return {
      mode: allSameMode ? autoLayout.mode : "mixed",
      direction: autoLayout.direction ?? "normal",
      gap: autoLayout.gap ?? defaultGap,
      counterAxisSpacing:
        autoLayout.counterAxisSpacing ?? autoLayout.gap ?? defaultGap,
      padding,
      alignItems: autoLayout.alignItems ?? "start",
      justifyContent: autoLayout.justifyContent ?? "start",
      gridColumns: autoLayout.gridColumns ?? 4,
      gridRows: autoLayout.gridRows ?? 3,
      // Padding uniformity check - both for 2-value and 4-value modes
      isUniformPadding:
        padding.top === padding.right &&
        padding.right === padding.bottom &&
        padding.bottom === padding.left,
      // Check if horizontal (left/right) or vertical (top/bottom) are different
      hasNonUniformSides:
        padding.left !== padding.right || padding.top !== padding.bottom,
      // For simplified view, show combined or comma-separated values
      horizontalPadding:
        padding.left === padding.right
          ? padding.left
          : `${padding.left}, ${padding.right}`,
      verticalPadding:
        padding.top === padding.bottom
          ? padding.top
          : `${padding.top}, ${padding.bottom}`,
    };
  }, [freshFrames]);

  // Auto-show individual padding when values have non-uniform sides
  useEffect(() => {
    if (autoLayoutValues && autoLayoutValues.hasNonUniformSides) {
      setShowIndividualPadding(true);
    }
  }, [autoLayoutValues?.hasNonUniformSides]);

  const handleToggleIndividualPadding = useCallback(() => {
    setShowIndividualPadding((prev: boolean) => !prev);
  }, []);

  // Helper: after changing gap or padding on a hug-sized frame, the CSS
  // fit-content size changes but the stored width/height in state is stale.
  // Schedule a DOM → state sync so the properties panel reflects the new size.
  const syncHugFrameSizesAfterChange = useCallback(() => {
    setTimeout(() => {
      const freshObjs = useAppStore.getState().objects;
      const freshVp = useAppStore.getState().viewport;
      objects
        .filter((obj) => obj.type === "frame")
        .forEach((obj) => {
          const fresh = freshObjs[obj.id];
          if (!fresh) return;
          const isHug =
            fresh.autoLayoutSizing?.horizontal === "hug" ||
            fresh.autoLayoutSizing?.vertical === "hug";
          if (isHug) {
            syncAutoLayoutPositionsFromDOM(
              obj.id,
              freshObjs,
              freshVp,
              dispatch,
            );
          }
        });
    }, 50);
  }, [objects, dispatch]);

  const handleGridDimensionChange = useCallback(
    (cols: number, rows: number) => {
      objects
        .filter((obj) => obj.type === "frame")
        .forEach((object) => {
          const currentProperties = object.properties || {};
          const currentAutoLayout =
            getAutoLayoutFromProperties(currentProperties) ||
            getDefaultAutoLayout();

          dispatch({
            type: "object.updated",
            payload: {
              id: object.id,
              changes: {
                properties: {
                  ...currentProperties,
                  autoLayout: {
                    ...currentAutoLayout,
                    gridColumns: cols,
                    gridRows: rows,
                  },
                },
              },
              previousValues: { properties: currentProperties },
            },
          });
        });
      syncHugFrameSizesAfterChange();
      temporarilyHideSelection();
    },
    [objects, dispatch, syncHugFrameSizesAfterChange, temporarilyHideSelection],
  );

  const handleCounterAxisSpacingChange = useCallback(
    (value: number) => {
      objects
        .filter((obj) => obj.type === "frame")
        .forEach((object) => {
          const currentProperties = object.properties || {};
          const currentAutoLayout =
            getAutoLayoutFromProperties(currentProperties) ||
            getDefaultAutoLayout();

          dispatch({
            type: "object.updated",
            payload: {
              id: object.id,
              changes: {
                properties: {
                  ...currentProperties,
                  autoLayout: {
                    ...currentAutoLayout,
                    counterAxisSpacing: value,
                  },
                },
              },
              previousValues: { properties: currentProperties },
            },
          });
        });
      syncHugFrameSizesAfterChange();
      temporarilyHideSelection();
    },
    [objects, dispatch, syncHugFrameSizesAfterChange, temporarilyHideSelection],
  );

  const handleHorizontalPaddingChange = useCallback(
    (value: number | string) => {
      // Parse comma-separated values or use single value
      let leftValue: number, rightValue: number;

      if (typeof value === "string" && value.includes(",")) {
        const parts = value.split(",").map((v) => parseFloat(v.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          leftValue = parts[0];
          rightValue = parts[1];
        } else {
          // Invalid format, fallback to original behavior
          leftValue = rightValue = parseFloat(value) || 16;
        }
      } else {
        leftValue = rightValue =
          typeof value === "number" ? value : parseFloat(value as string) || 16;
      }

      objects
        .filter((obj) => obj.type === "frame")
        .forEach((object) => {
          const currentProperties = object.properties || {};
          const currentAutoLayout =
            getAutoLayoutFromProperties(currentProperties) ||
            getDefaultAutoLayout();
          const currentPadding = currentAutoLayout.padding || {
            top: 16,
            right: 16,
            bottom: 16,
            left: 16,
          };

          dispatch({
            type: "object.updated",
            payload: {
              id: object.id,
              changes: {
                properties: {
                  ...currentProperties,
                  autoLayout: {
                    ...currentAutoLayout,
                    padding: {
                      ...currentPadding,
                      left: leftValue,
                      right: rightValue,
                    },
                  },
                },
              },
              previousValues: { properties: currentProperties },
            },
          });
        });
      syncHugFrameSizesAfterChange();
      temporarilyHideSelection();
    },
    [objects, dispatch, syncHugFrameSizesAfterChange, temporarilyHideSelection],
  );

  const handleVerticalPaddingChange = useCallback(
    (value: number | string) => {
      // Parse comma-separated values or use single value
      let topValue: number, bottomValue: number;

      if (typeof value === "string" && value.includes(",")) {
        const parts = value.split(",").map((v) => parseFloat(v.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          topValue = parts[0];
          bottomValue = parts[1];
        } else {
          // Invalid format, fallback to original behavior
          topValue = bottomValue = parseFloat(value) || 16;
        }
      } else {
        topValue = bottomValue =
          typeof value === "number" ? value : parseFloat(value as string) || 16;
      }

      objects
        .filter((obj) => obj.type === "frame")
        .forEach((object) => {
          const currentProperties = object.properties || {};
          const currentAutoLayout =
            getAutoLayoutFromProperties(currentProperties) ||
            getDefaultAutoLayout();
          const currentPadding = currentAutoLayout.padding || {
            top: 16,
            right: 16,
            bottom: 16,
            left: 16,
          };

          dispatch({
            type: "object.updated",
            payload: {
              id: object.id,
              changes: {
                properties: {
                  ...currentProperties,
                  autoLayout: {
                    ...currentAutoLayout,
                    padding: {
                      ...currentPadding,
                      top: topValue,
                      bottom: bottomValue,
                    },
                  },
                },
              },
              previousValues: { properties: currentProperties },
            },
          });
        });
      syncHugFrameSizesAfterChange();
      temporarilyHideSelection();
    },
    [objects, dispatch, syncHugFrameSizesAfterChange, temporarilyHideSelection],
  );

  if (!autoLayoutValues) return null;

  return (
    <div className="">
      {autoLayoutValues.mode !== "none" &&
        autoLayoutValues.mode !== "mixed" && (
          <div className="">
            <div className="grid grid-cols-[1fr_1fr_24px] grid-rows-[32px_32px] w-full gap-x-2 h-full items-center ">
              <div className="row-span-2 h-full w-full py-1">
                {autoLayoutValues.mode === "grid" ? (
                  <GridSizePicker
                    columns={autoLayoutValues.gridColumns ?? 4}
                    rows={autoLayoutValues.gridRows ?? 3}
                    onDimensionChange={handleGridDimensionChange}
                  />
                ) : (
                  <AlignmentGrid
                    objects={objects}
                    frameValues={frameValues}
                    dispatch={dispatch}
                  />
                )}
              </div>
              <div className="col-span-1 row-span-1">
                <PropertyInput
                  label={
                    autoLayoutValues.mode === "grid" ? "Column gap" : "Gap"
                  }
                  value={autoLayoutValues.gap}
                  onChange={(value) => {
                    objects
                      .filter((obj) => obj.type === "frame")
                      .forEach((object) => {
                        const currentProperties = object.properties || {};
                        const currentAutoLayout =
                          getAutoLayoutFromProperties(currentProperties) ||
                          getDefaultAutoLayout();

                        dispatch({
                          type: "object.updated",
                          payload: {
                            id: object.id,
                            changes: {
                              properties: {
                                ...currentProperties,
                                autoLayout: {
                                  ...currentAutoLayout,
                                  gap: value,
                                },
                              },
                            },
                            previousValues: {
                              properties: currentProperties,
                            },
                          },
                        });
                      });
                    syncHugFrameSizesAfterChange();
                    temporarilyHideSelection();
                  }}
                  type="number"
                  min={0}
                  leadingIcon={
                    autoLayoutValues.mode === "horizontal" ? (
                      <Icon24AlSpacingHorizontal className="text-secondary" />
                    ) : (
                      <Icon24AlSpacingVertical className="text-secondary" />
                    )
                  }
                />
              </div>
              <div className="col-span-1 row-span-1 row-2 col-start-2">
                {autoLayoutValues.mode === "grid" && (
                  <PropertyInput
                    label="Row gap"
                    value={autoLayoutValues.counterAxisSpacing}
                    onChange={handleCounterAxisSpacingChange}
                    type="number"
                    min={0}
                    leadingIcon={
                      <Icon24AlSpacingHorizontal className="text-secondary" />
                    }
                  />
                )}
              </div>
            </div>

            {/* Padding Controls - Toggle between 2 (horizontal/vertical) and 4 (individual) inputs */}
            <div>
              {!showIndividualPadding ? (
                // 2-input mode: Horizontal and Vertical padding
                <div className="grid grid-cols-[1fr_1fr_24px] gap-x-2 h-8 items-center">
                  <PropertyInput
                    label="Horizontal"
                    value={autoLayoutValues.horizontalPadding ?? 16}
                    onChange={handleHorizontalPaddingChange}
                    type="number"
                    min={0}
                    leadingIcon={
                      <Icon24AlPaddingHorizontal className="text-secondary" />
                    }
                  />
                  <PropertyInput
                    label="Vertical"
                    value={autoLayoutValues.verticalPadding ?? 16}
                    onChange={handleVerticalPaddingChange}
                    type="number"
                    min={0}
                    leadingIcon={
                      <Icon24AlPaddingVertical className="text-secondary" />
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleToggleIndividualPadding}
                  >
                    <Icon24AlPaddingSides />
                  </Button>
                </div>
              ) : (
                // 4-input mode: Individual padding for each side
                <div className="grid grid-cols-[1fr_1fr_24px] grid-rows-[32px_32px] gap-x-2 items-center">
                  <PropertyInput
                    label="Left"
                    value={autoLayoutValues.padding?.left ?? 16}
                    onChange={(value) => {
                      objects
                        .filter((obj) => obj.type === "frame")
                        .forEach((object) => {
                          const currentProperties = object.properties || {};
                          const currentAutoLayout =
                            getAutoLayoutFromProperties(currentProperties) ||
                            getDefaultAutoLayout();
                          const currentPadding = currentAutoLayout.padding || {
                            top: 16,
                            right: 16,
                            bottom: 16,
                            left: 16,
                          };

                          dispatch({
                            type: "object.updated",
                            payload: {
                              id: object.id,
                              changes: {
                                properties: {
                                  ...currentProperties,
                                  autoLayout: {
                                    ...currentAutoLayout,
                                    padding: { ...currentPadding, left: value },
                                  },
                                },
                              },
                              previousValues: { properties: currentProperties },
                            },
                          });
                        });
                      syncHugFrameSizesAfterChange();
                      temporarilyHideSelection();
                    }}
                    type="number"
                    min={0}
                    leadingIcon={
                      <Icon24AlPaddingLeft className="text-secondary" />
                    }
                  />
                  <PropertyInput
                    label="Top"
                    value={autoLayoutValues.padding?.top ?? 16}
                    onChange={(value) => {
                      objects
                        .filter((obj) => obj.type === "frame")
                        .forEach((object) => {
                          const currentProperties = object.properties || {};
                          const currentAutoLayout =
                            getAutoLayoutFromProperties(currentProperties) ||
                            getDefaultAutoLayout();
                          const currentPadding = currentAutoLayout.padding || {
                            top: 16,
                            right: 16,
                            bottom: 16,
                            left: 16,
                          };

                          dispatch({
                            type: "object.updated",
                            payload: {
                              id: object.id,
                              changes: {
                                properties: {
                                  ...currentProperties,
                                  autoLayout: {
                                    ...currentAutoLayout,
                                    padding: { ...currentPadding, top: value },
                                  },
                                },
                              },
                              previousValues: { properties: currentProperties },
                            },
                          });
                        });
                      syncHugFrameSizesAfterChange();
                      temporarilyHideSelection();
                    }}
                    type="number"
                    min={0}
                    leadingIcon={
                      <Icon24AlPaddingTop className="text-secondary" />
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleToggleIndividualPadding}
                    className={
                      showIndividualPadding
                        ? "bg-selected hover:bg-selected-secondary"
                        : ""
                    }
                  >
                    <Icon24AlPaddingSides className="text-brand" />
                  </Button>
                  <PropertyInput
                    label="Right"
                    value={autoLayoutValues.padding?.right ?? 16}
                    onChange={(value) => {
                      objects
                        .filter((obj) => obj.type === "frame")
                        .forEach((object) => {
                          const currentProperties = object.properties || {};
                          const currentAutoLayout =
                            getAutoLayoutFromProperties(currentProperties) ||
                            getDefaultAutoLayout();
                          const currentPadding = currentAutoLayout.padding || {
                            top: 16,
                            right: 16,
                            bottom: 16,
                            left: 16,
                          };

                          dispatch({
                            type: "object.updated",
                            payload: {
                              id: object.id,
                              changes: {
                                properties: {
                                  ...currentProperties,
                                  autoLayout: {
                                    ...currentAutoLayout,
                                    padding: {
                                      ...currentPadding,
                                      right: value,
                                    },
                                  },
                                },
                              },
                            },
                            previousValues: { properties: currentProperties },
                          });
                        });
                      syncHugFrameSizesAfterChange();
                      temporarilyHideSelection();
                    }}
                    type="number"
                    min={0}
                    leadingIcon={
                      <Icon24AlPaddingRight className="text-secondary" />
                    }
                  />
                  <PropertyInput
                    label="Bottom"
                    value={autoLayoutValues.padding?.bottom ?? 16}
                    onChange={(value) => {
                      objects
                        .filter((obj) => obj.type === "frame")
                        .forEach((object) => {
                          const currentProperties = object.properties || {};
                          const currentAutoLayout =
                            getAutoLayoutFromProperties(currentProperties) ||
                            getDefaultAutoLayout();
                          const currentPadding = currentAutoLayout.padding || {
                            top: 16,
                            right: 16,
                            bottom: 16,
                            left: 16,
                          };

                          dispatch({
                            type: "object.updated",
                            payload: {
                              id: object.id,
                              changes: {
                                properties: {
                                  ...currentProperties,
                                  autoLayout: {
                                    ...currentAutoLayout,
                                    padding: {
                                      ...currentPadding,
                                      bottom: value,
                                    },
                                  },
                                },
                              },
                            },
                            previousValues: { properties: currentProperties },
                          });
                        });
                      syncHugFrameSizesAfterChange();
                      temporarilyHideSelection();
                    }}
                    type="number"
                    min={0}
                    leadingIcon={
                      <Icon24AlPaddingBottom className="text-secondary" />
                    }
                  />
                </div>
              )}
            </div>
          </div>
        )}

      <div className="flex gap-2 items-center h-8">
        <Checkbox
          id="clip-content"
          checked={frameValues.overflow !== "visible"}
          onCheckedChange={() =>
            handleOverflowChange(
              frameValues.overflow === "visible" ? "hidden" : "visible",
            )
          }
        />
        <Label htmlFor="clip-content" className="w-full">
          Clip content
        </Label>
        <div className="flex-1" />
      </div>
    </div>
  );
}
