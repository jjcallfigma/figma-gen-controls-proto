import { useAppStore } from "@/core/state/store";
import {
  AutoLayoutObserverAPI,
  syncAutoLayoutPositionsFromDOM,
} from "@/core/utils/autoLayout";
import {
  getAbsolutePosition,
  getWorldCoordinatesFromEvent,
} from "@/core/utils/coordinates";
import { applyResizeSnapping } from "@/core/utils/snapping";
import { RESIZE_HANDLE_CURSORS } from "@/types/cursor";
import { useCallback, useRef, useState } from "react";
import { useTransientStore } from "@/core/state/transientStore";

export type ResizeHandle =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface UseCanvasResizeProps {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  viewport: any;
  objects: Record<string, any>;
  selectedIds: string[];
}

export function useCanvasResize({
  canvasRef,
  viewport,
  objects,
  selectedIds,
}: UseCanvasResizeProps) {
  const dispatch = useAppStore((state) => state.dispatch);
  const resetCursor = useAppStore((state) => state.resetCursor);
  const setCursor = useAppStore((state) => state.setCursor);
  const setIsResizing = useAppStore((state) => state.setIsResizing);

  // Resize state
  const isResizing = useAppStore((state) => state.isResizing);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
  const [resizeStartPoint, setResizeStartPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [originalBounds, setOriginalBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [originalObjects, setOriginalObjects] = useState<
    Record<string, { x: number; y: number; width: number; height: number }>
  >({});
  const resizeRafRef = useRef<number | null>(null);

  // Start resize operation
  const startResize = useCallback(
    (
      handle: ResizeHandle,
      startPoint: { x: number; y: number },
      bounds: { x: number; y: number; width: number; height: number }
    ) => {
      // Prevent resizing when space panning is active
      const isSpacePanning = (window as any).__figmaCloneSpacePanning;
      if (isSpacePanning) {
        return; // Don't start resize when space panning
      }

      setIsResizing(true);
      setResizeHandle(handle);
      setResizeStartPoint(startPoint);
      setOriginalBounds(bounds);

      AutoLayoutObserverAPI.disableSync();

      // Set cursor for resize operation
      const cursorType = RESIZE_HANDLE_CURSORS[handle];
      if (cursorType) {
        setCursor(cursorType, `resize:${handle}`);
      }

      // Store original object states
      const originalStates: Record<
        string,
        { x: number; y: number; width: number; height: number }
      > = {};
      selectedIds.forEach((id) => {
        const obj = objects[id];
        if (obj) {
          const absolutePos = getAbsolutePosition(id, objects);
          originalStates[id] = {
            x: absolutePos.x,
            y: absolutePos.y,
            width: obj.width,
            height: obj.height,
          };
        }
      });
      setOriginalObjects(originalStates);

      // Handle hug frames: switch to fixed sizing when manually resized
      const hugFrameUpdates: Array<{
        id: string;
        changes: any;
        previousValues: any;
      }> = [];

      selectedIds.forEach((id) => {
        const object = objects[id];
        if (object?.type === "frame") {
          const affectsHorizontal = [
            "middle-left",
            "middle-right",
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ].includes(handle);
          const affectsVertical = [
            "top-center",
            "bottom-center",
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ].includes(handle);

          let shouldUpdate = false;
          let changes: any = {};

          // Check unified autoLayoutSizing (new system)
          if (object.autoLayoutSizing) {
            const currentSizing = object.autoLayoutSizing;
            let newSizing = { ...currentSizing };

            if (affectsHorizontal && currentSizing.horizontal === "hug") {
              newSizing.horizontal = "fixed";
              shouldUpdate = true;
            }
            if (affectsVertical && currentSizing.vertical === "hug") {
              newSizing.vertical = "fixed";
              shouldUpdate = true;
            }

            if (shouldUpdate) {
              changes.autoLayoutSizing = newSizing;
            }
          }

          if (shouldUpdate) {
            hugFrameUpdates.push({
              id,
              changes,
              previousValues: {
                autoLayoutSizing: object.autoLayoutSizing,
                properties: object.properties,
              },
            });
          }
        }
      });

      if (hugFrameUpdates.length > 0) {
        dispatch({
          type: "objects.updated.batch",
          payload: {
            updates: hugFrameUpdates,
            context: "hug-to-fixed-on-resize",
          },
        });
      }

      // Check if all selected objects have the same parent
      const firstParentId =
        selectedIds.length > 0 ? objects[selectedIds[0]]?.parentId : undefined;
      const allSameParent = selectedIds.every(
        (id) => objects[id]?.parentId === firstParentId
      );
      const resizeType = allSameParent ? "same-parent" : "different-parent";

      // Immediately update auto layout sizing modes for children in auto layout frames
      const autoLayoutSizingUpdates: Array<{
        id: string;
        changes: any;
        previousValues: any;
      }> = [];

      selectedIds.forEach((id) => {
        const object = objects[id];
        if (!object?.parentId) return;

        const parent = objects[object.parentId];
        if (
          parent?.type === "frame" &&
          parent.properties?.type === "frame" &&
          parent.properties.autoLayout?.mode !== "none"
        ) {
          const currentSizing = object.autoLayoutSizing || {
            horizontal: "fixed",
            vertical: "fixed",
          };
          let newSizing = { ...currentSizing };
          let shouldUpdate = false;

          // Determine which axes are affected by the resize handle
          const affectsHorizontal = [
            "middle-left",
            "middle-right",
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ].includes(handle);
          const affectsVertical = [
            "top-center",
            "bottom-center",
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ].includes(handle);

          if (affectsHorizontal && currentSizing.horizontal !== "fixed") {
            newSizing.horizontal = "fixed";
            shouldUpdate = true;
          }

          if (affectsVertical && currentSizing.vertical !== "fixed") {
            newSizing.vertical = "fixed";
            shouldUpdate = true;
          }

          if (shouldUpdate) {
            autoLayoutSizingUpdates.push({
              id,
              changes: { autoLayoutSizing: newSizing },
              previousValues: { autoLayoutSizing: currentSizing },
            });
          }
        }
      });

      // Apply auto layout sizing updates immediately
      if (autoLayoutSizingUpdates.length > 0) {
        dispatch({
          type: "objects.updated.batch",
          payload: {
            updates: autoLayoutSizingUpdates,
            context: "auto-layout-sizing-from-resize-start",
          },
        });
      }

      // Handle text resize mode switching
      const textResizeModeUpdates: Array<{
        id: string;
        changes: any;
        previousValues: any;
      }> = [];

      selectedIds.forEach((id) => {
        const object = objects[id];
        if (object?.type !== "text" || object.properties?.type !== "text")
          return;

        const textProps = object.properties;
        const currentResizeMode = textProps.resizeMode || "auto-width";

        // Determine which axes are affected by the resize handle
        const affectsHorizontal = [
          "middle-left",
          "middle-right",
          "top-left",
          "top-right",
          "bottom-left",
          "bottom-right",
        ].includes(handle);
        const affectsVertical = [
          "top-center",
          "bottom-center",
          "top-left",
          "top-right",
          "bottom-left",
          "bottom-right",
        ].includes(handle);

        let newResizeMode = currentResizeMode;

        // Logic:
        // - If already fixed: keep it fixed
        // - When resizing width only (horizontal handles): switch to auto-height
        // - When resizing height or both: switch to fixed
        if (currentResizeMode === "fixed") {
          // Already fixed - keep it fixed
          newResizeMode = "fixed";
        } else if (affectsHorizontal && !affectsVertical) {
          // Width only resize - switch to auto-height
          newResizeMode = "auto-height";
        } else if (affectsVertical) {
          // Height resize (with or without width) - switch to fixed
          newResizeMode = "fixed";
        }

        if (newResizeMode !== currentResizeMode) {
          textResizeModeUpdates.push({
            id,
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
          });
        }

        // Sync autoLayoutSizing with the new resize mode
        const currentSizing = object.autoLayoutSizing || {
          horizontal: "fixed",
          vertical: "fixed",
        };
        const newSizing = { ...currentSizing };
        if (newResizeMode === "auto-width") {
          newSizing.horizontal = "hug";
          newSizing.vertical = "hug";
        } else if (newResizeMode === "auto-height") {
          if (currentSizing.horizontal === "hug") {
            newSizing.horizontal = "fixed";
          }
          newSizing.vertical = "hug";
        } else if (newResizeMode === "fixed") {
          if (currentSizing.horizontal === "hug") {
            newSizing.horizontal = "fixed";
          }
          if (currentSizing.vertical === "hug") {
            newSizing.vertical = "fixed";
          }
        }

        const sizingChanged =
          newSizing.horizontal !== currentSizing.horizontal ||
          newSizing.vertical !== currentSizing.vertical;
        if (sizingChanged) {
          textResizeModeUpdates.push({
            id,
            changes: { autoLayoutSizing: newSizing },
            previousValues: { autoLayoutSizing: currentSizing },
          });
        }
      });

      // Apply text resize mode updates immediately
      if (textResizeModeUpdates.length > 0) {
        dispatch({
          type: "objects.updated.batch",
          payload: {
            updates: textResizeModeUpdates,
            context: "text-resize-mode-from-resize-start",
          },
        });
      }

      // Dispatch resize.started event for undo/redo
      dispatch({
        type: "resize.started",
        payload: {
          selectedIds,
          handle,
          originalBounds: bounds,
          originalObjects: originalStates,
          resizeType,
        },
      });
    },
    [selectedIds, objects, dispatch, setCursor]
  );

  // Handle pointer move for resize (throttled to one update per animation frame)
  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (
        !isResizing ||
        !resizeHandle ||
        !resizeStartPoint ||
        !originalBounds ||
        !canvasRef.current
      ) {
        return;
      }

      const currentWorldPoint = getWorldCoordinatesFromEvent(
        event.nativeEvent,
        canvasRef.current,
        viewport
      );

      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
      }

      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;

        const deltaX = currentWorldPoint.x - resizeStartPoint.x;
        const deltaY = currentWorldPoint.y - resizeStartPoint.y;

        const newBounds = calculateNewBounds(
          originalBounds,
          resizeHandle,
          deltaX,
          deltaY
        );

        const { setSnapGuides } = useAppStore.getState();
        const { bounds: snappedBounds, snapResult } = applyResizeSnapping(
          originalBounds,
          newBounds,
          resizeHandle,
          objects,
          viewport,
          selectedIds,
          selectedIds
        );

        setSnapGuides({
          horizontal: snapResult.horizontalGuides,
          vertical: snapResult.verticalGuides,
        });

        applyResize(snappedBounds);
      });
    },
    [
      isResizing,
      resizeHandle,
      resizeStartPoint,
      originalBounds,
      canvasRef,
      viewport,
      objects,
      selectedIds,
    ]
  );

  // Calculate new bounds based on resize handle and deltas
  const calculateNewBounds = useCallback(
    (
      original: { x: number; y: number; width: number; height: number },
      handle: ResizeHandle,
      deltaX: number,
      deltaY: number
    ) => {
      let newX = original.x;
      let newY = original.y;
      let newWidth = original.width;
      let newHeight = original.height;

      // Handle horizontal resizing
      if (handle.includes("left")) {
        newX = original.x + deltaX;
        newWidth = original.width - deltaX;
      } else if (handle.includes("right")) {
        newWidth = original.width + deltaX;
      }

      // Handle vertical resizing
      if (handle.includes("top")) {
        newY = original.y + deltaY;
        newHeight = original.height - deltaY;
      } else if (handle.includes("bottom")) {
        newHeight = original.height + deltaY;
      }

      // Enforce minimum size
      const minSize = 1;
      if (newWidth < minSize) {
        if (handle.includes("left")) {
          newX = original.x + original.width - minSize;
        }
        newWidth = minSize;
      }
      if (newHeight < minSize) {
        if (handle.includes("top")) {
          newY = original.y + original.height - minSize;
        }
        newHeight = minSize;
      }

      // Round all values to avoid floating point precision issues
      return {
        x: Math.round(newX),
        y: Math.round(newY),
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      };
    },
    []
  );

  // Resize state is stored in a ref + pushed to the transient store
  // to avoid triggering Canvas re-renders on every resize frame.
  const currentResizeStateRef = useRef<
    Record<
      string,
      { x: number; y: number; width: number; height: number }
    >
  >({});
  const currentResizeState = currentResizeStateRef.current;
  const setCurrentResizeState = useCallback(
    (s: Record<string, { x: number; y: number; width: number; height: number }>) => {
      currentResizeStateRef.current = s;
      useTransientStore.getState().setResizeStates(s);
    },
    [],
  );

  // Apply resize to selected objects (for visual feedback only - no state dispatch)
  const applyResize = useCallback(
    (newBounds: { x: number; y: number; width: number; height: number }) => {
      if (!originalBounds) return;

      // Calculate new states for visual feedback without dispatching to store
      const newResizeStates: Record<
        string,
        {
          x: number;
          y: number;
          width: number;
          height: number;
        }
      > = {};

      if (selectedIds.length === 1) {
        // Single object - direct resize
        const id = selectedIds[0];
        const obj = objects[id];
        const originalObj = originalObjects[id];
        if (!obj || !originalObj) return;

        const changes: any = {
          width: Math.round(newBounds.width),
          height: Math.round(newBounds.height),
        };

        // Update position for top/left handles
        if (resizeHandle?.includes("left") || resizeHandle?.includes("top")) {
          // Convert back to relative coordinates if object has parent
          if (obj.parentId) {
            const parentAbsolute = getAbsolutePosition(obj.parentId, objects);
            changes.x = Math.round(newBounds.x - parentAbsolute.x);
            changes.y = Math.round(newBounds.y - parentAbsolute.y);
          } else {
            changes.x = Math.round(newBounds.x);
            changes.y = Math.round(newBounds.y);
          }
        } else {
          // Keep original position for other handles
          changes.x = obj.x;
          changes.y = obj.y;
        }

        newResizeStates[id] = changes;
      } else {
        // Multi-object - proportional resize

        // Check if all objects have the same parent
        const firstParent = objects[selectedIds[0]]?.parentId;
        const allSameParent = selectedIds.every(
          (id) => objects[id]?.parentId === firstParent
        );

        // Calculate scale factors
        const scaleX = newBounds.width / originalBounds.width;
        const scaleY = newBounds.height / originalBounds.height;

        if (allSameParent) {
          // Same parent: Group-like behavior - resize from shared anchor point

          // Calculate the anchor point based on resize handle
          let anchorX = originalBounds.x;
          let anchorY = originalBounds.y;

          if (resizeHandle?.includes("right")) {
            anchorX = originalBounds.x;
          } else if (resizeHandle?.includes("left")) {
            anchorX = originalBounds.x + originalBounds.width;
          } else {
            anchorX = originalBounds.x + originalBounds.width / 2;
          }

          if (resizeHandle?.includes("bottom")) {
            anchorY = originalBounds.y;
          } else if (resizeHandle?.includes("top")) {
            anchorY = originalBounds.y + originalBounds.height;
          } else {
            anchorY = originalBounds.y + originalBounds.height / 2;
          }

          // Batch all updates for same-parent group resize
          const batchedUpdates: Array<{
            id: string;
            changes: any;
            previousValues: any;
          }> = [];

          selectedIds.forEach((id) => {
            const obj = objects[id];
            const originalObj = originalObjects[id];
            if (!obj || !originalObj) return;

            // Scale the object size
            const newWidth = originalObj.width * scaleX;
            const newHeight = originalObj.height * scaleY;

            // Scale the object position relative to group anchor
            const originalCenterX = originalObj.x + originalObj.width / 2;
            const originalCenterY = originalObj.y + originalObj.height / 2;

            const deltaFromAnchorX = originalCenterX - anchorX;
            const deltaFromAnchorY = originalCenterY - anchorY;

            const newCenterX = anchorX + deltaFromAnchorX * scaleX;
            const newCenterY = anchorY + deltaFromAnchorY * scaleY;

            const newX = newCenterX - newWidth / 2;
            const newY = newCenterY - newHeight / 2;

            // Convert to relative coordinates if object has parent
            let finalX = newX;
            let finalY = newY;
            if (obj.parentId) {
              const parentAbsolute = getAbsolutePosition(obj.parentId, objects);
              finalX = newX - parentAbsolute.x;
              finalY = newY - parentAbsolute.y;
            }

            const changes = {
              x: Math.round(finalX),
              y: Math.round(finalY),
              width: Math.round(newWidth),
              height: Math.round(newHeight),
            };

            newResizeStates[id] = changes;
          });
        } else {
          // Different parents: Individual anchor behavior

          // Batch all updates for different-parent resize
          const batchedUpdates: Array<{
            id: string;
            changes: any;
            previousValues: any;
          }> = [];

          selectedIds.forEach((id) => {
            const obj = objects[id];
            const originalObj = originalObjects[id];
            if (!obj || !originalObj) return;

            // Scale the object size
            const newWidth = originalObj.width * scaleX;
            const newHeight = originalObj.height * scaleY;

            // Calculate new position based on resize handle (each object anchors independently)
            let newX = originalObj.x;
            let newY = originalObj.y;

            // Handle horizontal positioning based on resize handle
            if (resizeHandle?.includes("right")) {
              // Dragging right handle: anchor left edge, expand right
              newX = originalObj.x; // Keep left edge fixed
            } else if (resizeHandle?.includes("left")) {
              // Dragging left handle: anchor right edge, expand left
              newX = originalObj.x + originalObj.width - newWidth; // Keep right edge fixed
            } else {
              // Dragging center handles: expand from center
              newX = originalObj.x + (originalObj.width - newWidth) / 2; // Center the expansion
            }

            // Handle vertical positioning based on resize handle
            if (resizeHandle?.includes("bottom")) {
              // Dragging bottom handle: anchor top edge, expand down
              newY = originalObj.y; // Keep top edge fixed
            } else if (resizeHandle?.includes("top")) {
              // Dragging top handle: anchor bottom edge, expand up
              newY = originalObj.y + originalObj.height - newHeight; // Keep bottom edge fixed
            } else {
              // Dragging center handles: expand from center
              newY = originalObj.y + (originalObj.height - newHeight) / 2; // Center the expansion
            }

            // Convert to relative coordinates if object has parent
            let finalX = newX;
            let finalY = newY;
            if (obj.parentId) {
              const parentAbsolute = getAbsolutePosition(obj.parentId, objects);
              finalX = newX - parentAbsolute.x;
              finalY = newY - parentAbsolute.y;
            }

            const changes = {
              x: Math.round(finalX),
              y: Math.round(finalY),
              width: Math.round(newWidth),
              height: Math.round(newHeight),
            };

            newResizeStates[id] = changes;
          });
        }
      }

      setCurrentResizeState(newResizeStates);
    },
    [
      selectedIds,
      objects,
      originalObjects,
      originalBounds,
      resizeHandle,
    ]
  );

  // Complete resize operation — commit final positions to the main store
  const completeResize = useCallback(() => {
    if (isResizing && resizeHandle) {
      const finalResizeStates = currentResizeStateRef.current;

      if (Object.keys(finalResizeStates).length > 0) {
        const currentObjects = useAppStore.getState().objects;
        const stateUpdates = Object.entries(finalResizeStates)
          .map(([id, state]) => {
            const obj = currentObjects[id];
            if (!obj) return null;
            return {
              id,
              changes: state,
              previousValues: {
                x: obj.x,
                y: obj.y,
                width: obj.width,
                height: obj.height,
              },
            };
          })
          .filter(
            (update): update is NonNullable<typeof update> => update !== null
          );

        if (stateUpdates.length > 0) {
          const hasInstanceRelatedObjects = stateUpdates.some((update) => {
            const obj = currentObjects[update.id];
            return (
              obj?.isComponentInstance ||
              (obj?.componentId &&
                !obj.isMainComponent &&
                !obj.isComponentInstance)
            );
          });

          dispatch({
            type: "objects.updated.batch",
            payload: {
              updates: stateUpdates as Array<{
                id: string;
                changes: any;
                previousValues: any;
              }>,
              context: "resize",
              skipOverrideCreation: !hasInstanceRelatedObjects,
            },
          });
        }
      }

      dispatch({
        type: "resize.completed",
        payload: {
          selectedIds,
          handle: resizeHandle,
        },
      });

      // Sync auto layout frames after final commit, then re-enable sync
      requestAnimationFrame(() => {
        const freshState = useAppStore.getState();
        const autoLayoutFramesToSync = new Set<string>();
        selectedIds.forEach((objectId) => {
          const obj = freshState.objects[objectId];
          if (obj?.parentId) {
            const parent = freshState.objects[obj.parentId];
            if (
              parent?.type === "frame" &&
              parent.properties?.type === "frame" &&
              parent.properties.autoLayout?.mode !== "none"
            ) {
              autoLayoutFramesToSync.add(obj.parentId);
            }
          }
        });
        autoLayoutFramesToSync.forEach((frameId) => {
          syncAutoLayoutPositionsFromDOM(
            frameId,
            freshState.objects,
            freshState.viewport,
            dispatch,
          );
        });
        setTimeout(() => AutoLayoutObserverAPI.enableSync(), 100);
      });
    }

    useAppStore.getState().setIsHoveringResizeHandle(false);

    setTimeout(() => {
      const store = useAppStore.getState();
      if (!store.tools.isCreating) {
        resetCursor();
      }
    }, 50);

    useAppStore.getState().clearSnapGuides();

    setIsResizing(false);
    setResizeHandle(null);
    setResizeStartPoint(null);
    setOriginalBounds(null);
    setOriginalObjects({});
    setCurrentResizeState({});
  }, [
    isResizing,
    selectedIds,
    resizeHandle,
    dispatch,
    resetCursor,
  ]);

  return {
    // State
    isResizing,
    resizeHandle,
    currentResizeState, // Visual feedback state

    // Actions
    startResize,
    handlePointerMove,
    completeResize,

    // Getters
    hasActiveResize: isResizing && resizeHandle !== null,
  };
}
