"use client";

import { isTopLevelFrame } from "@/core/services/selection";
import { useAppStore, useObjects } from "@/core/state/store";
import { useTransientStore } from "@/core/state/transientStore";
import { getAbsolutePosition, worldToScreen } from "@/core/utils/coordinates";
import { useEffect, useRef, useState } from "react";
import { IconControlsIndicator } from "../icons/icon-controls-indicator";
import { Icon16CodeLayer } from "../icons/icon-16-code-layer";

interface FrameLabelsProps {
  isDragging?: boolean;
}

/**
 * Renders labels for top-level frames in screen space
 * Labels appear above frames and are always clickable to select the frame
 * Labels follow frames during drag operations
 */
export default function FrameLabels({ isDragging = false }: FrameLabelsProps) {
  const viewport = useAppStore((state) => state.viewport);
  const objects = useObjects();
  const dragPositions = useTransientStore((s) => s.dragPositions);
  const resizeStates = useTransientStore((s) => s.resizeStates);
  const isHoveringAutoLayout = useTransientStore((s) => s.isHoveringAutoLayout);
  const draggedIds = useTransientStore((s) => s.draggedIds);
  const selectedIds = useAppStore((state) => state.selection.selectedIds);
  const selectionPreviewTarget = useAppStore(
    (state) => state.selectionPreviewTarget,
  );
  const setSelectionPreviewTarget = useAppStore(
    (state) => state.setSelectionPreviewTarget,
  );
  const dispatch = useAppStore((state) => state.dispatch);

  // State for tracking which frame label is being edited
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const editableRef = useRef<HTMLDivElement>(null);

  // Helper functions for editing
  const startEditing = (frameId: string, currentName: string) => {
    setEditingFrameId(frameId);
    setEditingName(currentName);
  };

  const saveEdit = () => {
    if (!editingFrameId) return;

    const frame = objects[editingFrameId];
    if (!frame) return;

    // If the field is empty, restore the original name and close
    if (!editingName.trim()) {
      setEditingFrameId(null);
      setEditingName("");
      return;
    }

    // Only dispatch if the name actually changed
    if (editingName.trim() !== frame.name) {
      dispatch({
        type: "object.updated",
        payload: {
          id: editingFrameId,
          changes: { name: editingName.trim() },
          previousValues: { name: frame.name },
        },
      });
    }

    setEditingFrameId(null);
    setEditingName("");
  };

  const cancelEdit = () => {
    setEditingFrameId(null);
    setEditingName("");
  };

  // Focus the editable element when editing starts
  useEffect(() => {
    if (editingFrameId && editableRef.current) {
      // Set the initial content
      editableRef.current.textContent = editingName;
      editableRef.current.focus();
      // Select all text for easy replacement
      const range = document.createRange();
      range.selectNodeContents(editableRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [editingFrameId]);

  // Listen for custom edit events from useCanvasSelection
  useEffect(() => {
    const handleEditEvent = (event: CustomEvent) => {
      const { frameId, frameName } = event.detail;
      startEditing(frameId, frameName);
    };

    document.addEventListener(
      "editFrameLabel",
      handleEditEvent as EventListener,
    );

    return () => {
      document.removeEventListener(
        "editFrameLabel",
        handleEditEvent as EventListener,
      );
    };
  }, []);

  // Get all visible top-level frames and makes
  const topLevelFrames = Object.values(objects).filter(
    (obj) =>
      obj.visible &&
      (isTopLevelFrame(obj.id, objects) ||
        (obj.type === "make" && !obj.parentId)),
  );

  // Compute visible world bounds once for viewport culling
  // Use actual window dimensions (viewportBounds may be stale at 800×600)
  const screenW =
    typeof window !== "undefined"
      ? window.innerWidth
      : viewport.viewportBounds.width;
  const screenH =
    typeof window !== "undefined"
      ? window.innerHeight
      : viewport.viewportBounds.height;
  const visibleLeft = -viewport.panX / viewport.zoom;
  const visibleTop = -viewport.panY / viewport.zoom;
  const visibleWidth = screenW / viewport.zoom;
  const visibleHeight = screenH / viewport.zoom;
  // Add margin for labels that extend above/around the frame
  const marginX = visibleWidth * 0.1;
  const marginY = visibleHeight * 0.1 + 30 / viewport.zoom; // extra for label height

  return (
    <>
      {topLevelFrames.map((frame) => {
        // Quick viewport culling: skip frames entirely outside visible area
        // (using world coordinates before the expensive screen-coord conversion)
        if (
          viewport.zoom > 2 && // only cull when zoomed in enough to matter
          (frame.x + frame.width < visibleLeft - marginX ||
            frame.x > visibleLeft + visibleWidth + marginX ||
            frame.y + frame.height < visibleTop - marginY ||
            frame.y > visibleTop + visibleHeight + marginY)
        ) {
          return null;
        }

        // Get frame's position - prefer transient state (drag/resize) over store
        const resizeState = resizeStates[frame.id];
        let framePosition;
        if (dragPositions[frame.id]) {
          framePosition = dragPositions[frame.id];
        } else if (resizeState) {
          framePosition = { x: resizeState.x, y: resizeState.y };
        } else {
          framePosition = getAbsolutePosition(frame.id, objects);
        }

        // Convert to screen coordinates
        const screenPos = worldToScreen(framePosition, viewport);

        // Position label directly touching the frame (no gap)
        const labelX = screenPos.x;
        const labelY = screenPos.y; // At frame's top edge

        // Calculate maximum width based on frame's visual width (accounting for zoom)
        const frameWidth = resizeState ? resizeState.width : frame.width;
        const maxLabelWidth = frameWidth * viewport.zoom;

        // Don't render if label would be off-screen (above viewport)
        if (labelY < 20) return null; // Account for label height

        // Don't render if frame is too small to show a readable label
        if (maxLabelWidth < 20) return null;

        // Check if this frame is currently selected or being previewed
        const isFrameSelected = selectedIds.includes(frame.id);
        const isFramePreviewed = selectionPreviewTarget === frame.id;
        const isHighlighted = isFrameSelected || isFramePreviewed;

        // Hide frame label when dragging this frame into an auto layout
        const isFrameBeingDraggedIntoAL =
          isDragging && isHoveringAutoLayout && draggedIds.includes(frame.id);

        if (isFrameBeingDraggedIntoAL) {
          return null; // Hide the label
        }

        // Debug: Log frame label positioning (only once per session)
        if (!(window as any).frameLabelsDebugLogged) {
          (window as any).frameLabelsDebugLogged = true;
        }

        return (
          <div
            key={frame.id}
            className="absolute"
            data-frame-label={frame.id}
            style={{
              left: labelX,
              top: labelY,
              transform: "translateY(-100%)", // Position label bottom edge at labelY (right above frame)
              maxWidth: `${maxLabelWidth}px`, // Constrain to frame width
              zIndex: 9999, // Force to top layer
              pointerEvents: "auto", // Ensure clicks work
            }}
          >
            {editingFrameId === frame.id ? (
              // Editing mode - show contentEditable
              <div
                key="editing"
                ref={editableRef}
                contentEditable
                suppressContentEditableWarning={true}
                onInput={(e) => {
                  const target = e.target as HTMLDivElement;
                  setEditingName(target.textContent || "");
                }}
                onKeyDown={(e) => {
                  e.stopPropagation(); // Prevent canvas keyboard shortcuts
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveEdit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
                onBlur={saveEdit}
                className="text-[11px] font-medium mb-[2.5px] -ml-[3px] py-[3px] px-[1px] bg-white border-2 border-selected leading-[10px] rounded-[2px] cursor-text inline-block whitespace-nowrap outline-none"
                style={{
                  minWidth: "1ch",
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              // Display mode - show label with double-click to edit
              <div
                key="display"
                className={`text-[11px] font-medium py-1 min-h-[24px] pointer-events-auto  ${
                  isHighlighted
                    ? "text-selected"
                    : "text-tertiary hover:text-secondary"
                }`}
                data-frame-label={frame.id}
                data-object-id={frame.id}
                data-object-type="frame"
                style={{
                  width: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                onPointerDown={(e) => {
                  // Track clicks for double-click detection
                  const now = Date.now();
                  const lastClick = (window as any).__frameLabelLastClick || {
                    time: 0,
                    id: null,
                  };
                  const timeSinceLastClick = now - lastClick.time;
                  const isDoubleClick =
                    timeSinceLastClick < 300 && lastClick.id === frame.id;

                  (window as any).__frameLabelLastClick = {
                    time: now,
                    id: frame.id,
                  };

                  if (isDoubleClick) {
                    e.preventDefault();
                    e.stopPropagation();
                    startEditing(frame.id, frame.name || "Frame");
                    return;
                  }

                  // For single clicks, let the event bubble for normal selection
                }}
                onPointerEnter={(e) => {
                  // Stop event from bubbling to prevent Canvas mouse handler interference
                  e.stopPropagation();
                  // Use a small delay to ensure this runs after any conflicting canvas events
                  setTimeout(() => {
                    setSelectionPreviewTarget?.(frame.id, "ui");
                  }, 0);
                }}
                onPointerLeave={(e) => {
                  // Stop event from bubbling
                  e.stopPropagation();
                  // Use a small delay to ensure this runs after any conflicting canvas events
                  setTimeout(() => {
                    setSelectionPreviewTarget?.(null, "ui");
                  }, 0);
                }}
                onPointerMove={(e) => {
                  // Stop mouse move events from bubbling to Canvas
                  e.stopPropagation();
                  // Ensure the preview target stays set during mouse movement over the label
                  const currentTarget =
                    useAppStore.getState().selectionPreviewTarget;
                  if (currentTarget !== frame.id) {
                    setSelectionPreviewTarget?.(frame.id, "ui");
                  }
                }}
              >
                {frame.type === "make" && (
                  <Icon16CodeLayer
                    className="inline-block align-text-bottom mr-0.5 -ml-px mb-[-1px]"
                    style={{ width: 16, height: 16 }}
                  />
                )}
                {frame.name || "Frame"}
                {frame.genAiSpec && (
                  <IconControlsIndicator
                    className="inline-block align-middle ml-1"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
