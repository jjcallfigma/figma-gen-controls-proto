import { getVisualBounds } from "@/core/utils/coordinates";
import { CanvasObject } from "@/types/canvas";
import { getAbsolutePosition } from "./coordinates";

/**
 * Check if one object is an ancestor of another
 */
export function isAncestor(
  potentialAncestorId: string,
  objectId: string,
  objects: Record<string, CanvasObject>
): boolean {
  let currentParentId = objects[objectId]?.parentId;

  while (currentParentId) {
    if (currentParentId === potentialAncestorId) {
      return true;
    }
    currentParentId = objects[currentParentId]?.parentId;
  }

  return false;
}

/**
 * Check if one object is a descendant of another
 */
export function isDescendant(
  potentialDescendantId: string,
  objectId: string,
  objects: Record<string, CanvasObject>
): boolean {
  return isAncestor(objectId, potentialDescendantId, objects);
}

/**
 * Get all descendants of an object (children, grandchildren, etc.)
 * Returns a flat array of all descendant IDs
 */
export function getAllDescendants(
  objectId: string,
  objects: Record<string, CanvasObject>
): string[] {
  const descendants: string[] = [];
  const object = objects[objectId];

  if (!object || !object.childIds) return descendants;

  object.childIds.forEach((childId) => {
    descendants.push(childId);
    // Recursively get grandchildren
    descendants.push(...getAllDescendants(childId, objects));
  });

  return descendants;
}

/**
 * Get all descendants for multiple objects
 * Useful for getting all excluded IDs during drag operations
 */
export function getAllDescendantsForObjects(
  objectIds: string[],
  objects: Record<string, CanvasObject>
): string[] {
  const allDescendants: string[] = [];

  objectIds.forEach((objectId) => {
    allDescendants.push(...getAllDescendants(objectId, objects));
  });

  return allDescendants;
}

/**
 * Check if reparenting would create a circular hierarchy
 * Returns true if the operation is safe, false if it would create a cycle
 */
export function isValidReparenting(
  objectId: string,
  newParentId: string | undefined,
  objects: Record<string, CanvasObject>
): boolean {
  // Can't reparent to self
  if (objectId === newParentId) return false;

  // Can't reparent to undefined (root level is always valid)
  if (!newParentId) return true;

  // Can't reparent to own descendant (would create cycle)
  return !isDescendant(newParentId, objectId, objects);
}

/**
 * Filter out ancestor/descendant relationships from selection.
 * Keeps the last selected object when conflicts arise.
 */
export function filterAncestorDescendantConflicts(
  newSelectionIds: string[],
  objects: Record<string, CanvasObject>
): string[] {
  const filtered: string[] = [];

  // Process in reverse order to prioritize last selected
  for (let i = newSelectionIds.length - 1; i >= 0; i--) {
    const currentId = newSelectionIds[i];
    let hasConflict = false;

    // Check if this object conflicts with any already added object
    for (const existingId of filtered) {
      if (
        isAncestor(currentId, existingId, objects) ||
        isDescendant(currentId, existingId, objects)
      ) {
        hasConflict = true;
        break;
      }
    }

    if (!hasConflict) {
      filtered.unshift(currentId); // Add to beginning to maintain order
    }
  }

  return filtered;
}

/**
 * Group selected objects by their parent for unified selection boxes
 */
export function groupSelectionsByParent(
  selectedIds: string[],
  objects: Record<string, CanvasObject>
): Record<string, string[]> {
  const groups: Record<string, string[]> = {};

  selectedIds.forEach((id) => {
    const object = objects[id];
    if (object) {
      const parentKey = object.parentId || "root";
      if (!groups[parentKey]) {
        groups[parentKey] = [];
      }
      groups[parentKey].push(id);
    }
  });

  return groups;
}

/**
 * Calculate bounding box for a group of objects using absolute world coordinates
 */
export function calculateGroupBounds(
  objectIds: string[],
  objects: Record<string, CanvasObject>,
  dragPositions?: Record<string, { x: number; y: number }>
): { x: number; y: number; width: number; height: number } {
  if (objectIds.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  objectIds.forEach((id) => {
    const object = objects[id];
    if (object) {
      // Get visual bounds including borders and styling
      const visualBounds = getVisualBounds(id, objects, dragPositions?.[id]);

      const left = visualBounds.x;
      const top = visualBounds.y;
      const right = left + visualBounds.width;
      const bottom = top + visualBounds.height;

      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, right);
      maxY = Math.max(maxY, bottom);
    }
  });

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculate bounding box for a group of objects using DOM positions for auto layout children
 * This ensures accurate selection boxes during resize operations
 */
export function calculateGroupBoundsWithDOM(
  objectIds: string[],
  objects: Record<string, CanvasObject>,
  viewport: any,
  dragPositions?: Record<string, { x: number; y: number }>
): { x: number; y: number; width: number; height: number } {
  if (objectIds.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  let domQueryFailed = false;

  objectIds.forEach((id) => {
    const object = objects[id];
    if (object) {
      try {
        // Import getVisualBoundsFromDOM dynamically to avoid circular imports
        const { getVisualBoundsFromDOM } = require("@/core/utils/coordinates");

        // Get visual bounds using DOM positions for auto layout children
        const visualBounds = getVisualBoundsFromDOM(
          id,
          objects,
          viewport,
          dragPositions?.[id]
        );

        const left = visualBounds.x;
        const top = visualBounds.y;
        const right = left + visualBounds.width;
        const bottom = top + visualBounds.height;

        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, right);
        maxY = Math.max(maxY, bottom);
      } catch (error) {
        domQueryFailed = true;
        // Fallback to state bounds
        const left = dragPositions?.[id]?.x ?? object.x;
        const top = dragPositions?.[id]?.y ?? object.y;
        const right = left + object.width;
        const bottom = top + object.height;

        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, right);
        maxY = Math.max(maxY, bottom);
      }
    }
  });

  // If DOM queries failed, try again in next frame for better responsiveness
  if (domQueryFailed) {
    requestAnimationFrame(() => {
      // Trigger a re-render to pick up updated DOM positions
      const event = new CustomEvent("al-bounds-update");
      window.dispatchEvent(event);
    });
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Check if a screen point is inside any of the selection boxes
 * @param screenPoint - Point in screen coordinates
 * @param selectedIds - Currently selected object IDs
 * @param objects - Object data
 * @param viewport - Current viewport state
 * @param objectUnderMouse - The object actually under the mouse (if any)
 * @returns The ID of the selected object whose selection box was hit, or null if should allow normal selection
 */
export function getSelectionBoxHit(
  screenPoint: { x: number; y: number },
  selectedIds: string[],
  objects: Record<string, CanvasObject>,
  viewport: { zoom: number; panX: number; panY: number },
  objectUnderMouse: CanvasObject | null = null
): string | null {
  // Check each selected object's bounds in screen space
  for (const objectId of selectedIds) {
    const object = objects[objectId];
    if (!object) continue;

    // Get object bounds in world space
    const bounds = getVisualBounds(objectId, objects);

    // Convert to screen space
    const screenBounds = {
      left: bounds.x * viewport.zoom + viewport.panX,
      top: bounds.y * viewport.zoom + viewport.panY,
      right: (bounds.x + bounds.width) * viewport.zoom + viewport.panX,
      bottom: (bounds.y + bounds.height) * viewport.zoom + viewport.panY,
    };

    // Check if point is inside this selection box
    if (
      screenPoint.x >= screenBounds.left &&
      screenPoint.x <= screenBounds.right &&
      screenPoint.y >= screenBounds.top &&
      screenPoint.y <= screenBounds.bottom
    ) {
      // If there's an object under the mouse that's different from this selection box,
      // it means we're clicking on a child - so allow normal selection
      if (objectUnderMouse && objectUnderMouse.id !== objectId) {
        return null; // Allow normal selection to select the child
      }

      return objectId;
    }
  }

  return null;
}

/**
 * Get the generation depth of an object (how many levels deep from root)
 * Root level = 0, direct children = 1, grandchildren = 2, etc.
 */
export function getObjectGenerationDepth(
  objectId: string,
  objects: Record<string, CanvasObject>
): number {
  let depth = 0;
  let currentParentId = objects[objectId]?.parentId;

  while (currentParentId) {
    depth++;
    currentParentId = objects[currentParentId]?.parentId;
  }

  return depth;
}

/**
 * Find all objects that intersect with a selection region
 * With sophisticated frame handling and depth limiting:
 * - Without CMD: Only select up to 2nd generation objects (depth < 3)
 * - With frames: Select parent if fully covered, dive into children if partially covered
 * - With CMD: Select highest depth (topmost) objects fully contained
 * - Filters out parent/child conflicts
 */
export function findObjectsInRegion(
  regionBounds: { x: number; y: number; width: number; height: number },
  allObjects: Record<string, CanvasObject>,
  options: {
    selectionMode?: "intersect" | "contain";
    cmdPressed?: boolean;
  } = {}
): string[] {
  const { selectionMode = "intersect", cmdPressed = false } = options;
  const selectedIds: string[] = [];
  const processedIds = new Set<string>(); // Track which objects we've already processed

  // Find root objects (objects with no parent)
  const rootObjects = Object.entries(allObjects).filter(
    ([id, obj]) => !obj.parentId
  );

  // Process each root object recursively
  function processObjectHierarchy(
    objectId: string,
    obj: CanvasObject,
    currentDepth: number = 0
  ): boolean {
    if (!obj.visible || obj.locked || processedIds.has(objectId)) {
      return false;
    }

    // Check depth limit - depth 2+ objects only selectable with CMD (they should select depth 1 parent)
    // currentDepth: 0=depth0, 1=depth1, 2=depth2+
    if (!cmdPressed && currentDepth >= 2) {
      return false;
    }

    const absolutePos = getAbsolutePosition(objectId, allObjects);
    const objBounds = {
      x: absolutePos.x,
      y: absolutePos.y,
      width: obj.width,
      height: obj.height,
    };

    // Check if object intersects or is contained
    const intersects = doesObjectIntersectRegion(objBounds, regionBounds);
    const contained = isObjectContainedInRegion(objBounds, regionBounds);

    if (!intersects) return false; // No intersection at all

    // Handle frames with children using sophisticated hierarchy rules
    if (obj.type === "frame" && obj.childIds.length > 0) {
      if (contained) {
        if (cmdPressed) {
          selectedIds.push(objectId);
          processedIds.add(objectId);

          obj.childIds.forEach((childId) => {
            const child = allObjects[childId];
            if (child) {
              processObjectHierarchy(childId, child, currentDepth + 1);
            }
          });

          return true;
        } else {
          // Regular region: Select the frame itself
          selectedIds.push(objectId);
          processedIds.add(objectId);
          // Mark all descendants as processed to avoid double-selection
          markDescendantsAsProcessed(objectId, obj);
          return true;
        }
      } else {
        if (cmdPressed) {
          let anyChildSelected = false;
          obj.childIds.forEach((childId) => {
            const child = allObjects[childId];
            if (child) {
              const childSelected = processObjectHierarchy(
                childId,
                child,
                currentDepth + 1
              );
              if (childSelected) {
                anyChildSelected = true;
              }
            }
          });

          processedIds.add(objectId);
          return anyChildSelected;
        }

        // Regular region: Handle partially intersecting frames
        // For 2nd generation frames (depth 1), select the frame itself (don't dive into children)
        // For 1st generation frames (depth 0), dive into children for more precise selection
        if (currentDepth === 1) {
          // 2nd generation frame - select it directly when partially covered (without CMD)
          selectedIds.push(objectId);
          processedIds.add(objectId);
          // Mark all descendants as processed to avoid double-selection
          markDescendantsAsProcessed(objectId, obj);
          return true;
        } else {
          // 1st generation frame - dive into children for more precise selection
          let anyChildSelected = false;

          obj.childIds.forEach((childId) => {
            const child = allObjects[childId];
            if (child) {
              const childSelected = processObjectHierarchy(
                childId,
                child,
                currentDepth + 1
              );
              if (childSelected) {
                anyChildSelected = true;
              }
            }
          });

          processedIds.add(objectId);
          return anyChildSelected;
        }
      }
    } else {
      // Regular object (not a frame with children)
      const shouldSelect = cmdPressed ? contained : intersects;

      if (shouldSelect) {
        selectedIds.push(objectId);
        processedIds.add(objectId);
        return true;
      }

      return false;
    }
  }

  // Helper function to mark all descendants as processed
  function markDescendantsAsProcessed(objectId: string, obj: CanvasObject) {
    obj.childIds.forEach((childId) => {
      processedIds.add(childId);
      const child = allObjects[childId];
      if (child && child.childIds.length > 0) {
        markDescendantsAsProcessed(childId, child);
      }
    });
  }

  // Process all root objects
  rootObjects.forEach(([id, obj]) => {
    processObjectHierarchy(id, obj, 0);
  });

  // Special post-processing for CMD+region: Select only the topmost (lowest depth) fully contained objects
  let finalSelection = selectedIds;
  if (cmdPressed) {
    finalSelection = selectedIds.filter((objectId) => {
      const obj = allObjects[objectId];
      if (!obj) return false;

      let currentParentId = obj.parentId;
      while (currentParentId) {
        if (selectedIds.includes(currentParentId)) {
          return false;
        }
        const parent = allObjects[currentParentId];
        if (!parent) break;
        currentParentId = parent.parentId;
      }

      return true;
    });
  }

  // Filter out parent/child conflicts using the same logic as other selection mechanisms
  const filteredSelection = filterAncestorDescendantConflicts(
    finalSelection,
    allObjects
  );
  return filteredSelection;
}

/**
 * Check if an object intersects with the selection region
 */
function doesObjectIntersectRegion(
  objBounds: { x: number; y: number; width: number; height: number },
  regionBounds: { x: number; y: number; width: number; height: number }
): boolean {
  const objLeft = objBounds.x;
  const objTop = objBounds.y;
  const objRight = objBounds.x + objBounds.width;
  const objBottom = objBounds.y + objBounds.height;

  const regionLeft = regionBounds.x;
  const regionTop = regionBounds.y;
  const regionRight = regionBounds.x + regionBounds.width;
  const regionBottom = regionBounds.y + regionBounds.height;

  return !(
    objRight < regionLeft ||
    objLeft > regionRight ||
    objBottom < regionTop ||
    objTop > regionBottom
  );
}

/**
 * Check if an object is completely contained within the selection region
 */
function isObjectContainedInRegion(
  objBounds: { x: number; y: number; width: number; height: number },
  regionBounds: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    objBounds.x >= regionBounds.x &&
    objBounds.y >= regionBounds.y &&
    objBounds.x + objBounds.width <= regionBounds.x + regionBounds.width &&
    objBounds.y + objBounds.height <= regionBounds.y + regionBounds.height
  );
}
