import { useAppStore, useObjects } from "@/core/state/store";
import { useTransientStore } from "@/core/state/transientStore";
import { getWorldCoordinatesFromEvent } from "@/core/utils/coordinates";
import {
  calculateGroupBounds,
  calculateGroupBoundsWithDOM,
} from "@/core/utils/selection";
import { useResizeCursor } from "@/hooks/useCursor";
import {
  CURSOR_ASSETS,
  CURSOR_HOTSPOTS,
  RESIZE_HANDLE_CURSORS,
} from "@/types/cursor";
import { createTransformedCursor } from "@/utils/cursorUtils";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ResizeHandle =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

const HANDLE_CSS_FALLBACKS: Record<ResizeHandle, string> = {
  "top-left": "nw-resize",
  "top-center": "n-resize",
  "top-right": "ne-resize",
  "middle-left": "w-resize",
  "middle-right": "e-resize",
  "bottom-left": "sw-resize",
  "bottom-center": "s-resize",
  "bottom-right": "se-resize",
};

/**
 * Loads the custom cursor CSS values (transformed SVGs with shadow/rotation)
 * for all resize handles. Falls back to standard CSS cursors until loaded.
 */
function useResizeHandleCursors(): Record<ResizeHandle, string> {
  const [cursors, setCursors] = useState(HANDLE_CSS_FALLBACKS);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = { ...HANDLE_CSS_FALLBACKS };
      const handles = Object.keys(HANDLE_CSS_FALLBACKS) as ResizeHandle[];

      for (const handle of handles) {
        const cursorType = RESIZE_HANDLE_CURSORS[handle];
        const assetPath =
          CURSOR_ASSETS[cursorType as keyof typeof CURSOR_ASSETS];
        if (!assetPath) continue;

        const hotspot = CURSOR_HOTSPOTS[cursorType] || { x: 16, y: 16 };
        const url = await createTransformedCursor(
          assetPath,
          cursorType,
          hotspot
        );
        result[handle] =
          `url("${url}") ${hotspot.x} ${hotspot.y}, ${HANDLE_CSS_FALLBACKS[handle]}`;
      }

      if (!cancelled) setCursors(result);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return cursors;
}

interface SelectionBoxProps {
  objectIds: string[];
  parentId: string; // 'root' for top-level objects
  onSelectionBoxClick?: (event: React.PointerEvent, groupIds: string[]) => void;
  onSelectionBoxClearClick?: (event: React.PointerEvent) => void;
  onFrameLabelClick?: (event: React.PointerEvent, frameId: string) => void;
  onResizeStart?: (
    handle: ResizeHandle,
    startPoint: { x: number; y: number },
    bounds: { x: number; y: number; width: number; height: number },
  ) => void;
  isInteractive?: boolean;
  isZooming?: boolean;
  isPanning?: boolean;
  /** When true (e.g. AI prompt open + shimmer), hide dimension pill and resize handles */
  hideDimensionsAndHandles?: boolean;
}

export default function SelectionBox({
  objectIds,
  parentId,
  onSelectionBoxClick,
  onSelectionBoxClearClick,
  onFrameLabelClick,
  onResizeStart,
  isInteractive = true,
  isZooming = false,
  isPanning = false,
  hideDimensionsAndHandles = false,
}: SelectionBoxProps) {
  const objects = useObjects();
  const viewport = useAppStore((state) => state.viewport);
  const dragPositions = useTransientStore((s) => s.dragPositions);
  const resizeStates = useTransientStore((s) => s.resizeStates);
  const cropMode = useAppStore((state) => state.cropMode);
  const extractMode = useAppStore((state) => state.extractMode);

  // Initialize cursor management for resize handles
  const { handleResizeHandleEnter, handleResizeHandleLeave } =
    useResizeCursor();
  const handleCursors = useResizeHandleCursors();

  // Track drag state to differentiate click vs drag
  const [isDragStarted, setIsDragStarted] = useState(false);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);

  // Force re-render for auto layout bounds updates
  const [updateCounter, setUpdateCounter] = useState(0);

  useEffect(() => {
    const handleBoundsUpdate = () => {
      setUpdateCounter((prev) => prev + 1);
    };

    window.addEventListener("al-bounds-update", handleBoundsUpdate);
    return () =>
      window.removeEventListener("al-bounds-update", handleBoundsUpdate);
  }, []);

  // Track the viewport that the DOM currently reflects.
  // During a render triggered by a viewport change, the DOM still shows the
  // PREVIOUS viewport's transform. useLayoutEffect updates this ref after
  // React commits, keeping it in sync with the DOM.
  const committedViewportRef = useRef(viewport);
  useLayoutEffect(() => {
    committedViewportRef.current = viewport;
  }, [viewport]);

  // Check if any selected objects are children of auto layout frames
  const hasAutoLayoutChildren = objectIds.some((id) => {
    const object = objects[id];
    if (!object?.parentId) return false;
    const parent = objects[object.parentId];
    return (
      parent?.type === "frame" &&
      parent.properties?.type === "frame" &&
      parent.properties.autoLayout?.mode !== "none"
    );
  });

  // Use DOM bounds for auto layout children for pixel-perfect accuracy.
  // During zoom/pan the DOM still reflects the PREVIOUS viewport transform
  // while React state already has the NEW viewport.  We solve this by
  // converting DOM screen coords → world using committedViewportRef (which
  // matches the DOM) and then world → screen using the current viewport.
  const bounds = useMemo(() => {
    const isResizing =
      resizeStates &&
      Object.keys(resizeStates).some((id) => objectIds.includes(id));

    const hasDragPositions = !!(
      dragPositions &&
      Object.keys(dragPositions).some((id) => objectIds.includes(id))
    );

    // During resize, overlay transient resize state onto objects so
    // the selection box tracks the live dimensions.
    let effectiveObjects = objects;
    if (isResizing) {
      effectiveObjects = { ...objects };
      for (const [id, rs] of Object.entries(resizeStates)) {
        if (effectiveObjects[id]) {
          effectiveObjects[id] = { ...effectiveObjects[id], ...rs };
        }
      }
    }

    if (hasAutoLayoutChildren && !hasDragPositions) {
      try {
        return calculateGroupBoundsWithDOM(
          objectIds,
          effectiveObjects,
          committedViewportRef.current,
          dragPositions,
        );
      } catch (error) {
        return calculateGroupBounds(objectIds, effectiveObjects, dragPositions);
      }
    } else {
      return calculateGroupBounds(objectIds, effectiveObjects, dragPositions);
    }
  }, [
    objectIds,
    objects,
    dragPositions,
    resizeStates,
    hasAutoLayoutChildren,
    updateCounter,
  ]);

  // Listen for auto-layout sync completion events (from drag and resize operations)
  useEffect(() => {
    if (!hasAutoLayoutChildren) return;

    const handleAutoLayoutSync = (event: CustomEvent) => {
      const syncedFrameId = event.detail?.frameId;

      // Check if any of our selected objects are children of the synced frame
      const needsUpdate = objectIds.some((id) => {
        const object = objects[id];
        return object?.parentId === syncedFrameId;
      });

      if (needsUpdate) {
        setUpdateCounter((prev) => prev + 1);
      }
    };

    window.addEventListener(
      "auto-layout-sync-complete",
      handleAutoLayoutSync as EventListener,
    );

    return () => {
      window.removeEventListener(
        "auto-layout-sync-complete",
        handleAutoLayoutSync as EventListener,
      );
    };
  }, [hasAutoLayoutChildren, objectIds, objects]);

  // Convert world coordinates to screen coordinates
  const screenBounds = {
    x: bounds.x * viewport.zoom + viewport.panX,
    y: bounds.y * viewport.zoom + viewport.panY,
    width: bounds.width * viewport.zoom,
    height: bounds.height * viewport.zoom,
  };

  // Hide resize handles when BOTH dimensions are too small or in crop mode
  const MIN_VISUAL_SIZE_FOR_HANDLES = 8; // Minimum pixel size to show handles
  const isSelectedObjectInCropMode =
    cropMode.isActive &&
    objectIds.length === 1 &&
    objectIds[0] === cropMode.objectId;
  const shouldShowResizeHandles =
    (screenBounds.width >= MIN_VISUAL_SIZE_FOR_HANDLES ||
      screenBounds.height >= MIN_VISUAL_SIZE_FOR_HANDLES) &&
    !isSelectedObjectInCropMode && // Hide resize handles in crop mode to avoid interference
    !hideDimensionsAndHandles; // Hide when AI entrypoint is active and shimmer is showing

  // Reset cursor when resize handles are hidden (e.g., during zoom out)
  const resetCursor = useAppStore((s) => s.resetCursor);
  const setIsHoveringResizeHandle = useAppStore((s) => s.setIsHoveringResizeHandle);
  const isResizing = useAppStore((s) => s.isResizing);
  useEffect(() => {
    if (!shouldShowResizeHandles && !isResizing) {
      resetCursor();
      setIsHoveringResizeHandle(false);
    }
  }, [
    shouldShowResizeHandles,
    isResizing,
    resetCursor,
    setIsHoveringResizeHandle,
  ]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Prevent dragging when in crop mode
      if (isSelectedObjectInCropMode) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // Check if we're clicking on a frame label by checking coordinates and DOM
      const target = event.target as HTMLElement;
      const hasDataFrameLabel =
        target.getAttribute("data-frame-label") !== null;
      const closestFrameLabel = target.closest("[data-frame-label]");

      // Also check if click coordinates overlap with any frame label
      const clickX = event.clientX;
      const clickY = event.clientY;
      const frameLabelElements =
        document.querySelectorAll("[data-frame-label]");

      let isOverFrameLabel = hasDataFrameLabel || closestFrameLabel !== null;
      let foundLabelElement = null;

      // Use proper DOM hit testing to find the topmost frame label at click coordinates
      // This matches how normal canvas selection works and prevents wrong frame detection
      if (!isOverFrameLabel) {
        const elementsAtPoint = document.elementsFromPoint(clickX, clickY);

        // Find all frame labels at this point, not just the first one
        const frameLabelsAtPoint = elementsAtPoint
          .map((el, index) => ({
            element: el,
            frameId: el.getAttribute("data-frame-label"),
            index,
            zIndex: window.getComputedStyle(el).zIndex,
          }))
          .filter((item) => item.frameId);

        // Compare with what normal canvas hit testing would find
        const allElementsWithObjectIds = elementsAtPoint
          .map((el, index) => ({
            index,
            objectId: el.getAttribute("data-object-id"),
            objectType: el.getAttribute("data-object-type"),
            frameId: el.getAttribute("data-frame-label"),
            tagName: el.tagName,
            className: el.className,
          }))
          .filter((item) => item.objectId || item.frameId);

        // Find the first (topmost) element that has a data-frame-label attribute
        for (const element of elementsAtPoint) {
          const frameId = element.getAttribute("data-frame-label");
          if (frameId) {
            isOverFrameLabel = true;
            foundLabelElement = element;
            break;
          }
        }
      }

      if (isOverFrameLabel) {
        // Get the frame ID from the frame label element
        const frameId =
          foundLabelElement?.getAttribute("data-frame-label") ||
          target.getAttribute("data-frame-label") ||
          closestFrameLabel?.getAttribute("data-frame-label");

        if (frameId && onFrameLabelClick) {
          // Prevent other handlers from processing this event FIRST
          event.preventDefault();
          event.stopPropagation();

          onFrameLabelClick(
            event as React.PointerEvent<HTMLDivElement>,
            frameId,
          );
          return;
        }

        return;
      }

      // For shift-clicks or CMD-clicks, don't stop propagation - let the Canvas handle it
      const cmdPressed = event.metaKey || event.ctrlKey;

      // Check if any text object is currently in edit mode
      const hasEditingText = Object.values(objects).some((obj) => {
        return (
          obj &&
          obj.type === "text" &&
          obj.properties.type === "text" &&
          (obj.properties as any).isEditing
        );
      });

      if (!event.shiftKey && !cmdPressed && !hasEditingText) {
        // Stop propagation to prevent canvas selection
        event.stopPropagation();
      }

      // Track the start point for drag detection
      dragStartPointRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
      setIsDragStarted(false);

      // DON'T start drag immediately - wait to see if user actually drags
      // onSelectionBoxClick will be called in handlePointerMove if drag threshold is exceeded
    },
    [objects],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (dragStartPointRef.current) {
        const deltaX = event.clientX - dragStartPointRef.current.x;
        const deltaY = event.clientY - dragStartPointRef.current.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // If we've moved more than a few pixels, consider it a drag
        if (distance > 3 && !isDragStarted) {
          // Check if space panning is active
          const isSpacePanning = (window as any).__figmaCloneSpacePanning;
          if (isSpacePanning) {
            return; // Don't start drag when space panning
          }

          // Check if CMD is pressed - if so, don't start drag (allow region selection instead)
          const cmdPressed = event.metaKey || event.ctrlKey;

          if (cmdPressed) {
            return; // Don't start drag, let Canvas handle region selection
          }

          // Check if any text object is currently in edit mode
          const hasEditingText = Object.values(objects).some((obj) => {
            return (
              obj &&
              obj.type === "text" &&
              obj.properties.type === "text" &&
              (obj.properties as any).isEditing
            );
          });

          if (hasEditingText) {
            return; // Don't start drag when text is being edited
          }

          setIsDragStarted(true);

          // NOW start the drag since user is actually dragging
          onSelectionBoxClick?.(event, objectIds);
        }
      }
    },
    [isDragStarted, onSelectionBoxClick, objectIds, objects],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      // Prevent pointer up processing if text is in edit mode and click is inside text editor
      const hasEditingText = Object.values(objects).some((obj) => {
        return (
          obj &&
          obj.type === "text" &&
          obj.properties.type === "text" &&
          (obj.properties as any).isEditing
        );
      });

      if (hasEditingText) {
        // Use the same approach as Canvas - check elements at point for editing text
        const screenPoint = { x: event.clientX, y: event.clientY };
        const elementsAtPoint = document.elementsFromPoint(
          screenPoint.x,
          screenPoint.y,
        );

        for (const element of elementsAtPoint) {
          const objectId = element.getAttribute("data-object-id");
          const objectType = element.getAttribute("data-object-type");

          if (objectId && objectType === "text") {
            const textObject = objects[objectId];
            if (
              textObject &&
              textObject.properties.type === "text" &&
              (textObject.properties as any).isEditing
            ) {
              // Reset drag tracking but don't call selection logic
              dragStartPointRef.current = null;
              setIsDragStarted(false);
              return;
            }
          }
        }
      }

      // For shift-clicks, don't stop propagation - let the Canvas handle it
      if (!event.shiftKey) {
        event.stopPropagation();
      }

      // If we didn't start dragging, it's a click
      if (!isDragStarted && dragStartPointRef.current) {
        // Don't interfere with shift-click behavior - let the canvas handle it
        if (!event.shiftKey) {
          // Always try to select what's underneath for click-through behavior
          onSelectionBoxClearClick?.(event);
        }
      }

      // Reset drag tracking
      dragStartPointRef.current = null;
      setIsDragStarted(false);
    },
    [
      isDragStarted,
      onSelectionBoxClearClick,
      objects,
      isSelectedObjectInCropMode,
    ],
  );

  // Handle resize handle clicks
  const handleResizeHandlePointerDown = useCallback(
    (event: React.PointerEvent, handle: ResizeHandle) => {
      // Don't stop propagation - let Canvas handle pointer events including pointer up

      // Prevent resizing when space panning is active
      const isSpacePanning = (window as any).__figmaCloneSpacePanning;
      if (isSpacePanning) {
        return; // Don't allow resize when space panning
      }

      // Don't allow resize if handles are hidden due to small size
      if (!shouldShowResizeHandles) {
        return;
      }

      if (!onResizeStart) {
        return;
      }

      // Get canvas element - try multiple strategies
      let canvasElement = null;

      // Strategy 1: Look for canvas with specific attributes
      canvasElement =
        document.querySelector("[data-world-space]")?.parentElement;
      if (!canvasElement) {
        // Strategy 2: Look for canvas by class or other attributes
        canvasElement = document.querySelector(".relative.w-full.h-full");
      }
      if (!canvasElement) {
        // Strategy 3: Use the current target's closest canvas-like element
        canvasElement = event.currentTarget.closest(
          ".relative",
        ) as HTMLDivElement;
      }

      if (!canvasElement) {
        return;
      }

      const viewport = useAppStore.getState().viewport;
      const worldPoint = getWorldCoordinatesFromEvent(
        event.nativeEvent,
        canvasElement as HTMLDivElement,
        viewport,
      );

      // Start resize with current bounds
      onResizeStart(handle, worldPoint, bounds);
    },
    [onResizeStart, bounds, shouldShowResizeHandles],
  );

  // Don't render if no objects, invalid bounds, or if none of the selected objects exist
  const validObjectIds = objectIds.filter((id) => objects[id]);
  if (
    objectIds.length === 0 ||
    validObjectIds.length === 0 ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return null;
  }

  return (
    <div
      className="absolute pointer-events-none" // Don't capture pointer events - let Canvas handle them
      style={{
        left: screenBounds.x,
        top: screenBounds.y,
        width: screenBounds.width,
        height: screenBounds.height,
        zIndex: 1000,
      }}
    >
      {/* Selection border - hidden in crop mode */}
      {!isSelectedObjectInCropMode && (
        <div
          className="absolute inset-0 border border-[var(--ramp-blue-500)] pointer-events-none"
          style={{
            borderWidth: "1px",
          }}
        />
      )}

      {/* Draggable area - enables drag behavior for the selection.
          Disabled for Make nodes that are playing or in extract mode so the iframe can receive pointer events directly. */}
      <div
        className={`absolute inset-1 ${
          isInteractive &&
          !isSelectedObjectInCropMode &&
          !validObjectIds.some(
            (id) =>
              objects[id]?.type === "make" &&
              objects[id]?.properties?.type === "make" &&
              ((objects[id]?.properties as any)?.playing ||
                (extractMode.isActive && extractMode.makeObjectId === id)),
          )
            ? "pointer-events-auto"
            : "pointer-events-none"
        }`}
        style={{
          backgroundColor: "transparent",
        }}
        data-crop-mode={isSelectedObjectInCropMode ? "true" : undefined}
        onPointerDown={
          isInteractive && !isSelectedObjectInCropMode
            ? handlePointerDown
            : undefined
        }
        onPointerMove={
          isInteractive && !isSelectedObjectInCropMode
            ? handlePointerMove
            : undefined
        }
        onPointerUp={
          isInteractive && !isSelectedObjectInCropMode
            ? handlePointerUp
            : undefined
        }
      />

      {/* Corner handles - small squares with inverted colors (white fill, blue border) */}
      {shouldShowResizeHandles &&
        [
          {
            x: -3,
            y: -3,
            handle: "top-left" as ResizeHandle,
          },
          {
            x: screenBounds.width - 5,
            y: -3,
            handle: "top-right" as ResizeHandle,
          },
          {
            x: screenBounds.width - 5,
            y: screenBounds.height - 5,
            handle: "bottom-right" as ResizeHandle,
          },
          {
            x: -3,
            y: screenBounds.height - 5,
            handle: "bottom-left" as ResizeHandle,
          },
        ].map((handleInfo, index) => (
          <div
            key={`corner-${index}`}
            className={`absolute ${
              isInteractive ? "pointer-events-auto" : "pointer-events-none"
            }`}
            data-resize-handle="true"
            data-resize-handle-type={handleInfo.handle}
            style={{
              left: handleInfo.x - 5,
              top: handleInfo.y - 5,
              width: 18,
              height: 18,
              zIndex: 10,
              cursor: handleCursors[handleInfo.handle],
            }}
            onPointerEnter={
              isInteractive
                ? () => handleResizeHandleEnter(handleInfo.handle)
                : undefined
            }
            onPointerLeave={
              isInteractive ? () => handleResizeHandleLeave() : undefined
            }
            onPointerDown={
              isInteractive
                ? (e) => {
                    // Stop propagation to prevent Canvas selection, but set up pointer capture
                    e.stopPropagation();

                    // Start resize through the handle
                    handleResizeHandlePointerDown(e, handleInfo.handle);

                    // Capture pointer on Canvas so Canvas gets pointer up events
                    const canvasElement = document.querySelector(
                      ".relative.w-full.h-full",
                    ) as HTMLElement;
                    if (canvasElement) {
                      canvasElement.setPointerCapture(e.pointerId);
                    }
                  }
                : undefined
            }
          >
            {/* Visual handle centered within hit area */}
            <div
              className="absolute w-2 h-2 bg-white border border-[var(--ramp-blue-500)]"
              style={{
                left: 5, // Center the 8px handle within the 18px hit area
                top: 5,
                borderRadius: "0px",
              }}
            />
          </div>
        ))}

      {/* Edge handles - full-width/height strips */}
      {shouldShowResizeHandles && (
        <>
          {/* Top edge */}
          <div
            className={`absolute bg-transparent ${
              isInteractive ? "pointer-events-auto" : "pointer-events-none"
            }`}
            data-resize-handle="true"
            data-resize-handle-type="top-center"
            style={{
              left: -5,
              top: -8,
              width: screenBounds.width + 10,
              height: 16,
              zIndex: 5,
              cursor: handleCursors["top-center"],
            }}
            onPointerEnter={
              isInteractive
                ? () => handleResizeHandleEnter("top-center")
                : undefined
            }
            onPointerLeave={
              isInteractive ? () => handleResizeHandleLeave() : undefined
            }
            onPointerDown={
              isInteractive
                ? (e) => {
                    e.stopPropagation();
                    handleResizeHandlePointerDown(e, "top-center");
                    const canvasElement = document.querySelector(
                      ".relative.w-full.h-full",
                    ) as HTMLElement;
                    if (canvasElement) {
                      canvasElement.setPointerCapture(e.pointerId);
                    }
                  }
                : undefined
            }
          />

          {/* Bottom edge */}
          <div
            className={`absolute bg-transparent ${
              isInteractive ? "pointer-events-auto" : "pointer-events-none"
            }`}
            data-resize-handle="true"
            data-resize-handle-type="bottom-center"
            style={{
              left: -5,
              top: screenBounds.height - 8,
              width: screenBounds.width + 10,
              height: 16,
              zIndex: 5,
              cursor: handleCursors["bottom-center"],
            }}
            onPointerEnter={
              isInteractive
                ? () => handleResizeHandleEnter("bottom-center")
                : undefined
            }
            onPointerLeave={
              isInteractive ? () => handleResizeHandleLeave() : undefined
            }
            onPointerDown={
              isInteractive
                ? (e) => {
                    e.stopPropagation();
                    handleResizeHandlePointerDown(e, "bottom-center");
                    const canvasElement = document.querySelector(
                      ".relative.w-full.h-full",
                    ) as HTMLElement;
                    if (canvasElement) {
                      canvasElement.setPointerCapture(e.pointerId);
                    }
                  }
                : undefined
            }
          />

          {/* Left edge */}
          <div
            className={`absolute bg-transparent ${
              isInteractive ? "pointer-events-auto" : "pointer-events-none"
            }`}
            data-resize-handle="true"
            data-resize-handle-type="middle-left"
            style={{
              left: -8,
              top: -5,
              width: 16,
              height: screenBounds.height + 10,
              zIndex: 5,
              cursor: handleCursors["middle-left"],
            }}
            onPointerEnter={
              isInteractive
                ? () => handleResizeHandleEnter("middle-left")
                : undefined
            }
            onPointerLeave={
              isInteractive ? () => handleResizeHandleLeave() : undefined
            }
            onPointerDown={
              isInteractive
                ? (e) => {
                    e.stopPropagation();
                    handleResizeHandlePointerDown(e, "middle-left");
                    const canvasElement = document.querySelector(
                      ".relative.w-full.h-full",
                    ) as HTMLElement;
                    if (canvasElement) {
                      canvasElement.setPointerCapture(e.pointerId);
                    }
                  }
                : undefined
            }
          />

          {/* Right edge */}
          <div
            className={`absolute bg-transparent ${
              isInteractive ? "pointer-events-auto" : "pointer-events-none"
            }`}
            data-resize-handle="true"
            data-resize-handle-type="middle-right"
            style={{
              left: screenBounds.width - 8,
              top: -5,
              width: 16,
              height: screenBounds.height + 10,
              zIndex: 5,
              cursor: handleCursors["middle-right"],
            }}
            onPointerEnter={
              isInteractive
                ? () => handleResizeHandleEnter("middle-right")
                : undefined
            }
            onPointerLeave={
              isInteractive ? () => handleResizeHandleLeave() : undefined
            }
            onPointerDown={
              isInteractive
                ? (e) => {
                    e.stopPropagation();
                    handleResizeHandlePointerDown(e, "middle-right");
                    const canvasElement = document.querySelector(
                      ".relative.w-full.h-full",
                    ) as HTMLElement;
                    if (canvasElement) {
                      canvasElement.setPointerCapture(e.pointerId);
                    }
                  }
                : undefined
            }
          />
        </>
      )}

      {/* Measurement pill at bottom center */}
      {shouldShowResizeHandles &&
        (() => {
          // For single selection of auto-layout elements, show enhanced dimension info
          const shouldShowEnhancedDimensions = objectIds.length === 1;

          if (shouldShowEnhancedDimensions) {
            const singleObject = objects[objectIds[0]];
            const autoLayoutSizing = singleObject?.autoLayoutSizing;

            // Check if this object is a child of auto-layout
            const parent = singleObject?.parentId
              ? objects[singleObject.parentId]
              : null;
            const isChildOfAutoLayout =
              parent?.type === "frame" &&
              parent.properties?.type === "frame" &&
              parent.properties.autoLayout?.mode &&
              parent.properties.autoLayout.mode !== "none" &&
              !singleObject.absolutePositioned; // Absolutely positioned objects don't participate in auto-layout

            // Check if this object itself has auto-layout (is an auto-layout frame)
            const hasAutoLayout =
              singleObject?.type === "frame" &&
              singleObject.properties?.type === "frame" &&
              singleObject.properties.autoLayout?.mode &&
              singleObject.properties.autoLayout.mode !== "none";

            // Show enhanced dimensions if:
            // 1. Object is a child of auto-layout with sizing info (and not absolutely positioned), OR
            // 2. Object is itself an auto-layout frame with sizing info
            if (autoLayoutSizing && (isChildOfAutoLayout || hasAutoLayout)) {
              const widthText = (() => {
                const actualWidth = parseFloat(bounds.width.toFixed(2));
                switch (autoLayoutSizing.horizontal) {
                  case "fill":
                    return `Fill (${actualWidth})`;
                  case "hug":
                    return `${actualWidth} Hug`;
                  case "fixed":
                  default:
                    return actualWidth.toString();
                }
              })();

              const heightText = (() => {
                const actualHeight = parseFloat(bounds.height.toFixed(2));
                switch (autoLayoutSizing.vertical) {
                  case "fill":
                    return `Fill (${actualHeight})`;
                  case "hug":
                    return `${actualHeight} Hug`;
                  case "fixed":
                  default:
                    return actualHeight.toString();
                }
              })();

              const finalText = `${widthText} × ${heightText}`;

              return (
                <div
                  className="absolute bg-[var(--ramp-blue-500)] text-white text-[11px] h-4 font-medium px-[3px] rounded-[2px] pointer-events-none"
                  style={{
                    left: "50%",
                    bottom: "-22px",
                    transform: "translateX(-50%)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {finalText}
                </div>
              );
            }
          }

          // Default dimension display for non-auto-layout or multi-selection
          return (
            <div
              className="absolute bg-[var(--ramp-blue-500)] text-white text-[11px] h-4 font-medium px-[3px] rounded-[2px] pointer-events-none"
              style={{
                left: "50%",
                bottom: "-22px",
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
              }}
            >
              {parseFloat(bounds.width.toFixed(2))} ×{" "}
              {parseFloat(bounds.height.toFixed(2))}
            </div>
          );
        })()}
    </div>
  );
}
