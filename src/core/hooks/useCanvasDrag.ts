import { useAppStore } from "@/core/state/store";
import { useTransientStore } from "@/core/state/transientStore";
import {
  AutoLayoutObserverAPI,
  calculateAutoLayoutChildPlaceholderPosition,
  calculateCondensedDragPositions,
  calculateCondensedGroupBounds,
  calculateExternalItemInsertionIndex,
  calculateGroupInsertionIndex,
  syncAutoLayoutPositionsFromDOM,
} from "@/core/utils/autoLayout";
import {
  convertToParentSpace,
  getAbsolutePosition,
  getWorldCoordinatesFromEvent,
} from "@/core/utils/coordinates";
import {
  filterAncestorDescendantConflicts,
  getAllDescendantsForObjects,
  isValidReparenting,
} from "@/core/utils/selection";
import {
  applyDragSnapping,
  calculateSelectionBounds,
} from "@/core/utils/snapping";
import { CanvasObject } from "@/types/canvas";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Get the top-level component ancestor (main component or instance) for a given object
 */
function getComponentAncestor(
  objectId: string,
  objects: Record<string, CanvasObject>
): {
  id: string;
  isMainComponent: boolean;
  isInstance: boolean;
  componentId: string;
} | null {
  let currentId: string | undefined = objectId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const currentObj: CanvasObject | undefined = objects[currentId];

    if (!currentObj) break;

    // If we found a main component or instance, return it
    if (currentObj.isMainComponent || currentObj.isComponentInstance) {
      return {
        id: currentId,
        isMainComponent: !!currentObj.isMainComponent,
        isInstance: !!currentObj.isComponentInstance,
        componentId: currentObj.componentId || "",
      };
    }

    currentId = currentObj.parentId;
  }

  return null;
}

/**
 * Validates component nesting rules for an array of object IDs and their descendants
 */
function validateComponentNestingForObjects(
  objectIds: string[],
  targetParentId: string | undefined,
  objects: Record<string, CanvasObject>
): { isValid: boolean; reason?: string; problematicObjectId?: string } {
  if (!targetParentId) return { isValid: true }; // Canvas root is always valid

  const targetParent = objects[targetParentId];
  if (!targetParent) return { isValid: true };

  // Find the component ancestor of the target parent (if any)
  const targetComponentAncestor = getComponentAncestor(targetParentId, objects);

  // Get all objects to check (including descendants)
  const allDescendants = getAllDescendantsForObjects(objectIds, objects);
  const allObjectsToCheck = [...objectIds, ...allDescendants];

  // Check validation rules for all objects and their descendants
  for (const objToCheckId of allObjectsToCheck) {
    const objToCheck = objects[objToCheckId];
    if (!objToCheck) continue;

    // RULE 1: Instance cannot be nested inside main component (direct or indirect)
    if (objToCheck.isComponentInstance && targetParent.isMainComponent) {
      return {
        isValid: false,
        reason: "Instance cannot be nested inside main component",
        problematicObjectId: objToCheckId,
      };
    }

    // RULE 1.5: Instance cannot be nested inside hierarchy of main component
    if (
      objToCheck.isComponentInstance &&
      targetComponentAncestor?.isMainComponent
    ) {
      return {
        isValid: false,
        reason: "Instance cannot be nested inside main component hierarchy",
        problematicObjectId: objToCheckId,
      };
    }

    // RULE 2: Main component cannot be nested inside instance (direct or indirect)
    if (objToCheck.isMainComponent && targetParent.isComponentInstance) {
      return {
        isValid: false,
        reason: "Main component cannot be nested inside instance",
        problematicObjectId: objToCheckId,
      };
    }

    // RULE 2.5: Main component cannot be nested inside hierarchy of instance
    if (objToCheck.isMainComponent && targetComponentAncestor?.isInstance) {
      return {
        isValid: false,
        reason: "Main component cannot be nested inside instance hierarchy",
        problematicObjectId: objToCheckId,
      };
    }

    // RULE 3: Objects from different components cannot be mixed (direct)
    if (
      objToCheck.componentId &&
      targetParent.componentId &&
      objToCheck.componentId !== targetParent.componentId
    ) {
      return {
        isValid: false,
        reason: "Cannot mix objects from different components",
        problematicObjectId: objToCheckId,
      };
    }

    // RULE 3.5: Objects from different components cannot be mixed (indirect via ancestor)
    if (
      objToCheck.componentId &&
      targetComponentAncestor?.componentId &&
      objToCheck.componentId !== targetComponentAncestor.componentId
    ) {
      return {
        isValid: false,
        reason: "Cannot mix objects from different components (via ancestor)",
        problematicObjectId: objToCheckId,
      };
    }

    // RULE 4: Component objects cannot be nested inside other component objects (direct)
    if (
      (objToCheck.isMainComponent || objToCheck.isComponentInstance) &&
      (targetParent.isMainComponent || targetParent.isComponentInstance) &&
      objToCheck.componentId !== targetParent.componentId
    ) {
      return {
        isValid: false,
        reason: "Components cannot be nested inside other components",
        problematicObjectId: objToCheckId,
      };
    }

    // RULE 4.5: Component objects cannot be nested inside other component hierarchies
    if (
      (objToCheck.isMainComponent || objToCheck.isComponentInstance) &&
      targetComponentAncestor &&
      objToCheck.componentId !== targetComponentAncestor.componentId
    ) {
      return {
        isValid: false,
        reason:
          "Components cannot be nested inside other component hierarchies",
        problematicObjectId: objToCheckId,
      };
    }

    // RULE 5: Instances of same component cannot be nested inside each other (direct)
    if (
      objToCheck.isComponentInstance &&
      targetParent.isComponentInstance &&
      objToCheck.componentId === targetParent.componentId
    ) {
      return {
        isValid: false,
        reason:
          "Instances of same component cannot be nested inside each other",
        problematicObjectId: objToCheckId,
      };
    }

    // RULE 5.5: Instances cannot be nested inside hierarchy of same component instance
    if (
      objToCheck.isComponentInstance &&
      targetComponentAncestor?.isInstance &&
      objToCheck.componentId === targetComponentAncestor.componentId
    ) {
      return {
        isValid: false,
        reason:
          "Instances cannot be nested inside same component instance hierarchy",
        problematicObjectId: objToCheckId,
      };
    }
  }

  return { isValid: true };
}

/**
 * Reorders selection array to match visual order for AL children
 * This prevents jumps when dragging items selected in different order than their visual layout
 */
function reorderSelectionByVisualOrder(
  draggedIds: string[],
  objects: Record<string, any>
): string[] {
  // Group items by their AL parent
  const alChildrenGroups: Record<string, string[]> = {};
  const nonAlChildren: string[] = [];

  draggedIds.forEach((objectId) => {
    const object = objects[objectId];
    if (object?.parentId) {
      const parent = objects[object.parentId];
      // Check if parent is an AL frame
      if (
        parent?.type === "frame" &&
        parent.properties?.type === "frame" &&
        parent.properties.autoLayout?.mode &&
        parent.properties.autoLayout.mode !== "none"
      ) {
        // This is an AL child
        if (!alChildrenGroups[object.parentId]) {
          alChildrenGroups[object.parentId] = [];
        }
        alChildrenGroups[object.parentId].push(objectId);
      } else {
        nonAlChildren.push(objectId);
      }
    } else {
      nonAlChildren.push(objectId);
    }
  });

  // Reorder each AL children group by their visual index in parent
  const reorderedGroups: Record<string, string[]> = {};
  Object.entries(alChildrenGroups).forEach(([parentId, childIds]) => {
    const parent = objects[parentId];
    if (parent?.childIds) {
      // Sort by visual index in parent.childIds
      reorderedGroups[parentId] = childIds.sort((a, b) => {
        const aIndex = parent.childIds.indexOf(a);
        const bIndex = parent.childIds.indexOf(b);
        return aIndex - bIndex;
      });
    } else {
      reorderedGroups[parentId] = childIds;
    }
  });

  // Rebuild the draggedIds array maintaining the original sequence but with AL children in visual order
  const result: string[] = [];
  draggedIds.forEach((originalId) => {
    const object = objects[originalId];
    if (object?.parentId && reorderedGroups[object.parentId]) {
      // This is an AL child - check if we've already processed this group
      const group = reorderedGroups[object.parentId];
      const firstInGroup = group[0];
      if (originalId === firstInGroup) {
        // First encounter of this group - add all items in visual order
        result.push(...group);
      }
      // For other items in the group, skip (already added)
    } else {
      // Non-AL child - add as-is
      result.push(originalId);
    }
  });

  return result;
}

export interface UseCanvasDragProps {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  viewport: any;
  objects: Record<string, any>;
  onDragStateChange?: (
    positions: Record<string, { x: number; y: number }>,
    isDragging: boolean
  ) => void;
}

// Safe getter for autoLayout properties from parent objects
function getParentAutoLayout(parent: any) {
  if (parent?.type === "frame") {
    // Check properties.autoLayout first (for regular frames)
    if (parent.properties?.type === "frame" && parent.properties.autoLayout) {
      return parent.properties.autoLayout;
    }
    // Check direct autoLayout (for component instances)
    if ((parent as any).autoLayout) {
      return (parent as any).autoLayout;
    }
  }
  return null;
}

export function useCanvasDrag({
  canvasRef,
  viewport,
  objects,
  onDragStateChange,
}: UseCanvasDragProps) {
  const dispatch = useAppStore((state) => state.dispatch);

  // Track CMD and Option keys for reparenting control and duplication
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        setIsCmdPressed(true);
      }
      if (e.altKey) {
        setIsOptionPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) {
        setIsCmdPressed(false);
      }
      if (!e.altKey) {
        setIsOptionPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPoint, setDragStartPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [draggedObjectIds, setDraggedObjectIds] = useState<string[]>([]);
  const [dragStartPositions, setDragStartPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const dragCurrentPositionsRef = useRef<
    Record<string, { x: number; y: number }>
  >({});
  const dragCurrentPositions = dragCurrentPositionsRef.current;
  const setDragCurrentPositions = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      dragCurrentPositionsRef.current = positions;
      useTransientStore.getState().setDragPositions(positions);
    },
    [],
  );

  // Reparenting state
  const [potentialParent, setPotentialParent] = useState<string | undefined>(
    undefined
  );
  const [overlayParent, setOverlayParent] = useState<string | undefined>(
    undefined
  );
  const [currentParents, setCurrentParents] = useState<
    Record<string, string | undefined>
  >({});
  const [originalParents, setOriginalParents] = useState<
    Record<string, string | undefined>
  >({});
  const [originalAbsolutePositioning, setOriginalAbsolutePositioning] =
    useState<Record<string, boolean>>({});
  const [liveReparentedObjects, setLiveReparentedObjects] = useState<
    Set<string>
  >(new Set());
  const [hasLeftOriginalParent, setHasLeftOriginalParent] =
    useState<boolean>(false);

  // Track mouse position and auto layout state for placeholder logic
  const [currentMouseWorldPosition, setCurrentMouseWorldPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isHoveringAutoLayout, setIsHoveringAutoLayout] = useState(false);

  // Track CMD key for advanced reparenting
  const [isCmdPressed, setIsCmdPressed] = useState(false);

  // Track Option/Alt key for duplication during drag
  const [isOptionPressed, setIsOptionPressed] = useState(false);

  // Track if we're in completion phase to prevent double duplication
  const isCompletingDragRef = useRef(false);


  // Track if we've processed CMD release to prevent infinite loops
  const cmdReleaseProcessedRef = useRef(false);

  // Track items being dragged from auto layout frames
  const [draggedAutoLayoutChildren, setDraggedAutoLayoutChildren] = useState<
    Record<
      string,
      {
        parentId: string;
        originalIndex: number;
        isTemporarilyOutside?: boolean;
      }
    >
  >({});

  // Track placeholder positions for auto layout children during drag
  const [autoLayoutPlaceholderPositions, setAutoLayoutPlaceholderPositions] =
    useState<Record<string, { parentId: string; insertionIndex: number }>>({});

  // Track duplication state
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [duplicatedObjectIds, setDuplicatedObjectIds] = useState<string[]>([]);
  const duplicateDragStartPositionsRef = useRef<
    Record<string, { x: number; y: number }>
  >({});
  const duplicateInitialOffsetsRef = useRef<
    Record<string, { x: number; y: number }>
  >({});
  const [originalDragObjectIds, setOriginalDragObjectIds] = useState<string[]>(
    []
  );
  const [originalDragStartPositions, setOriginalDragStartPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [originalDragParents, setOriginalDragParents] = useState<
    Record<string, string | undefined>
  >({});
  const [lastValidParent, setLastValidParent] = useState<
    string | undefined | null
  >(
    null // null means "not set yet", undefined means "canvas"
  );

  // Sync transient drag metadata so CanvasObjects can subscribe per-id
  useEffect(() => {
    useTransientStore.getState().setDragMeta({
      draggedAutoLayoutChildren,
      autoLayoutPlaceholderPositions,
      isHoveringAutoLayout,
      draggedIds: draggedObjectIds,
      isCmdPressed,
    });
  }, [
    draggedAutoLayoutChildren,
    autoLayoutPlaceholderPositions,
    isHoveringAutoLayout,
    draggedObjectIds,
    isCmdPressed,
  ]);

  // Handle cursor changes for duplication mode
  useEffect(() => {
    const { setCursor, resetCursor } = useAppStore.getState();
    const { selection, selectionPreviewTarget } = useAppStore.getState();

    // Show duplicate cursor when Option is pressed AND:
    // 1. We have an existing selection, OR
    // 2. We're hovering over a valid target (that would be selected on click)
    const hasValidTarget =
      selection.selectedIds.length > 0 || selectionPreviewTarget;

    // Show duplicate cursor when Option is pressed and we have a valid target
    if (isOptionPressed && hasValidTarget) {
      setCursor("duplicate", "duplication-mode");
    } else {
      // Reset cursor when Option is released (but only if it was set by duplication mode)
      const currentCursor = useAppStore.getState().cursor;
      if (currentCursor.source === "duplication-mode") {
        resetCursor();
      }
    }
  }, [isOptionPressed]);

  // Subscribe to selection preview changes for cursor updates
  const selectionPreviewTarget = useAppStore(
    (state) => state.selectionPreviewTarget
  );

  // React to selection preview changes
  useEffect(() => {
    const { setCursor, resetCursor } = useAppStore.getState();
    const { selection } = useAppStore.getState();

    // Only update cursor if Option is pressed (to avoid unnecessary cursor changes)
    if (!isOptionPressed) return;

    const hasValidTarget =
      selection.selectedIds.length > 0 || selectionPreviewTarget;

    if (hasValidTarget) {
      setCursor("duplicate", "duplication-mode");
    } else {
      const currentCursor = useAppStore.getState().cursor;
      if (currentCursor.source === "duplication-mode") {
        resetCursor();
      }
    }
  }, [selectionPreviewTarget, isOptionPressed]);

  // Reactive effect to handle Option key changes during active drag
  useEffect(() => {
    if (!isDragging || originalDragObjectIds.length === 0) return;

    if (isOptionPressed && !isDuplicating) {
      // Switch TO duplication mode during drag

      // CHECK: Is this the problematic reparent+Option case?
      const hasReparentedObjects = Array.from(liveReparentedObjects).length > 0;

      // Reset originals to their ORIGINAL start positions (where drag began)
      // Reset ALL objects that have original parent information (including nested ones)
      Object.keys(originalDragParents).forEach((objectId) => {
        const startPos = originalDragStartPositions[objectId];
        const originalParentId = originalDragParents[objectId];
        const currentParentId = currentParents[objectId];

        if (startPos) {
          // CRITICAL: Remove object from current parent's childIds before moving it back
          if (currentParentId && currentParentId !== originalParentId) {
            // First, remove from current parent's childIds
            const currentParent = objects[currentParentId];
            if (currentParent && currentParent.childIds) {
              const newChildIds = currentParent.childIds.filter(
                (id: string) => id !== objectId
              );
              dispatch({
                type: "object.updated",
                payload: {
                  id: currentParentId,
                  changes: {
                    childIds: newChildIds,
                  },
                },
              });
            }

            // Then, move object back to canvas (parentId = undefined)
            dispatch({
              type: "object.updated",
              payload: {
                id: objectId,
                changes: {
                  parentId: originalParentId, // undefined for canvas
                },
              },
            });
          }

          // Convert absolute start position to relative position for the original parent
          const relativePosition = convertToParentSpace(
            { x: startPos.x, y: startPos.y },
            originalParentId,
            objects
          );

          dispatch({
            type: "object.updated",
            payload: {
              id: objectId,
              changes: {
                x: relativePosition.x,
                y: relativePosition.y,
                parentId: originalParentId,
              },
            },
          });
        }
      });

      // Prepare reset positions for visual update (but call onDragStateChange after dispatches)
      const originalResetPositions: Record<string, { x: number; y: number }> =
        {};
      originalDragObjectIds.forEach((id) => {
        const startPos = originalDragStartPositions[id];
        if (startPos) {
          originalResetPositions[id] = startPos;
        }
      });

      // Create duplicates if not already created
      let targetDuplicateIds = duplicatedObjectIds;
      let duplicateIdMapping: Record<string, string> = {};

      if (duplicatedObjectIds.length === 0) {
        // No offset for duplicates when duplicating during drag
        // Duplicates appear exactly at the same position as originals
        const avgDeltaX = 0;
        const avgDeltaY = 0;

        const { duplicatedObjects, idMapping, correctedDragStarts } =
          createDuplicatesForDrag(
            originalDragObjectIds,
            {
              x: 0, // Use zero offset since we'll position with coordinate conversion
              y: 0,
            },
            lastValidParent || undefined, // Pass target parent for coordinate conversion
            originalDragParents // Pass original parents for coordinate conversion
          );

        // CRITICAL: Apply corrected drag start positions for coordinate-converted duplicates
        if (
          correctedDragStarts &&
          Object.keys(correctedDragStarts).length > 0
        ) {
          Object.keys(correctedDragStarts).forEach((duplicateId) => {
            duplicateDragStartPositionsRef.current[duplicateId] =
              correctedDragStarts[duplicateId];
          });
        }

        dispatch({
          type: "objects.duplicated",
          payload: {
            originalIds: originalDragObjectIds,
            duplicatedObjects,
            offset: { x: avgDeltaX, y: avgDeltaY },
          },
        });

        // Notify listeners (e.g. useDesignChat) about the duplication
        const originalToDuplicatedMap: Record<string, string> = {};
        Object.keys(idMapping).forEach((origId) => {
          originalToDuplicatedMap[origId] = idMapping[origId];
        });
        window.dispatchEvent(
          new CustomEvent("canvas-objects-duplicated", {
            detail: { originalToDuplicatedMap, originalIds: originalDragObjectIds },
          }),
        );

        // Get ALL duplicated object IDs for tracking (includes children)
        const allDuplicatedIds = duplicatedObjects.map((obj) => obj.id);
        setDuplicatedObjectIds(allDuplicatedIds);

        // But only select the TOP-LEVEL duplicated objects (those corresponding to originally selected objects)
        targetDuplicateIds = originalDragObjectIds
          .map((originalId) => idMapping[originalId])
          .filter(Boolean);
        duplicateIdMapping = idMapping;

        // CRITICAL: Calculate drag start positions for duplicates while we have access to duplicatedObjects
        Object.keys(idMapping).forEach((originalId) => {
          const duplicateId = idMapping[originalId];

          if (originalDragObjectIds.includes(originalId)) {
            const duplicateObj = duplicatedObjects.find(
              (obj) => obj.id === duplicateId
            );

            if (duplicateObj) {
              // Calculate absolute position manually from the duplicate object
              let absoluteX = duplicateObj.x;
              let absoluteY = duplicateObj.y;

              // Walk up parent chain to get absolute position
              let currentParentId = duplicateObj.parentId;
              while (currentParentId) {
                const parent = objects[currentParentId];
                if (!parent) break;
                absoluteX += parent.x;
                absoluteY += parent.y;
                currentParentId = parent.parentId;
              }

              const duplicateAbsolutePos = { x: absoluteX, y: absoluteY };

              // Don't overwrite corrected drag start positions
              if (!duplicateDragStartPositionsRef.current[duplicateId]) {
                duplicateDragStartPositionsRef.current[duplicateId] =
                  duplicateAbsolutePos;
              } else {
              }
            }
          }
        });

        // DEBUG: Log positions of originals vs duplicates
        originalDragObjectIds.forEach((originalId) => {
          const originalObj = objects[originalId];
          const duplicateId = idMapping[originalId];
          const duplicateObj = duplicatedObjects.find(
            (d) => d.id === duplicateId
          );
        });
      }

      // Switch drag to duplicates
      if (targetDuplicateIds.length > 0) {
        setDraggedObjectIds(targetDuplicateIds);

        // CRITICAL: Only reset drag start point for cross-parent duplication
        // For same-parent duplication, keep original drag start to preserve initial offset
        const needsDragStartReset =
          originalDragParents &&
          Object.values(originalDragParents).some(
            (parentId) => parentId !== lastValidParent
          );

        if (needsDragStartReset) {
          // Calculate the initial offset that existed when drag started
          // This is the difference between original drag start and where objects were positioned
          const initialOffsets: Record<string, { x: number; y: number }> = {};

          targetDuplicateIds.forEach((duplicateId) => {
            const originalId = Object.keys(duplicateIdMapping).find(
              (origId) => duplicateIdMapping[origId] === duplicateId
            );
            if (
              originalId &&
              dragStartPositions[originalId] &&
              dragStartPoint
            ) {
              // Original offset = where object was positioned - where mouse clicked initially
              const originalObjectStart = dragStartPositions[originalId];
              initialOffsets[duplicateId] = {
                x: originalObjectStart.x - dragStartPoint.x,
                y: originalObjectStart.y - dragStartPoint.y,
              };
            }
          });

          // Apply the initial offsets to duplicate drag start positions
          targetDuplicateIds.forEach((duplicateId) => {
            if (
              initialOffsets[duplicateId] &&
              duplicateDragStartPositionsRef.current[duplicateId]
            ) {
              // Store the initial offset for use during completion
              duplicateInitialOffsetsRef.current[duplicateId] =
                initialOffsets[duplicateId];

              const correctedStart = {
                x:
                  (currentMouseWorldPosition?.x || 0) +
                  initialOffsets[duplicateId].x,
                y:
                  (currentMouseWorldPosition?.y || 0) +
                  initialOffsets[duplicateId].y,
              };
              duplicateDragStartPositionsRef.current[duplicateId] =
                correctedStart;
            }
          });

          setDragStartPoint(currentMouseWorldPosition);
        } else {
          // For same-parent duplication, also store the initial offsets
          targetDuplicateIds.forEach((duplicateId) => {
            const originalId = Object.keys(duplicateIdMapping).find(
              (origId) => duplicateIdMapping[origId] === duplicateId
            );
            if (originalId && dragStartPoint) {
              const originalStartPos = originalDragStartPositions[originalId];
              if (originalStartPos) {
                const initialOffset = {
                  x: originalStartPos.x - dragStartPoint.x,
                  y: originalStartPos.y - dragStartPoint.y,
                };
                duplicateInitialOffsetsRef.current[duplicateId] = initialOffset;
              }
            }
          });
        }

        setIsDuplicating(true);

        dispatch({
          type: "selection.changed",
          payload: { selectedIds: targetDuplicateIds },
        });

        // Force visual update to show originals at their reset positions
        // AND duplicates at their correct positions
        const duplicatePositions: Record<string, { x: number; y: number }> = {};

        // For duplicates, position them to appear under the current mouse
        targetDuplicateIds.forEach((duplicateId) => {
          if (currentMouseWorldPosition) {
            // Use stored initial offset to position duplicate under mouse
            if (duplicateInitialOffsetsRef.current[duplicateId]) {
              const initialOffset =
                duplicateInitialOffsetsRef.current[duplicateId];
              duplicatePositions[duplicateId] = {
                x: currentMouseWorldPosition.x + initialOffset.x,
                y: currentMouseWorldPosition.y + initialOffset.y,
              };
            } else {
              // Fallback to corrected start if offset not available
              const correctedStart =
                duplicateDragStartPositionsRef.current[duplicateId];
              if (correctedStart) {
                duplicatePositions[duplicateId] = correctedStart;
              }
            }
          }
        });

        const combinedPositions = {
          ...originalResetPositions,
          ...duplicatePositions,
        };

        setDragCurrentPositions({
          ...dragCurrentPositionsRef.current,
          ...combinedPositions,
        });

        // Force visual update after a brief delay to ensure store updates are processed
        setTimeout(() => {
          onDragStateChange?.(combinedPositions, true);
        }, 0);

        // Check if we have positions for all duplicates before calling onDragStateChange
        const hasAllPositions = targetDuplicateIds.every(
          (id) => duplicateDragStartPositionsRef.current[id]
        );

        // Calculate current mouse positions for duplicates based on corrected drag starts + current delta
        // IMPORTANT: For duplicates, delta should be 0 since we reset dragStartPoint to current mouse position
        const currentDelta = {
          x: 0,
          y: 0,
        };

        const duplicateCurrentPositions: Record<
          string,
          { x: number; y: number }
        > = {};
        targetDuplicateIds.forEach((duplicateId) => {
          const correctedStart =
            duplicateDragStartPositionsRef.current[duplicateId];
          if (correctedStart) {
            duplicateCurrentPositions[duplicateId] = {
              x: correctedStart.x + currentDelta.x,
              y: correctedStart.y + currentDelta.y,
            };
          }
        });

        // onDragStateChange already called above with correct positions
      }
    } else if (!isOptionPressed && isDuplicating) {
      // Switch FROM duplication mode back to originals during drag

      // 1. Remove duplicates from the canvas
      const deletedObjects: Record<string, any> = {};
      duplicatedObjectIds.forEach((duplicateId) => {
        const obj = objects[duplicateId];
        if (obj) deletedObjects[duplicateId] = obj;
      });
      if (Object.keys(deletedObjects).length > 0) {
        dispatch({
          type: "objects.deleted.batch",
          payload: { ids: Object.keys(deletedObjects), objects: deletedObjects },
        });
      }

      // 2. Position originals at current cursor position (where duplicates were)
      const currentDragPositions = dragCurrentPositions;
      let avgCurrentX = 0,
        avgCurrentY = 0;
      let count = 0;

      // Get average current position of duplicates
      duplicatedObjectIds.forEach((duplicateId) => {
        const currentPos = currentDragPositions[duplicateId];
        if (currentPos) {
          avgCurrentX += currentPos.x;
          avgCurrentY += currentPos.y;
          count++;
        }
      });

      if (count > 0) {
        avgCurrentX /= count;
        avgCurrentY /= count;

        // Calculate offset from original start positions
        let avgStartX = 0,
          avgStartY = 0;
        originalDragObjectIds.forEach((objectId) => {
          const startPos = originalDragStartPositions[objectId];
          if (startPos) {
            avgStartX += startPos.x;
            avgStartY += startPos.y;
          }
        });
        avgStartX /= originalDragObjectIds.length;
        avgStartY /= originalDragObjectIds.length;

        const deltaX = avgCurrentX - avgStartX;
        const deltaY = avgCurrentY - avgStartY;

        // Position originals at current cursor position
        // Restore ALL objects that have original parent information (including nested ones)
        Object.keys(originalDragParents).forEach((objectId) => {
          const startPos = originalDragStartPositions[objectId];

          if (startPos) {
            // Use the LAST VALID parent detected during drag
            // CRITICAL: lastValidParent can be undefined (canvas), so we need to check if it was set
            const targetParentId =
              lastValidParent !== null
                ? lastValidParent
                : currentParents[objectId] ?? originalDragParents[objectId];

            // Calculate new absolute position
            const newAbsoluteX = startPos.x + deltaX;
            const newAbsoluteY = startPos.y + deltaY;

            // Convert absolute position to relative position for the target parent
            const relativePosition = convertToParentSpace(
              { x: newAbsoluteX, y: newAbsoluteY },
              targetParentId,
              objects
            );

            // Apply the reparenting immediately when Option is released
            // This ensures the original appears in the correct parent

            if (targetParentId !== originalDragParents[objectId]) {
              // Handle absolute positioning when reparenting
              const currentObject = objects[objectId];
              const targetParent = targetParentId
                ? objects[targetParentId]
                : null;
              const targetParentHasAutoLayout =
                targetParent?.type === "frame" &&
                targetParent.properties?.type === "frame" &&
                targetParent.properties.autoLayout?.mode !== "none";

              const changes: any = {
                x: relativePosition.x,
                y: relativePosition.y,
                parentId: targetParentId,
              };

              // Note: Don't modify absolute positioning during drag operations
              // This will be handled on final drop in the completion logic

              // Update object's parent immediately
              dispatch({
                type: "object.updated",
                payload: {
                  id: objectId,
                  changes,
                },
              });

              // Update parent-child relationships
              const oldParentId = originalDragParents[objectId];
              if (oldParentId && objects[oldParentId]) {
                dispatch({
                  type: "object.updated",
                  payload: {
                    id: oldParentId,
                    changes: {
                      childIds:
                        objects[oldParentId].childIds?.filter(
                          (id: string) => id !== objectId
                        ) || [],
                    },
                  },
                });
              }

              if (targetParentId && objects[targetParentId]) {
                const newParentChildIds =
                  objects[targetParentId].childIds || [];
                if (!newParentChildIds.includes(objectId)) {
                  dispatch({
                    type: "object.updated",
                    payload: {
                      id: targetParentId,
                      changes: {
                        childIds: [...newParentChildIds, objectId],
                      },
                    },
                  });
                }
              }

              // Track the reparenting
              setLiveReparentedObjects((prev) => new Set([...prev, objectId]));
              setCurrentParents((prev) => ({
                ...prev,
                [objectId]: targetParentId,
              }));
            }
          }
        });
      }

      // 3. Switch back to dragging originals
      setDraggedObjectIds(originalDragObjectIds);

      // Don't change drag positions during Option release
      // Let the normal drag system handle positioning

      // Force immediate visual update with current positions
      // Position originals at the same location where duplicates currently are

      // No additional positioning needed - objects are already positioned correctly
      // by the reparenting logic above which handles coordinate conversion properly

      // Objects are already positioned correctly by the reparenting logic above
      // Just need to update the drag start positions for continued dragging
      const newStartPositions: Record<string, { x: number; y: number }> = {};
      originalDragObjectIds.forEach((objectId) => {
        const absolutePosition = getAbsolutePosition(objectId, objects);
        newStartPositions[objectId] = absolutePosition;
      });

      setDragStartPositions(newStartPositions);

      // Keep the current positions as they are (at cursor location)
      // This creates the visual offset that will be applied during drag

      setIsDuplicating(false);
      setDuplicatedObjectIds([]);

      dispatch({
        type: "selection.changed",
        payload: { selectedIds: originalDragObjectIds },
      });
    }
  }, [isOptionPressed, isDragging]);

  // Create duplicates of selected objects for drag
  const createDuplicatesForDrag = useCallback(
    (
      originalIds: string[],
      offset: { x: number; y: number } = { x: 0, y: 0 },
      targetParent?: string,
      originalDragParents?: Record<string, string | undefined>
    ) => {
      // Filter out children whose parents are also in the selection
      // This prevents duplicating both a frame and its children
      const filteredIds = filterAncestorDescendantConflicts(
        originalIds,
        objects
      );

      const duplicatedObjects: CanvasObject[] = [];
      const idMapping: Record<string, string> = {};

      // First pass: create all objects and build ID mapping
      const createDuplicateObject = (
        originalId: string,
        newParentId?: string
      ): CanvasObject => {
        const originalObject = objects[originalId];
        if (!originalObject) {
          throw new Error(`Original object ${originalId} not found`);
        }

        const newId = nanoid();
        idMapping[originalId] = newId;

        // Create duplicate with new ID but same position (we'll apply offset later)
        // Deep clone nested objects (properties, fills, strokes, etc.) to avoid shared references
        const duplicate: CanvasObject = {
          ...originalObject,
          id: newId,
          parentId: newParentId || originalObject.parentId,
          childIds: [], // Will be populated in second pass
          createdAt: Date.now(),
          // Deep clone properties to prevent shared-reference mutations
          properties: originalObject.properties
            ? JSON.parse(JSON.stringify(originalObject.properties))
            : originalObject.properties,
          fills: originalObject.fills
            ? JSON.parse(JSON.stringify(originalObject.fills))
            : [],
          strokes: originalObject.strokes
            ? JSON.parse(JSON.stringify(originalObject.strokes))
            : [],
          effects: originalObject.effects
            ? JSON.parse(JSON.stringify(originalObject.effects))
            : originalObject.effects,
          autoLayoutSizing: originalObject.autoLayoutSizing
            ? { ...originalObject.autoLayoutSizing }
            : originalObject.autoLayoutSizing,
          // Clear component-related properties for duplicates
          componentId: undefined,
          isMainComponent: false,
          isComponentInstance: false,
          originalId: undefined,
        };

        return duplicate;
      };

      // Create duplicates recursively
      const createDuplicatesRecursively = (
        originalId: string,
        newParentId?: string
      ): CanvasObject => {
        const duplicate = createDuplicateObject(originalId, newParentId);
        duplicatedObjects.push(duplicate);

        // Recursively create child duplicates
        const originalObject = objects[originalId];
        if (originalObject.childIds && originalObject.childIds.length > 0) {
          const newChildIds: string[] = [];
          originalObject.childIds.forEach((childId: string, index: number) => {
            const childDuplicate = createDuplicatesRecursively(
              childId,
              duplicate.id
            );

            newChildIds.push(childDuplicate.id);
          });
          duplicate.childIds = [...newChildIds]; // Create a clean copy to avoid reference issues
        }

        return duplicate;
      };

      // Create duplicates for all filtered objects (parents only, not children)
      filteredIds.forEach((originalId) => {
        createDuplicatesRecursively(originalId);
      });

      // COORDINATE CONVERSION: If duplicates are being created in a different parent than originals
      let correctedDragStarts: Record<string, { x: number; y: number }> = {};

      if (targetParent && originalDragParents) {
        duplicatedObjects.forEach((duplicate) => {
          // Find the original ID that this duplicate corresponds to
          const originalId = Object.keys(idMapping).find(
            (origId) => idMapping[origId] === duplicate.id
          );

          if (originalId && filteredIds.includes(originalId)) {
            const originalParentFromMemory = originalDragParents[originalId];
            const needsConversion =
              targetParent && originalParentFromMemory !== targetParent;

            if (needsConversion) {
              // Use current mouse position for duplicate placement
              const mouseWorldPos = currentMouseWorldPosition || { x: 0, y: 0 };

              // Convert mouse position to target parent space
              const targetRelativePos = convertToParentSpace(
                mouseWorldPos,
                targetParent,
                objects
              );

              // Apply converted coordinates
              duplicate.x = targetRelativePos.x;
              duplicate.y = targetRelativePos.y;

              // CRITICAL: The duplicate's drag start position must match its new position
              // so that when mouse moves, it follows the cursor correctly
              // CRITICAL: Recalculate drag start position after coordinate conversion
              // Calculate new absolute position for the converted duplicate
              const newAbsolutePos = getAbsolutePosition(duplicate.id, {
                ...objects,
                [duplicate.id]: duplicate, // Use the updated duplicate position
              });

              // Store the corrected drag start position (will be used later)
              correctedDragStarts = correctedDragStarts || {};
              correctedDragStarts[duplicate.id] = newAbsolutePos;
            }
          }
        });
      }

      duplicatedObjects.forEach((duplicate) => {
        // Find the original ID that this duplicate corresponds to
        const originalId = Object.keys(idMapping).find(
          (origId) => idMapping[origId] === duplicate.id
        );

        if (originalId && originalIds.includes(originalId)) {
          const beforeOffset = { x: duplicate.x, y: duplicate.y };

          duplicate.x += offset.x;
          duplicate.y += offset.y;
        } else {
        }
      });

      return { duplicatedObjects, idMapping, correctedDragStarts };
    },
    [objects, currentMouseWorldPosition, convertToParentSpace]
  );

  // Detect potential parent frame during drag
  // Returns:
  //   string  — a valid frame ID to reparent into
  //   null    — no frame under cursor (canvas root)
  //   undefined — a frame was found but nesting is blocked (e.g. sibling guard)
  const detectPotentialParent = useCallback(
    (
      worldPoint: { x: number; y: number },
      excludeIds: string[] = []
    ): string | null | undefined => {
      // Get all descendants of dragged objects to prevent circular reparenting
      const allDescendants = getAllDescendantsForObjects(excludeIds, objects);
      const allExcludedIds = [...excludeIds, ...allDescendants];

      if (!canvasRef.current) {
        return undefined;
      }

      // Convert world point to viewport coordinates for DOM hit testing
      // First convert to canvas-relative screen coordinates
      const canvasScreenPoint = {
        x: worldPoint.x * viewport.zoom + viewport.panX,
        y: worldPoint.y * viewport.zoom + viewport.panY,
      };

      // Then convert to viewport coordinates by adding canvas position
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const viewportPoint = {
        x: canvasScreenPoint.x + canvasRect.left,
        y: canvasScreenPoint.y + canvasRect.top,
      };

      // Use DOM hit testing to find elements under the point (respects overflow clipping)
      const elementsUnderPoint = document.elementsFromPoint(
        viewportPoint.x,
        viewportPoint.y
      );

      // Find the deepest frame that can accept nesting
      let candidates: Array<{
        objectId: string;
        frameObject: any;
        depth: number;
      }> = [];

      for (const element of elementsUnderPoint) {
        const objectId = element.getAttribute("data-object-id");
        const objectType = element.getAttribute("data-object-type");

        if (
          objectId &&
          objectType === "frame" &&
          !allExcludedIds.includes(objectId)
        ) {
          const frameObject = objects[objectId];

          if (frameObject && frameObject.visible && !frameObject.locked) {
            // Validate each dragged object can be reparented to this potential parent
            let isValidForAllDragged = true;
            for (const draggedId of excludeIds) {
              if (!isValidReparenting(draggedId, objectId, objects)) {
                isValidForAllDragged = false;
                break;
              }
            }

            // Additional component nesting validation for all dragged objects and their descendants
            if (isValidForAllDragged) {
              const componentValidation = validateComponentNestingForObjects(
                excludeIds,
                objectId,
                objects
              );

              if (!componentValidation.isValid) {
                isValidForAllDragged = false;
              }
            }

            if (isValidForAllDragged) {
              // Check if this would be invalid nesting based on source and CMD state
              let shouldPreventNesting = false;

              for (const draggedId of excludeIds) {
                const draggedObject = objects[draggedId];
                const isOriginalAutoLayoutChild =
                  draggedAutoLayoutChildren[draggedId];

                if (isOriginalAutoLayoutChild) {
                  // Case 1: Original auto layout child (was in AL at drag start)
                  // Only allow nesting into siblings/children with CMD key
                  // Check regardless of current parent (could be undefined if dragged to canvas)

                  if (!isCmdPressed) {
                    // Use the original auto layout parent info, not current parent
                    const originalAutoLayoutInfo = isOriginalAutoLayoutChild;
                    const originalParent =
                      objects[originalAutoLayoutInfo.parentId];

                    if (
                      originalParent?.type === "frame" &&
                      originalParent.properties?.type === "frame" &&
                      originalParent.properties.autoLayout?.mode !== "none"
                    ) {
                      // Check if target is a sibling in the original auto layout parent
                      const originalSiblings = originalParent.childIds || [];

                      if (originalSiblings.includes(objectId)) {
                        shouldPreventNesting = true;
                        break;
                      }

                      // Also check if target is a descendant of any original auto layout sibling
                      // This prevents nesting into any child of a sibling frame
                      for (const siblingId of originalSiblings) {
                        if (siblingId === draggedId) continue; // Skip self

                        // Check if target is inside this sibling (regardless of whether sibling has auto layout)
                        const allDescendants = getAllDescendantsForObjects(
                          [siblingId],
                          objects
                        );
                        if (allDescendants.includes(objectId)) {
                          shouldPreventNesting = true;
                          break;
                        }
                      }
                      if (shouldPreventNesting) break;
                    }
                  }
                } else {
                  // Case 2: External item (originally external, may have been reparented)
                  // Always allow nesting - no CMD required for external items
                }
              }

              if (!shouldPreventNesting) {
                // Calculate depth to find the topmost (shallowest) frame
                let depth = 0;
                let currentId = frameObject.parentId;
                while (currentId) {
                  depth++;
                  const parent = objects[currentId];
                  currentId = parent?.parentId;
                }

                candidates.push({ objectId, frameObject, depth });
              }
            }
          }
        }
      }

      // Sort by depth (deepest first) to select the most nested frame
      candidates.sort((a, b) => b.depth - a.depth);

      if (candidates.length > 0) {
        let selectedCandidate = candidates[0];

        // Without CMD, don't nest into children of auto layout frames —
        // prefer the AL frame itself so the item is inserted at the
        // top level (reordering), not nested into a child.
        if (!isCmdPressed && candidates.length > 1) {
          const candidateIds = new Set(candidates.map((c) => c.objectId));
          let current = selectedCandidate;
          // Walk up: if current's parent is an AL frame that's also a
          // candidate, prefer the parent instead.
          while (current) {
            const parentId = current.frameObject.parentId;
            if (!parentId || !candidateIds.has(parentId)) break;
            const parentObj = objects[parentId];
            if (
              parentObj?.type === "frame" &&
              parentObj.properties?.type === "frame" &&
              parentObj.properties.autoLayout?.mode !== "none"
            ) {
              const parentCandidate = candidates.find(
                (c) => c.objectId === parentId
              );
              if (parentCandidate) {
                current = parentCandidate;
              } else {
                break;
              }
            } else {
              break;
            }
          }
          selectedCandidate = current;
        }

        return selectedCandidate.objectId;
      }

      // Distinguish "no frames under cursor" (canvas root → null)
      // from "frames found but nesting blocked" (→ undefined).
      // Check if any frame elements were hit at all (before filtering).
      const anyFrameHit = elementsUnderPoint.some((el) => {
        const oid = el.getAttribute("data-object-id");
        const otype = el.getAttribute("data-object-type");
        return oid && otype === "frame" && !allExcludedIds.includes(oid);
      });
      return anyFrameHit ? undefined : null;
    },
    [objects, viewport, canvasRef, isCmdPressed, draggedAutoLayoutChildren]
  );

  // Handle live reparenting during drag
  const handleLiveReparenting = useCallback(
    (draggedIds: string[], newParentId: string | undefined) => {
      draggedIds.forEach((objectId: string) => {
        const object = objects[objectId];
        if (!object) return;

        // SMART CLEANUP: Mark objects as temporarily outside when leaving original parent,
        // but allow them to re-enter seamlessly during the same drag operation
        const currentParentForCleanup =
          currentParents[objectId] ?? object.parentId;
        const draggedInfo = draggedAutoLayoutChildren[objectId];

        if (draggedInfo) {
          const isLeavingOriginalParent =
            currentParentForCleanup === draggedInfo.parentId &&
            newParentId !== draggedInfo.parentId;
          const isReturningToOriginalParent =
            newParentId === draggedInfo.parentId &&
            currentParentForCleanup !== draggedInfo.parentId;

          if (isLeavingOriginalParent) {
            setDraggedAutoLayoutChildren((prev) => ({
              ...prev,
              [objectId]: { ...prev[objectId], isTemporarilyOutside: true },
            }));
          } else if (isReturningToOriginalParent) {
            setDraggedAutoLayoutChildren((prev) => ({
              ...prev,
              [objectId]: { ...prev[objectId], isTemporarilyOutside: false },
            }));
          }
        }

        // Validate reparenting before applying
        if (!isValidReparenting(objectId, newParentId, objects)) {
          return;
        }

        // Defensive guard: NEVER reparent an AL child into one of its
        // original siblings (or descendants thereof). This catches any
        // edge case where detectPotentialParent's prevention is bypassed
        // (e.g. stale closures, timing issues).
        if (draggedInfo && newParentId && !isCmdPressed) {
          const origParent = objects[draggedInfo.parentId];
          if (
            origParent?.type === "frame" &&
            origParent.properties?.type === "frame" &&
            origParent.properties.autoLayout?.mode !== "none"
          ) {
            const origSiblings = origParent.childIds || [];
            if (origSiblings.includes(newParentId)) {
              return; // Block: target is a sibling
            }
            // Also block descendants of siblings
            for (const sibId of origSiblings) {
              if (sibId === objectId) continue;
              const sibDescendants = getAllDescendantsForObjects(
                [sibId],
                objects
              );
              if (sibDescendants.includes(newParentId)) {
                return; // Block: target is inside a sibling
              }
            }
          }
        }

        // Additional component nesting validation for this object and its descendants
        const componentValidation = validateComponentNestingForObjects(
          [objectId],
          newParentId,
          objects
        );

        if (!componentValidation.isValid) {
          return;
        }

        const currentParent = currentParents[objectId] ?? object.parentId;

        if (currentParent !== newParentId) {
          // Check if the new parent has auto layout - if so, skip immediate reparenting
          const newParent = newParentId ? objects[newParentId] : null;
          const newParentAutoLayout = getParentAutoLayout(newParent);
          const hasAutoLayout =
            newParentAutoLayout && newParentAutoLayout.mode !== "none";

          if (hasAutoLayout) {
            // For auto layout frames, only track the potential parent but don't reparent immediately
            // The actual reparenting will happen on drop with the calculated insertion position

            return;
          }

          // Update our tracking of current parents
          setCurrentParents((prev) => ({
            ...prev,
            [objectId]: newParentId,
          }));

          const currentDragPosition = dragCurrentPositions[objectId];
          if (currentDragPosition) {
            const newRelativePosition = convertToParentSpace(
              currentDragPosition,
              newParentId,
              objects
            );

            // Check if this object should restore original absolute positioning
            const originalParent = originalParents[objectId];
            const wasOriginallyAbsolute = originalAbsolutePositioning[objectId];
            const shouldRestoreAbsolute =
              newParentId === originalParent && wasOriginallyAbsolute;

            dispatch({
              type: "object.reparented.withCoordinates",
              payload: {
                objectId: objectId,
                newParentId: newParentId,
                previousParentId: currentParent,
                newIndex: 0,
                previousIndex: 0,
                newPosition: {
                  x: newRelativePosition.x,
                  y: newRelativePosition.y,
                },
                previousPosition: {
                  x: object.x,
                  y: object.y,
                },
                // Pass original drag state for smart absolute positioning
                originalParentId: originalParent,
                wasOriginallyAbsolute: wasOriginallyAbsolute,
                shouldRestoreAbsolute: shouldRestoreAbsolute,
                // This is live reparenting during drag
                isLiveReparenting: true,
              },
            });

            setLiveReparentedObjects((prev) => new Set([...prev, objectId]));

            setDragCurrentPositions({
              ...dragCurrentPositionsRef.current,
              [objectId]: currentDragPosition,
            });
          }
        }
      });
    },
    [
      objects,
      currentParents,
      dragCurrentPositions,
      dispatch,
      draggedAutoLayoutChildren,
      setDraggedAutoLayoutChildren,
      isCmdPressed,
    ]
  );

  // Start drag operation
  const startDrag = useCallback(
    (
      draggedIds: string[],
      startPoint: { x: number; y: number },
      startPositions: Record<string, { x: number; y: number }>,
      originalParentsMap: Record<string, string | undefined>,
      isShiftPressed: boolean = false,
      event?: React.PointerEvent
    ) => {
      // Ensure no stale resize state lingers — a just-finished resize may
      // not have cleared in time if the user immediately starts a drag.
      useTransientStore.getState().clearResize();

      // Check if any dragged objects are absolutely positioned
      const absolutePositionedObjects = draggedIds.filter(
        (id) => objects[id]?.absolutePositioned
      );

      // Prevent dragging if any text object is currently being edited
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

      // Prevent dragging when space panning is active
      // Check if space key is currently pressed (global space pan state)
      const isSpacePanning = (window as any).__figmaCloneSpacePanning;
      if (isSpacePanning) {
        return; // Don't start drag when space panning
      }

      // Check if Option/Alt key is physically held down at drag start
      // This restores continuous duplication capability
      const isPhysicalOptionPressed = event?.altKey || false;

      if (isPhysicalOptionPressed && !isOptionPressed) {
        setIsOptionPressed(true);
      }

      // Store original drag information for reactive switching
      // ONLY store top-level objects - children will follow automatically via hierarchy
      setOriginalDragObjectIds(draggedIds);
      setOriginalDragStartPositions(startPositions);
      setOriginalDragParents(originalParentsMap);

      // Check if we should duplicate objects (Option/Alt key pressed)
      let finalDraggedIds = draggedIds;
      let finalStartPositions = startPositions;
      let finalOriginalParentsMap = originalParentsMap;

      if (isOptionPressed && !isCompletingDragRef.current) {
        const { duplicatedObjects, idMapping } =
          createDuplicatesForDrag(draggedIds);

        // Dispatch duplication event to add objects to store
        dispatch({
          type: "objects.duplicated",
          payload: {
            originalIds: draggedIds,
            duplicatedObjects,
            offset: { x: 0, y: 0 },
          },
        });

        // Notify listeners (e.g. useDesignChat) about the duplication
        const originalToDuplicatedMap: Record<string, string> = {};
        Object.keys(idMapping).forEach((origId) => {
          originalToDuplicatedMap[origId] = idMapping[origId];
        });
        window.dispatchEvent(
          new CustomEvent("canvas-objects-duplicated", {
            detail: { originalToDuplicatedMap, originalIds: draggedIds },
          }),
        );

        // Update drag target to duplicated objects
        const duplicatedIds = duplicatedObjects.map((obj) => obj.id);
        finalDraggedIds = duplicatedIds;

        // Update start positions and parent maps for duplicated objects
        finalStartPositions = {};
        finalOriginalParentsMap = {};

        duplicatedObjects.forEach((duplicate) => {
          const originalId = Object.keys(idMapping).find(
            (origId) => idMapping[origId] === duplicate.id
          );
          if (originalId && startPositions[originalId]) {
            // Calculate the absolute position where the duplicate actually is
            // Manual calculation since duplicate isn't in store yet
            let absoluteX = duplicate.x;
            let absoluteY = duplicate.y;

            // Walk up the parent chain to get absolute position
            let currentParentId = duplicate.parentId;
            while (currentParentId) {
              const parent = objects[currentParentId];
              if (!parent) break;
              absoluteX += parent.x;
              absoluteY += parent.y;
              currentParentId = parent.parentId;
            }

            finalStartPositions[duplicate.id] = {
              x: absoluteX,
              y: absoluteY,
            };
            finalOriginalParentsMap[duplicate.id] = duplicate.parentId;
          }
        });

        // Set duplication state
        setIsDuplicating(true);
        setDuplicatedObjectIds(duplicatedIds);

        // Update selection to duplicated objects
        dispatch({
          type: "selection.changed",
          payload: { selectedIds: duplicatedIds },
        });
      } else {
        // Reset duplication state
        setIsDuplicating(false);
        setDuplicatedObjectIds([]);
        duplicateDragStartPositionsRef.current = {};
        duplicateInitialOffsetsRef.current = {};
      }

      // Reorder draggedIds to match visual order for AL children
      // This prevents jumps when selection order differs from visual order
      const reorderedDraggedIds = reorderSelectionByVisualOrder(
        finalDraggedIds,
        objects
      );

      setDraggedObjectIds(reorderedDraggedIds);
      setDragStartPoint(startPoint);
      setDragStartPositions(finalStartPositions);
      setCurrentParents(finalOriginalParentsMap);
      setOriginalParents(finalOriginalParentsMap);

      // Track original absolute positioning state
      const originalAbsoluteState: Record<string, boolean> = {};
      reorderedDraggedIds.forEach((objectId) => {
        const object = objects[objectId];
        originalAbsoluteState[objectId] = !!object?.absolutePositioned;
      });

      setOriginalAbsolutePositioning(originalAbsoluteState);

      setLiveReparentedObjects(new Set());
      setOverlayParent(undefined);
      setHasLeftOriginalParent(false);

      // Don't process auto layout children on mouse down —
      // defer until the drag threshold is exceeded in handlePointerMove.
      // Setting draggedAutoLayoutChildren before the drag starts causes the child
      // to be removed from the flex flow and re-rendered separately (but still
      // with position:relative since there's no dragPosition yet), which corrupts
      // the layout and causes a visible resize that snaps back on mouse up.
      setDraggedAutoLayoutChildren({});
      setAutoLayoutPlaceholderPositions({});
    },
    [objects]
  );

  // Handle pointer move for drag
  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (
        !canvasRef.current ||
        !dragStartPoint ||
        draggedObjectIds.length === 0
      )
        return;

      // Note: Mid-drag duplication switching is now handled by reactive useEffect

      const currentWorldPoint = getWorldCoordinatesFromEvent(
        event.nativeEvent,
        canvasRef.current,
        viewport
      );

      const deltaX = currentWorldPoint.x - dragStartPoint.x;
      const deltaY = currentWorldPoint.y - dragStartPoint.y;

      const dragThreshold = 3 / viewport.zoom;
      const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (!isDragging && dragDistance > dragThreshold) {
        setIsDragging(true);

        // Process auto layout children now that drag has actually started
        // This is always deferred from startDrag to prevent layout corruption on mouse down
        if (Object.keys(draggedAutoLayoutChildren).length === 0) {
          const autoLayoutChildren: Record<
            string,
            { parentId: string; originalIndex: number }
          > = {};

          draggedObjectIds.forEach((objectId) => {
            const object = objects[objectId];
            if (object?.parentId && !object.absolutePositioned) {
              const parent = objects[object.parentId];

              const parentAutoLayout = getParentAutoLayout(parent);
              if (parentAutoLayout && parentAutoLayout.mode !== "none") {
                const originalIndex = parent.childIds.indexOf(objectId);
                autoLayoutChildren[objectId] = {
                  parentId: object.parentId,
                  originalIndex: originalIndex >= 0 ? originalIndex : 0,
                };
              }
            } else if (object?.absolutePositioned) {
            }
          });

          // Before transitioning AL children from flex to absolute positioning,
          // sync their DOM-computed dimensions AND positions into the store so
          // the absolute layout matches what the flex layout was rendering.
          Object.keys(autoLayoutChildren).forEach((objectId) => {
            const element = document.querySelector(
              `[data-object-id="${objectId}"]`
            );
            if (element) {
              const rect = element.getBoundingClientRect();
              const domWidth = Math.round(rect.width / viewport.zoom);
              const domHeight = Math.round(rect.height / viewport.zoom);
              const obj = objects[objectId];
              if (!obj) return;

              // Also sync position: compute relative position within the parent frame
              const changes: any = {};
              const parentElement = obj.parentId
                ? document.querySelector(
                    `[data-object-id="${obj.parentId}"]`
                  )
                : null;

              if (parentElement) {
                const parentRect = parentElement.getBoundingClientRect();
                const relativeX = Math.round(
                  (rect.left - parentRect.left) / viewport.zoom
                );
                const relativeY = Math.round(
                  (rect.top - parentRect.top) / viewport.zoom
                );

                if (
                  Math.abs(obj.x - relativeX) > 0.5 ||
                  Math.abs(obj.y - relativeY) > 0.5
                ) {
                  changes.x = relativeX;
                  changes.y = relativeY;
                }
              }

              if (
                Math.abs(obj.width - domWidth) > 0.5 ||
                Math.abs(obj.height - domHeight) > 0.5
              ) {
                changes.width = domWidth;
                changes.height = domHeight;
              }

              if (Object.keys(changes).length > 0) {
                dispatch({
                  type: "object.updated",
                  payload: {
                    id: objectId,
                    changes,
                    context: "drag-start-sync",
                  },
                });
              }
            }
          });

          setDraggedAutoLayoutChildren(autoLayoutChildren);

          // Create immediate placeholders for auto layout children.
          // Group siblings share the same adjusted insertion index so that
          // they appear together in the non-dragged render order (e.g. if
          // B(1) and C(2) are dragged from [A,B,C,D], both placeholders
          // go at index 1 — between A and D — not at 1 and 2).
          const immediatePlaceholders: Record<
            string,
            { parentId: string; insertionIndex: number }
          > = {};

          // Group AL children by parent to compute adjusted indices
          const groupsByParent: Record<
            string,
            { objectId: string; originalIndex: number }[]
          > = {};
          Object.entries(autoLayoutChildren).forEach(([objectId, info]) => {
            if (!groupsByParent[info.parentId]) {
              groupsByParent[info.parentId] = [];
            }
            groupsByParent[info.parentId].push({
              objectId,
              originalIndex: info.originalIndex,
            });
          });

          Object.entries(groupsByParent).forEach(([parentId, group]) => {
            group.sort((a, b) => a.originalIndex - b.originalIndex);

            const parent = objects[parentId];
            if (!parent) return;

            // Count non-dragged children before the first group member
            // to get the correct insertion index in the filtered list
            const draggedSet = new Set(group.map((g) => g.objectId));
            let adjustedIndex = 0;
            for (let i = 0; i < parent.childIds.length; i++) {
              if (parent.childIds[i] === group[0].objectId) break;
              if (!draggedSet.has(parent.childIds[i])) {
                adjustedIndex++;
              }
            }

            // All group members share the same insertion index
            group.forEach((member) => {
              immediatePlaceholders[member.objectId] = {
                parentId,
                insertionIndex: adjustedIndex,
              };
            });
          });

          if (Object.keys(immediatePlaceholders).length > 0) {
            setAutoLayoutPlaceholderPositions(immediatePlaceholders);
          }

          // Disable observer-driven position syncs while dragging AL children.
          // The ResizeObserver would otherwise continuously fire as siblings
          // reflow around placeholders, causing an oscillation feedback loop.
          if (Object.keys(autoLayoutChildren).length > 0) {
            AutoLayoutObserverAPI.disableSync();
          }
        }

        // Dispatch drag.started event to capture history snapshot BEFORE any live reparenting
        dispatch({
          type: "drag.started",
          payload: {
            draggedObjectIds,
            startPoint: dragStartPoint,
          },
        });
      }

      if (isDragging || dragDistance > dragThreshold) {
        const newPositions: Record<string, { x: number; y: number }> = {};

        // Detect potential parent early for all positioning logic
        // During duplication mode, exclude both dragged objects AND originals to prevent circular reparenting
        const excludeIds = isDuplicating
          ? [...draggedObjectIds, ...originalDragObjectIds]
          : draggedObjectIds;

        // detectPotentialParent returns:
        //   string    — valid frame target
        //   null      — canvas root (no frames under cursor)
        //   undefined — nesting was blocked (e.g. sibling guard)
        const rawNewPotentialParent = detectPotentialParent(
          currentWorldPoint,
          excludeIds
        );
        const newPotentialParent = rawNewPotentialParent ?? undefined;
        const nestingBlocked = rawNewPotentialParent === undefined;

        // Track last valid parent for duplication mode
        // This ensures originals follow to the most recent valid parent when Option is released
        // CRITICAL: We need to track BOTH frame parents AND canvas (undefined)

        setLastValidParent(newPotentialParent); // This includes undefined for canvas!

        // Check if we have AL children that should be condensed
        const alChildrenGroups: Record<string, string[]> = {};
        const standaloneItems: string[] = [];

        draggedObjectIds.forEach((objectId) => {
          const alChildInfo = draggedAutoLayoutChildren[objectId];
          if (alChildInfo) {
            const parentId = alChildInfo.parentId;
            if (!alChildrenGroups[parentId]) {
              alChildrenGroups[parentId] = [];
            }
            alChildrenGroups[parentId].push(objectId);
          } else {
            standaloneItems.push(objectId);
          }
        });

        // Handle standalone items (single items or non-AL children) with normal positioning
        standaloneItems.forEach((objectId) => {
          // For duplicates, use corrected drag start positions; for originals, use normal drag start positions
          const originalPos =
            isDuplicating && duplicateDragStartPositionsRef.current[objectId]
              ? duplicateDragStartPositionsRef.current[objectId]
              : dragStartPositions[objectId];

          if (originalPos) {
            const newPos = {
              x: Math.round(originalPos.x + deltaX),
              y: Math.round(originalPos.y + deltaY),
            };
            newPositions[objectId] = newPos;
          }
        });

        // Handle AL children groups with conditional condensed positioning
        Object.entries(alChildrenGroups).forEach(([parentId, groupIds]) => {
          if (groupIds.length === 1) {
            // Single AL child - normal positioning
            const objectId = groupIds[0];
            const originalPos = dragStartPositions[objectId];
            if (originalPos) {
              const newPos = {
                x: Math.round(originalPos.x + deltaX),
                y: Math.round(originalPos.y + deltaY),
              };
              newPositions[objectId] = newPos;
            }
          } else {
            // Multiple AL children - always use condensed positioning
            // Keep items snug together regardless of target context
            const condensedPositions = calculateCondensedDragPositions(
              groupIds,
              parentId,
              objects,
              dragStartPositions,
              deltaX,
              deltaY
            );
            Object.assign(newPositions, condensedPositions);
          }
        });

        setDragCurrentPositions(newPositions);

        // TODO: Add live component sync during drag without using objects.moved events
        // The objects.moved approach causes double position application

        // Update mouse position for placeholder logic
        setCurrentMouseWorldPosition(currentWorldPoint);

        // Check if the new potential parent has auto layout
        const newParent = newPotentialParent
          ? objects[newPotentialParent]
          : null;
        const newParentAutoLayout = getParentAutoLayout(newParent);
        const hasAutoLayout =
          newParentAutoLayout && newParentAutoLayout.mode !== "none";
        setIsHoveringAutoLayout(hasAutoLayout || false);

        // Only calculate placeholders when officially dragging (not just past threshold)
        // This prevents flickering during drag initiation
        if (isDragging) {
          // Calculate placeholder positions for auto layout children being dragged
          const newPlaceholderPositions: Record<
            string,
            { parentId: string; insertionIndex: number }
          > = {};

          // Start with existing placeholders, we'll update or remove them as needed
          const placeholdersToRemove: string[] = [];

          // For auto layout children being dragged within/between auto layout frames
          // Always create placeholders within original parent to prevent layout collapse
          // CMD only affects cross-parent nesting behavior, not placeholder creation
          {
            // Group AL children by their target parent for group-based positioning
            const alChildrenByParent: Record<
              string,
              {
                objectId: string;
                autoLayoutChildInfo: {
                  parentId: string;
                  originalIndex: number;
                };
                draggedObject: any;
                currentDragPos: { x: number; y: number };
                currentPlaceholder: any;
              }[]
            > = {};

            // First pass: determine target parent for each AL child and group them
            Object.keys(draggedAutoLayoutChildren).forEach((objectId) => {
              const draggedObject = objects[objectId];
              const currentDragPos = newPositions[objectId];

              // Skip absolutely positioned children - they don't get placeholders
              if (draggedObject?.absolutePositioned) {
                return;
              }

              if (draggedObject && currentDragPos) {
                const autoLayoutChildInfo = draggedAutoLayoutChildren[objectId];
                const currentPlaceholder =
                  autoLayoutPlaceholderPositions[objectId];

                // Determine target parent (same logic as before)
                const originalParent = objects[autoLayoutChildInfo.parentId];
                const originalHasAutoLayout =
                  originalParent?.type === "frame" &&
                  originalParent.properties?.type === "frame" &&
                  originalParent.properties.autoLayout?.mode !== "none";

                let targetParentId: string | undefined;
                if (
                  originalHasAutoLayout &&
                  newPotentialParent === autoLayoutChildInfo.parentId
                ) {
                  targetParentId = autoLayoutChildInfo.parentId;
                }

                // Handle placeholder removal
                if (
                  currentPlaceholder &&
                  (!targetParentId ||
                    currentPlaceholder.parentId !== targetParentId)
                ) {
                  placeholdersToRemove.push(objectId);
                }

                // Group by target parent for group positioning
                if (targetParentId) {
                  if (!alChildrenByParent[targetParentId]) {
                    alChildrenByParent[targetParentId] = [];
                  }
                  alChildrenByParent[targetParentId].push({
                    objectId,
                    autoLayoutChildInfo,
                    draggedObject,
                    currentDragPos,
                    currentPlaceholder,
                  });
                }
              }
            });

            // Second pass: process each group using group bounding box
            Object.entries(alChildrenByParent).forEach(
              ([targetParentId, group]) => {
                if (group.length === 0) return;

                // Determine drag delta along the parent's layout axis.
                // This tells the placeholder functions which edge to use
                // (leading for backward, trailing for forward) consistently,
                // preventing oscillation from alternating edges.
                const targetParentObj = objects[targetParentId];
                const targetParentAL =
                  targetParentObj?.properties?.type === "frame"
                    ? targetParentObj.properties.autoLayout
                    : null;
                const isParentHorizontal =
                  targetParentAL?.mode === "horizontal";
                const layoutAxisDelta = isParentHorizontal ? deltaX : deltaY;

                // Calculate condensed group bounds using the actual condensed drag positions
                const groupDragPositions: Record<
                  string,
                  { x: number; y: number }
                > = {};
                group.forEach(({ objectId }) => {
                  // Use the condensed positions from newPositions (already calculated above)
                  groupDragPositions[objectId] = newPositions[objectId];
                });

                const groupBounds = calculateCondensedGroupBounds(
                  group.map((g) => g.objectId),
                  targetParentId,
                  objects,
                  groupDragPositions
                );

                // Handle both single items and multi-selection groups
                if (group.length === 1) {
                  // Single item - use the condensed position (same as original for single items)
                  const item = group[0];
                  const condensedPos = newPositions[item.objectId];
                  const draggedBounds = {
                    x: condensedPos.x,
                    y: condensedPos.y,
                    width: item.draggedObject.width,
                    height: item.draggedObject.height,
                  };

                  const currentPlaceholderIndex =
                    item.currentPlaceholder?.parentId === targetParentId
                      ? item.currentPlaceholder.insertionIndex
                      : item.autoLayoutChildInfo.originalIndex;

                  const placeholderPos =
                    calculateAutoLayoutChildPlaceholderPosition(
                      item.objectId,
                      draggedBounds,
                      targetParentId,
                      objects,
                      viewport,
                      currentPlaceholderIndex,
                      layoutAxisDelta
                    );

                  newPlaceholderPositions[item.objectId] = placeholderPos;
                } else {
                  // Multi-selection - custom group-aware calculation
                  // Sort by original index to maintain relative order within the group
                  const sortedGroup = group.sort(
                    (a, b) =>
                      a.autoLayoutChildInfo.originalIndex -
                      b.autoLayoutChildInfo.originalIndex
                  );

                  // Get the current group insertion index from any member's placeholder
                  const currentGroupIndex =
                    sortedGroup[0].currentPlaceholder?.parentId ===
                    targetParentId
                      ? sortedGroup[0].currentPlaceholder.insertionIndex
                      : undefined;

                  // Calculate group insertion index using proper group bounds logic
                  const groupInsertionIndex = calculateGroupInsertionIndex(
                    targetParentId,
                    groupBounds,
                    group.map((g) => g.objectId), // All dragged items to exclude
                    objects,
                    viewport,
                    currentGroupIndex,
                    layoutAxisDelta
                  );

                  // All group members share the same insertion index.
                  // The rendering code places all placeholders at that index
                  // consecutively, keeping them together as a unit.
                  sortedGroup.forEach((item) => {
                    newPlaceholderPositions[item.objectId] = {
                      parentId: targetParentId,
                      insertionIndex: groupInsertionIndex,
                    };
                  });
                }
              }
            );
          }

          // NOTE: Placeholders are ONLY for reordering within the same auto layout parent
          // External items (from non-AL parents or canvas) should NOT show placeholders
          // This maintains the design principle that placeholders = reordering, no placeholders = external nesting

          // Apply placeholder updates: start with existing, remove what needs to be removed, add new ones
          const updatedPlaceholderPositions = {
            ...autoLayoutPlaceholderPositions,
          };

          // Remove placeholders that are no longer needed
          placeholdersToRemove.forEach((objectId) => {
            delete updatedPlaceholderPositions[objectId];
          });

          // Add/update new placeholders
          Object.keys(newPlaceholderPositions).forEach((objectId) => {
            updatedPlaceholderPositions[objectId] =
              newPlaceholderPositions[objectId];
          });

          // Only update state if placeholder positions actually changed.
          // Avoids unnecessary re-renders of the flex container on every
          // pointer move, which can cause layout recalculations and jitter.
          const hasPlaceholderChanges =
            placeholdersToRemove.length > 0 ||
            Object.keys(newPlaceholderPositions).some((objectId) => {
              const prev = autoLayoutPlaceholderPositions[objectId];
              const next = newPlaceholderPositions[objectId];
              return (
                !prev ||
                prev.parentId !== next.parentId ||
                prev.insertionIndex !== next.insertionIndex
              );
            });

          if (hasPlaceholderChanges) {
            setAutoLayoutPlaceholderPositions(updatedPlaceholderPositions);
          }
        }

        // Handle live reparenting (only if nesting is allowed)
        // detectPotentialParent returns:
        //   string    — valid frame target
        //   null      — canvas root (no frames under cursor)
        //   undefined — nesting was blocked (e.g. sibling guard)
        if (newPotentialParent !== potentialParent) {
          setPotentialParent(newPotentialParent);

          // Allow reparenting for valid targets (frame ID or canvas root).
          // Block only when nesting was explicitly prevented.
          if (!nestingBlocked) {
            handleLiveReparenting(draggedObjectIds, newPotentialParent);
          } else {
            // If nesting is blocked, check if any dragged items are currently in blocked siblings
            // and force them back to their original parent
            for (const objectId of draggedObjectIds) {
              const currentParent =
                currentParents[objectId] ?? objects[objectId]?.parentId;
              const originalParent = originalParents[objectId];

              // Check if item is currently in a sibling where it shouldn't be
              if (draggedAutoLayoutChildren[objectId] && !isCmdPressed) {
                const originalAutoLayoutInfo =
                  draggedAutoLayoutChildren[objectId];
                if (originalAutoLayoutInfo && originalParent) {
                  const originalParentObj =
                    objects[originalAutoLayoutInfo.parentId];
                  if (
                    originalParentObj?.type === "frame" &&
                    originalParentObj.properties?.type === "frame" &&
                    originalParentObj.properties.autoLayout?.mode !== "none"
                  ) {
                    const originalSiblings = originalParentObj.childIds || [];
                    const isCurrentlyInBlockedSibling =
                      currentParent &&
                      currentParent !== originalAutoLayoutInfo.parentId &&
                      originalSiblings.includes(currentParent);

                    if (isCurrentlyInBlockedSibling) {
                      handleLiveReparenting(
                        [objectId],
                        originalAutoLayoutInfo.parentId
                      );
                    }
                  }
                }
              }
            }
          }
        }

        // Separately determine if overlay should be shown
        // Show overlay when:
        // 1. We're currently in a different frame than original parent, OR
        // 2. We've left the original parent at least once during this drag
        let shouldShowOverlay = false;

        const currentPotentialParent = newPotentialParent;

        // Track if we've ever left the original parent
        let hasLeftOriginal = hasLeftOriginalParent;
        if (!hasLeftOriginal) {
          for (const objectId of draggedObjectIds) {
            const originalParent = originalParents[objectId];
            if (originalParent !== currentPotentialParent) {
              hasLeftOriginal = true;
              setHasLeftOriginalParent(true);
              break;
            }
          }
        }

        // Show overlay if we're over a frame AND (it's different from original OR we've left original)
        if (currentPotentialParent !== undefined) {
          // Case 1: Currently in different parent than original
          let isDifferentFromOriginal = false;
          for (const objectId of draggedObjectIds) {
            const originalParent = originalParents[objectId];
            if (originalParent !== currentPotentialParent) {
              isDifferentFromOriginal = true;
              break;
            }
          }

          // Case 2: We've left original and are now over any frame (including returning to original)
          shouldShowOverlay = isDifferentFromOriginal || hasLeftOriginal;
        }

        const newOverlayParent = shouldShowOverlay
          ? newPotentialParent
          : undefined;
        if (newOverlayParent !== overlayParent) {
          setOverlayParent(newOverlayParent);
        }

        // Apply snapping to standalone items
        const { setSnapGuides, clearSnapGuides } = useAppStore.getState();

        if (standaloneItems.length > 0) {
          // Calculate bounds for snap detection using the overall selection bounding box
          const dragBounds = calculateSelectionBounds(
            standaloneItems,
            newPositions,
            objects
          );

          if (dragBounds) {
            // Apply snapping
            const { bounds: snappedBounds, snapResult } = applyDragSnapping(
              dragBounds,
              dragBounds,
              objects,
              viewport,
              draggedObjectIds,
              draggedObjectIds
            );

            // Calculate the snap offset
            const snapOffsetX = snappedBounds.x - dragBounds.x;
            const snapOffsetY = snappedBounds.y - dragBounds.y;

            // Apply snap offset to all standalone items
            if (snapOffsetX !== 0 || snapOffsetY !== 0) {
              standaloneItems.forEach((objectId) => {
                if (newPositions[objectId]) {
                  newPositions[objectId] = {
                    x: newPositions[objectId].x + snapOffsetX,
                    y: newPositions[objectId].y + snapOffsetY,
                  };
                }
              });
            }

            // Update snap guides
            setSnapGuides({
              horizontal: snapResult.horizontalGuides,
              vertical: snapResult.verticalGuides,
            });
          }
        } else {
          // Clear guides if no standalone items
          clearSnapGuides();
        }

        onDragStateChange?.(newPositions, true);
      }
    },
    [
      canvasRef,
      dragStartPoint,
      draggedObjectIds,
      dragStartPositions,
      isDragging,
      viewport,
      objects,
      onDragStateChange,
      detectPotentialParent,
      potentialParent,
      handleLiveReparenting,
      originalParents,
      overlayParent,
      currentParents,
      hasLeftOriginalParent,
    ]
  );

  // Complete drag operation
  const completeDrag = useCallback(
    (event: React.PointerEvent) => {
      // SAFETY: Reset absolutePositioned only if object left its original parent
      // This ensures dragging within same parent preserves absolute positioning
      draggedObjectIds.forEach((objectId) => {
        const obj = objects[objectId];
        const originalParent = originalParents[objectId];

        if (obj?.absolutePositioned) {
          // Only reset if the final parent is different from original parent
          if (obj.parentId !== originalParent) {
            dispatch({
              type: "object.updated",
              payload: {
                id: objectId,
                changes: { absolutePositioned: false },
                previousValues: { absolutePositioned: obj.absolutePositioned },
              },
            });
          }
        }
      });

      // Set completion flag to prevent duplication during completion
      isCompletingDragRef.current = true;

      if (isDragging && draggedObjectIds.length > 0 && dragStartPoint) {
        // Use the final dragged positions (which include snapping) instead of mouse position
        // This ensures that snapped positions are persisted on drop

        // Handle non-reparented objects
        const nonReparentedObjectIds: string[] = [];
        draggedObjectIds.forEach((objectId: string) => {
          if (!liveReparentedObjects.has(objectId)) {
            // Skip duplicates with corrected initial offsets - they should not be moved by delta
            if (
              isDuplicating &&
              duplicatedObjectIds.includes(objectId) &&
              duplicateInitialOffsetsRef.current[objectId]
            ) {
            } else {
              // For duplicates, only include TOP-LEVEL objects (children move with parent automatically)
              if (isDuplicating && duplicatedObjectIds.includes(objectId)) {
                const obj = objects[objectId];
                if (obj && obj.parentId) {
                  // This is a child - check if its parent is also being dragged
                  if (draggedObjectIds.includes(obj.parentId)) {
                    return; // Skip children when parent is also being dragged
                  }
                }
              }

              nonReparentedObjectIds.push(objectId);
            }
          }
        });

        // Prepare updates for live reparented objects
        const reparentedUpdates: Array<{
          objectId: string;
          newPosition: { x: number; y: number };
          previousPosition: { x: number; y: number };
        }> = [];

        Array.from(liveReparentedObjects).forEach((objectId: string) => {
          const objectInState = objects[objectId];
          const currentDragPos = dragCurrentPositions[objectId];
          // For duplicates, use corrected drag start positions; for originals, use normal drag start positions
          const originalPosition =
            isDuplicating && duplicateDragStartPositionsRef.current[objectId]
              ? duplicateDragStartPositionsRef.current[objectId]
              : dragStartPositions[objectId];

          if (currentDragPos && objectInState && originalPosition) {
            const finalRelativePosition = convertToParentSpace(
              currentDragPos,
              objectInState.parentId,
              objects
            );

            reparentedUpdates.push({
              objectId,
              newPosition: {
                x: Math.round(finalRelativePosition.x),
                y: Math.round(finalRelativePosition.y),
              },
              previousPosition: {
                x: Math.round(originalPosition.x),
                y: Math.round(originalPosition.y),
              },
            });
          }
        });

        // Prepare movement for non-reparented objects
        // Calculate final movement deltas from actual dragged positions (includes snapping)
        let totalDeltaX = 0;
        let totalDeltaY = 0;
        let deltaCount = 0;

        nonReparentedObjectIds.forEach((objectId) => {
          let finalPos = dragCurrentPositions[objectId];

          // For duplicates, calculate the correct final position that maintains the initial offset
          if (
            isDuplicating &&
            duplicatedObjectIds.includes(objectId) &&
            currentMouseWorldPosition
          ) {
            const initialOffset = duplicateInitialOffsetsRef.current[objectId];
            if (initialOffset) {
              // Use the stored initial offset to position the duplicate correctly
              // initialOffset represents mouse position relative to object origin
              // So we need to subtract it to get object position relative to mouse
              finalPos = {
                x: currentMouseWorldPosition.x - initialOffset.x,
                y: currentMouseWorldPosition.y - initialOffset.y,
              };
            }
          }

          // For duplicates, use corrected drag start positions; for originals, use normal drag start positions
          const startPos =
            isDuplicating && duplicateDragStartPositionsRef.current[objectId]
              ? duplicateDragStartPositionsRef.current[objectId]
              : dragStartPositions[objectId];

          if (finalPos && startPos) {
            // Skip duplicates with corrected initial offsets from delta calculation
            // They should be positioned directly, not moved by delta
            if (
              isDuplicating &&
              duplicatedObjectIds.includes(objectId) &&
              duplicateInitialOffsetsRef.current[objectId]
            ) {
            } else {
              totalDeltaX += finalPos.x - startPos.x;
              totalDeltaY += finalPos.y - startPos.y;
              deltaCount++;
            }
          }
        });

        // Use average delta (should be same for all objects in a grouped drag)
        const deltaX = deltaCount > 0 ? totalDeltaX / deltaCount : 0;
        const deltaY = deltaCount > 0 ? totalDeltaY / deltaCount : 0;

        // Additional debug for duplicates in completion
        if (isDuplicating) {
          nonReparentedObjectIds.forEach((objectId) => {
            if (duplicatedObjectIds.includes(objectId)) {
              const finalPos = dragCurrentPositions[objectId];
              const startPos = duplicateDragStartPositionsRef.current[objectId];
              // Get the actual store object to see its current position
              const storeObject = objects[objectId];
              const storeAbsolutePos = storeObject
                ? getAbsolutePosition(objectId, objects)
                : null;
            }
          });
        }

        // Only apply movement if user actually performed intentional drag movements
        const hasActualDragMovement =
          Object.keys(dragCurrentPositions).length > 0;
        const movedObjects =
          nonReparentedObjectIds.length > 0 &&
          hasActualDragMovement && // Only if drag positions were actually updated during drag
          (Math.abs(deltaX) > 0.1 || Math.abs(deltaY) > 0.1)
            ? {
                objectIds: nonReparentedObjectIds,
                deltaX: Math.round(deltaX),
                deltaY: Math.round(deltaY),
              }
            : null;

        // Handle auto layout reparenting if we ended drag over an auto layout frame
        if (potentialParent && currentMouseWorldPosition) {
          const potentialParentObj = objects[potentialParent];
          const hasAutoLayout =
            potentialParentObj?.type === "frame" &&
            potentialParentObj.properties?.type === "frame" &&
            potentialParentObj.properties.autoLayout?.mode !== "none";

          if (hasAutoLayout) {
            // Use existing placeholder positions as source of truth for insertion indices
            // The placeholder shows the user exactly where items will be placed
            const placeholderBasedInsertions: Record<string, number> = {};

            draggedObjectIds.forEach((objectId) => {
              const draggedObject = objects[objectId];

              // Skip absolutely positioned children - they should not use placeholder-based insertion
              if (draggedObject?.absolutePositioned) {
                return;
              }

              const placeholder = autoLayoutPlaceholderPositions[objectId];
              if (placeholder && placeholder.parentId === potentialParent) {
                // Use placeholder position for auto layout children (reordering within same parent)
                placeholderBasedInsertions[objectId] =
                  placeholder.insertionIndex;
              } else {
                // External item (no placeholder) - calculate insertion based on current position
                const insertionIndex = calculateExternalItemInsertionIndex(
                  potentialParent,
                  currentMouseWorldPosition,
                  [objectId],
                  objects,
                  viewport
                );
                placeholderBasedInsertions[objectId] = insertionIndex;
              }
            });

            // Group AL children vs external items for different handling
            const alChildren: string[] = [];
            const externalItems: string[] = [];

            draggedObjectIds.forEach((objectId) => {
              const draggedObject = objects[objectId];
              const placeholder = autoLayoutPlaceholderPositions[objectId];
              const isOriginalAlChild = draggedAutoLayoutChildren[objectId];

              // Absolutely positioned children are always treated as external items
              if (draggedObject?.absolutePositioned) {
                externalItems.push(objectId);
              } else if (
                placeholder &&
                placeholder.parentId === potentialParent
              ) {
                // This is an AL child being reordered within same parent
                alChildren.push(objectId);
              } else if (isOriginalAlChild) {
                // This is an AL child being inserted into a new AL parent
                // Treat as AL child for proper insertion, not external item
                alChildren.push(objectId);
              } else {
                // This is an external item being inserted
                externalItems.push(objectId);
              }
            });

            // Handle AL children (reordering) - ensure consecutive drop for multi-selection
            if (alChildren.length === 1) {
              // Single item - use calculated index
              const objectId = alChildren[0];
              const object = objects[objectId];
              if (
                object &&
                isValidReparenting(objectId, potentialParent, objects)
              ) {
                // Use placeholder index if available, otherwise calculate insertion index
                const insertionIndex =
                  placeholderBasedInsertions[objectId] !== undefined
                    ? placeholderBasedInsertions[objectId]
                    : calculateExternalItemInsertionIndex(
                        potentialParent,
                        currentMouseWorldPosition,
                        [objectId],
                        objects,
                        viewport
                      );

                // Check if object needs reparenting (not just reordering)
                if (object.parentId === potentialParent) {
                  // Same parent - use reordering
                  dispatch({
                    type: "object.reordered",
                    payload: {
                      objectId: objectId,
                      parentId: potentialParent,
                      newIndex: insertionIndex,
                      previousIndex:
                        objects[potentialParent]?.childIds.indexOf(objectId) ||
                        0,
                    },
                  });
                } else {
                  // Different parent (including canvas) - use reparenting
                  const newRelativePosition = convertToParentSpace(
                    dragCurrentPositions[objectId] || {
                      x: object.x,
                      y: object.y,
                    },
                    potentialParent,
                    objects
                  );

                  // Check if this object should restore original absolute positioning
                  const originalParent = originalParents[objectId];
                  const wasOriginallyAbsolute =
                    originalAbsolutePositioning[objectId];
                  const shouldRestoreAbsolute =
                    potentialParent === originalParent && wasOriginallyAbsolute;

                  dispatch({
                    type: "object.reparented.withCoordinates",
                    payload: {
                      objectId: objectId,
                      newParentId: potentialParent,
                      previousParentId: object.parentId,
                      newIndex: insertionIndex,
                      previousIndex: 0,
                      newPosition: {
                        x: newRelativePosition.x,
                        y: newRelativePosition.y,
                      },
                      previousPosition: {
                        x: object.x,
                        y: object.y,
                      },
                      // Pass original drag state for smart absolute positioning
                      originalParentId: originalParent,
                      wasOriginallyAbsolute: wasOriginallyAbsolute,
                      shouldRestoreAbsolute: shouldRestoreAbsolute,
                      // This is final drop reparenting, not live
                      isLiveReparenting: false,
                    },
                  });
                }
              }
            } else if (alChildren.length > 1) {
              // Multi-selection - force consecutive indices
              // Sort by original parent order to maintain relative positioning
              const parent = objects[potentialParent];
              const sortedAlChildren = alChildren.sort((a, b) => {
                const aIndex = parent?.childIds.indexOf(a) || 0;
                const bIndex = parent?.childIds.indexOf(b) || 0;
                return aIndex - bIndex;
              });

              // Find the minimum insertion index from placeholders or calculate fallback
              const insertionIndices = alChildren.map((id) => {
                if (placeholderBasedInsertions[id] !== undefined) {
                  return placeholderBasedInsertions[id];
                } else {
                  // Fallback to calculated insertion for items without placeholders
                  return calculateExternalItemInsertionIndex(
                    potentialParent,
                    currentMouseWorldPosition,
                    [id],
                    objects,
                    viewport
                  );
                }
              });
              const minInsertionIndex = Math.min(...insertionIndices);

              // Group items by operation type for efficient batch processing
              const reorderItems: Array<{
                objectId: string;
                newIndex: number;
                previousIndex: number;
              }> = [];
              const reparentItems: Array<{
                objectId: string;
                newIndex: number;
                newRelativePosition: { x: number; y: number };
                previousPosition: { x: number; y: number };
                previousParentId: string | undefined;
              }> = [];

              sortedAlChildren.forEach((objectId, index) => {
                const object = objects[objectId];
                // Validate basic reparenting and component nesting rules
                let isValidReparentingResult = false;
                if (
                  object &&
                  isValidReparenting(objectId, potentialParent, objects)
                ) {
                  // Additional component nesting validation for this object and its descendants
                  const componentValidation =
                    validateComponentNestingForObjects(
                      [objectId],
                      potentialParent,
                      objects
                    );

                  if (!componentValidation.isValid) {
                    isValidReparentingResult = false;
                  } else {
                    isValidReparentingResult = true;
                  }
                }

                if (isValidReparentingResult) {
                  const insertionIndex = minInsertionIndex + index;

                  // Check if object needs reparenting (not just reordering)
                  if (object.parentId === potentialParent) {
                    // Same parent - collect for batch reordering
                    reorderItems.push({
                      objectId: objectId,
                      newIndex: insertionIndex,
                      previousIndex:
                        objects[potentialParent]?.childIds.indexOf(objectId) ||
                        0,
                    });
                  } else {
                    // Different parent (including canvas) - collect for reparenting
                    const worldPosition = dragCurrentPositions[objectId] || {
                      x: object.x,
                      y: object.y,
                    };
                    const newRelativePosition = convertToParentSpace(
                      worldPosition,
                      potentialParent,
                      objects
                    );

                    reparentItems.push({
                      objectId: objectId,
                      newIndex: insertionIndex,
                      newRelativePosition,
                      previousPosition: { x: object.x, y: object.y },
                      previousParentId: object.parentId,
                    });
                  }
                }
              });

              // Dispatch batch reorder event for items staying in same parent
              if (reorderItems.length > 0) {
                dispatch({
                  type: "objects.reordered.batch",
                  payload: {
                    parentId: potentialParent,
                    reorders: reorderItems,
                  },
                });
              }

              // Dispatch individual reparenting events (these need individual processing)
              reparentItems.forEach((item) => {
                // Check if this object should restore original absolute positioning
                const originalParent = originalParents[item.objectId];
                const wasOriginallyAbsolute =
                  originalAbsolutePositioning[item.objectId];
                const shouldRestoreAbsolute =
                  potentialParent === originalParent && wasOriginallyAbsolute;

                dispatch({
                  type: "object.reparented.withCoordinates",
                  payload: {
                    objectId: item.objectId,
                    newParentId: potentialParent,
                    previousParentId: item.previousParentId,
                    newIndex: item.newIndex,
                    previousIndex: 0,
                    newPosition: item.newRelativePosition,
                    previousPosition: item.previousPosition,
                    // Pass original drag state for smart absolute positioning
                    originalParentId: originalParent,
                    wasOriginallyAbsolute: wasOriginallyAbsolute,
                    shouldRestoreAbsolute: shouldRestoreAbsolute,
                    // This is final drop reparenting, not live
                    isLiveReparenting: false,
                  },
                });
              });
            }

            // Handle external items - use drag positions for final placement
            externalItems.forEach((objectId) => {
              const object = objects[objectId];
              if (
                object &&
                isValidReparenting(objectId, potentialParent, objects)
              ) {
                const newRelativePosition = convertToParentSpace(
                  dragCurrentPositions[objectId] || {
                    x: object.x,
                    y: object.y,
                  },
                  potentialParent,
                  objects
                );

                // Check if this object should restore original absolute positioning
                const originalParent = originalParents[objectId];
                const wasOriginallyAbsolute =
                  originalAbsolutePositioning[objectId];
                const shouldRestoreAbsolute =
                  potentialParent === originalParent && wasOriginallyAbsolute;

                dispatch({
                  type: "object.reparented.withCoordinates",
                  payload: {
                    objectId: objectId,
                    newParentId: potentialParent,
                    previousParentId: object.parentId,
                    newIndex: placeholderBasedInsertions[objectId] || 0,
                    previousIndex: 0,
                    newPosition: {
                      x: newRelativePosition.x,
                      y: newRelativePosition.y,
                    },
                    previousPosition: {
                      x: object.x,
                      y: object.y,
                    },
                    // Pass original drag state for smart absolute positioning
                    originalParentId: originalParent,
                    wasOriginallyAbsolute: wasOriginallyAbsolute,
                    shouldRestoreAbsolute: shouldRestoreAbsolute,
                    // This is final drop reparenting, not live
                    isLiveReparenting: false,
                  },
                });
              }
            });

            // Don't apply regular movement for auto layout reparented objects
            const autoLayoutReparentedIds = new Set(draggedObjectIds);
            const filteredNonReparentedIds = nonReparentedObjectIds.filter(
              (id) => !autoLayoutReparentedIds.has(id)
            );

            const filteredMovedObjects =
              filteredNonReparentedIds.length > 0 &&
              hasActualDragMovement &&
              (Math.abs(deltaX) > 0.1 || Math.abs(deltaY) > 0.1)
                ? {
                    objectIds: filteredNonReparentedIds,
                    deltaX: Math.round(deltaX),
                    deltaY: Math.round(deltaY),
                  }
                : null;

            // Apply remaining movements if any
            if (reparentedUpdates.length > 0 || filteredMovedObjects) {
              dispatch({
                type: "drag.completed",
                payload: {
                  reparentedUpdates,
                  movedObjects: filteredMovedObjects,
                },
              });
            }

            // Clean up and exit early since we handled auto layout reparenting
            // IMPORTANT: Clear auto-layout state first to prevent transitional rendering issues
            setDraggedAutoLayoutChildren({});
            setAutoLayoutPlaceholderPositions({});

            // Re-enable observer syncs that were paused during drag
            AutoLayoutObserverAPI.enableSync();

            setIsDragging(false);
            setDragStartPoint(null);
            setDraggedObjectIds([]);
            setDragStartPositions({});
            setDragCurrentPositions({});
            setPotentialParent(undefined);
            setOverlayParent(undefined);
            setCurrentParents({});
            setOriginalParents({});
            setOriginalAbsolutePositioning({});
            setLiveReparentedObjects(new Set());
            setHasLeftOriginalParent(false);
            setCurrentMouseWorldPosition(null);
            setIsHoveringAutoLayout(false);

            // Clear snap guides
            useAppStore.getState().clearSnapGuides();

            // Clear duplication state (CRITICAL - was missing!)
            setIsDuplicating(false);
            setDuplicatedObjectIds([]);
            setOriginalDragObjectIds([]);
            setOriginalDragStartPositions({});
            setOriginalDragParents({});
            setLastValidParent(null);

            // Clear completion flag
            isCompletingDragRef.current = false;

            // Clear Option state to prevent phantom duplication on next click
            // This will be restored if user immediately starts another drag with Option held
            setIsOptionPressed(false);

            onDragStateChange?.({}, false);
            return;
          }
        }

        // Handle reordering within the same auto layout parent
        const reorderUpdates: Array<{
          objectId: string;
          parentId: string;
          newIndex: number;
          previousIndex: number;
        }> = [];

        // Check for auto layout children that may need reordering in their original parent
        Object.keys(draggedAutoLayoutChildren).forEach((objectId) => {
          const autoLayoutChildInfo = draggedAutoLayoutChildren[objectId];
          const currentObject = objects[objectId];

          if (currentObject && autoLayoutChildInfo) {
            const originalParentId = autoLayoutChildInfo.parentId;
            const currentParentId = currentObject.parentId;

            // Only handle reordering if the object stayed in its original auto layout parent
            if (originalParentId === currentParentId && originalParentId) {
              const placeholder = autoLayoutPlaceholderPositions[objectId];

              if (placeholder && placeholder.parentId === originalParentId) {
                const newIndex = placeholder.insertionIndex;
                const originalIndex = autoLayoutChildInfo.originalIndex;

                // Only dispatch reorder if the index actually changed
                if (newIndex !== originalIndex) {
                  reorderUpdates.push({
                    objectId,
                    parentId: originalParentId,
                    newIndex,
                    previousIndex: originalIndex,
                  });
                }
              }
            }
          }
        });

        // Dispatch reorder events if any
        if (reorderUpdates.length > 0) {
          reorderUpdates.forEach((update) => {
            dispatch({
              type: "object.reordered",
              payload: update,
            });
          });
        }

        // For duplicates with corrected positions, update their store position to match visual position
        // before dragCurrentPositions is cleared
        if (isDuplicating) {
          duplicatedObjectIds.forEach((objectId) => {
            const initialOffset = duplicateInitialOffsetsRef.current[objectId];
            const visualPosition = dragCurrentPositions[objectId];
            if (initialOffset && currentMouseWorldPosition && visualPosition) {
              const storeObject = objects[objectId];
              if (storeObject) {
                // Convert the visual position to relative coordinates for the store
                const relativePosition = storeObject.parentId
                  ? convertToParentSpace(
                      visualPosition,
                      storeObject.parentId,
                      objects
                    )
                  : visualPosition;

                dispatch({
                  type: "object.updated",
                  payload: {
                    id: objectId,
                    changes: {
                      x: relativePosition.x,
                      y: relativePosition.y,
                    },
                  },
                });
              }
            }
          });
        }

        // Dispatch a single batched event for all final position updates
        if (reparentedUpdates.length > 0 || movedObjects) {
          dispatch({
            type: "drag.completed",
            payload: {
              reparentedUpdates,
              movedObjects,
            },
          });
        }

        // After drag completion, sync positions for any auto layout frames that might contain moved objects
        setTimeout(() => {
          const autoLayoutFramesToSync = new Set<string>();

          // Check all dragged objects to find auto layout parent frames
          draggedObjectIds.forEach((objectId) => {
            const obj = objects[objectId];
            if (obj?.parentId) {
              const parentObj = objects[obj.parentId];
              if (
                parentObj?.type === "frame" &&
                parentObj.properties?.type === "frame" &&
                parentObj.properties.autoLayout?.mode !== "none"
              ) {
                autoLayoutFramesToSync.add(obj.parentId);
              }
            }
          });

          // Sync positions for all affected auto layout frames
          autoLayoutFramesToSync.forEach((frameId) => {
            const freshState = useAppStore.getState();
            syncAutoLayoutPositionsFromDOM(
              frameId,
              freshState.objects,
              freshState.viewport,
              dispatch
            );
          });
        }, 0); // Use setTimeout to ensure DOM has updated
      }

      // Reset all drag state - IMPORTANT: Clear auto-layout state first to prevent transitional rendering issues
      setDraggedAutoLayoutChildren({});
      setAutoLayoutPlaceholderPositions({});

      // Re-enable observer syncs that were paused during drag
      AutoLayoutObserverAPI.enableSync();

      setIsDragging(false);
      setDragStartPoint(null);
      setDraggedObjectIds([]);
      setDragStartPositions({});
      setDragCurrentPositions({});
      setPotentialParent(undefined);
      setCurrentParents({});
      setOriginalParents({});
      setOriginalAbsolutePositioning({});
      setLiveReparentedObjects(new Set());
      setOverlayParent(undefined);
      setHasLeftOriginalParent(false);

      // Clear snap guides
      useAppStore.getState().clearSnapGuides();

      // Clear duplication state
      setIsDuplicating(false);
      setDuplicatedObjectIds([]);
      setOriginalDragObjectIds([]);
      setOriginalDragStartPositions({});
      setOriginalDragParents({});
      setLastValidParent(null);

      // Clear completion flag
      isCompletingDragRef.current = false;

      // Clear Option state to prevent phantom duplication on next click
      // This will be restored if user immediately starts another drag with Option held
      setIsOptionPressed(false);

      onDragStateChange?.({}, false);
    },
    [
      isDragging,
      draggedObjectIds,
      dragStartPoint,
      canvasRef,
      viewport,
      dispatch,
      onDragStateChange,
      liveReparentedObjects,
      objects,
      dragCurrentPositions,
      originalParents,
      potentialParent,
      overlayParent,
      currentParents,
      hasLeftOriginalParent,
    ]
  );

  // Cancel drag operation - resets all drag state
  const cancelDrag = useCallback(() => {
    // IMPORTANT: Clear auto-layout state first to prevent transitional rendering issues
    setDraggedAutoLayoutChildren({});
    setAutoLayoutPlaceholderPositions({});

    // Re-enable observer syncs that were paused during drag
    AutoLayoutObserverAPI.enableSync();

    setIsDragging(false);
    setDragStartPoint(null);
    setDraggedObjectIds([]);
    setDragStartPositions({});
    setDragCurrentPositions({});
    setPotentialParent(undefined);
    setOverlayParent(undefined);
    setCurrentParents({});
    setOriginalParents({});
    setOriginalAbsolutePositioning({});
    setLiveReparentedObjects(new Set());
    setHasLeftOriginalParent(false);
    setCurrentMouseWorldPosition(null);
    setIsHoveringAutoLayout(false);

    // Clear duplication state
    setIsDuplicating(false);
    setDuplicatedObjectIds([]);
    setOriginalDragObjectIds([]);
    setOriginalDragStartPositions({});
    setOriginalDragParents({});
    setLastValidParent(null);

    // Notify parent component
    onDragStateChange?.({}, false);
  }, [onDragStateChange]);

  // Track previous CMD state to detect actual changes
  const prevCmdPressedRef = useRef(isCmdPressed);

  // Re-evaluate potential parent ONLY when CMD state actually changes during active drag
  useEffect(() => {
    // Only run if CMD state actually changed
    const cmdStateChanged = prevCmdPressedRef.current !== isCmdPressed;
    prevCmdPressedRef.current = isCmdPressed;

    if (
      cmdStateChanged &&
      isDragging &&
      currentMouseWorldPosition &&
      draggedObjectIds.length > 0
    ) {
      // Special handling when CMD is released - force auto layout children back to original parents
      if (!isCmdPressed && !cmdReleaseProcessedRef.current) {
        // Check if any dragged items are auto layout children that should return home
        const shouldReturnHome = draggedObjectIds.some((objectId) => {
          const autoLayoutInfo = draggedAutoLayoutChildren[objectId];
          if (autoLayoutInfo) {
            const currentParentFromState = currentParents[objectId];
            const currentParentFromObject = objects[objectId]?.parentId;
            const originalParent = autoLayoutInfo.parentId;

            // Use the most up-to-date parent info
            const actualCurrentParent =
              currentParentFromObject || currentParentFromState;

            // Should return if currently nested somewhere other than original parent
            return actualCurrentParent !== originalParent;
          }
          return false;
        });

        if (shouldReturnHome) {
          // Mark as processed to prevent infinite loops
          cmdReleaseProcessedRef.current = true;

          // For auto layout children, force them back to their original parent
          draggedObjectIds.forEach((objectId) => {
            const autoLayoutInfo = draggedAutoLayoutChildren[objectId];
            if (autoLayoutInfo) {
              const originalParentId = autoLayoutInfo.parentId;

              handleLiveReparenting([objectId], originalParentId);
            }
          });

          // Force potential parent to be the original parent to prevent re-nesting
          const firstAutoLayoutChild = draggedObjectIds.find(
            (id) => draggedAutoLayoutChildren[id]
          );
          if (firstAutoLayoutChild) {
            const originalParentId =
              draggedAutoLayoutChildren[firstAutoLayoutChild].parentId;
            setPotentialParent(originalParentId);
            setIsHoveringAutoLayout(true); // Original parent is auto layout
          }
          return; // Skip normal detection logic
        }
      }

      // Reset the processed flag when CMD is pressed
      if (isCmdPressed) {
        cmdReleaseProcessedRef.current = false;
      }

      // During duplication mode, exclude both dragged objects AND originals to prevent circular reparenting
      const excludeIds = isDuplicating
        ? [...draggedObjectIds, ...originalDragObjectIds]
        : draggedObjectIds;

      const rawNewPotentialParent = detectPotentialParent(
        currentMouseWorldPosition,
        excludeIds
      );
      const newPotentialParent = rawNewPotentialParent ?? undefined;
      const nestingBlockedByCmd = rawNewPotentialParent === undefined;

      setPotentialParent(newPotentialParent);

      // Update auto layout hover state
      const newParent = newPotentialParent ? objects[newPotentialParent] : null;
      const hasAutoLayout =
        newParent?.type === "frame" &&
        newParent.properties?.type === "frame" &&
        newParent.properties.autoLayout?.mode !== "none";
      setIsHoveringAutoLayout(hasAutoLayout || false);

      // Handle CMD state changes for auto layout children
      const currentParentId = Object.values(currentParents)[0] || undefined;

      // Normal reparenting logic for other cases
      if (newPotentialParent !== currentParentId) {
        // Only perform live reparenting if nesting is actually allowed
        // This prevents the CMD reactive effect from bypassing sibling prevention
        if (!nestingBlockedByCmd) {
          handleLiveReparenting(draggedObjectIds, newPotentialParent);
        }
      }
    }
  }, [isCmdPressed]); // Only depend on CMD state - all other values are captured from current state

  return {
    // State
    isDragging,
    dragStartPoint,
    draggedObjectIds,
    dragCurrentPositions,
    potentialParent: overlayParent, // Return overlay parent for display
    currentMouseWorldPosition,
    isHoveringAutoLayout,
    draggedAutoLayoutChildren,
    autoLayoutPlaceholderPositions,
    isCmdPressed, // Add CMD state for conditional rendering
    isOptionPressed, // Add Option/Alt state for duplication
    isDuplicating, // Add duplication state
    duplicatedObjectIds, // Add duplicated object IDs

    // Actions
    startDrag,
    handlePointerMove,
    completeDrag,
    cancelDrag,

    // Getters - use useMemo to prevent recalculation on every render
    hasActiveDrag: useMemo(() => {
      return dragStartPoint !== null && draggedObjectIds.length > 0;
    }, [dragStartPoint, draggedObjectIds.length]),
  };
}
