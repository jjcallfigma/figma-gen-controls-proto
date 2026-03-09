import { CanvasObject, Viewport } from "@/types/canvas";
import { useAppStore } from "../state/store";
import { getAbsolutePosition } from "./coordinates";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calculates the optimal insertion position for objects being dropped into an auto layout frame
 */
export function calculateAutoLayoutInsertion(
  parentId: string,
  mousePosition: { x: number; y: number },
  draggedIds: string[],
  objects: Record<string, CanvasObject>
): { insertionIndex: number } {
  const parentObject = objects[parentId];
  if (!parentObject || parentObject.type !== "frame") {
    return { insertionIndex: 0 };
  }

  const autoLayout =
    parentObject.properties?.type === "frame"
      ? parentObject.properties.autoLayout
      : null;

  if (!autoLayout || autoLayout.mode === "none") {
    return { insertionIndex: 0 };
  }

  // Get absolute position of the parent frame
  const parentAbsolute = getAbsolutePosition(parentId, objects);

  // Convert mouse position to parent's local coordinate space
  const localMouseX = mousePosition.x - parentAbsolute.x;
  const localMouseY = mousePosition.y - parentAbsolute.y;

  // Get visible children of the parent frame that are not being dragged
  const children = parentObject.childIds
    .map((id) => objects[id])
    .filter((child) => child && child.visible && !draggedIds.includes(child.id))
    .sort((a, b) => a.createdAt - b.createdAt); // Sort by creation time as default order

  // Get the first dragged object to use for edge calculations
  const firstDraggedObject =
    draggedIds.length > 0 ? objects[draggedIds[0]] : null;
  if (!firstDraggedObject) {
    return { insertionIndex: 0 };
  }

  // Calculate dragged object's position and edges (assuming it's centered on mouse)
  const draggedBounds = {
    x: mousePosition.x - firstDraggedObject.width / 2,
    y: mousePosition.y - firstDraggedObject.height / 2,
    width: firstDraggedObject.width,
    height: firstDraggedObject.height,
  };

  // Convert to parent's local coordinate space
  const draggedInParent = {
    x: draggedBounds.x - parentAbsolute.x,
    y: draggedBounds.y - parentAbsolute.y,
    width: draggedBounds.width,
    height: draggedBounds.height,
  };

  const draggedCenter = {
    x: draggedInParent.x + draggedInParent.width / 2,
    y: draggedInParent.y + draggedInParent.height / 2,
  };

  const draggedEdges = {
    left: draggedInParent.x,
    right: draggedInParent.x + draggedInParent.width,
    top: draggedInParent.y,
    bottom: draggedInParent.y + draggedInParent.height,
  };

  // Enhanced logic: use dragged object's leading edge to determine position switches
  let insertionIndex = 0;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    // Check if we've passed this child's midpoint using appropriate edge
    let passedMidpoint = false;

    if (autoLayout.mode === "horizontal") {
      const childMidX = child.x + child.width / 2;

      // Determine if dragged object is to the left or right of this child
      if (draggedCenter.x < childMidX) {
        // Dragged object is to the left - check if right edge crosses child center
        passedMidpoint = draggedEdges.right > childMidX;
      } else {
        // Dragged object is to the right - it's already past this child
        passedMidpoint = true;
      }
    } else if (autoLayout.mode === "vertical") {
      const childMidY = child.y + child.height / 2;

      // Determine if dragged object is above or below this child
      if (draggedCenter.y < childMidY) {
        // Dragged object is above - check if bottom edge crosses child center
        passedMidpoint = draggedEdges.bottom > childMidY;
      } else {
        // Dragged object is below - it's already past this child
        passedMidpoint = true;
      }
    }

    if (passedMidpoint) {
      // We've passed this child, so we should be after it
      insertionIndex = i + 1;
    } else {
      // We haven't passed this child, so we should be before it
      break;
    }
  }

  return { insertionIndex };
}

/**
 * Computes the midpoints of non-excluded children in a parent's auto layout
 * using their **stored x/y positions**. These are synced from the DOM by the
 * auto layout observer before the drag starts and remain stable during drag
 * (observer is disabled). Because they reflect the actual expanded layout
 * (with all children present), they're in the same coordinate space as the
 * dragged items' positions — avoiding the coordinate mismatch that would
 * occur with a "collapsed" analytical calculation.
 *
 * No DOM queries are made; this reads only from the state store.
 */
function computeStoredChildMidpoints(
  parentId: string,
  excludeIds: string[],
  objects: Record<string, CanvasObject>
): { id: string; mid: number }[] {
  const parent = objects[parentId];
  if (!parent || parent.type !== "frame") return [];

  const autoLayout =
    parent.properties?.type === "frame"
      ? parent.properties.autoLayout
      : null;
  if (!autoLayout || autoLayout.mode === "none") return [];

  const isHorizontal = autoLayout.mode === "horizontal";

  const children = parent.childIds
    .map((id) => objects[id])
    .filter(
      (child) => child && child.visible && !excludeIds.includes(child.id)
    );

  return children.map((child) => ({
    id: child.id,
    mid: isHorizontal
      ? child.x + child.width / 2
      : child.y + child.height / 2,
  }));
}

/**
 * Calculates where a dragged auto layout child should be positioned within its current or target parent.
 * Uses the **leading edge** of the selection to determine when reordering triggers:
 *   - Siblings before the current position: use LEFT/TOP edge (retreating)
 *   - Siblings at/after the current position: use RIGHT/BOTTOM edge (advancing)
 * Midpoints come from stored positions (no DOM queries) so the result is stable.
 */
export function calculateAutoLayoutChildPlaceholderPosition(
  draggedObjectId: string,
  draggedObjectBounds: { x: number; y: number; width: number; height: number },
  targetParentId: string,
  objects: Record<string, CanvasObject>,
  viewport: Viewport,
  currentPlaceholderIndex?: number,
  dragDelta?: number
): { parentId: string; insertionIndex: number } {
  const targetParent = objects[targetParentId];
  if (!targetParent || targetParent.type !== "frame") {
    return { parentId: targetParentId, insertionIndex: 0 };
  }

  const autoLayout =
    targetParent.properties?.type === "frame"
      ? targetParent.properties.autoLayout
      : null;

  if (!autoLayout || autoLayout.mode === "none") {
    return { parentId: targetParentId, insertionIndex: 0 };
  }

  const isHorizontal = autoLayout.mode === "horizontal";

  // Get parent's absolute position
  const parentAbsolute = getAbsolutePosition(targetParentId, objects);

  // Selection edges in parent-relative coordinates
  const leadingEdge = isHorizontal
    ? draggedObjectBounds.x - parentAbsolute.x
    : draggedObjectBounds.y - parentAbsolute.y;
  const trailingEdge = isHorizontal
    ? draggedObjectBounds.x - parentAbsolute.x + draggedObjectBounds.width
    : draggedObjectBounds.y - parentAbsolute.y + draggedObjectBounds.height;

  // Pick a single edge based on the drag direction.
  // Dragging backward (left/up, delta < 0) → use leading edge (left/top)
  // Dragging forward (right/down, delta >= 0) → use trailing edge (right/bottom)
  // This prevents oscillation caused by alternating edges per-sibling.
  const useLeadingEdge = dragDelta !== undefined && dragDelta < 0;
  const edge = useLeadingEdge ? leadingEdge : trailingEdge;

  // Compute stable midpoints from stored sizes (no DOM)
  const midpoints = computeStoredChildMidpoints(
    targetParentId,
    [draggedObjectId],
    objects
  );

  let insertionIndex = 0;

  for (let i = 0; i < midpoints.length; i++) {
    const siblingMid = midpoints[i].mid;

    if (edge > siblingMid) {
      insertionIndex = i + 1;
    } else {
      break;
    }
  }

  return { parentId: targetParentId, insertionIndex };
}

/**
 * Calculate condensed drag positions for multi-selection AL children
 * Visually repositions items to be consecutive with gap spacing during drag
 */
export function calculateCondensedDragPositions(
  draggedIds: string[],
  parentId: string,
  objects: Record<string, CanvasObject>,
  originalPositions: Record<string, { x: number; y: number }>,
  deltaX: number,
  deltaY: number
): Record<string, { x: number; y: number }> {
  if (draggedIds.length <= 1) {
    // Single item or empty - fallback to normal positioning
    const result: Record<string, { x: number; y: number }> = {};
    draggedIds.forEach((id) => {
      const originalPos = originalPositions[id];
      if (originalPos) {
        result[id] = {
          x: Math.round(originalPos.x + deltaX),
          y: Math.round(originalPos.y + deltaY),
        };
      }
    });
    return result;
  }

  const parent = objects[parentId];
  const autoLayout =
    parent?.properties?.type === "frame" ? parent.properties.autoLayout : null;

  if (!autoLayout || autoLayout.mode === "none") {
    // Fallback to normal positioning if no auto layout
    const result: Record<string, { x: number; y: number }> = {};
    draggedIds.forEach((id) => {
      const originalPos = originalPositions[id];
      if (originalPos) {
        result[id] = {
          x: Math.round(originalPos.x + deltaX),
          y: Math.round(originalPos.y + deltaY),
        };
      }
    });
    return result;
  }

  const gap = autoLayout.gap || 0;
  const isHorizontal = autoLayout.mode === "horizontal";

  // Sort items by their original index in the parent to maintain visual order
  const sortedItems = draggedIds
    .map((id) => ({ id, object: objects[id] }))
    .filter((item) => item.object)
    .sort((a, b) => {
      const aIndex = parent.childIds.indexOf(a.id);
      const bIndex = parent.childIds.indexOf(b.id);
      return aIndex - bIndex;
    });

  // Check if items are already consecutive in parent order
  const indices = sortedItems.map((item) => parent.childIds.indexOf(item.id));
  const isAlreadyConsecutive = indices.every(
    (index, i) => i === 0 || index === indices[i - 1] + 1
  );

  if (isAlreadyConsecutive) {
    // Items are already consecutive - just apply delta without repositioning
    const result: Record<string, { x: number; y: number }> = {};
    sortedItems.forEach((item) => {
      const originalPos = originalPositions[item.id];
      if (originalPos) {
        result[item.id] = {
          x: Math.round(originalPos.x + deltaX),
          y: Math.round(originalPos.y + deltaY),
        };
      }
    });
    return result;
  }

  // Items are not consecutive - apply condensed positioning
  const firstItem = sortedItems[0];
  const firstOriginalPos = originalPositions[firstItem.id];
  const anchorPos = {
    x: firstOriginalPos.x + deltaX,
    y: firstOriginalPos.y + deltaY,
  };

  const result: Record<string, { x: number; y: number }> = {};
  let currentOffset = 0;

  sortedItems.forEach((item, index) => {
    const { object } = item;

    if (index === 0) {
      // First item stays at anchor position
      result[item.id] = {
        x: Math.round(anchorPos.x),
        y: Math.round(anchorPos.y),
      };
    } else {
      // Subsequent items are positioned consecutively with gap
      if (isHorizontal) {
        result[item.id] = {
          x: Math.round(anchorPos.x + currentOffset),
          y: Math.round(anchorPos.y), // Same Y as anchor
        };
      } else {
        result[item.id] = {
          x: Math.round(anchorPos.x), // Same X as anchor
          y: Math.round(anchorPos.y + currentOffset),
        };
      }
    }

    // Update offset for next item (current item size + gap)
    if (index < sortedItems.length - 1) {
      if (isHorizontal) {
        currentOffset += object.width + gap;
      } else {
        currentOffset += object.height + gap;
      }
    }
  });

  return result;
}

/**
 * Calculate condensed bounds for multi-selection as if items were consecutive
 * Uses the parent's gap value to create a compact "virtual group"
 */
export function calculateCondensedGroupBounds(
  draggedIds: string[],
  parentId: string,
  objects: Record<string, CanvasObject>,
  dragPositions: Record<string, { x: number; y: number }>
): { x: number; y: number; width: number; height: number } {
  if (draggedIds.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  if (draggedIds.length === 1) {
    // Single item - use its actual bounds
    const objectId = draggedIds[0];
    const object = objects[objectId];
    const dragPos = dragPositions[objectId];
    return {
      x: dragPos.x,
      y: dragPos.y,
      width: object.width,
      height: object.height,
    };
  }

  const parent = objects[parentId];
  const autoLayout =
    parent?.properties?.type === "frame" ? parent.properties.autoLayout : null;

  if (!autoLayout || autoLayout.mode === "none") {
    // Fallback to regular group bounds if no auto layout
    const { calculateGroupBounds } = require("@/core/utils/selection");
    return calculateGroupBounds(draggedIds, objects, dragPositions);
  }

  const gap = autoLayout.gap || 0;
  const isHorizontal = autoLayout.mode === "horizontal";

  // Sort items by their original index in the parent to maintain visual order
  const sortedItems = draggedIds
    .map((id) => ({ id, object: objects[id] }))
    .filter((item) => item.object)
    .sort((a, b) => {
      const aIndex = parent.childIds.indexOf(a.id);
      const bIndex = parent.childIds.indexOf(b.id);
      return aIndex - bIndex;
    });

  // Calculate condensed dimensions
  let totalMainAxisSize = 0;
  let maxCrossAxisSize = 0;

  sortedItems.forEach((item, index) => {
    const { object } = item;

    if (isHorizontal) {
      totalMainAxisSize += object.width;
      if (index > 0) totalMainAxisSize += gap; // Add gap between items
      maxCrossAxisSize = Math.max(maxCrossAxisSize, object.height);
    } else {
      totalMainAxisSize += object.height;
      if (index > 0) totalMainAxisSize += gap; // Add gap between items
      maxCrossAxisSize = Math.max(maxCrossAxisSize, object.width);
    }
  });

  // Use the position of the first item as the anchor point
  const firstItem = sortedItems[0];
  const firstItemPos = dragPositions[firstItem.id];

  return {
    x: firstItemPos.x,
    y: firstItemPos.y,
    width: isHorizontal ? totalMainAxisSize : maxCrossAxisSize,
    height: isHorizontal ? maxCrossAxisSize : totalMainAxisSize,
  };
}

/**
 * Calculate insertion index for a group of items using group bounds
 * This properly handles multi-selection edge detection
 */
export function calculateGroupInsertionIndex(
  parentId: string,
  groupBounds: { x: number; y: number; width: number; height: number },
  draggedIds: string[],
  objects: Record<string, CanvasObject>,
  viewport: Viewport,
  currentInsertionIndex?: number,
  dragDelta?: number
): number {
  const parentObject = objects[parentId];
  if (!parentObject || parentObject.type !== "frame") {
    return 0;
  }

  const autoLayout =
    parentObject.properties?.type === "frame"
      ? parentObject.properties.autoLayout
      : null;

  if (!autoLayout || autoLayout.mode === "none") {
    return 0;
  }

  const isHorizontal = autoLayout.mode === "horizontal";

  // Get parent's absolute position
  const parentAbsolute = getAbsolutePosition(parentId, objects);

  // Group edges in parent-relative coordinates
  const leadingEdge = isHorizontal
    ? groupBounds.x - parentAbsolute.x
    : groupBounds.y - parentAbsolute.y;
  const trailingEdge = isHorizontal
    ? groupBounds.x - parentAbsolute.x + groupBounds.width
    : groupBounds.y - parentAbsolute.y + groupBounds.height;

  // Pick a single edge based on the drag direction.
  // Dragging backward (left/up, delta < 0) → use leading edge (left/top)
  // Dragging forward (right/down, delta >= 0) → use trailing edge (right/bottom)
  const useLeadingEdge = dragDelta !== undefined && dragDelta < 0;
  const edge = useLeadingEdge ? leadingEdge : trailingEdge;

  // Compute stable midpoints from stored sizes (no DOM)
  const midpoints = computeStoredChildMidpoints(
    parentId,
    draggedIds,
    objects
  );

  let insertionIndex = 0;

  for (let i = 0; i < midpoints.length; i++) {
    const siblingMid = midpoints[i].mid;

    if (edge > siblingMid) {
      insertionIndex = i + 1;
    } else {
      break;
    }
  }

  return insertionIndex;
}

/**
 * Calculate insertion index for external items using live DOM positions
 * This matches the AutoLayoutPlaceholder logic exactly
 */
export function calculateExternalItemInsertionIndex(
  parentId: string,
  mousePosition: { x: number; y: number },
  draggedIds: string[],
  objects: Record<string, CanvasObject>,
  viewport: Viewport
): number {
  const parentObject = objects[parentId];
  if (!parentObject || parentObject.type !== "frame") {
    return 0;
  }

  const autoLayout =
    parentObject.properties?.type === "frame"
      ? parentObject.properties.autoLayout
      : null;

  if (!autoLayout || autoLayout.mode === "none") {
    return 0;
  }

  const isHorizontal = autoLayout.mode === "horizontal";

  // Get parent's absolute position
  const parentAbsolute = getAbsolutePosition(parentId, objects);

  // Mouse in parent-relative coordinates along the layout axis
  const mouseLocal = isHorizontal
    ? mousePosition.x - parentAbsolute.x
    : mousePosition.y - parentAbsolute.y;

  // Compute stable midpoints from stored sizes (no DOM)
  const midpoints = computeStoredChildMidpoints(
    parentId,
    draggedIds,
    objects
  );

  let insertionIndex = 0;

  for (let i = 0; i < midpoints.length; i++) {
    if (mouseLocal < midpoints[i].mid) {
      insertionIndex = i;
      break;
    }
    insertionIndex = i + 1;
  }

  return insertionIndex;
}

// Prevent infinite loops by tracking active syncs
const activeSyncs = new Set<string>();
let syncDispatchingCount = 0;
const syncCooldowns = new Map<string, number>();
const SYNC_COOLDOWN_MS = 400;
// Track the last values we synced per-frame to avoid re-dispatching identical updates
const lastSyncedValues = new Map<string, Map<string, { x?: number; y?: number; width?: number; height?: number }>>();

/**
 * Reads the actual DOM position of auto layout children and syncs them back to state
 */
export function syncAutoLayoutPositionsFromDOM(
  frameId: string,
  objects: Record<string, CanvasObject>,
  viewport: Viewport,
  dispatch: (action: any) => void
) {
  // Don't sync during zoom/pan — the DOM dimensions are in screen space and dividing
  // by a stale or mid-transition viewport.zoom produces wrong world-space values.
  if (observer.isSyncDisabled()) {
    return;
  }

  // Prevent infinite loops - if this frameId is already being synced, skip
  if (activeSyncs.has(frameId)) {
    return;
  }

  // Cooldown: skip if this frame was just synced (breaks dispatch→render→observer loops)
  const lastSync = syncCooldowns.get(frameId);
  if (lastSync && Date.now() - lastSync < SYNC_COOLDOWN_MS) {
    return;
  }

  // Mark this frame as being synced
  activeSyncs.add(frameId);
  // Removed: Sync function start logging
  const frameElement = document.querySelector(`[data-object-id="${frameId}"]`);
  if (!frameElement) {
    activeSyncs.delete(frameId);
    return;
  }

  const frameObject = objects[frameId];
  if (!frameObject || frameObject.type !== "frame") {
    activeSyncs.delete(frameId);
    return;
  }

  // Check if this frame has auto layout enabled or hug sizing
  const autoLayout =
    frameObject.properties?.type === "frame"
      ? frameObject.properties.autoLayout
      : (frameObject.properties as any)?.autoLayout; // For instance frames - check properties.autoLayout directly

  if (!autoLayout) {
    activeSyncs.delete(frameId);
    return;
  }

  // Check for hug sizing using unified autoLayoutSizing property
  const isHugFrame =
    frameObject.autoLayoutSizing.horizontal === "hug" ||
    frameObject.autoLayoutSizing.vertical === "hug";

  if (autoLayout.mode === "none" && !isHugFrame) {
    activeSyncs.delete(frameId);
    return;
  }

  const frameRect = frameElement.getBoundingClientRect();

  // Suppress observer-driven re-syncs while we dispatch updates
  syncDispatchingCount++;

  // Collect all updates into a single batch to avoid per-child dispatches
  const batchUpdates: Array<{
    id: string;
    changes: Record<string, any>;
    previousValues: Record<string, any>;
  }> = [];

  // Collect nested auto layout frame IDs for cascading sync
  const nestedAutoLayoutFrameIds: string[] = [];

  // Handle hug frames (need to update their size based on content)
  const HUG_SYNC_TOLERANCE = 1;

  if (isHugFrame) {
    const sizeChanges: any = {};
    const previousValues: any = {};
    let hasChanges = false;

    const isHugHorizontal = frameObject.autoLayoutSizing.horizontal === "hug";
    const isHugVertical = frameObject.autoLayoutSizing.vertical === "hug";

    if (isHugHorizontal) {
      const domWidth = round2(frameRect.width / viewport.zoom);
      if (Math.abs(frameObject.width - domWidth) > HUG_SYNC_TOLERANCE) {
        sizeChanges.width = domWidth;
        previousValues.width = frameObject.width;
        hasChanges = true;
      }
    }

    if (isHugVertical) {
      const domHeight = round2(frameRect.height / viewport.zoom);
      if (Math.abs(frameObject.height - domHeight) > HUG_SYNC_TOLERANCE) {
        sizeChanges.height = domHeight;
        previousValues.height = frameObject.height;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      batchUpdates.push({ id: frameId, changes: sizeChanges, previousValues });
    }
  }

  // Sync children positions and sizes
  const SYNC_TOLERANCE = 1;

  frameObject.childIds.forEach((childId) => {
    const childObject = objects[childId];

    if (childObject?.absolutePositioned) return;
    if (!childObject) return;
    if (!childObject.visible) return;

    const childElement = frameElement.querySelector(
      `[data-object-id="${childId}"]`
    );
    if (!childElement) return;

    const childRect = childElement.getBoundingClientRect();

    // round2 immediately so tolerance checks and dispatched values are identical,
    // preventing oscillation between sync passes.
    const relativeX = round2((childRect.left - frameRect.left) / viewport.zoom);
    const relativeY = round2((childRect.top - frameRect.top) / viewport.zoom);
    const domWidth = round2(childRect.width / viewport.zoom);
    const domHeight = round2(childRect.height / viewport.zoom);

    const positionChanged =
      Math.abs(childObject.x - relativeX) > SYNC_TOLERANCE ||
      Math.abs(childObject.y - relativeY) > SYNC_TOLERANCE;

    const isWidthFlexible =
      childObject.autoLayoutSizing?.horizontal === "fill" ||
      childObject.autoLayoutSizing?.horizontal === "hug";
    const isHeightFlexible =
      childObject.autoLayoutSizing?.vertical === "fill" ||
      childObject.autoLayoutSizing?.vertical === "hug";

    const widthChanged =
      isWidthFlexible &&
      Math.abs(childObject.width - domWidth) > SYNC_TOLERANCE;
    const heightChanged =
      isHeightFlexible &&
      Math.abs(childObject.height - domHeight) > SYNC_TOLERANCE;
    const sizeChanged = widthChanged || heightChanged;

    if (positionChanged || sizeChanged) {
      const changes: any = {};
      const previousValues: any = {};

      if (positionChanged) {
        changes.x = relativeX;
        changes.y = relativeY;
        previousValues.x = childObject.x;
        previousValues.y = childObject.y;
      }

      if (widthChanged) {
        changes.width = domWidth;
        previousValues.width = childObject.width;
      }
      if (heightChanged) {
        changes.height = domHeight;
        previousValues.height = childObject.height;
      }

      batchUpdates.push({ id: childId, changes, previousValues });
    }

    if (
      childObject.type === "frame" &&
      childObject.properties?.type === "frame" &&
      childObject.properties.autoLayout?.mode !== "none"
    ) {
      nestedAutoLayoutFrameIds.push(childId);
    }
  });

  // Filter out updates that match the last synced values (prevents re-dispatch loops)
  const frameCache = lastSyncedValues.get(frameId) ?? new Map();
  const novelUpdates = batchUpdates.filter(({ id, changes }) => {
    const prev = frameCache.get(id);
    if (!prev) return true;
    const same =
      (changes.x === undefined || changes.x === prev.x) &&
      (changes.y === undefined || changes.y === prev.y) &&
      (changes.width === undefined || changes.width === prev.width) &&
      (changes.height === undefined || changes.height === prev.height);
    return !same;
  });

  if (novelUpdates.length > 0) {
    dispatch({
      type: "objects.updated.batch",
      payload: {
        updates: novelUpdates,
        context: "auto-layout-sync",
        skipOverrideCreation: true,
      },
    });
    syncCooldowns.set(frameId, Date.now());

    // Record what we just wrote so the next observer-triggered sync skips them
    for (const { id, changes } of novelUpdates) {
      frameCache.set(id, { ...frameCache.get(id), ...changes });
    }
    lastSyncedValues.set(frameId, frameCache);
  }

  // Schedule cascading sync for nested auto layout frames in a single RAF
  if (nestedAutoLayoutFrameIds.length > 0) {
    requestAnimationFrame(() => {
      const freshState = useAppStore.getState();
      for (const childId of nestedAutoLayoutFrameIds) {
        syncAutoLayoutPositionsFromDOM(
          childId,
          freshState.objects,
          freshState.viewport,
          dispatch
        );
      }
    });
  }

  window.dispatchEvent(
    new CustomEvent("auto-layout-sync-complete", {
      detail: { frameId },
    })
  );

  // Keep syncDispatchingCount elevated longer than the observer debounce (50ms)
  // to suppress the dispatch→render→observe→re-dispatch cascade.
  setTimeout(() => {
    syncDispatchingCount--;
  }, 120);

  activeSyncs.delete(frameId);
}

// Per-frame timeouts for debouncing sync calls
const syncTimeouts = new Map<string, NodeJS.Timeout>();

export function debouncedSyncAutoLayoutPositions(
  frameId: string,
  objects: Record<string, CanvasObject>,
  viewport: Viewport,
  dispatch: (action: any) => void,
  delay: number = 100,
  immediate: boolean = false
) {
  // Removed: Debounced sync logging

  // For immediate sync (e.g., after keyboard reordering), execute right away
  if (immediate) {
    // Removed: Immediate sync logging
    // Clear any existing timeout to avoid duplicate syncs
    const existingTimeout = syncTimeouts.get(frameId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      syncTimeouts.delete(frameId);
    }

    syncAutoLayoutPositionsFromDOM(frameId, objects, viewport, dispatch);
    return;
  }

  const existingTimeout = syncTimeouts.get(frameId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    // Removed: Timeout cleared logging
  }

  const newTimeout = setTimeout(() => {
    syncTimeouts.delete(frameId);

    // Use fresh state — the viewport may have changed since the debounce was queued
    // (e.g., user started zooming between the observer firing and this timeout).
    // Also check syncDisabled in case zoom/pan started after this was queued.
    if (observer.isSyncDisabled()) return;

    const freshState = useAppStore.getState();
    syncAutoLayoutPositionsFromDOM(
      frameId,
      freshState.objects,
      freshState.viewport,
      dispatch
    );
  }, delay);

  syncTimeouts.set(frameId, newTimeout);
}

/**
 * Trigger immediate sync for auto layout frame after state changes (e.g., reordering)
 * This bypasses the debouncing to provide instant visual feedback
 */
export function triggerImmediateAutoLayoutSync(
  frameId: string,
  objects: Record<string, CanvasObject>,
  viewport: Viewport,
  dispatch: (action: any) => void
) {
  // Check if this is an auto layout frame
  const frame = objects[frameId];
  if (
    !frame ||
    frame.type !== "frame" ||
    frame.properties?.type !== "frame" ||
    !frame.properties.autoLayout?.mode ||
    frame.properties.autoLayout.mode === "none"
  ) {
    return;
  }

  // Use requestAnimationFrame to ensure DOM has updated first,
  // then read FRESH state so we don't use stale objects/viewport
  requestAnimationFrame(() => {
    const freshState = useAppStore.getState();
    debouncedSyncAutoLayoutPositions(
      frameId,
      freshState.objects,
      freshState.viewport,
      freshState.dispatch,
      0, // No delay
      true // Immediate flag
    );
  });
}

/**
 * Observer manager for auto layout frames
 * Watches for size/position changes and automatically syncs positions
 */
class AutoLayoutObserver {
  private resizeObserver: ResizeObserver | null = null;
  // Per-frame MutationObservers — avoids the costly disconnect/reconnect-all pattern
  private mutationObservers = new Map<string, MutationObserver>();
  private observedFrames = new Map<
    string,
    {
      frameElement: Element;
      dispatch: (action: any) => void;
    }
  >();
  // Reverse lookup: element → frameId for O(1) ResizeObserver resolution
  private elementToFrameId = new Map<Element, string>();
  private syncDisabled = false;
  private initialSyncDone = new Set<string>();
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.resizeObserver = new ResizeObserver((entries) => {
        if (this.syncDisabled || syncDispatchingCount > 0) return;

        const framesToSync = new Set<string>();

        for (const entry of entries) {
          const element = entry.target;

          // O(1) lookup: is this element a frame or a registered child?
          const directFrameId = this.elementToFrameId.get(element);
          if (directFrameId) {
            // Skip if element has transforms (common during drags)
            const style = window.getComputedStyle(element);
            if (style.transform !== "none" && style.transform !== "matrix(1, 0, 0, 1, 0, 0)") {
              continue;
            }
            framesToSync.add(directFrameId);
          }
        }

        framesToSync.forEach((frameId) => {
          const frameData = this.observedFrames.get(frameId);
          if (frameData) {
            const freshState = useAppStore.getState();
            debouncedSyncAutoLayoutPositions(
              frameId,
              freshState.objects,
              freshState.viewport,
              frameData.dispatch,
              50
            );
          }
        });
      });
    }
  }

  private createMutationObserverForFrame(frameId: string): MutationObserver {
    return new MutationObserver((mutations) => {
      if (this.syncDisabled || syncDispatchingCount > 0) return;
      if (!this.observedFrames.has(frameId)) return;

      let needsSync = false;

      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          needsSync = true;
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.hasAttribute("data-object-id") && this.resizeObserver) {
                this.resizeObserver.observe(element);
                this.elementToFrameId.set(element, frameId);
              }
            }
          });
        }
      });

      if (needsSync) {
        const frameData = this.observedFrames.get(frameId);
        if (frameData) {
          const freshState = useAppStore.getState();
          debouncedSyncAutoLayoutPositions(
            frameId,
            freshState.objects,
            freshState.viewport,
            frameData.dispatch,
            100
          );
        }
      }
    });
  }

  /**
   * Start observing an auto layout frame and its children
   * AGGRESSIVE MODE: Also observes parent and all ancestor frames
   */
  observeFrame(
    frameId: string,
    objects: Record<string, CanvasObject>,
    viewport: Viewport,
    dispatch: (action: any) => void
  ) {
    const frameElement = document.querySelector(
      `[data-object-id="${frameId}"]`
    );
    if (!frameElement) return;

    const frameObject = objects[frameId];
    if (!frameObject || frameObject.type !== "frame") return;

    // Check for auto layout in both places: properties.autoLayout (main frames) and direct autoLayout (instances)
    const autoLayout =
      frameObject.properties?.type === "frame"
        ? frameObject.properties.autoLayout
        : (frameObject as any).autoLayout ||
          (frameObject.properties as any)?.autoLayout; // For instance frames - check both places

    // Check if this frame has auto layout OR has children with auto layout sizing
    const hasAutoLayout = autoLayout && autoLayout.mode !== "none";

    const hasChildrenWithAutoLayoutSizing = frameObject.childIds.some(
      (childId) => {
        const child = objects[childId];
        const hasALSizing =
          child &&
          (child.autoLayoutSizing?.horizontal === "fill" ||
            child.autoLayoutSizing?.vertical === "fill" ||
            child.autoLayoutSizing?.horizontal === "hug" ||
            child.autoLayoutSizing?.vertical === "hug");

        return hasALSizing;
      }
    );

    if (!hasAutoLayout && !hasChildrenWithAutoLayoutSizing) {
      return;
    }

    // Store frame data (only dispatch — objects/viewport are read fresh from store)
    this.observedFrames.set(frameId, {
      frameElement,
      dispatch,
    });

    // Create a per-frame MutationObserver (avoids disconnect/reconnect-all)
    if (!this.mutationObservers.has(frameId)) {
      const mo = this.createMutationObserverForFrame(frameId);
      mo.observe(frameElement, { childList: true, subtree: false });
      this.mutationObservers.set(frameId, mo);
    }

    // Observe the frame element and its direct canvas-object children for resize changes
    if (this.resizeObserver) {
      this.resizeObserver.observe(frameElement);
      this.elementToFrameId.set(frameElement, frameId);

      frameObject.childIds.forEach((childId) => {
        const childElement = frameElement.querySelector(
          `[data-object-id="${childId}"]`
        );
        if (childElement) {
          this.resizeObserver!.observe(childElement);
          this.elementToFrameId.set(childElement, frameId);
        }
      });
    }

    // Schedule a deferred initial sync instead of running it synchronously.
    // Synchronous sync inside observeFrame dispatches to the store, which
    // triggers React re-renders, which can call observeFrame again — creating
    // an infinite "maximum update depth" loop. By deferring to a timeout,
    // the sync happens outside React's commit phase.
    if (!this.initialSyncDone.has(frameId) && !this.syncDisabled) {
      this.initialSyncDone.add(frameId);
      setTimeout(() => {
        if (this.syncDisabled) return;
        const fresh = useAppStore.getState();
        syncAutoLayoutPositionsFromDOM(frameId, fresh.objects, fresh.viewport, dispatch);
      }, 0);
    }
  }

  /**
   * Observe the parent frame (if it also uses auto layout) so that
   * nested auto-layout frames stay in sync.  Only the parent element
   * itself is observed — NOT all of its descendants.
   */
  private observeParentChain(
    frameId: string,
    objects: Record<string, CanvasObject>
  ) {
    const frameObject = objects[frameId];
    if (!frameObject || !frameObject.parentId) return;

    const parentObject = objects[frameObject.parentId];
    if (!parentObject || parentObject.type !== "frame") return;

    const parentElement = document.querySelector(
      `[data-object-id="${frameObject.parentId}"]`
    );
    if (!parentElement) return;

    const parentAutoLayout =
      parentObject.properties?.type === "frame"
        ? parentObject.properties.autoLayout
        : (parentObject as any).autoLayout;

    if (parentAutoLayout && parentAutoLayout.mode !== "none") {
      // Only observe the parent element itself for resize — not all descendants
      if (this.resizeObserver) {
        this.resizeObserver.observe(parentElement);
      }
    }
  }

  /**
   * Observe all children of a frame for resize changes
   */
  private observeFrameChildren(
    frameId: string,
    frameElement: Element,
    frameObject: CanvasObject
  ) {
    frameObject.childIds.forEach((childId) => {
      const childElement = frameElement.querySelector(
        `[data-object-id="${childId}"]`
      );
      if (childElement) {
        // Check if we're already observing this element to avoid duplicate observations
        if (this.resizeObserver) {
          try {
            this.resizeObserver.observe(childElement);
          } catch (error) {
            // ResizeObserver will throw if already observing, which is fine
          }
        }
      }
    });
  }

  /**
   * Stop observing a frame
   */
  unobserveFrame(frameId: string) {
    const frameData = this.observedFrames.get(frameId);
    if (!frameData) return;

    // Stop observing all children + frame element for resize, and clean up reverse map
    if (this.resizeObserver) {
      const childElements =
        frameData.frameElement.querySelectorAll("[data-object-id]");
      childElements.forEach((element) => {
        this.resizeObserver!.unobserve(element);
        this.elementToFrameId.delete(element);
      });
      this.resizeObserver.unobserve(frameData.frameElement);
      this.elementToFrameId.delete(frameData.frameElement);
    }

    // Disconnect only this frame's MutationObserver (O(1) instead of O(n))
    const mo = this.mutationObservers.get(frameId);
    if (mo) {
      mo.disconnect();
      this.mutationObservers.delete(frameId);
    }

    this.observedFrames.delete(frameId);
  }

  /**
   * Disable sync temporarily (e.g., during zoom/pan).
   * Also clears all pending debounced syncs to prevent stale
   * viewport data from corrupting positions during zoom.
   */
  disableSync() {
    this.syncDisabled = true;
    // Clear all pending debounced sync timeouts — they captured stale viewport state
    for (const [frameId, timeout] of syncTimeouts) {
      clearTimeout(timeout);
    }
    syncTimeouts.clear();
  }

  /**
   * Re-enable sync and trigger a catch-up sync for all observed frames.
   * This picks up any changes that were skipped while sync was disabled.
   */
  enableSync() {
    this.syncDisabled = false;
    this.initialSyncDone.clear();

    // Stagger catch-up syncs to avoid a burst of work after zoom/pan.
    // Each frame gets an increasing delay so they don't all fire at once.
    let delay = 100;
    const STAGGER_MS = 30;

    this.observedFrames.forEach((frameData, frameId) => {
      const freshState = useAppStore.getState();
      debouncedSyncAutoLayoutPositions(
        frameId,
        freshState.objects,
        freshState.viewport,
        frameData.dispatch,
        delay
      );
      delay += STAGGER_MS;
    });
  }

  /**
   * Check if sync is currently disabled
   */
  isSyncDisabled() {
    return this.syncDisabled;
  }
}

// Global instance
const observer = new AutoLayoutObserver();

// Public API
export const AutoLayoutObserverAPI = {
  observeFrame: (
    frameId: string,
    objects: Record<string, CanvasObject>,
    viewport: Viewport,
    dispatch: (action: any) => void
  ) => observer.observeFrame(frameId, objects, viewport, dispatch),
  unobserveFrame: (frameId: string) => observer.unobserveFrame(frameId),
  disableSync: () => observer.disableSync(),
  enableSync: () => observer.enableSync(),
};
