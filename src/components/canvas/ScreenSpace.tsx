"use client";

import { NavigationContext } from "@/contexts/NavigationContext";
import { useAppStore, useObjects } from "@/core/state/store";
import { useTransientStore } from "@/core/state/transientStore";
import { getAbsolutePosition, screenToWorld, worldToScreen } from "@/core/utils/coordinates";
import { groupSelectionsByParent } from "@/core/utils/selection";
import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CropModeOverlay from "./CropModeOverlay";
import FrameLabels from "./FrameLabels";
import { IndividualSelectionIndicators } from "./IndividualSelectionIndicators";
import DesignChangesToolbar from "./DesignChangesToolbar";
import MakeExtractOverlay from "./MakeExtractOverlay";
import MakeToolbar from "./MakeExtractToolbar";
import OnCanvasAiPrompt from "./OnCanvasAiPrompt";
import OnCanvasMakeChat from "./OnCanvasMakeChat";
import SelectionBox, { ResizeHandle } from "./SelectionBox";
import { SelectionPreview } from "./SelectionPreview";
import SnapGuides from "./SnapGuides";

interface ScreenSpaceProps {
  isDragging?: boolean;
  showSelectionUI?: boolean;
  showSelectionPreview?: boolean;
  selectionPreviewTarget?: string | null;

  potentialParent?: string;
  dragMousePosition?: { x: number; y: number }; // Mouse position in world coordinates during drag
  draggedIds?: string[]; // IDs of objects being dragged
  onSelectionBoxClick?: (event: React.PointerEvent, groupIds: string[]) => void;
  onSelectionBoxClearClick?: (event: React.PointerEvent) => void;
  onResizeStart?: (
    handle: ResizeHandle,
    startPoint: { x: number; y: number },
    bounds: { x: number; y: number; width: number; height: number },
  ) => void;
  isZooming?: boolean;
  isPanning?: boolean;

  // Selection region props
  isSelectionRegion?: boolean;
  selectionRegionStart?: { x: number; y: number } | null;
  selectionRegionCurrent?: { x: number; y: number } | null;
}

/**
 * ScreenSpace renders fixed overlays that don't zoom/pan
 * These overlays need to be recalculated when viewport changes
 * Examples: selection handles, drag previews, snap guides, UI panels
 */
export default function ScreenSpace({
  isDragging = false,
  showSelectionUI = true,
  showSelectionPreview = false,
  selectionPreviewTarget = null,
  potentialParent,
  dragMousePosition,
  draggedIds = [],
  onSelectionBoxClick,
  onSelectionBoxClearClick,
  onResizeStart,
  isZooming = false,
  isPanning = false,
  isSelectionRegion = false,
  selectionRegionStart,
  selectionRegionCurrent,
}: ScreenSpaceProps) {
  const selectedIds = useAppStore((state) => state.selection.selectedIds);
  const tools = useAppStore((state) => state.tools);
  const objects = useObjects();
  const snapGuides = useAppStore((state) => state.snapGuides);
  const isResizing = useAppStore((state) => state.isResizing);

  // Check if any text object is currently being edited
  const hasEditingText = Object.values(objects).some((obj) => {
    return (
      obj &&
      obj.type === "text" &&
      obj.properties.type === "text" &&
      (obj.properties as any).isEditing
    );
  });

  // Get left rail offset (NavigationBar width + sidebar width if not collapsed)
  // NavigationBar is always 48px, sidebar width varies
  // Use useContext directly to avoid hook error when context is not available
  const navigationContext = useContext(NavigationContext);
  const NAVIGATION_BAR_WIDTH = 48;
  const leftRailOffset =
    navigationContext && !navigationContext.isNavigationCollapsed
      ? NAVIGATION_BAR_WIDTH + navigationContext.sidebarWidth
      : 0;

  const dragPositions = useTransientStore((s) => s.dragPositions);
  const resizeStates = useTransientStore((s) => s.resizeStates);
  const draggedAutoLayoutChildren = useTransientStore((s) => s.draggedAutoLayoutChildren);
  const autoLayoutPlaceholderPositions = useTransientStore((s) => s.autoLayoutPlaceholderPositions);
  const isHoveringAutoLayout = useTransientStore((s) => s.isHoveringAutoLayout);

  // Get crop mode state from global store
  const cropMode = useAppStore((state) => state.cropMode);

  const onCanvasAiPrompt = useAppStore((state) => state.onCanvasAiPrompt);
  const aiEditingGroups = useAppStore((state) => state.aiEditingGroups);
  const hideDimensionsAndHandlesForAi =
    onCanvasAiPrompt.isOpen &&
    Object.keys(aiEditingGroups).some(
      (k) => Object.keys(aiEditingGroups[k] || {}).length > 0
    );

  // Ref for canvas container so done entrypoint can portal and receive clicks (parent has pointer-events-none)
  const containerRef = useRef<HTMLDivElement>(null);

  // Get crop mode data if active
  const cropModeData = (() => {
    if (!cropMode.isActive || !cropMode.objectId || !cropMode.fillId)
      return null;

    const object = objects[cropMode.objectId];
    if (!object?.fills) return null;

    const imageFill = object.fills.find((fill) => fill.id === cropMode.fillId);
    if (!imageFill || imageFill.type !== "image") return null;

    return {
      object,
      imageFill,
    };
  })();

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{
        // Prevent this layer from affecting interactions
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      {/* Add CSS for caret blink animation */}
      <style>
        {`
          @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
          }
        `}
      </style>
      {/* Individual selection indicators - shows blue rectangles around each selected object in multi-selection */}
      <IndividualSelectionIndicators
        selectedIds={selectedIds}
        showIndividual={
          showSelectionUI &&
          selectedIds.length > 1 &&
          !isDragging &&
          !hasEditingText
        }
        isZooming={isZooming}
        isPanning={isPanning}
      />

      {/* Dotted border overlay on auto layout parent when its children are selected */}
      {showSelectionUI && !isDragging && !hasEditingText && (
        <AutoLayoutParentOverlay selectedIds={selectedIds} />
      )}

      {/* Grouped selection overlays - hide during drag, when showSelectionUI is false, or when text is being edited */}
      {selectedIds.length > 0 &&
        selectedIds.some((id) => objects[id]) && // Only render if at least one selected object exists
        !isDragging &&
        showSelectionUI &&
        !hasEditingText && (
          <GroupedSelectionOverlay
            onSelectionBoxClick={
              tools.activeTool === "select" ? onSelectionBoxClick : undefined
            }
            onSelectionBoxClearClick={
              tools.activeTool === "select"
                ? onSelectionBoxClearClick
                : undefined
            }
            onResizeStart={
              tools.activeTool === "select" ? onResizeStart : undefined
            }
            isInteractive={tools.activeTool === "select"}
            isZooming={isZooming}
            isPanning={isPanning}
            hideDimensionsAndHandles={hideDimensionsAndHandlesForAi}
          />
        )}

      {/* AI editing pulse overlay — shown on objects being edited by the AI Assistant */}
      <AiEditingOverlay />

      {/* Marching dashes overlay — shown on Makes while AI is generating */}
      <MakeGeneratingOverlay />

      {/* Frame labels - always visible for top-level frames, rendered after selection to be on top */}
      <FrameLabels
        isDragging={isDragging}
      />

      {/* Extract mode overlays — hover + selection highlights rendered in screen space */}
      <MakeExtractOverlay />

      {/* Make toolbar - play, editor, extract design */}
      <MakeToolbar />

      {/* Design changes toolbar - shown when extracted designs are modified */}
      <DesignChangesToolbar />

      {/* On-canvas Make chat panel for round-trip design→make updates */}
      <OnCanvasMakeChat />

      {/* On-canvas AI: selection star + persistent entrypoint (loading/done) + mini prompt; portaled to body */}
      <OnCanvasAiPrompt containerRef={containerRef} isInteractive={tools.activeTool === "select"} />

      {/* Selection preview - shows which object would be selected */}
      <SelectionPreview
        isVisible={showSelectionPreview}
        previewTargetId={selectionPreviewTarget}
      />

      {/* Snap guides - show alignment guides during drag and resize */}
      <SnapGuides
        horizontalGuides={snapGuides.horizontal}
        verticalGuides={snapGuides.vertical}
        isResizing={isResizing}
      />

      {/* Nesting target feedback - show potential parent frame during drag */}
      {isDragging && potentialParent && (
        <NestingTargetOverlay parentId={potentialParent} />
      )}

      {/* Crop mode overlay - show when an object with crop image fill is selected */}
      {cropModeData && (
        <CropModeOverlay
          object={cropModeData.object}
          imageFill={cropModeData.imageFill}
        />
      )}

      {/* Auto layout placeholder - show insertion line for auto layout frames */}
      {/* But don't show if AL children are re-entering their original parent (they use custom placeholders) */}
      {isDragging &&
        potentialParent &&
        dragMousePosition &&
        (() => {
          // Check if any dragged items are AL children re-entering their original parent
          // OR if any dragged items are absolutely positioned
          const hasReenteringALChildren = draggedIds.some((draggedId) => {
            const draggedObject = objects[draggedId];

            // Always suppress line placeholders for absolutely positioned children
            if (draggedObject?.absolutePositioned) {
              return true;
            }

            const alChildInfo = draggedAutoLayoutChildren[draggedId];
            const hasCustomPlaceholder =
              autoLayoutPlaceholderPositions[draggedId]?.parentId ===
              potentialParent;

            // If it's an AL child with a custom placeholder in the target parent, suppress line placeholder
            return alChildInfo && hasCustomPlaceholder;
          });

          if (hasReenteringALChildren) {
            return null;
          }

          return (
            <AutoLayoutPlaceholder
              parentId={potentialParent}
              mousePosition={dragMousePosition}
              draggedIds={draggedIds}
            />
          );
        })()}

      {/* Tool creation preview */}
      {tools.isCreating && tools.creationPreview && (
        <CreationPreview preview={tools.creationPreview} />
      )}

      {/* Selection region visualization */}
      {isSelectionRegion && selectionRegionStart && selectionRegionCurrent && (
        <SelectionRegion
          start={selectionRegionStart}
          current={selectionRegionCurrent}
        />
      )}

      {/* Drag feedback */}

      {/* Custom Text Caret */}
      <CustomTextCaret
        hasEditingText={hasEditingText}
        leftRailOffset={leftRailOffset}
      />

      {/* Text editing overlay - show blue border when editing non-empty text */}
      {Object.values(objects)
        .filter((obj) => {
          if (
            !obj ||
            obj.type !== "text" ||
            obj.properties.type !== "text" ||
            !(obj.properties as any).isEditing
          ) {
            return false;
          }

          // Always show overlay for fixed-size text, regardless of content
          if ((obj.properties as any).resizeMode === "fixed") {
            return true;
          }

          // For auto-width text, only show overlay if there's meaningful content
          // Target the Slate editor specifically, not the entire container
          const textContainer = document.querySelector(
            `[data-object-id="${obj.id}"]`,
          );
          if (textContainer) {
            // Look for the actual Slate editor inside the container
            const slateEditor = textContainer.querySelector(
              '[data-slate-editor="true"]',
            );
            if (slateEditor) {
              const textContent = slateEditor.textContent || "";
              const trimmed = textContent.trim();

              // Consider empty if:
              // - No content at all
              // - Only whitespace
              // - Only newline characters
              // - Empty string
              if (
                !trimmed ||
                trimmed === "" ||
                trimmed === "\n" ||
                /^\s*$/.test(trimmed)
              ) {
                return false;
              }
              return true;
            }
          }

          // Fallback to stored content property
          const content = (obj.properties as any).content || "";
          const trimmed = content.trim();
          return trimmed !== "" && trimmed !== "\n" && !/^\s*$/.test(trimmed);
        })
        .map((textObj) => {
          const textAbsolute = getAbsolutePosition(textObj!.id, objects);
          const vp = useAppStore.getState().viewport;
          const screenX = textAbsolute.x * vp.zoom + vp.panX;
          const screenY = textAbsolute.y * vp.zoom + vp.panY;
          const screenWidth = textObj!.width * vp.zoom;
          const screenHeight = textObj!.height * vp.zoom;

          return (
            <div
              key={`text-editing-overlay-${textObj!.id}`}
              className="absolute pointer-events-none"
              style={{
                left: screenX - 1, // Offset by border width
                top: screenY - 1, // Offset by border width
                width: screenWidth + 2, // Add border width to both sides
                height: screenHeight + 2, // Add border width to both sides
                border: "1px solid #3b82f6", // Blue border
                zIndex: 1001, // Above text but below caret
              }}
            />
          );
        })}
    </div>
  );
}

/**
 * Shows visual feedback for potential nesting target
 */
function NestingTargetOverlay({ parentId }: { parentId: string }) {
  const viewport = useAppStore((state) => state.viewport);
  const objects = useObjects();

  const parentObject = objects[parentId];
  if (!parentObject) return null;

  // Get absolute position of the potential parent frame
  const parentAbsolute = getAbsolutePosition(parentId, objects);

  // Convert to screen coordinates for overlay positioning
  const screenX = parentAbsolute.x * viewport.zoom + viewport.panX;
  const screenY = parentAbsolute.y * viewport.zoom + viewport.panY;
  const screenWidth = parentObject.width * viewport.zoom;
  const screenHeight = parentObject.height * viewport.zoom;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: screenX,
        top: screenY,
        width: screenWidth,
        height: screenHeight,
        border: "1px solid #3b82f6",
      }}
    />
  );
}

/**
 * Shows a dotted border overlay on the parent auto layout frame
 * when any of its children are selected.
 */
function AutoLayoutParentOverlay({ selectedIds }: { selectedIds: string[] }) {
  const viewport = useAppStore((state) => state.viewport);
  const objects = useObjects();

  // Track the viewport that the DOM currently reflects so that
  // DOM → world conversion stays accurate even during zoom/pan.
  const committedViewportRef = useRef(viewport);
  React.useLayoutEffect(() => {
    committedViewportRef.current = viewport;
  }, [viewport]);

  if (selectedIds.length === 0) return null;

  // Collect unique AL parent IDs for selected children
  const alParentIds = new Set<string>();
  for (const id of selectedIds) {
    const obj = objects[id];
    if (!obj?.parentId) continue;
    const parent = objects[obj.parentId];
    if (
      parent?.type === "frame" &&
      parent.properties?.type === "frame" &&
      parent.properties.autoLayout?.mode !== undefined &&
      parent.properties.autoLayout?.mode !== "none"
    ) {
      // Only show if the parent itself is NOT selected (avoid double borders)
      if (!selectedIds.includes(parent.id)) {
        alParentIds.add(parent.id);
      }
    }
  }

  if (alParentIds.size === 0) return null;

  return (
    <>
      {[...alParentIds].map((parentId) => {
        const parentObj = objects[parentId];
        if (!parentObj) return null;

        // Read position from the DOM and convert to world coordinates first,
        // then project to screen using the current viewport. This two-step
        // approach keeps the overlay aligned during zoom/pan, because the DOM
        // may still reflect a slightly older viewport transform.
        const element = document.querySelector(
          `[data-object-id="${parentId}"]`
        );
        const canvasArea = document.querySelector(
          '[data-canvas-area="true"]'
        );

        let worldX: number;
        let worldY: number;
        let worldW: number;
        let worldH: number;

        if (element && canvasArea) {
          const rect = element.getBoundingClientRect();
          const canvasRect = canvasArea.getBoundingClientRect();
          const cv = committedViewportRef.current;

          // Screen-relative position within the canvas container
          const screenRelX = rect.left - canvasRect.left;
          const screenRelY = rect.top - canvasRect.top;

          // Convert screen coords → world coords using the committed viewport
          // (the viewport the DOM currently reflects):
          // screen = world * zoom + pan  =>  world = (screen - pan) / zoom
          worldX = (screenRelX - cv.panX) / cv.zoom;
          worldY = (screenRelY - cv.panY) / cv.zoom;
          worldW = rect.width / cv.zoom;
          worldH = rect.height / cv.zoom;
        } else {
          // Fallback to state-based calculation if DOM isn't ready
          const parentAbsolute = getAbsolutePosition(parentId, objects);
          worldX = parentAbsolute.x;
          worldY = parentAbsolute.y;
          worldW = parentObj.width;
          worldH = parentObj.height;
        }

        // Convert world → screen using the *current* viewport
        const screenTopLeft = worldToScreen({ x: worldX, y: worldY }, viewport);
        const screenBottomRight = worldToScreen(
          { x: worldX + worldW, y: worldY + worldH },
          viewport
        );

        return (
          <div
            key={`al-parent-overlay-${parentId}`}
            className="absolute pointer-events-none"
            style={{
              left: screenTopLeft.x,
              top: screenTopLeft.y,
              width: screenBottomRight.x - screenTopLeft.x,
              height: screenBottomRight.y - screenTopLeft.y,
              border: "1px dotted var(--ramp-blue-500)",
              zIndex: 999,
            }}
          />
        );
      })}
    </>
  );
}

/**
 * AutoLayoutPlaceholder component - shows insertion line for auto layout frames.
 * Reads live DOM positions so the line respects alignItems / justifyContent.
 */
function AutoLayoutPlaceholder({
  parentId,
  mousePosition,
  draggedIds,
}: {
  parentId: string;
  mousePosition: { x: number; y: number };
  draggedIds: string[];
}) {
  const viewport = useAppStore((state) => state.viewport);
  const objects = useObjects();

  const parentObject = objects[parentId];
  if (!parentObject || parentObject.type !== "frame") return null;

  const autoLayout =
    parentObject.properties?.type === "frame"
      ? parentObject.properties.autoLayout
      : null;

  if (!autoLayout || autoLayout.mode === "none") return null;

  const isHorizontal = autoLayout.mode === "horizontal";
  const gap = autoLayout.gap || 0;
  const padding = autoLayout.padding || {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };

  // Read the parent's DOM rect once — all child positions are relative to this.
  const parentElement = document.querySelector(
    `[data-object-id="${parentId}"]`
  );
  const parentRect = parentElement?.getBoundingClientRect();
  if (!parentRect) return null;

  // Helper: get a child's rect in parent-relative world coordinates
  const getChildWorldRect = (childId: string) => {
    const el = document.querySelector(`[data-object-id="${childId}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: (r.left - parentRect.left) / viewport.zoom,
      y: (r.top - parentRect.top) / viewport.zoom,
      width: r.width / viewport.zoom,
      height: r.height / viewport.zoom,
    };
  };

  // Get absolute position of the parent frame
  const parentAbsolute = getAbsolutePosition(parentId, objects);

  // Convert mouse position to parent's local coordinate space
  const localMouseX = mousePosition.x - parentAbsolute.x;
  const localMouseY = mousePosition.y - parentAbsolute.y;

  // Visible children (not being dragged)
  const children = parentObject.childIds
    .map((id) => objects[id])
    .filter((child) => child && !draggedIds.includes(child.id));

  // Build DOM rects array for visible children
  const childRects = children.map((c) => ({
    id: c.id,
    rect: getChildWorldRect(c.id),
  }));

  // Determine insertion index from mouse position vs child midpoints
  let insertionIndex = 0;
  for (let i = 0; i < childRects.length; i++) {
    const r = childRects[i].rect;
    if (!r) continue;
    const mid = isHorizontal ? r.x + r.width / 2 : r.y + r.height / 2;
    const mouse = isHorizontal ? localMouseX : localMouseY;
    if (mouse < mid) {
      insertionIndex = i;
      break;
    }
    insertionIndex = i + 1;
  }

  // ----- Compute placeholder position from DOM rects -----
  // Main axis: position the line between the two neighboring children.
  // Cross axis: span the full content region indicated by neighboring children.

  let mainPos: number; // position along the layout axis (in parent-relative world coords)
  let crossStart: number; // start of the line on the cross axis
  let crossEnd: number; // end of the line on the cross axis

  const prevRect = insertionIndex > 0 ? childRects[insertionIndex - 1].rect : null;
  const nextRect =
    insertionIndex < childRects.length ? childRects[insertionIndex].rect : null;

  if (isHorizontal) {
    // Main axis = X
    if (prevRect && nextRect) {
      // Between two children — center of the gap
      mainPos = prevRect.x + prevRect.width + (nextRect.x - (prevRect.x + prevRect.width)) / 2;
    } else if (prevRect) {
      // After last child — edge + half remaining space
      mainPos = prevRect.x + prevRect.width + gap / 2;
    } else if (nextRect) {
      // Before first child — half the leading space
      mainPos = nextRect.x / 2;
    } else {
      mainPos = padding.left;
    }

    // Cross axis = Y — span the union of neighboring children, or fall back to padding
    const refRect = prevRect || nextRect;
    if (refRect) {
      crossStart = refRect.y;
      crossEnd = refRect.y + refRect.height;
      // Widen to union of both neighbors if available
      if (prevRect && nextRect) {
        crossStart = Math.min(prevRect.y, nextRect.y);
        crossEnd = Math.max(
          prevRect.y + prevRect.height,
          nextRect.y + nextRect.height
        );
      }
    } else {
      crossStart = padding.top;
      crossEnd = parentObject.height - padding.bottom;
    }
  } else {
    // Main axis = Y
    if (prevRect && nextRect) {
      mainPos = prevRect.y + prevRect.height + (nextRect.y - (prevRect.y + prevRect.height)) / 2;
    } else if (prevRect) {
      mainPos = prevRect.y + prevRect.height + gap / 2;
    } else if (nextRect) {
      mainPos = nextRect.y / 2;
    } else {
      mainPos = padding.top;
    }

    // Cross axis = X
    const refRect = prevRect || nextRect;
    if (refRect) {
      crossStart = refRect.x;
      crossEnd = refRect.x + refRect.width;
      if (prevRect && nextRect) {
        crossStart = Math.min(prevRect.x, nextRect.x);
        crossEnd = Math.max(
          prevRect.x + prevRect.width,
          nextRect.x + nextRect.width
        );
      }
    } else {
      crossStart = padding.left;
      crossEnd = parentObject.width - padding.right;
    }
  }

  // Convert to screen coordinates
  const screenParentX = parentAbsolute.x * viewport.zoom + viewport.panX;
  const screenParentY = parentAbsolute.y * viewport.zoom + viewport.panY;

  let screenX: number;
  let screenY: number;
  let lineWidth: number;
  let lineHeight: number;

  if (isHorizontal) {
    screenX = screenParentX + mainPos * viewport.zoom - 1;
    screenY = screenParentY + crossStart * viewport.zoom;
    lineWidth = 2;
    lineHeight = Math.max((crossEnd - crossStart) * viewport.zoom, 20);
  } else {
    screenX = screenParentX + crossStart * viewport.zoom;
    screenY = screenParentY + mainPos * viewport.zoom - 1;
    lineWidth = Math.max((crossEnd - crossStart) * viewport.zoom, 20);
    lineHeight = 2;
  }

  return (
    <div
      className="absolute pointer-events-none bg-blue-500 transition-opacity duration-100"
      style={{
        left: screenX,
        top: screenY,
        width: lineWidth,
        height: lineHeight,
        opacity: 0.8,
      }}
    />
  );
}

/**
 * Grouped selection overlays component
 */
function GroupedSelectionOverlay({
  onSelectionBoxClick,
  onSelectionBoxClearClick,
  onResizeStart,
  isInteractive,
  isZooming,
  isPanning,
  hideDimensionsAndHandles = false,
}: {
  onSelectionBoxClick?: (event: React.PointerEvent, groupIds: string[]) => void;
  onSelectionBoxClearClick?: (event: React.PointerEvent) => void;
  onResizeStart?: (
    handle: ResizeHandle,
    startPoint: { x: number; y: number },
    bounds: { x: number; y: number; width: number; height: number },
  ) => void;
  isInteractive: boolean;
  isZooming?: boolean;
  isPanning?: boolean;
  hideDimensionsAndHandles?: boolean;
}) {
  const selectedIds = useAppStore((state) => state.selection.selectedIds);
  const objects = useObjects();

  // Group selected IDs by parent
  const groupedSelections = groupSelectionsByParent(
    selectedIds,
    objects,
  );

  return (
    <>
      {Object.entries(groupedSelections).map(([parentId, objectIds]) => (
        <SelectionBox
          key={parentId}
          objectIds={objectIds}
          parentId={parentId}
          onSelectionBoxClick={onSelectionBoxClick}
          onSelectionBoxClearClick={onSelectionBoxClearClick}
          onResizeStart={onResizeStart}
          isInteractive={isInteractive}
          isZooming={isZooming}
          isPanning={isPanning}
          hideDimensionsAndHandles={hideDimensionsAndHandles}
        />
      ))}
    </>
  );
}

/**
 * Selection handles component
 */
function SelectionHandles({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const handleSize = 8;
  const handleOffset = handleSize / 2;

  // Define handle positions
  const handles = [
    { x: -handleOffset, y: -handleOffset }, // Top-left
    { x: width / 2 - handleOffset, y: -handleOffset }, // Top-center
    { x: width - handleOffset, y: -handleOffset }, // Top-right
    { x: width - handleOffset, y: height / 2 - handleOffset }, // Center-right
    { x: width - handleOffset, y: height - handleOffset }, // Bottom-right
    { x: width / 2 - handleOffset, y: height - handleOffset }, // Bottom-center
    { x: -handleOffset, y: height - handleOffset }, // Bottom-left
    { x: -handleOffset, y: height / 2 - handleOffset }, // Center-left
  ];

  return (
    <>
      {handles.map((handle, index) => (
        <div
          key={index}
          className="absolute bg-white border-2 border-[var(--ramp-blue-500)] cursor-pointer"
          style={{
            left: handle.x,
            top: handle.y,
            width: handleSize,
            height: handleSize,
            borderRadius: "0px",
          }}
        />
      ))}
    </>
  );
}

/**
 * Creation preview component - shows visual feedback during object creation
 */
function CreationPreview({ preview }: { preview: any }) {
  const viewport = useAppStore((state) => state.viewport);

  if (!preview || preview.width <= 0 || preview.height <= 0) {
    return null;
  }

  // Only show creation preview after sufficient movement (5 pixels in screen space)
  const screenWidth = preview.width * viewport.zoom;
  const screenHeight = preview.height * viewport.zoom;
  const hasMovedEnough = screenWidth >= 5 || screenHeight >= 5;

  if (!hasMovedEnough) {
    return null;
  }

  // Convert world coordinates to screen coordinates
  const screenBounds = {
    x: preview.x * viewport.zoom + viewport.panX,
    y: preview.y * viewport.zoom + viewport.panY,
    width: preview.width * viewport.zoom,
    height: preview.height * viewport.zoom,
  };

  // Selection box style for all creation types
  const getPreviewStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      left: screenBounds.x,
      top: screenBounds.y,
      width: screenBounds.width,
      height: screenBounds.height,
      position: "absolute" as const,
      pointerEvents: "none" as const,
      border: "1px solid var(--ramp-blue-500)", // Matches selection box: border-blue-500
      backgroundColor: "transparent", // No fill, just border
    };

    // Adjust border radius based on shape type
    if (preview.type === "ellipse") {
      return {
        ...baseStyle,
        borderRadius: "50%",
      };
    } else if (preview.type === "rectangle") {
      return {
        ...baseStyle,
        borderRadius: "4px",
      };
    } else if (preview.type === "frame") {
      return {
        ...baseStyle,
        borderRadius: "0px", // Frames have no border radius
      };
    } else if (preview.type === "make") {
      return {
        ...baseStyle,
        borderRadius: "0px", // Make nodes have no border radius
      };
    }

    return baseStyle;
  };

  // Match SelectionBox: only show handles when at least one axis is ≥ 8px
  const MIN_VISUAL_SIZE_FOR_HANDLES = 8;
  const shouldShowHandles =
    screenBounds.width >= MIN_VISUAL_SIZE_FOR_HANDLES ||
    screenBounds.height >= MIN_VISUAL_SIZE_FOR_HANDLES;

  return (
    <div className="creation-preview" style={getPreviewStyle()}>
      {/* Corner resize handles - matching SelectionBox styling exactly */}
      {shouldShowHandles &&
        [
          {
            x: -3,
            y: -3,
            handle: "top-left",
          },
          {
            x: screenBounds.width - 5,
            y: -3,
            handle: "top-right",
          },
          {
            x: screenBounds.width - 5,
            y: screenBounds.height - 5,
            handle: "bottom-right",
          },
          {
            x: -3,
            y: screenBounds.height - 5,
            handle: "bottom-left",
          },
        ].map((handleInfo, index) => (
          <div
            key={`corner-${index}`}
            className="absolute pointer-events-none"
            style={{
              left: handleInfo.x - 5,
              top: handleInfo.y - 5,
              width: 18,
              height: 18,
              zIndex: 10,
            }}
          >
            <div
              className="absolute w-2 h-2 bg-white border border-blue-500"
              style={{
                left: 4,
                top: 4,
              }}
            />
          </div>
        ))}

      {/* Dimension pill - matching SelectionBox styling.
          Use -23px (vs SelectionBox's -22px) to compensate for the 1px
          border on this container — the pill should sit at the same
          visual distance from the bottom edge. */}
      {shouldShowHandles && (
        <div
          className="absolute bg-[var(--ramp-blue-500)] text-white text-[11px] h-4 font-medium px-[3px] rounded-[2px] pointer-events-none"
          style={{
            left: "50%",
            bottom: "-23px",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}
        >
          {parseFloat(preview.width.toFixed(2))} ×{" "}
          {parseFloat(preview.height.toFixed(2))}
        </div>
      )}
    </div>
  );
}

/**
 * Selection region visualization component
 */
function SelectionRegion({
  start,
  current,
}: {
  start: { x: number; y: number } | null;
  current: { x: number; y: number } | null;
}) {
  if (!start || !current) return null;

  const viewport = useAppStore((state) => state.viewport);

  // Calculate proper bounds (like creation tools do)
  const minX = Math.min(start.x, current.x);
  const minY = Math.min(start.y, current.y);
  const maxX = Math.max(start.x, current.x);
  const maxY = Math.max(start.y, current.y);
  const width = maxX - minX;
  const height = maxY - minY;

  // Convert world coordinates to screen coordinates
  const screenX = minX * viewport.zoom + viewport.panX;
  const screenY = minY * viewport.zoom + viewport.panY;
  const screenWidth = width * viewport.zoom;
  const screenHeight = height * viewport.zoom;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: screenX,
        top: screenY,
        width: screenWidth,
        height: screenHeight,
        border: "1px solid #3b82f6",
        borderRadius: "0px",
        backgroundColor: "rgba(59, 130, 246, 0.08)",
      }}
    />
  );
}

// Custom Text Caret Component for ScreenSpace
function CustomTextCaret({
  hasEditingText,
  leftRailOffset,
}: {
  hasEditingText: boolean;
  leftRailOffset: number;
}) {
  const viewport = useAppStore((state) => state.viewport);
  const [caretPosition, setCaretPosition] = useState<{
    x: number;
    y: number;
    height: number;
  } | null>(null);
  const [animationKey, setAnimationKey] = useState(0); // Force animation restart
  const canvasContainerRef = useRef<HTMLElement | null>(null);

  // Get canvas container position on mount
  useEffect(() => {
    const canvasArea = document.querySelector('[data-canvas-area="true"]');
    canvasContainerRef.current = canvasArea as HTMLElement;
  }, []);

  // Calculate cursor height using line element height (same as overlays)
  // This ensures cursor and overlays have consistent heights
  const calculateLineHeightAndPosition = (
    caretRange: Range,
  ): { height: number; top: number } => {
    try {
      const caretRect = caretRange.getBoundingClientRect();

      // Try to find the actual line box height by checking the containing DOM element (same as overlays)
      try {
        const container = caretRange.commonAncestorContainer;

        // Find the containing line element (Slate paragraph)
        let lineElement =
          container.nodeType === Node.TEXT_NODE
            ? container.parentElement
            : (container as Element);

        while (
          lineElement &&
          !lineElement.closest('[data-slate-node="element"]')
        ) {
          lineElement = lineElement.parentElement;
        }

        if (lineElement) {
          const lineElementContainer = lineElement.closest(
            '[data-slate-node="element"]',
          );

          if (lineElementContainer) {
            const lineRect = lineElementContainer.getBoundingClientRect();

            // Check if this is likely a single-line container
            // If the container height is much larger than the natural cursor height,
            // it's probably a multi-line auto-height text, so use natural height
            const heightRatio = lineRect.height / caretRect.height;

            if (lineRect.height > 0 && heightRatio <= 1.5) {
              return { height: lineRect.height, top: lineRect.top };
            }
          } else {
          }
        } else {
        }
      } catch (error) {
        console.warn("Error getting cursor line element height:", error);
      }

      return { height: caretRect.height, top: caretRect.top };
    } catch (error) {
      const caretRect = caretRange.getBoundingClientRect();
      return { height: caretRect.height, top: caretRect.top };
    }
  };

  useEffect(() => {
    const updateCaretPosition = () => {
      try {
        const selection = window.getSelection();

        if (
          !selection ||
          selection.rangeCount === 0 ||
          !selection.isCollapsed
        ) {
          setCaretPosition(null);
          return;
        }

        // Check if we're editing any text object
        if (!hasEditingText) {
          setCaretPosition(null);
          return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        if (rect.width < 2 && rect.height > 0) {
          // Calculate line height and position for cursor - use tallest element like overlays
          const { height: lineHeight, top: tallestTop } =
            calculateLineHeightAndPosition(range);

          // Get canvas container position to convert viewport coordinates to canvas-relative coordinates
          // rect.left is in viewport coordinates, ScreenSpace is positioned relative to canvas container
          const canvasRect =
            canvasContainerRef.current?.getBoundingClientRect();
          const canvasLeft = canvasRect?.left ?? 0;

          const newPosition = {
            x: rect.left - canvasLeft, // Convert to canvas-relative coordinates
            y: tallestTop - (canvasRect?.top ?? 0), // Convert to canvas-relative coordinates
            height: lineHeight, // Use tallest height on line
          };

          // Check if position actually changed to restart animation (with tolerance to prevent jumping)
          setCaretPosition((prevPosition) => {
            const positionTolerance = 2; // pixels - small tolerance to prevent micro-movements

            if (
              !prevPosition ||
              Math.abs(prevPosition.x - newPosition.x) > positionTolerance ||
              Math.abs(prevPosition.y - newPosition.y) > positionTolerance ||
              Math.abs(prevPosition.height - newPosition.height) >
                positionTolerance
            ) {
              // Position changed significantly - restart animation
              setAnimationKey((prev) => prev + 1);
            }
            return newPosition;
          });
        } else {
          setCaretPosition(null);
        }
      } catch (error) {
        setCaretPosition(null);
      }
    };

    // Keyboard event handler to restart animation on caret-moving keys
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!hasEditingText) return;

      // Keys that move the caret or create new content
      const caretKeys = [
        "Enter",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "PageUp",
        "PageDown",
      ];

      if (caretKeys.includes(event.key)) {
        // Restart animation after a small delay to let the DOM update
        setTimeout(() => {
          setAnimationKey((prev) => prev + 1);
        }, 10);
      }
    };

    // Click event handler to restart animation on caret repositioning
    const handleClick = (event: MouseEvent) => {
      if (!hasEditingText) return;

      // Check if click is within a text editing area
      const target = event.target as HTMLElement;
      if (target && target.closest('[data-slate-editor="true"]')) {
        // Restart animation after a small delay to let selection update
        setTimeout(() => {
          setAnimationKey((prev) => prev + 1);
        }, 10);
      }
    };

    // Update on selection changes
    document.addEventListener("selectionchange", updateCaretPosition);

    // Listen for keyboard events to restart animation
    document.addEventListener("keydown", handleKeyDown);

    // Listen for clicks to restart animation
    document.addEventListener("click", handleClick);

    // Update immediately when viewport or editing state changes
    updateCaretPosition();

    return () => {
      document.removeEventListener("selectionchange", updateCaretPosition);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClick);
    };
  }, [
    hasEditingText,
    viewport.zoom,
    viewport.panX,
    viewport.panY,
    leftRailOffset,
  ]);

  if (!caretPosition) return null;

  return (
    <div
      key={animationKey} // Force animation restart when key changes
      style={{
        position: "absolute",
        left: caretPosition.x,
        top: caretPosition.y,
        width: 1,
        height: caretPosition.height,
        backgroundColor: "black",
        pointerEvents: "none",
        zIndex: 1001,
        animation: "blink 1s infinite",
      }}
    />
  );
}

/**
 * Overlay that renders a rotating gradient border on objects being edited by the AI Assistant,
 * or on the current selection when the entrypoint was just clicked (AI request loading).
 * Rendered in screen-space so it doesn't interfere with the canvas DOM.
 */
const AiEditingOverlay = React.memo(function AiEditingOverlay() {
  const aiEditingGroups = useAppStore((state) => state.aiEditingGroups);
  const dragPositions = useTransientStore((s) => s.dragPositions);
  const objects = useObjects();
  const viewport = useAppStore((state) => state.viewport);

  const BORDER_PADDING = 1;
  const OVERLAY_PADDING = 4;

  const groupEntries = Object.entries(aiEditingGroups).filter(
    ([_, ids]) => Object.keys(ids).length > 0,
  );
  if (groupEntries.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes ai-gradient-rotate {
          to { transform: rotate(360deg); }
        }
      `}</style>
      {groupEntries.map(([groupKey, idRecord]) => {
        const editingIds = Object.keys(idRecord);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const id of editingIds) {
          const obj = objects[id];
          if (!obj) continue;
          const absPos = dragPositions[id] || getAbsolutePosition(id, objects);
          const w = obj.width ?? 0;
          const h = obj.height ?? 0;
          minX = Math.min(minX, absPos.x);
          minY = Math.min(minY, absPos.y);
          maxX = Math.max(maxX, absPos.x + w);
          maxY = Math.max(maxY, absPos.y + h);
        }
        if (minX === Infinity) return <React.Fragment key={groupKey} />;

        const screenX = minX * viewport.zoom + viewport.panX;
        const screenY = minY * viewport.zoom + viewport.panY;
        const screenW = (maxX - minX) * viewport.zoom;
        const screenH = (maxY - minY) * viewport.zoom;
        const overlayW = screenW + OVERLAY_PADDING * 2;
        const overlayH = screenH + OVERLAY_PADDING * 2;
        const gradientExtension = Math.ceil(
          Math.sqrt(overlayW * overlayW + overlayH * overlayH) / 2,
        );

        return (
          <div
            key={groupKey}
            className="pointer-events-none"
            style={{
              position: "absolute",
              left: screenX - OVERLAY_PADDING,
              top: screenY - OVERLAY_PADDING,
              width: overlayW,
              height: overlayH,
              zIndex: 999,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 5,
                backgroundColor: "transparent",
                padding: `${BORDER_PADDING}px`,
                mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                maskComposite: "exclude",
                WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                WebkitMaskComposite: "xor",
                overflow: "hidden",
                ["--gradient-extension" as string]: `${gradientExtension}px`,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "calc(-1 * var(--gradient-extension))",
                  left: "calc(-1 * var(--gradient-extension))",
                  right: "calc(-1 * var(--gradient-extension))",
                  bottom: "calc(-1 * var(--gradient-extension))",
                  backgroundImage:
                    "conic-gradient(from 0deg, rgba(255, 255, 255, 0) 0%, var(--color-bg-brand) 20%, var(--color-bg-brand) 80%, rgba(255, 255, 255, 0) 100%)",
                  animation: "ai-gradient-rotate 3s linear infinite",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>
        );
      })}
    </>
  );
});

/**
 * Overlay that renders a marching dashes border on Makes while AI is generating.
 * Rendered in screen-space so it sits above the iframe and overflow:hidden container.
 */
const MakeGeneratingOverlay = React.memo(function MakeGeneratingOverlay() {
  const generatingMakeIds = useAppStore((state) => state.generatingMakeIds);
  const dragPositions = useTransientStore((s) => s.dragPositions);
  const objects = useObjects();
  const viewport = useAppStore((state) => state.viewport);

  const ids = Object.keys(generatingMakeIds);
  if (ids.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes make-dash-march {
          to { stroke-dashoffset: -16; }
        }
      `}</style>
      {ids.map((id) => {
        const obj = objects[id];
        if (!obj) return null;

        // Use drag position if available, otherwise fall back to stored position
        const absPos = dragPositions[id] || getAbsolutePosition(id, objects);
        const screenX = absPos.x * viewport.zoom + viewport.panX;
        const screenY = absPos.y * viewport.zoom + viewport.panY;
        const screenW = obj.width * viewport.zoom;
        const screenH = obj.height * viewport.zoom;

        return (
          <div
            key={`make-gen-${id}`}
            className="pointer-events-none"
            style={{
              position: "absolute",
              left: screenX,
              top: screenY,
              width: screenW,
              height: screenH,
              zIndex: 999,
            }}
          >
            {/* Marching dashes border */}
            <svg
              style={{
                position: "absolute",
                inset: -1,
                width: "calc(100% + 2px)",
                height: "calc(100% + 2px)",
                overflow: "visible",
              }}
            >
              <rect
                x="0.5"
                y="0.5"
                width={screenW + 1}
                height={screenH + 1}
                rx="2"
                ry="2"
                fill="none"
                stroke="var(--ramp-blue-500, #0d99ff)"
                strokeWidth="1"
                strokeDasharray="4 4"
                style={{
                  animation: "make-dash-march 0.4s linear infinite",
                }}
              />
            </svg>
          </div>
        );
      })}
    </>
  );
});
