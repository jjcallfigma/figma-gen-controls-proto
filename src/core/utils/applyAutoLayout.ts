import { CanvasObject, AutoLayoutMode } from "@/types/canvas";
import {
  AutoLayoutObserverAPI,
  syncAutoLayoutPositionsFromDOM,
} from "@/core/utils/autoLayout";
import { useAppStore } from "@/core/state/store";

/**
 * Heuristics result for auto layout configuration
 */
interface AutoLayoutHeuristics {
  direction: AutoLayoutMode; // "horizontal" | "vertical"
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

/**
 * Analyze children positions to determine best auto layout direction, gap, and padding.
 * Looks at the bounding boxes of children relative to the frame to infer layout intent.
 */
export function inferAutoLayoutFromChildren(
  frame: CanvasObject,
  children: CanvasObject[]
): AutoLayoutHeuristics {
  const defaultResult: AutoLayoutHeuristics = {
    direction: "vertical",
    gap: 8,
    padding: { top: 16, right: 16, bottom: 16, left: 16 },
  };

  if (children.length === 0) {
    return defaultResult;
  }

  if (children.length === 1) {
    // Single child: infer padding from its position
    const child = children[0];
    const paddingTop = Math.max(0, Math.round(child.y));
    const paddingLeft = Math.max(0, Math.round(child.x));
    const paddingBottom = Math.max(
      0,
      Math.round(frame.height - (child.y + child.height))
    );
    const paddingRight = Math.max(
      0,
      Math.round(frame.width - (child.x + child.width))
    );

    return {
      direction: "vertical",
      gap: 0,
      padding: {
        top: paddingTop,
        right: paddingRight,
        bottom: paddingBottom,
        left: paddingLeft,
      },
    };
  }

  // Multiple children: sort by position to determine direction
  const sortedByX = [...children].sort((a, b) => a.x - b.x);
  const sortedByY = [...children].sort((a, b) => a.y - b.y);

  // Calculate spread in each direction
  const xSpread =
    sortedByX[sortedByX.length - 1].x +
    sortedByX[sortedByX.length - 1].width -
    sortedByX[0].x;
  const ySpread =
    sortedByY[sortedByY.length - 1].y +
    sortedByY[sortedByY.length - 1].height -
    sortedByY[0].y;

  // Check for overlap: if children overlap significantly in one axis, the layout is along the other
  const hasHorizontalOverlap = checkAxisOverlap(children, "horizontal");
  const hasVerticalOverlap = checkAxisOverlap(children, "vertical");

  let direction: AutoLayoutMode;

  if (hasVerticalOverlap && !hasHorizontalOverlap) {
    // Children overlap on Y axis (share the same vertical band) → side by side → horizontal
    direction = "horizontal";
  } else if (hasHorizontalOverlap && !hasVerticalOverlap) {
    // Children overlap on X axis (share the same horizontal band) → stacked → vertical
    direction = "vertical";
  } else {
    // Use spread as fallback heuristic
    direction = xSpread >= ySpread ? "horizontal" : "vertical";
  }

  // Calculate gap
  let gap = 0;
  if (direction === "horizontal") {
    const sorted = sortedByX;
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = sorted[i - 1].x + sorted[i - 1].width;
      const currentStart = sorted[i].x;
      gaps.push(Math.max(0, currentStart - prevEnd));
    }
    gap = gaps.length > 0 ? Math.round(median(gaps)) : 0;
  } else {
    const sorted = sortedByY;
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = sorted[i - 1].y + sorted[i - 1].height;
      const currentStart = sorted[i].y;
      gaps.push(Math.max(0, currentStart - prevEnd));
    }
    gap = gaps.length > 0 ? Math.round(median(gaps)) : 0;
  }

  // Calculate padding from the bounding box of all children
  const childrenMinX = Math.min(...children.map((c) => c.x));
  const childrenMinY = Math.min(...children.map((c) => c.y));
  const childrenMaxX = Math.max(...children.map((c) => c.x + c.width));
  const childrenMaxY = Math.max(...children.map((c) => c.y + c.height));

  const padding = {
    top: Math.max(0, Math.round(childrenMinY)),
    left: Math.max(0, Math.round(childrenMinX)),
    bottom: Math.max(0, Math.round(frame.height - childrenMaxY)),
    right: Math.max(0, Math.round(frame.width - childrenMaxX)),
  };

  return { direction, gap, padding };
}

/**
 * Check if children overlap along an axis (meaning they're stacked along that axis)
 */
function checkAxisOverlap(
  children: CanvasObject[],
  axis: "horizontal" | "vertical"
): boolean {
  if (children.length < 2) return false;

  let overlapCount = 0;
  const total = children.length * (children.length - 1) / 2;

  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const a = children[i];
      const b = children[j];

      if (axis === "horizontal") {
        // Check x-axis overlap
        const aLeft = a.x;
        const aRight = a.x + a.width;
        const bLeft = b.x;
        const bRight = b.x + b.width;
        if (aLeft < bRight && bLeft < aRight) {
          overlapCount++;
        }
      } else {
        // Check y-axis overlap
        const aTop = a.y;
        const aBottom = a.y + a.height;
        const bTop = b.y;
        const bBottom = b.y + b.height;
        if (aTop < bBottom && bTop < aBottom) {
          overlapCount++;
        }
      }
    }
  }

  // Consider it overlapping if majority of pairs overlap
  return overlapCount > total / 2;
}

/**
 * Calculate median of an array of numbers
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Apply auto layout to the current selection.
 * Handles 4 cases:
 *  1. Single frame without AL → add AL to it (with heuristics)
 *  2. Single frame with AL → wrap it in a new AL frame
 *  3. Multiple nodes in same parent → wrap them in a new AL frame
 *  4. Multiple nodes in different parents → wrap nodes within each parent
 */
export function applyAutoLayout(
  dispatch: (event: any) => void
): void {
  const state = useAppStore.getState();
  const { objects, selection, viewport } = state;
  const selectedIds = selection.selectedIds;

  if (selectedIds.length === 0) return;

  // Resolve selected objects
  const selectedObjects = selectedIds
    .map((id) => objects[id])
    .filter(Boolean);

  if (selectedObjects.length === 0) return;

  // Case 1 & 2: Single object selected
  if (selectedObjects.length === 1) {
    const obj = selectedObjects[0];

    if (obj.type === "frame") {
      const autoLayout = obj.properties?.type === "frame"
        ? (obj.properties as any).autoLayout
        : undefined;
      const hasAL = autoLayout && autoLayout.mode !== "none";

      if (!hasAL) {
        // Case 1: Single frame without AL → add auto layout to it
        applyAutoLayoutToFrame(obj, objects, dispatch, viewport);
      } else {
        // Case 2: Single frame with AL → wrap in a new AL frame
        wrapObjectsInAutoLayoutFrame(
          [obj],
          obj.parentId,
          objects,
          dispatch,
          viewport
        );
      }
    } else {
      // Single non-frame object → wrap it in a new AL frame
      wrapObjectsInAutoLayoutFrame(
        [obj],
        obj.parentId,
        objects,
        dispatch,
        viewport
      );
    }
    return;
  }

  // Multiple objects selected
  // Group by parent
  const groups: Record<string, CanvasObject[]> = {};
  for (const obj of selectedObjects) {
    const parentKey = obj.parentId || "__root__";
    if (!groups[parentKey]) {
      groups[parentKey] = [];
    }
    groups[parentKey].push(obj);
  }

  const parentKeys = Object.keys(groups);

  if (parentKeys.length === 1) {
    // Case 3: All in same parent → wrap them together
    const parentKey = parentKeys[0];
    const objs = groups[parentKey];
    const parentId = parentKey === "__root__" ? undefined : parentKey;
    wrapObjectsInAutoLayoutFrame(objs, parentId, objects, dispatch, viewport);
  } else {
    // Case 4: Different parents → wrap within each parent separately
    for (const parentKey of parentKeys) {
      const objs = groups[parentKey];
      const parentId = parentKey === "__root__" ? undefined : parentKey;
      wrapObjectsInAutoLayoutFrame(objs, parentId, objects, dispatch, viewport);
    }
  }
}

/**
 * Case 1: Apply auto layout directly to an existing frame.
 * Uses heuristics to determine direction, gap, and padding.
 */
function applyAutoLayoutToFrame(
  frame: CanvasObject,
  objects: Record<string, CanvasObject>,
  dispatch: (event: any) => void,
  viewport: any
): void {
  // Get children to analyze
  const children = frame.childIds
    .map((id) => objects[id])
    .filter(Boolean);

  const heuristics = inferAutoLayoutFromChildren(frame, children);

  const currentProperties = frame.properties || {};

  dispatch({
    type: "object.updated",
    payload: {
      id: frame.id,
      changes: {
        properties: {
          ...currentProperties,
          autoLayout: {
            mode: heuristics.direction,
            direction: "normal",
            gap: heuristics.gap,
            padding: heuristics.padding,
            alignItems: "start",
            justifyContent: "start",
          },
        },
      },
      previousValues: {
        properties: currentProperties,
      },
    },
  });

  // Initialize autoLayoutSizing on all children
  children.forEach((child) => {
    if (child && !child.autoLayoutSizing) {
      dispatch({
        type: "object.updated",
        payload: {
          id: child.id,
          changes: {
            autoLayoutSizing: {
              horizontal: "fixed",
              vertical: "fixed",
            },
          },
          previousValues: {
            autoLayoutSizing: undefined,
          },
        },
      });
    }
  });

  // Sync positions after enabling auto layout
  setTimeout(() => {
    const freshState = useAppStore.getState();
    syncAutoLayoutPositionsFromDOM(
      frame.id,
      freshState.objects,
      freshState.viewport,
      dispatch
    );
    AutoLayoutObserverAPI.observeFrame(
      frame.id,
      freshState.objects,
      freshState.viewport,
      dispatch
    );

    // Also re-observe parent if it's an AL frame
    const parentId = freshState.objects[frame.id]?.parentId;
    if (parentId && freshState.objects[parentId]?.type === "frame") {
      AutoLayoutObserverAPI.observeFrame(
        parentId,
        freshState.objects,
        freshState.viewport,
        dispatch
      );
    }
  }, 50);
}

/**
 * Cases 2, 3, 4: Wrap the given objects in a new frame with auto layout.
 * The new frame will be placed in the same parent, at the position of the first
 * selected object, and sized to the bounding box of all selected objects.
 */
function wrapObjectsInAutoLayoutFrame(
  objects: CanvasObject[],
  parentId: string | undefined,
  allObjects: Record<string, CanvasObject>,
  dispatch: (event: any) => void,
  viewport: any
): void {
  if (objects.length === 0) return;

  // Calculate the bounding box of all objects (in parent-relative coordinates)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const obj of objects) {
    minX = Math.min(minX, obj.x);
    minY = Math.min(minY, obj.y);
    maxX = Math.max(maxX, obj.x + obj.width);
    maxY = Math.max(maxY, obj.y + obj.height);
  }

  const boundingWidth = maxX - minX;
  const boundingHeight = maxY - minY;

  // Infer layout heuristics based on the objects' relative positions
  // Create a virtual frame to run heuristics on
  const virtualFrame: CanvasObject = {
    id: "__virtual__",
    type: "frame",
    name: "virtual",
    createdAt: 0,
    x: minX,
    y: minY,
    width: boundingWidth,
    height: boundingHeight,
    rotation: 0,
    autoLayoutSizing: { horizontal: "fixed", vertical: "fixed" },
    childIds: [],
    zIndex: 0,
    visible: true,
    locked: false,
    properties: { type: "frame", borderRadius: 0, overflow: "visible" },
    fills: [],
    strokes: [],
    effects: [],
  };

  // Adjust children positions to be relative to the bounding box
  const adjustedChildren = objects.map((obj) => ({
    ...obj,
    x: obj.x - minX,
    y: obj.y - minY,
  }));

  const heuristics = inferAutoLayoutFromChildren(virtualFrame, adjustedChildren);

  // Generate a unique ID for the new frame
  const newFrameId = `frame-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Determine the insertion index in the parent (at the position of the first selected object)
  let insertIndex = 0;
  if (parentId) {
    const parent = allObjects[parentId];
    if (parent) {
      // Find the lowest index of any selected object in the parent's childIds
      const indices = objects
        .map((obj) => parent.childIds.indexOf(obj.id))
        .filter((i) => i !== -1);
      if (indices.length > 0) {
        insertIndex = Math.min(...indices);
      }
    }
  }

  // Create the new frame
  const newFrame: CanvasObject = {
    id: newFrameId,
    type: "frame",
    name: "Auto Layout",
    createdAt: Date.now(),
    x: minX,
    y: minY,
    width: boundingWidth,
    height: boundingHeight,
    rotation: 0,
    autoLayoutSizing: { horizontal: "fixed", vertical: "fixed" },
    childIds: [],
    parentId: parentId,
    zIndex: 0,
    visible: true,
    locked: false,
    fills: [],
    strokes: [],
    effects: [],
    properties: {
      type: "frame",
      borderRadius: 0,
      overflow: "visible",
      autoLayout: {
        mode: heuristics.direction,
        direction: "normal",
        gap: heuristics.gap,
        padding: heuristics.padding,
        alignItems: "start",
        justifyContent: "start",
      },
    },
  };

  // Step 1: Create the new frame
  dispatch({
    type: "object.created",
    payload: { object: newFrame },
  });

  // Step 2: Add the new frame to the parent's childIds at the correct position
  if (parentId) {
    dispatch({
      type: "object.reparented",
      payload: {
        objectId: newFrameId,
        newParentId: parentId,
        previousParentId: undefined,
        newIndex: insertIndex,
      },
    });
  }

  // Step 3: Sort objects by their visual order to maintain stacking
  // Sort by the order they appear in the parent's childIds (or by position if root)
  let sortedObjects: CanvasObject[];
  if (parentId) {
    const parent = allObjects[parentId];
    if (parent) {
      sortedObjects = [...objects].sort((a, b) => {
        const aIndex = parent.childIds.indexOf(a.id);
        const bIndex = parent.childIds.indexOf(b.id);
        return aIndex - bIndex;
      });
    } else {
      sortedObjects = objects;
    }
  } else {
    // Root level: sort by position along the inferred direction
    if (heuristics.direction === "horizontal") {
      sortedObjects = [...objects].sort((a, b) => a.x - b.x);
    } else {
      sortedObjects = [...objects].sort((a, b) => a.y - b.y);
    }
  }

  // Step 4: Reparent each selected object into the new frame
  sortedObjects.forEach((obj, index) => {
    // Calculate new relative position within the wrapper frame
    const newX = obj.x - minX;
    const newY = obj.y - minY;

    dispatch({
      type: "object.reparented",
      payload: {
        objectId: obj.id,
        newParentId: newFrameId,
        previousParentId: parentId,
        newIndex: index,
      },
    });

    // Update the position to be relative to the new frame
    dispatch({
      type: "object.updated",
      payload: {
        id: obj.id,
        changes: {
          x: newX,
          y: newY,
          autoLayoutSizing: {
            horizontal: "fixed",
            vertical: "fixed",
          },
        },
        previousValues: {
          x: obj.x,
          y: obj.y,
          autoLayoutSizing: obj.autoLayoutSizing,
        },
      },
    });
  });

  // Step 5: Select the new frame
  dispatch({
    type: "selection.changed",
    payload: {
      selectedIds: [newFrameId],
      previousSelection: objects.map((o) => o.id),
    },
  });

  // Step 6: Sync auto layout positions after DOM updates
  setTimeout(() => {
    const freshState = useAppStore.getState();
    syncAutoLayoutPositionsFromDOM(
      newFrameId,
      freshState.objects,
      freshState.viewport,
      dispatch
    );
    AutoLayoutObserverAPI.observeFrame(
      newFrameId,
      freshState.objects,
      freshState.viewport,
      dispatch
    );

    // Also re-observe parent if it's an AL frame
    if (parentId && freshState.objects[parentId]?.type === "frame") {
      AutoLayoutObserverAPI.observeFrame(
        parentId,
        freshState.objects,
        freshState.viewport,
        dispatch
      );
    }
  }, 50);
}
