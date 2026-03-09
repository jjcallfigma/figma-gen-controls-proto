import { CanvasObject, Point, WorldPoint } from "@/types/canvas";

/**
 * Selection service using browser's elementsFromPoint API
 * This provides much better control for complex interactions like:
 * - Multiple selections
 * - Nested object selection
 * - Precise hit testing
 * - Frame hierarchy selection
 */

export interface SelectionOptions {
  /** Whether to allow multiple selections */
  allowMultiple?: boolean;
  /** Whether to select only the topmost object */
  selectTopmost?: boolean;
  /** Whether to prefer frames over their children */
  preferFrames?: boolean;
  /** Whether to pierce through locked objects */
  ignoreLocked?: boolean;
}

export interface HitTestResult {
  object: CanvasObject;
  element: HTMLElement;
  depth: number; // How many levels deep in the hierarchy
}

/**
 * Find objects at a specific point using elementsFromPoint
 */
export function getObjectsAtPoint(
  screenPoint: Point,
  options: SelectionOptions = {}
): HitTestResult[] {
  const {
    selectTopmost = false,
    preferFrames = false,
    ignoreLocked = false,
  } = options;

  // Use browser's elementsFromPoint to get all elements at this point
  const elements = document.elementsFromPoint(screenPoint.x, screenPoint.y);

  const results: HitTestResult[] = [];

  for (const element of elements) {
    // Skip non-canvas elements
    const objectId = element.getAttribute("data-object-id");
    const objectType = element.getAttribute("data-object-type");

    if (!objectId || !objectType) {
      continue;
    }

    // Skip locked objects if requested
    if (ignoreLocked && element.getAttribute("data-locked") === "true") {
      continue;
    }

    // Calculate depth in hierarchy
    const depth = getElementDepth(element);

    // We need to get the actual CanvasObject - this will be injected later
    // For now, we'll store the element info with a placeholder
    results.push({
      object: {} as CanvasObject, // Will be populated by the caller
      element: element as HTMLElement,
      depth,
    });

    // Note: Don't break here for selectTopmost - we need to collect all elements first, then sort properly
  }

  // Sort by depth (deepest/most nested first) unless preferFrames is set
  if (!preferFrames) {
    results.sort((a, b) => b.depth - a.depth);
  } else {
    // When preferFrames is true, prioritize frames even if they're shallower
    results.sort((a, b) => {
      const aIsFrame = a.element.getAttribute("data-object-type") === "frame";
      const bIsFrame = b.element.getAttribute("data-object-type") === "frame";

      if (aIsFrame && !bIsFrame) return -1;
      if (!aIsFrame && bIsFrame) return 1;

      // If both are frames or both are not frames, sort by depth
      return b.depth - a.depth;
    });
  }

  // Apply selectTopmost AFTER sorting
  if (selectTopmost && results.length > 0) {
    // Return the deepest visible element (this is correct for normal/shift click)
    return [results[0]]; // First result after depth sorting (deepest)
  }

  return results;
}

/**
 * Calculate the depth of an element in the DOM hierarchy
 * Higher number means more deeply nested
 */
function getElementDepth(element: Element): number {
  let depth = 0;
  let current = element.parentElement;

  while (current && !current.hasAttribute("data-world-space")) {
    if (current.hasAttribute("data-object-id")) {
      depth++;
    }
    current = current.parentElement;
  }

  return depth;
}

/**
 * Calculate the depth of an object in the hierarchy
 * Depth 0 = top-level objects, Depth 1 = direct children, Depth 2+ = grandchildren+
 */
function getObjectDepth(
  objectId: string,
  objects: Record<string, CanvasObject>
): number {
  let depth = 0;
  let currentId = objectId;

  while (true) {
    const obj = objects[currentId];
    if (!obj || !obj.parentId) break;

    depth++;
    currentId = obj.parentId;
  }

  return depth;
}

/**
 * Find the direct child (depth-1) of a parent that contains the given descendant
 */
function findDirectChild(
  parentId: string,
  descendantId: string,
  objects: Record<string, CanvasObject>
): CanvasObject | null {
  let currentId = descendantId;

  while (currentId) {
    const currentObj = objects[currentId];
    if (!currentObj || !currentObj.parentId) break;

    // If the parent of this object is our target parent, this is the direct child
    if (currentObj.parentId === parentId) {
      return currentObj;
    }

    currentId = currentObj.parentId;
  }

  return null;
}

/**
 * Get the best selection target from hit test results
 * Implements smart selection logic for different interaction modes
 */
export function getBestSelectionTarget(
  results: HitTestResult[],
  currentSelection: string[],
  options: SelectionOptions = {}
): HitTestResult | null {
  const { allowMultiple = false, preferFrames = false } = options;

  if (results.length === 0) return null;

  // If we prefer frames and there's a frame in the results, select it
  if (preferFrames) {
    const frameResult = results.find(
      (r) => r.element.getAttribute("data-object-type") === "frame"
    );
    if (frameResult) return frameResult;
  }

  // If multiple selection is disabled, always return the first (topmost) result
  if (!allowMultiple) {
    return results[0];
  }

  // For multiple selection, check if we're adding to existing selection
  // or starting a new one based on modifier keys (handled by caller)
  return results[0];
}

/**
 * Check if a frame is empty (has no children)
 */
export function isEmptyFrame(
  objectId: string,
  objects: Record<string, CanvasObject>
): boolean {
  const obj = objects[objectId];
  if (!obj || obj.type !== "frame") return false;

  return !obj.childIds || obj.childIds.length === 0;
}

/**
 * Get the generation depth of an object relative to top-level frames
 * - Top-level objects: generation 1
 * - Direct children of top-level frames: generation 2
 * - Grandchildren: generation 3, etc.
 */
export function getObjectGenerationDepth(
  objectId: string,
  objects: Record<string, CanvasObject>
): number {
  let depth = 1;
  let currentId = objectId;

  while (true) {
    const obj = objects[currentId];
    if (!obj || !obj.parentId) {
      break;
    }

    const parent = objects[obj.parentId];
    if (!parent) {
      break;
    }

    // If parent is a frame, we've gone up one generation
    if (parent.type === "frame") {
      depth++;
    }

    currentId = obj.parentId;
  }

  return depth;
}

/**
 * Check if an object is a direct child of a top-level frame
 */
export function isDirectChildOfTopLevelFrame(
  objectId: string,
  objects: Record<string, CanvasObject>
): boolean {
  const obj = objects[objectId];
  if (!obj || !obj.parentId) return false;

  return isTopLevelFrame(obj.parentId, objects);
}

/**
 * Check if a frame is a top-level frame (not nested inside another frame)
 */
export function isTopLevelFrame(
  objectId: string,
  objects: Record<string, CanvasObject>
): boolean {
  const obj = objects[objectId];
  if (!obj || obj.type !== "frame") return false;

  // Top-level if no parent or parent is not a frame
  return !obj.parentId || objects[obj.parentId]?.type !== "frame";
}

/**
 * Enhanced selection logic for nested objects
 * Implements sophisticated selection rules similar to Figma
 */
export function getAdvancedSelectionTarget(
  results: HitTestResult[],
  currentSelection: string[],
  objects: Record<string, CanvasObject>,
  options: {
    isCmdClick?: boolean;
    isShiftClick?: boolean;
    isClickingOnLabel?: boolean;
    labelFrameId?: string;
  } = {}
): HitTestResult | null {
  const {
    isCmdClick = false,
    isShiftClick = false,
    isClickingOnLabel = false,
    labelFrameId,
  } = options;

  if (results.length === 0) return null;

  // If clicking on a frame label, always select that frame
  if (isClickingOnLabel && labelFrameId) {
    const labelResult = results.find((r) => r.object.id === labelFrameId);
    if (labelResult) return labelResult;
  }

  // CMD+Click: Always select topmost element regardless of depth
  if (isCmdClick) {
    return results[0]; // First result is topmost
  }

  // Shift+Click: Use EXACTLY the same selection logic as normal click
  // Only the final add/remove behavior should be different, not the target selection
  // Remove the early return and let it fall through to normal selection logic

  // Check if we're clicking on something that's already selected
  const clickedSelectedItem = results.find((r) =>
    currentSelection.includes(r.object.id)
  );

  // Check if we're clicking on a descendant of a selected object (child, grandchild, etc.)
  let descendantOfSelectedItem = null;
  for (const r of results) {
    // Check if this object's parent (or any ancestor) is selected
    let currentParentId = r.object.parentId;
    while (currentParentId) {
      if (currentSelection.includes(currentParentId)) {
        descendantOfSelectedItem = {
          descendant: r,
          selectedAncestor: currentParentId,
        };
        break;
      }
      const parentObj = objects[currentParentId];
      currentParentId = parentObj?.parentId;
    }
    if (descendantOfSelectedItem) break;
  }

  // Check if we're clicking on an ancestor of a selected object
  let ancestorOfSelectedItem = null;
  for (const r of results) {
    // Check if any selected object is a descendant of this object
    for (const selectedId of currentSelection) {
      let currentParentId = objects[selectedId]?.parentId;
      while (currentParentId) {
        if (currentParentId === r.object.id) {
          ancestorOfSelectedItem = {
            ancestor: r,
            selectedDescendant: selectedId,
          };
          break;
        }
        const parentObj = objects[currentParentId];
        currentParentId = parentObj?.parentId;
      }
      if (ancestorOfSelectedItem) break;
    }
    if (ancestorOfSelectedItem) break;
  }

  // Check if we're clicking on a sibling of ancestors (or descendant of sibling of ancestor) of selected objects
  let siblingOfAncestorItem = null;
  for (const r of results) {
    // Check if this clicked object (or any of its ancestors) is a sibling of any ancestor of selected objects
    let clickedObject = r.object;

    while (clickedObject && clickedObject.parentId) {
      for (const selectedId of currentSelection) {
        // Walk up the ancestry of the selected object
        let currentAncestorId = objects[selectedId]?.parentId;

        while (currentAncestorId) {
          const ancestorObj = objects[currentAncestorId];
          if (!ancestorObj) break;

          // Check if the clicked object (or its ancestor) is a sibling of this ancestor
          if (
            ancestorObj.parentId &&
            clickedObject.parentId === ancestorObj.parentId &&
            clickedObject.id !== ancestorObj.id
          ) {
            siblingOfAncestorItem = {
              siblingOfAncestor: { ...r, object: clickedObject }, // Select the sibling, not its descendant
              ancestor: ancestorObj,
              selectedDescendant: selectedId,
              sharedParent: ancestorObj.parentId,
            };
            break;
          }

          currentAncestorId = ancestorObj.parentId;
        }

        if (siblingOfAncestorItem) break;
      }

      if (siblingOfAncestorItem) break;

      // Move up to parent to check if parent is a sibling of ancestor
      clickedObject = objects[clickedObject.parentId];
    }

    if (siblingOfAncestorItem) break;
  }

  // Check if we're clicking on a sibling (or descendant of sibling) of a selected object
  let siblingOfSelectedItem = null;
  for (const r of results) {
    // Check if this object (or any of its ancestors) is a sibling of any selected object
    let currentObject = r.object;

    while (currentObject && currentObject.parentId) {
      const clickedParentId = currentObject.parentId;

      for (const selectedId of currentSelection) {
        const selectedObj = objects[selectedId];
        if (
          selectedObj &&
          selectedObj.parentId === clickedParentId &&
          selectedObj.id !== currentObject.id
        ) {
          siblingOfSelectedItem = {
            sibling: { ...r, object: currentObject }, // Select the sibling, not its descendant
            selectedSibling: selectedId,
            sharedParent: clickedParentId,
          };
          break;
        }
      }

      if (siblingOfSelectedItem) break;

      // Move up to parent to check if parent is a sibling
      currentObject = objects[currentObject.parentId];
    }

    if (siblingOfSelectedItem) break;
  }

  if (descendantOfSelectedItem && !clickedSelectedItem) {
    // Clicking on descendant of selected object
    const selectedAncestorId = descendantOfSelectedItem.selectedAncestor;
    const selectedAncestor = objects[selectedAncestorId];
    const descendant = descendantOfSelectedItem.descendant;

    // Apply depth-0 special rules for already selected ancestors
    if (selectedAncestor) {
      const ancestorDepth = getObjectDepth(selectedAncestor.id, objects);

      // If the selected ancestor is depth-0 and has children, select the direct child instead
      if (ancestorDepth === 0 && selectedAncestor.childIds.length > 0) {
        const directChild = findDirectChild(
          selectedAncestor.id,
          descendant.object.id,
          objects
        );

        if (directChild) {
          return {
            object: directChild,
            element: descendant.element,
            depth: getObjectDepth(directChild.id, objects),
          };
        }
      }
    }

    // Default behavior: return the selected ancestor
    const parentResult = results.find(
      (r) => r.object.id === selectedAncestorId
    ) || {
      object: objects[selectedAncestorId],
      element: descendant.element, // Use descendant's element as fallback
      depth: getObjectDepth(selectedAncestorId, objects),
    };

    return parentResult as HitTestResult;
  }

  if (ancestorOfSelectedItem && !clickedSelectedItem) {
    // Special rule: Don't allow selecting depth-0 ancestors when ANY descendant is selected
    // BUT skip this rule for shift-clicks to allow multi-select conflict resolution
    const ancestor = ancestorOfSelectedItem.ancestor.object;
    const ancestorDepth = getObjectDepth(ancestor.id, objects);

    // If ancestor is depth-0 and has children, check blocking conditions
    if (ancestorDepth === 0 && ancestor.childIds.length > 0 && !isShiftClick) {
      // Only block if the depth-0 ancestor is NOT currently selected
      const isAncestorSelected = currentSelection.includes(ancestor.id);

      if (!isAncestorSelected) {
        // Check if any currently selected object is a descendant of this depth-0 ancestor
        const hasSelectedDescendants = currentSelection.some((selectedId) => {
          let currentParentId = objects[selectedId]?.parentId;
          while (currentParentId) {
            if (currentParentId === ancestor.id) {
              return true; // Found that selected object is descendant of this ancestor
            }
            currentParentId = objects[currentParentId]?.parentId;
          }
          return false;
        });

        if (hasSelectedDescendants) {
          // Return null to block ancestor selection, will fall through to other logic
          return null;
        }
      } else {
        // Find the direct child (depth-1) instead of selecting the ancestor
        const selectedDescendantId = ancestorOfSelectedItem.selectedDescendant;
        const directChild = findDirectChild(
          ancestor.id,
          selectedDescendantId,
          objects
        );

        if (directChild) {
          console.log("✅ SELECTING DIRECT CHILD:", {
            childId: directChild.id,
            childName: directChild.name,
            parentId: ancestor.id,
          });

          // Return the direct child instead of the ancestor
          return {
            object: directChild,
            element: ancestorOfSelectedItem.ancestor.element,
            depth: getObjectDepth(directChild.id, objects),
          };
        }
      }
    }

    // Clicking on ancestor of selected object - select the ancestor directly
    return ancestorOfSelectedItem.ancestor;
  }

  if (siblingOfAncestorItem && !clickedSelectedItem) {
    // Clicking on sibling of ancestor - select the sibling directly
    return siblingOfAncestorItem.siblingOfAncestor;
  }

  if (siblingOfSelectedItem && !clickedSelectedItem) {
    // Clicking on sibling of selected object - select the sibling directly
    return siblingOfSelectedItem.sibling;
  }

  if (clickedSelectedItem) {
    // Special case: If we're clicking on a depth0 frame with children that's already selected,
    // check if we should deselect it (clicking on empty area)
    if (
      clickedSelectedItem.object.type === "frame" &&
      isTopLevelFrame(clickedSelectedItem.object.id, objects) &&
      clickedSelectedItem.object.childIds &&
      clickedSelectedItem.object.childIds.length > 0
    ) {
      // Check if any of the children are also in the hit results
      // If no children are hit, then we're clicking on empty area -> deselect
      const childrenInResults = results.filter((r) =>
        clickedSelectedItem.object.childIds.includes(r.object.id)
      );

      if (childrenInResults.length === 0) {
        return null; // Deselect
      }
    }

    // If we click on something already selected, preserve selection for drag

    return clickedSelectedItem;
  }

  // Check if a top-level frame is currently selected
  const selectedTopLevelFrame = currentSelection.find((id) => {
    const obj = objects[id];
    return obj && isTopLevelFrame(id, objects);
  });

  if (selectedTopLevelFrame) {
    // First check if we're clicking on a DIFFERENT top-level frame
    const otherTopLevelFrame = results.find((r) => {
      const obj = r.object;
      return (
        obj.type === "frame" &&
        isTopLevelFrame(obj.id, objects) &&
        obj.id !== selectedTopLevelFrame
      );
    });

    if (otherTopLevelFrame) {
      // Allow normal selection logic to handle this
      // by falling through to the normal selection rules below
    } else {
      // We're interacting with the same frame hierarchy - use existing logic

      // A top-level frame is selected - check if we're clicking on its direct child
      const directChildResult = results.find((r) => {
        const obj = r.object;
        return obj.parentId === selectedTopLevelFrame;
      });

      if (directChildResult) {
        // Clicking on direct child of selected frame - allow selection
        return directChildResult;
      }

      // Check if we're clicking on a grandchild (depth 2+) of the selected frame
      // In this case, we want to select the depth 1 child instead
      const grandchildResult = results.find((r) => {
        const obj = r.object;
        const objDepth = getObjectDepth(obj.id, objects);

        // Check if this is a grandchild of the selected frame
        if (objDepth >= 2 && obj.parentId) {
          // Walk up to find if this object is a descendant of the selected frame
          let currentId: string | undefined = obj.parentId;
          let depth1Parent: CanvasObject | null = null;

          while (currentId) {
            const currentObj: CanvasObject | undefined = objects[currentId];
            if (!currentObj) break;

            if (
              currentObj.parentId &&
              currentObj.parentId === selectedTopLevelFrame
            ) {
              // Found the depth 1 child of the selected frame
              depth1Parent = currentObj;
              break;
            }

            currentId = currentObj.parentId;
          }

          if (depth1Parent) {
            // Store the depth 1 parent for selection
            r.object = depth1Parent;
            return true;
          }
        }

        return false;
      });

      if (grandchildResult) {
        return grandchildResult;
      }

      // Check if we're clicking on the selected frame itself
      const clickedSelectedFrame = results.find(
        (r) => r.object.id === selectedTopLevelFrame
      );
      if (clickedSelectedFrame) {
        // Clicking on the selected frame itself - keep it selected

        return clickedSelectedFrame;
      }

      // If we're here, we clicked on a different object while a frame was selected
      // Instead of deselecting, fall through to normal selection logic to select the new object
    }
  }

  // First, separate candidates by depth for processing
  const depthSeparatedCandidates = results.map((result) => {
    const obj = result.object;
    const objectDepth = getObjectDepth(obj.id, objects);

    // Check if this object is a child of any currently selected object
    const isChildOfSelected = currentSelection.some((selectedId) => {
      const selectedObj = objects[selectedId];
      return selectedObj && obj.parentId === selectedId;
    });

    // Check if this object is currently selected
    const isAlreadySelected = currentSelection.includes(obj.id);

    const shouldFallback =
      objectDepth >= 2 &&
      !isCmdClick &&
      !isAlreadySelected &&
      !isChildOfSelected;

    return {
      ...result,
      objectDepth,
      needsFallback: shouldFallback,
    };
  });

  // Filter out only the objects that need fallback
  const depthFilteredCandidates = depthSeparatedCandidates.filter((result) => {
    if (result.needsFallback) {
      return false; // Will be handled by fallback
    }
    return true;
  });

  // Then apply frame vs children preference logic
  const selectableCandidates = depthFilteredCandidates.filter((result) => {
    const obj = result.object;

    // Non-frames are always selectable (already passed depth filter)
    if (obj.type !== "frame") {
      // BUT: If this non-frame object is a child of a depth 1 frame,
      // we should select the depth 1 frame instead
      if (obj.parentId) {
        const parent = objects[obj.parentId];
        if (parent && parent.type === "frame") {
          const parentDepth = getObjectDepth(parent.id, objects);
          if (parentDepth === 1) {
            // This object is a child of a depth 1 frame - don't select it directly

            return false;
          }
        }
      }
      return true;
    }

    // For frames, apply the depth-based selection rules
    const frameDepth = getObjectDepth(obj.id, objects);
    const hasChildren = obj.childIds && obj.childIds.length > 0;

    if (frameDepth === 0) {
      // Depth 0 frames (top-level): Only selectable if they have no children
      if (hasChildren) {
        // Check if any of this frame's children are in our candidates
        const childCandidates = depthFilteredCandidates.filter(
          (r) => r.object.parentId === obj.id
        );

        if (childCandidates.length > 0) {
          // Children are available - don't select this depth 0 frame

          return false;
        } else {
          // No children in candidates (clicking on empty area) - allow region selection

          return false;
        }
      } else {
        // Empty depth 0 frame - selectable

        return true;
      }
    } else if (frameDepth === 1) {
      // Depth 1 frames: ALWAYS selectable (regardless of children)

      return true;
    } else {
      // Depth 2+ frames: Should have been filtered out already, but allow if they got through

      return true;
    }
  });

  // If no selectable candidates found but we have blocked deep objects,
  // try to find the depth 1 parent
  if (selectableCandidates.length === 0 && !isCmdClick) {
    // Check for depth 2+ objects that need fallback
    const fallbackObjects = depthSeparatedCandidates.filter(
      (result) => result.needsFallback
    );

    // Handle depth 2+ objects - find their depth 1 parent
    if (fallbackObjects.length > 0) {
      const fallbackObject = fallbackObjects[0].object;
      const depth1Parent = findHighestValidParent(fallbackObject.id, objects);

      if (depth1Parent) {
        return {
          ...fallbackObjects[0],
          object: depth1Parent,
        };
      }
    }

    // Also check for children of depth 1 frames that were filtered out
    const childrenOfDepth1Frames = depthFilteredCandidates.filter((result) => {
      const obj = result.object;
      if (obj.type !== "frame" && obj.parentId) {
        const parent = objects[obj.parentId];
        if (parent && parent.type === "frame") {
          const parentDepth = getObjectDepth(parent.id, objects);
          return parentDepth === 1; // Child of depth 1 frame
        }
      }
      return false;
    });

    // Handle children of depth 1 frames
    if (childrenOfDepth1Frames.length > 0) {
      const childObject = childrenOfDepth1Frames[0].object;
      const parent = objects[childObject.parentId!];
      if (parent) {
        return {
          ...childrenOfDepth1Frames[0],
          object: parent,
        };
      }
    }
  }

  // Return the first selectable candidate (topmost)
  let finalResult =
    selectableCandidates.length > 0 ? selectableCandidates[0] : null;

  // Apply depth-0 blocking rule to final result as well
  if (finalResult) {
    const candidate = finalResult.object;
    const candidateDepth = getObjectDepth(candidate.id, objects);

    // If candidate is depth-0 and has children, check blocking conditions
    // BUT skip this rule for shift-clicks to allow multi-select conflict resolution
    if (
      candidateDepth === 0 &&
      candidate.childIds.length > 0 &&
      !isShiftClick
    ) {
      // Only block if the depth-0 candidate is NOT currently selected
      const isCandidateSelected = currentSelection.includes(candidate.id);

      if (!isCandidateSelected) {
        const hasSelectedDescendants = currentSelection.some((selectedId) => {
          let currentParentId = objects[selectedId]?.parentId;
          while (currentParentId) {
            if (currentParentId === candidate.id) {
              return true; // Found that selected object is descendant of this candidate
            }
            currentParentId = objects[currentParentId]?.parentId;
          }
          return false;
        });

        if (hasSelectedDescendants) {
          finalResult = null; // Block this selection
        }
      } else {
        // This case is when we're hovering over empty areas of an already-selected depth-0 frame
        // We should allow the selection to proceed normally in this case
      }
    }
  }

  return finalResult;
}

/**
 * Find the depth 1 parent for blocked depth 2+ objects
 * Walk from the blocked object towards root to find the depth 1 parent
 */
function findHighestValidParent(
  objectId: string,
  objects: Record<string, CanvasObject>
): CanvasObject | null {
  let currentId = objects[objectId]?.parentId;

  // Walk upward and return the depth 1 parent
  while (currentId) {
    const currentObject = objects[currentId];
    if (!currentObject) break;

    const depth = getObjectDepth(currentId, objects);

    if (depth === 1) {
      // Found depth 1 parent - this is what we want

      return currentObject;
    }

    currentId = currentObject.parentId;
  }

  return null; // No valid parent found
}

/**
 * Check if a point is inside a world-space bounds
 * Useful for drag selection rectangles
 */
export function isPointInWorldBounds(
  worldPoint: WorldPoint,
  object: CanvasObject
): boolean {
  return (
    worldPoint.x >= object.x &&
    worldPoint.x <= object.x + object.width &&
    worldPoint.y >= object.y &&
    worldPoint.y <= object.y + object.height
  );
}

/**
 * Get all objects that intersect with a selection rectangle
 */
export function getObjectsInSelectionRect(
  objects: CanvasObject[],
  selectionStart: WorldPoint,
  selectionEnd: WorldPoint
): CanvasObject[] {
  const left = Math.min(selectionStart.x, selectionEnd.x);
  const top = Math.min(selectionStart.y, selectionEnd.y);
  const right = Math.max(selectionStart.x, selectionEnd.x);
  const bottom = Math.max(selectionStart.y, selectionEnd.y);

  return objects.filter((object) => {
    // Check if object intersects with selection rectangle
    const objRight = object.x + object.width;
    const objBottom = object.y + object.height;

    return !(
      object.x > right ||
      objRight < left ||
      object.y > bottom ||
      objBottom < top
    );
  });
}

/**
 * Find parent frame of an object
 */
export function findParentFrame(
  objectId: string,
  objects: Record<string, CanvasObject>
): CanvasObject | null {
  const object = objects[objectId];
  if (!object || !object.parentId) return null;

  const parent = objects[object.parentId];
  if (!parent) return null;

  if (parent.type === "frame") return parent;

  // Recursively search up the hierarchy
  return findParentFrame(parent.id, objects);
}

/**
 * Get all descendants of an object (children, grandchildren, etc.)
 */
export function getAllDescendants(
  objectId: string,
  objects: Record<string, CanvasObject>
): CanvasObject[] {
  const object = objects[objectId];
  if (!object) return [];

  const descendants: CanvasObject[] = [];

  for (const childId of object.childIds) {
    const child = objects[childId];
    if (child) {
      descendants.push(child);
      // Recursively get grandchildren
      descendants.push(...getAllDescendants(childId, objects));
    }
  }

  return descendants;
}
