import {
  getAdvancedSelectionTarget,
  getObjectsAtPoint,
  HitTestResult,
} from "@/core/services/selection";
import { useAppStore } from "@/core/state/store";
import {
  getAbsolutePosition,
  getVisualBoundsFromDOM,
  getWorldCoordinatesFromEvent,
} from "@/core/utils/coordinates";
import {
  filterAncestorDescendantConflicts,
  isAncestor,
} from "@/core/utils/selection";
import { useCallback, useRef, useState } from "react";

// Global state for double-click detection on frame labels
const frameLabelClickState = {
  lastClickTime: 0,
  lastClickedFrameId: null as string | null,
};

export interface UseCanvasSelectionProps {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  viewport: any;
  activeTool: string;
  objects: Record<string, any>;
  selection: any;
  isZooming: boolean;
  isPanning: boolean;
  resetZoomPanStates: () => void;
}

export interface SelectionResult {
  selectedIds: string[];
  dragStartPoint: { x: number; y: number } | null;
  dragStartPositions: Record<string, { x: number; y: number }>;
  originalParents: Record<string, string | undefined>;
  isSelectionRegion?: boolean; // Flag for selection region operations
}

/**
 * Check if we're clicking on an empty area of a frame that has children
 * This allows starting selection regions inside frames
 */
function isClickingOnEmptyFrameArea(
  hitResults: HitTestResult[],
  clickPoint: { x: number; y: number }
): boolean {
  // Find frames in the hit results
  const frameResults = hitResults.filter(
    (result) =>
      result.object?.type === "frame" &&
      result.object?.childIds &&
      result.object.childIds.length > 0
  );

  if (frameResults.length === 0) return false;

  // Check if click is on frame background (not on any children)
  // If we hit a frame but no children, it's an empty area
  const hasChildHits = hitResults.some(
    (result) => result.object?.type !== "frame"
  );

  return !hasChildHits;
}

export function useCanvasSelection({
  canvasRef,
  viewport,
  activeTool,
  objects,
  selection,
  isZooming,
  isPanning,
  resetZoomPanStates,
}: UseCanvasSelectionProps) {
  const dispatch = useAppStore((state) => state.dispatch);

  // Selection UI state
  const [showSelectionUI, setShowSelectionUI] = useState(true);
  const selectionUITimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSelection = useCallback(
    (event: React.PointerEvent): SelectionResult | null => {
      if (!canvasRef.current || activeTool !== "select") return null;

      // Don't handle selection if we're zooming/panning
      // But don't reset zoom/pan states if we're space panning
      if (isZooming || isPanning) {
        // Check if space panning is active before resetting states
        const isSpacePanning = (window as any).__figmaCloneSpacePanning;
        if (!isSpacePanning) {
          resetZoomPanStates();
        }
        return null;
      }

      // Screen coordinates relative to viewport
      const screenPoint = {
        x: event.nativeEvent.clientX,
        y: event.nativeEvent.clientY,
      };

      // Use elementsFromPoint for accurate DOM-based selection (respects overflow clipping)
      // For shift+click, use EXACTLY the same selection rules as normal click
      const hitResults = getObjectsAtPoint(screenPoint, {
        allowMultiple: event.metaKey || event.ctrlKey, // Only CMD allows different behavior, NOT shift
        selectTopmost: !(event.metaKey || event.ctrlKey), // Only allow deep selection with CMD+click, NOT shift
        preferFrames: event.altKey,
        ignoreLocked: true,
      });

      // Populate the actual CanvasObject data from store
      const populatedResults: HitTestResult[] = hitResults
        .map((result) => {
          const objectId = result.element.getAttribute("data-object-id");
          const object = objectId ? objects[objectId] : null;

          // Removed: Population logging that triggered on every hit test

          return {
            ...result,
            object: object || result.object,
          };
        })
        .filter((result) => {
          if (!result.object || Object.keys(result.object).length === 0) {
            return false;
          }
          const obj = result.object;
          return obj.visible && !obj.locked;
        });

      // Removed: Results logging that triggered on every selection

      // Detect if we're clicking on a frame label
      const isClickingOnFrameLabel = hitResults.some((result) =>
        result.element.hasAttribute("data-frame-label")
      );
      const labelFrameId = isClickingOnFrameLabel
        ? hitResults
            .find((result) => result.element.hasAttribute("data-frame-label"))
            ?.element.getAttribute("data-frame-label") || undefined
        : undefined;

      // Handle double-click on frame labels for editing
      if (isClickingOnFrameLabel && labelFrameId) {
        const now = Date.now();
        const timeSinceLastClick = now - frameLabelClickState.lastClickTime;
        const isDoubleClick =
          timeSinceLastClick < 300 &&
          frameLabelClickState.lastClickedFrameId === labelFrameId;

        frameLabelClickState.lastClickTime = now;
        frameLabelClickState.lastClickedFrameId = labelFrameId;

        if (isDoubleClick) {
          // Trigger frame label editing by dispatching a custom event
          const frameObject = objects[labelFrameId];
          if (frameObject) {
            // Dispatch a custom event that the FrameLabels component can listen for
            const editEvent = new CustomEvent("editFrameLabel", {
              detail: {
                frameId: labelFrameId,
                frameName: frameObject.name || "Frame",
              },
            });
            document.dispatchEvent(editEvent);

            // Prevent normal selection behavior for double-clicks
            return null;
          }
        }
      }

      // Removed: Frame label detection logging

      // Get the best selection target using advanced logic
      const bestTarget = getAdvancedSelectionTarget(
        populatedResults,
        selection.selectedIds,
        objects,
        {
          isCmdClick: event.metaKey || event.ctrlKey,
          isShiftClick: event.shiftKey,
          isClickingOnLabel: isClickingOnFrameLabel,
          labelFrameId: labelFrameId,
        }
      );

      // Removed: Hit detection logging that triggered on every selection

      if (bestTarget) {
        // CMD+click should allow direct object selection (but CMD+drag will start region)
        // We handle this by allowing CMD clicks to go through normal selection
        const targetId = bestTarget.object.id;
        const isAlreadySelected = selection.selectedIds.includes(targetId);
        const cmdPressed = event.metaKey || event.ctrlKey;

        // Always do normal selection for true click-through behavior
        // Drag preparation will be handled later when movement is detected

        // Determine new selection
        let rawSelection: string[];
        if (event.shiftKey) {
          if (isAlreadySelected) {
            // Remove from selection

            rawSelection = selection.selectedIds.filter(
              (id: string) => id !== targetId
            );
          } else {
            // Check if adding this target would create ancestor/descendant conflicts

            // Find any conflicting ancestors/descendants
            const conflictingIds: string[] = [];
            selection.selectedIds.forEach((existingId: string) => {
              const isTargetAncestorOfExisting = isAncestor(
                targetId,
                existingId,
                objects
              );
              const isExistingAncestorOfTarget = isAncestor(
                existingId,
                targetId,
                objects
              );

              if (isTargetAncestorOfExisting || isExistingAncestorOfTarget) {
                conflictingIds.push(existingId);
              }
            });

            if (conflictingIds.length > 0) {
              // Remove conflicting items and add the new target
              const filteredSelection = selection.selectedIds.filter(
                (id: string) => !conflictingIds.includes(id)
              );
              rawSelection = [...filteredSelection, targetId];
            } else {
              // Safe to add to selection
              rawSelection = [...selection.selectedIds, targetId];
            }
          }
        } else {
          // If clicking on an already selected item in a multi-selection,
          // immediately isolate it but store original selection for potential drag
          if (isAlreadySelected && selection.selectedIds.length > 1) {
            // Store original multi-selection for potential drag
            (window as any).__originalMultiSelectionForDrag =
              selection.selectedIds;

            // Immediately isolate the clicked item
            rawSelection = [targetId];
          } else {
            rawSelection = [targetId]; // Normal single selection
          }
        }

        // Filter out ancestor/descendant conflicts (keeps last selected)
        const newSelection = filterAncestorDescendantConflicts(
          rawSelection,
          objects
        );

        // Check if selection actually changed
        const selectionChanged =
          newSelection.length !== selection.selectedIds.length ||
          !newSelection.every((id: string) =>
            selection.selectedIds.includes(id)
          );

        // Update selection if it changed
        if (selectionChanged) {
          dispatch({
            type: "selection.changed",
            payload: {
              selectedIds: newSelection,
              previousSelection: selection.selectedIds,
            },
          });

          // Handle selection UI
          setShowSelectionUI(false);
          if (selectionUITimeoutRef.current) {
            clearTimeout(selectionUITimeoutRef.current);
          }
          selectionUITimeoutRef.current = setTimeout(() => {
            setShowSelectionUI(true);
          }, 150);
        }

        // Prepare drag data for all clicks (including shift+clicks)
        const worldPoint = getWorldCoordinatesFromEvent(
          event.nativeEvent,
          canvasRef.current!,
          viewport
        );

        // Store initial positions for drag
        // For auto layout children, use DOM-based positions to avoid stale state values
        const initialPositions: Record<string, { x: number; y: number }> = {};
        const initialParents: Record<string, string | undefined> = {};

        newSelection.forEach((id: string) => {
          const obj = objects[id];
          if (obj) {
            // Use DOM positions for AL children (CSS flexbox drives layout, state may be stale)
            const bounds = getVisualBoundsFromDOM(id, objects, viewport);
            initialPositions[id] = {
              x: bounds.x,
              y: bounds.y,
            };
            initialParents[id] = obj.parentId;
          }
        });

        return {
          selectedIds: newSelection,
          dragStartPoint: { x: worldPoint.x, y: worldPoint.y },
          dragStartPositions: initialPositions,
          originalParents: initialParents,
        };
      } else {
        // No target found - this could be:
        // 1. Clicking on empty space -> start selection region or clear selection
        // 2. Clicking outside children of selected frame -> deselect the frame

        // Check if we should clear selection due to clicking outside selected frame's children
        if (!event.shiftKey && selection.selectedIds.length > 0) {
          // Check if any selected item is a top-level frame
          const hasSelectedTopLevelFrame = selection.selectedIds.some(
            (id: string) => {
              const obj = objects[id];
              return (
                obj &&
                obj.type === "frame" &&
                (!obj.parentId || objects[obj.parentId]?.type !== "frame")
              );
            }
          );

          if (hasSelectedTopLevelFrame && populatedResults.length > 0) {
            // We hit something but getAdvancedSelectionTarget returned null
            // This means we should deselect

            dispatch({
              type: "selection.changed",
              payload: {
                selectedIds: [],
                previousSelection: selection.selectedIds,
              },
            });

            // Handle selection UI
            setShowSelectionUI(false);
            if (selectionUITimeoutRef.current) {
              clearTimeout(selectionUITimeoutRef.current);
            }
            selectionUITimeoutRef.current = setTimeout(() => {
              setShowSelectionUI(true);
            }, 150);

            return null;
          }
        }

        // Continue with existing logic for selection regions
        const worldPoint = getWorldCoordinatesFromEvent(
          event.nativeEvent,
          canvasRef.current!,
          viewport
        );

        // Allow selection region if:
        // 1. CMD is pressed (allows region anywhere when no target)
        // 2. Clicked on empty space
        // 3. Clicked on empty area of a frame with children
        const cmdPressed = event.metaKey || event.ctrlKey;

        const shouldStartSelectionRegion =
          cmdPressed ||
          populatedResults.length === 0 ||
          isClickingOnEmptyFrameArea(populatedResults, worldPoint);

        if (shouldStartSelectionRegion) {
          return {
            selectedIds: event.shiftKey ? selection.selectedIds : [], // Keep selection if shift, clear if not
            dragStartPoint: { x: worldPoint.x, y: worldPoint.y },
            dragStartPositions: {},
            originalParents: {},
            isSelectionRegion: true, // Flag to indicate this is a selection region
          };
        } else {
          // Hit something but not allowing selection region - treat as normal click
          // This allows frames with children to be clicked normally when not using CMD
          return null;
        }
      }

      return null;
    },
    [
      canvasRef,
      activeTool,
      isZooming,
      isPanning,
      resetZoomPanStates,
      objects,
      selection.selectedIds,
      dispatch,
      viewport,
    ]
  );

  // Cleanup
  const cleanup = useCallback(() => {
    if (selectionUITimeoutRef.current) {
      clearTimeout(selectionUITimeoutRef.current);
    }
  }, []);

  return {
    handleSelection,
    showSelectionUI,
    setShowSelectionUI,
    cleanup,
  };
}
