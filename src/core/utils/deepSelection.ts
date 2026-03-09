import type { CanvasObject } from "@/types/canvas";

/**
 * Deep selection utilities for navigating object hierarchy
 */

/**
 * Calculate the depth of an object in the hierarchy
 */
function getObjectDepth(
  objectId: string,
  objects: Record<string, CanvasObject>
): number {
  let depth = 0;
  let currentObj = objects[objectId];

  while (currentObj && currentObj.parentId) {
    depth++;
    currentObj = objects[currentObj.parentId];
  }

  return depth;
}

export interface DeepSelectionState {
  depth: number;
  rootObjectId: string;
  lastClickPosition: { x: number; y: number };
  timestamp: number;
}

/**
 * Find all objects at a given screen position, ordered by depth (deepest first)
 */
export function findObjectsAtPosition(
  objects: Record<string, CanvasObject>,
  screenX: number,
  screenY: number
): CanvasObject[] {
  const foundObjects: CanvasObject[] = [];

  // Get DOM elements at the click position
  const elementsAtPoint = document.elementsFromPoint(screenX, screenY);

  for (const element of elementsAtPoint) {
    const objectId = element.getAttribute("data-object-id");
    if (objectId && objects[objectId]) {
      const obj = objects[objectId];
      // Avoid duplicates
      if (!foundObjects.find((o) => o.id === objectId)) {
        foundObjects.push(obj);
      }
    }
  }

  return foundObjects;
}

/**
 * Get the direct children of an object that are at the given position
 */
export function getChildrenAtPosition(
  objects: Record<string, CanvasObject>,
  parentId: string,
  screenX: number,
  screenY: number
): CanvasObject[] {
  const parent = objects[parentId];
  if (!parent || !parent.childIds.length) {
    return [];
  }

  const allObjectsAtPosition = findObjectsAtPosition(objects, screenX, screenY);

  // Filter to only direct children
  return allObjectsAtPosition.filter((obj) => parent.childIds.includes(obj.id));
}

/**
 * Get the topmost child at a specific depth relative to a root object
 */
export function getChildAtDepth(
  objects: Record<string, CanvasObject>,
  rootId: string,
  targetDepth: number,
  screenX: number,
  screenY: number
): CanvasObject | null {
  if (targetDepth === 0) {
    return objects[rootId] || null;
  }

  let currentObjects = [objects[rootId]];

  for (let depth = 1; depth <= targetDepth; depth++) {
    const nextLevelObjects: CanvasObject[] = [];

    for (const currentObj of currentObjects) {
      if (!currentObj || !currentObj.childIds.length) continue;

      const childrenAtPosition = getChildrenAtPosition(
        objects,
        currentObj.id,
        screenX,
        screenY
      );

      nextLevelObjects.push(...childrenAtPosition);
    }

    if (nextLevelObjects.length === 0) {
      return null; // No children at this depth
    }

    if (depth === targetDepth) {
      // Return the first (topmost) child at target depth
      return nextLevelObjects[0];
    }

    currentObjects = nextLevelObjects;
  }

  return null;
}

/**
 * Get all siblings of the given objects
 */
export function getSiblingsOfObjects(
  objects: Record<string, CanvasObject>,
  objectIds: string[]
): string[] {
  const siblings = new Set<string>();

  for (const objectId of objectIds) {
    const obj = objects[objectId];
    if (!obj) continue;

    if (obj.parentId) {
      // Object has a parent - get all siblings
      const parent = objects[obj.parentId];
      if (parent) {
        parent.childIds.forEach((childId) => {
          if (childId !== objectId) {
            siblings.add(childId);
          }
        });
      }
    } else {
      // Object is top-level - get all other top-level objects
      Object.values(objects).forEach((otherObj) => {
        if (!otherObj.parentId && otherObj.id !== objectId) {
          siblings.add(otherObj.id);
        }
      });
    }
  }

  return Array.from(siblings);
}

/**
 * Check if two positions are close enough to be considered the same click
 */
export function isSameClickPosition(
  pos1: { x: number; y: number },
  pos2: { x: number; y: number },
  threshold: number = 5
): boolean {
  const distance = Math.sqrt(
    Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2)
  );
  return distance <= threshold;
}

/**
 * Determine the next selection for deep selection
 */
export function getNextDeepSelection(
  objects: Record<string, CanvasObject>,
  currentSelection: string[],
  screenX: number,
  screenY: number,
  lastDeepSelection?: DeepSelectionState,
  maxTimeBetweenClicks: number = 500
): {
  selectedIds: string[];
  newDeepSelection?: DeepSelectionState;
} {
  const now = Date.now();
  const clickPosition = { x: screenX, y: screenY };

  // Get objects at position to understand the context
  const objectsAtPosition = findObjectsAtPosition(objects, screenX, screenY);

  // Check if this is a continuation of deep selection
  // We consider it a continuation if:
  // 1. There's a previous deep selection within time limit
  // 2. Clicking in the same position
  // 3. AND we're clicking on objects in the same hierarchy
  let isContinuation = false;
  const timeDiff = lastDeepSelection ? now - lastDeepSelection.timestamp : null;
  const positionCheck = lastDeepSelection
    ? isSameClickPosition(clickPosition, lastDeepSelection.lastClickPosition)
    : false;
  const currentTopLevelObject =
    objectsAtPosition.find((obj) => !obj.parentId) || objectsAtPosition[0];
  const rootObjectMatch =
    lastDeepSelection && currentTopLevelObject
      ? currentTopLevelObject.id === lastDeepSelection.rootObjectId
      : false;

  console.log("🔍 DEEP SELECTION DEBUG: Continuation check", {
    hasLastSelection: !!lastDeepSelection,
    timeDiff,
    timeOk: timeDiff ? timeDiff < maxTimeBetweenClicks : false,
    positionCheck,
    rootObjectMatch,
    currentRoot: currentTopLevelObject?.id,
    lastRoot: lastDeepSelection?.rootObjectId,
  });

  if (
    lastDeepSelection &&
    timeDiff !== null &&
    timeDiff < maxTimeBetweenClicks &&
    positionCheck &&
    rootObjectMatch
  ) {
    isContinuation = true;
  }

  if (isContinuation && lastDeepSelection) {
    console.log(
      "🎯 DEEP SELECTION: Continuing from depth",
      lastDeepSelection.depth
    );

    // Continue deep selection - go one level deeper than last time
    const nextDepth = lastDeepSelection.depth + 1;
    const nextObject = getChildAtDepth(
      objects,
      lastDeepSelection.rootObjectId,
      nextDepth,
      screenX,
      screenY
    );

    if (nextObject) {
      console.log(
        `🎯 DEEP SELECTION: Going to depth ${nextDepth} →`,
        nextObject.name
      );

      return {
        selectedIds: [nextObject.id],
        newDeepSelection: {
          depth: nextDepth,
          rootObjectId: lastDeepSelection.rootObjectId,
          lastClickPosition: clickPosition,
          timestamp: now,
        },
      };
    } else {
      // No deeper child available, cycle back to depth 1
      console.log(
        "🔍 DEEP SELECTION DEBUG: No deeper child, cycling back to depth 1"
      );

      const depth1Object =
        getChildAtDepth(
          objects,
          lastDeepSelection.rootObjectId,
          1,
          screenX,
          screenY
        ) || objects[lastDeepSelection.rootObjectId];

      return {
        selectedIds: [depth1Object.id],
        newDeepSelection: {
          depth: depth1Object.id === lastDeepSelection.rootObjectId ? 0 : 1,
          rootObjectId: lastDeepSelection.rootObjectId,
          lastClickPosition: clickPosition,
          timestamp: now,
        },
      };
    }
  }

  // Start new deep selection
  if (objectsAtPosition.length === 0) {
    return { selectedIds: [] };
  }

  // Find the top-level object (frame) at this position
  const topLevelObject =
    objectsAtPosition.find((obj) => !obj.parentId) ||
    objectsAtPosition[objectsAtPosition.length - 1];

  // First check if we're clicking on a descendant of something selected
  // We prioritize the deepest object (first in array) to determine actual intent
  const deepestObject = objectsAtPosition[0];
  let clickedDescendantOfSelected = null;
  let selectedObjectUnderMouse = null;

  // Check if ANY object at this position is currently selected
  const selectedObjectAtPosition = objectsAtPosition.find((obj) =>
    currentSelection.includes(obj.id)
  );

  if (selectedObjectAtPosition) {
    // A selected object is under the mouse - we're clicking on/near the selected object
    selectedObjectUnderMouse = selectedObjectAtPosition;
  } else {
    // Check if the deepest object is a descendant of something selected
    let currentParentId = deepestObject.parentId;
    while (currentParentId) {
      if (currentSelection.includes(currentParentId)) {
        clickedDescendantOfSelected = {
          descendant: deepestObject,
          selectedAncestor: currentParentId,
        };
        break;
      }
      const parentObj = objects[currentParentId];
      currentParentId = parentObj?.parentId;
    }
  }

  if (selectedObjectUnderMouse) {
    // Something under the mouse is selected - go one level deeper
    const selectedObjectId = selectedObjectUnderMouse.id;
    const selectedDepth = getObjectDepth(selectedObjectId, objects);
    const nextDepth = selectedDepth + 1;

    // Find direct children of the selected object that are under the mouse
    const directChildren = getChildrenAtPosition(
      objects,
      selectedObjectId,
      screenX,
      screenY
    );

    if (directChildren.length > 0) {
      // Select the first direct child (progressive deepening)
      const nextDeeperObject = directChildren[0];
      const depth = getObjectDepth(nextDeeperObject.id, objects);

      return {
        selectedIds: [nextDeeperObject.id],
        newDeepSelection: {
          depth: depth,
          rootObjectId: topLevelObject.id,
          lastClickPosition: clickPosition,
          timestamp: now,
        },
      };
    } else {
      // No direct children found at this position - keep current selection unchanged

      return {
        selectedIds: currentSelection,
        newDeepSelection: undefined, // No deep selection state change
      };
    }
  } else if (clickedDescendantOfSelected) {
    // We're clicking on a descendant of something selected
    // For progressive selection, check if we should select the immediate parent or the clicked object
    const clickedObject = clickedDescendantOfSelected.descendant;
    const immediateParentId = clickedObject.parentId;
    const selectedAncestorId = clickedDescendantOfSelected.selectedAncestor;

    // If the immediate parent is the selected ancestor, select the clicked object (direct child)
    if (immediateParentId === selectedAncestorId) {
      const depth = getObjectDepth(clickedObject.id, objects);

      return {
        selectedIds: [clickedObject.id],
        newDeepSelection: {
          depth: depth,
          rootObjectId: topLevelObject.id,
          lastClickPosition: clickPosition,
          timestamp: now,
        },
      };
    } else if (immediateParentId && objects[immediateParentId]) {
      // Otherwise, select the immediate parent (for grandchildren, etc.)
      const immediateParent = objects[immediateParentId];
      const depth = getObjectDepth(immediateParentId, objects);

      return {
        selectedIds: [immediateParentId],
        newDeepSelection: {
          depth: depth,
          rootObjectId: topLevelObject.id,
          lastClickPosition: clickPosition,
          timestamp: now,
        },
      };
    }

    // Fallback if no immediate parent found
    const targetObject = clickedDescendantOfSelected.descendant;
    const depth = getObjectDepth(targetObject.id, objects);

    return {
      selectedIds: [targetObject.id],
      newDeepSelection: {
        depth: depth,
        rootObjectId: topLevelObject.id,
        lastClickPosition: clickPosition,
        timestamp: now,
      },
    };
  } else {
    // Nothing under the mouse is selected - start with depth 2
    const depth2Object = getChildAtDepth(
      objects,
      topLevelObject.id,
      2,
      screenX,
      screenY
    );

    if (depth2Object) {
      return {
        selectedIds: [depth2Object.id],
        newDeepSelection: {
          depth: 2,
          rootObjectId: topLevelObject.id,
          lastClickPosition: clickPosition,
          timestamp: now,
        },
      };
    } else {
      // No depth 2 object, fall back to depth 1
      const depth1Object =
        getChildAtDepth(objects, topLevelObject.id, 1, screenX, screenY) ||
        topLevelObject;
      return {
        selectedIds: [depth1Object.id],
        newDeepSelection: {
          depth: depth1Object === topLevelObject ? 0 : 1,
          rootObjectId: topLevelObject.id,
          lastClickPosition: clickPosition,
          timestamp: now,
        },
      };
    }
  }
}
