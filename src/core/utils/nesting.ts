import { CanvasObject } from "@/types/canvas";

/**
 * Find the most appropriate parent frame for a new object based on its position
 * Returns the deepest nested frame that completely contains the object
 * This ensures objects are nested in the most specific containing frame
 */
export function findParentFrame(
  objectBounds: { x: number; y: number; width: number; height: number },
  allObjects: Record<string, CanvasObject>
): string | undefined {
  const candidateFrames: Array<{
    id: string;
    frame: CanvasObject;
    depth: number;
  }> = [];

  // Find all frames that completely contain the object
  Object.entries(allObjects).forEach(([id, obj]) => {
    if (obj.type === "frame" && obj.visible && !obj.locked) {
      // Get absolute position of the frame
      const absolutePos = getAbsolutePosition(id, allObjects);

      const frameLeft = absolutePos.x;
      const frameTop = absolutePos.y;
      const frameRight = absolutePos.x + obj.width;
      const frameBottom = absolutePos.y + obj.height;

      const objectLeft = objectBounds.x;
      const objectTop = objectBounds.y;
      const objectRight = objectBounds.x + objectBounds.width;
      const objectBottom = objectBounds.y + objectBounds.height;

      // Check if frame completely contains the object
      const isContained =
        frameLeft <= objectLeft &&
        frameTop <= objectTop &&
        frameRight >= objectRight &&
        frameBottom >= objectBottom;

      if (isContained) {
        // Calculate nesting depth (how deep this frame is in the hierarchy)
        const depth = calculateFrameDepth(id, allObjects);

        candidateFrames.push({ id, frame: obj, depth });
      }
    }
  });

  // If no containing frames found, return undefined (top-level)
  if (candidateFrames.length === 0) {
    return undefined;
  }

  // Return the frame with the largest depth (deepest nested/most specific)
  candidateFrames.sort((a, b) => b.depth - a.depth);
  const selectedFrame = candidateFrames[0];

  return selectedFrame.id;
}

/**
 * Calculate how deep a frame is in the nesting hierarchy
 * 0 = top-level frame, 1 = nested one level, etc.
 */
function calculateFrameDepth(
  frameId: string,
  allObjects: Record<string, CanvasObject>
): number {
  let depth = 0;
  let currentId = frameId;

  while (true) {
    const obj = allObjects[currentId];
    if (!obj || !obj.parentId) break;

    const parent = allObjects[obj.parentId];
    if (!parent) break;

    if (parent.type === "frame") {
      depth++;
    }

    currentId = obj.parentId;
  }

  return depth;
}

/**
 * Get absolute position of an object (same as in coordinates.ts but needed here to avoid circular imports)
 */
function getAbsolutePosition(
  objectId: string,
  objects: Record<string, CanvasObject>
): { x: number; y: number } {
  const object = objects[objectId];
  if (!object) {
    return { x: 0, y: 0 };
  }

  let absoluteX = object.x;
  let absoluteY = object.y;

  // Walk up the parent chain
  let currentParentId = object.parentId;
  while (currentParentId) {
    const parent = objects[currentParentId];
    if (!parent) break;

    // Add parent's position
    absoluteX += parent.x;
    absoluteY += parent.y;

    // Note: Strokes are now rendered as separate layers (StrokeLayer)
    // and don't affect child positioning, so no border offset needed

    currentParentId = parent.parentId;
  }

  return { x: absoluteX, y: absoluteY };
}

/**
 * Convert object coordinates to be relative to its parent frame
 * objectBounds should be in world coordinates
 * Returns coordinates relative to the parent frame's local space
 */
export function convertToRelativeCoordinates(
  objectBounds: { x: number; y: number; width: number; height: number },
  parentFrameId: string | undefined,
  allObjects: Record<string, CanvasObject>
): { x: number; y: number; width: number; height: number } {
  if (!parentFrameId) {
    // No parent, coordinates stay the same (world space)

    return objectBounds;
  }

  const parentFrame = allObjects[parentFrameId];
  if (!parentFrame) {
    return objectBounds;
  }

  // Get the absolute position of the parent frame in world coordinates
  const parentAbsolutePos = getAbsolutePosition(parentFrameId, allObjects);

  // Convert from world coordinates to parent frame's local coordinates
  const relativeCoords = {
    x: objectBounds.x - parentAbsolutePos.x,
    y: objectBounds.y - parentAbsolutePos.y,
    width: objectBounds.width,
    height: objectBounds.height,
  };

  return relativeCoords;
}

/**
 * Update parent frame's children list when adding a new child
 */
export function addChildToParent(
  childId: string,
  parentId: string | undefined,
  allObjects: Record<string, CanvasObject>
): void {
  if (!parentId) return;

  const parent = allObjects[parentId];
  const child = allObjects[childId];

  if (parent && parent.type === "frame" && child) {
    if (!parent.childIds.includes(childId)) {
      parent.childIds.push(childId);

      // If parent is an auto layout frame, assign autoLayoutOrder to the child
      const hasAutoLayout =
        parent.properties?.type === "frame" &&
        parent.properties.autoLayout?.mode !== "none";

      if (hasAutoLayout) {
        // Assign order based on current position in childIds array
        const orderIndex = parent.childIds.length - 1;
        child.autoLayoutOrder = orderIndex;
      }
    }
  }
}

/**
 * Initialize autoLayoutOrder for all children of auto layout frames
 * This is useful for migrating existing objects to use the order system
 */
export function initializeAutoLayoutOrders(
  allObjects: Record<string, CanvasObject>
): void {
  Object.values(allObjects).forEach((object) => {
    if (
      object.type === "frame" &&
      object.properties?.type === "frame" &&
      object.properties.autoLayout?.mode !== "none"
    ) {
      // This is an auto layout frame - assign orders to its children
      object.childIds.forEach((childId, index) => {
        const child = allObjects[childId];
        if (child && child.autoLayoutOrder === undefined) {
          child.autoLayoutOrder = index;
        }
      });
    }
  });
}
