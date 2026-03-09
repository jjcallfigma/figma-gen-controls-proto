import { getAbsolutePosition, worldToScreen } from "@/core/utils/coordinates";
import { CanvasObject, Viewport } from "@/types/canvas";

export interface SnapPoint {
  value: number; // The position value (x or y coordinate)
  type: "edge" | "center"; // Type of snap point
  direction: "horizontal" | "vertical"; // Direction of the snap line
  sourceId: string; // ID of the object creating this snap point
  sourceEdge?: "left" | "right" | "top" | "bottom" | "midpoint"; // Which edge/center of the source
}

export interface SnapResult {
  snappedX?: number;
  snappedY?: number;
  snapPoints: SnapPoint[];
  horizontalGuides: SnapGuide[];
  verticalGuides: SnapGuide[];
}

export interface SnapGuide {
  position: number; // Screen coordinate
  start: number; // Screen coordinate of guide start
  end: number; // Screen coordinate of guide end
  direction: "horizontal" | "vertical";
  type: "edge" | "center";
  snapPoints?: { x: number; y: number }[]; // Screen coordinates of snap points (corners for edges, center for center snaps)
}

export interface SnapBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SNAP_THRESHOLD = 8; // pixels in screen space

/**
 * Gets potential snap points from siblings and parent objects
 */
export function getSnapPoints(
  objects: Record<string, CanvasObject>,
  viewport: Viewport,
  excludeIds: string[] = [],
  selectedIds: string[] = [],
  context: "drag" | "resize" = "drag",
  excludeAutoLayoutAffected: boolean = false
): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];

  // Determine valid snap targets: siblings and parent of selected objects
  const validSnapTargets = new Set<string>();

  // Note: Auto layout exclusion is now handled at the snap point level
  // instead of excluding entire objects

  selectedIds.forEach((selectedId) => {
    const selectedObj = objects[selectedId];
    if (!selectedObj) return;

    const parentId = selectedObj.parentId;

    // Add parent as valid snap target, but exclude hug-content parents to prevent feedback loops
    if (parentId && objects[parentId]) {
      const parent = objects[parentId];

      const isAutoLayoutParent =
        parent.type === "frame" &&
        parent.properties?.type === "frame" &&
        (parent.properties as any).autoLayout?.mode !== "none";

      // Always add parents as snap targets - we'll filter problematic edges later
      validSnapTargets.add(parentId);
    }

    // Add all siblings as valid snap targets
    if (parentId) {
      const parent = objects[parentId];
      if (parent && parent.childIds) {
        parent.childIds.forEach((siblingId) => {
          if (!excludeIds.includes(siblingId)) {
            validSnapTargets.add(siblingId);
          }
        });
      }
    } else {
      // If no parent, add all root-level objects as siblings
      Object.keys(objects).forEach((objId) => {
        const obj = objects[objId];
        if (obj && !obj.parentId && !excludeIds.includes(objId)) {
          validSnapTargets.add(objId);
        }
      });
    }
  });

  // Calculate viewport bounds in world space for culling
  const viewportWorldBounds = {
    left: -viewport.panX / viewport.zoom,
    top: -viewport.panY / viewport.zoom,
    right: (-viewport.panX + window.innerWidth) / viewport.zoom,
    bottom: (-viewport.panY + window.innerHeight) / viewport.zoom,
  };

  Object.entries(objects).forEach(([id, object]) => {
    // Only consider valid snap targets (siblings and parent)
    if (!validSnapTargets.has(id)) {
      return;
    }

    // Skip excluded objects (usually the ones being dragged/resized)
    if (excludeIds.includes(id)) {
      return;
    }

    // Skip invisible or locked objects
    if (object.visible === false || object.locked) return;

    // Get absolute position for the object
    const absolutePos = getAbsolutePosition(id, objects);
    const bounds = {
      left: absolutePos.x,
      top: absolutePos.y,
      right: absolutePos.x + object.width,
      bottom: absolutePos.y + object.height,
    };

    // Cull objects outside viewport (with some padding for snap lines)
    const padding = 100; // world space padding
    if (
      bounds.right < viewportWorldBounds.left - padding ||
      bounds.left > viewportWorldBounds.right + padding ||
      bounds.bottom < viewportWorldBounds.top - padding ||
      bounds.top > viewportWorldBounds.bottom + padding
    ) {
      return;
    }

    // Check if this object is a hug-content auto layout parent
    const isHugContentParent =
      object.type === "frame" &&
      object.properties?.type === "frame" &&
      (object.properties as any).autoLayout?.mode !== "none" &&
      (object.autoLayoutSizing?.horizontal === "hug" ||
        object.autoLayoutSizing?.vertical === "hug");

    // Determine which edges to exclude for hug-content parents during resize operations
    const shouldExcludeHorizontalEdges =
      context === "resize" &&
      isHugContentParent &&
      object.autoLayoutSizing?.horizontal === "hug";
    const shouldExcludeVerticalEdges =
      context === "resize" &&
      isHugContentParent &&
      object.autoLayoutSizing?.vertical === "hug";

    // Add horizontal snap points (for vertical alignment) - exclude if hug horizontal
    if (!shouldExcludeHorizontalEdges) {
      snapPoints.push(
        // Left edge
        {
          value: bounds.left,
          type: "edge",
          direction: "vertical",
          sourceId: id,
          sourceEdge: "left",
        },
        // Right edge
        {
          value: bounds.right,
          type: "edge",
          direction: "vertical",
          sourceId: id,
          sourceEdge: "right",
        }
      );
    }

    // Always include centers for alignment
    snapPoints.push(
      // Horizontal center
      {
        value: bounds.left + object.width / 2,
        type: "center",
        direction: "vertical",
        sourceId: id,
      }
    );

    // Add vertical snap points (for horizontal alignment) - exclude if hug vertical
    if (!shouldExcludeVerticalEdges) {
      snapPoints.push(
        // Top edge
        {
          value: bounds.top,
          type: "edge",
          direction: "horizontal",
          sourceId: id,
          sourceEdge: "top",
        },
        // Bottom edge
        {
          value: bounds.bottom,
          type: "edge",
          direction: "horizontal",
          sourceId: id,
          sourceEdge: "bottom",
        }
      );
    }

    // Always include centers for alignment
    snapPoints.push(
      // Vertical center
      {
        value: bounds.top + object.height / 2,
        type: "center",
        direction: "horizontal",
        sourceId: id,
      }
    );
  });

  // Note: Removed parent midpoint generation for resize operations
  // as they're not useful and can be confusing during resize

  return snapPoints;
}

/**
 * Calculates the overall bounding box for multiple objects
 */
export function calculateSelectionBounds(
  objectIds: string[],
  positions: Record<string, { x: number; y: number }>,
  objects: Record<string, CanvasObject>
): SnapBounds | null {
  if (objectIds.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of objectIds) {
    const position = positions[id];
    const obj = objects[id];

    if (!position || !obj) continue;

    const left = position.x;
    const top = position.y;
    const right = position.x + obj.width;
    const bottom = position.y + obj.height;

    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  }

  if (minX === Infinity) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculates snap targets for a given bounds
 */
export function calculateSnapTargets(bounds: SnapBounds): {
  horizontal: number[]; // y values to snap to
  vertical: number[]; // x values to snap to
} {
  return {
    horizontal: [
      bounds.y, // top edge
      bounds.y + bounds.height / 2, // center
      bounds.y + bounds.height, // bottom edge
    ],
    vertical: [
      bounds.x, // left edge
      bounds.x + bounds.width / 2, // center
      bounds.x + bounds.width, // right edge
    ],
  };
}

/**
 * Calculates resize-specific snap targets based on the resize handle
 */
export function calculateResizeSnapTargets(
  bounds: SnapBounds,
  resizeHandle: string
): {
  horizontal: number[]; // y values to snap to
  vertical: number[]; // x values to snap to
} {
  const targets = { horizontal: [] as number[], vertical: [] as number[] };

  // Only include the edges that are being resized (NOT centers during edge resize)
  if (resizeHandle.includes("top")) {
    targets.horizontal.push(bounds.y); // top edge
  }
  if (resizeHandle.includes("bottom")) {
    targets.horizontal.push(bounds.y + bounds.height); // bottom edge
  }
  if (resizeHandle.includes("left")) {
    targets.vertical.push(bounds.x); // left edge
  }
  if (resizeHandle.includes("right")) {
    targets.vertical.push(bounds.x + bounds.width); // right edge
  }

  // For center-only handles (middle-left, middle-right, top-center, bottom-center),
  // DON'T include center points as targets - they should only snap to edges
  // Center snapping is only for true center resize operations (which don't exist in our current system)

  return targets;
}

/**
 * Finds snap matches and calculates the snapped position
 */
export function findSnapMatches(
  bounds: SnapBounds,
  snapPoints: SnapPoint[],
  viewport: Viewport
): SnapResult {
  const targets = calculateSnapTargets(bounds);
  const result: SnapResult = {
    snapPoints: [],
    horizontalGuides: [],
    verticalGuides: [],
  };

  // Find ALL horizontal snaps within threshold (not just the best one)
  type SnapMatch = { distance: number; value: number; points: SnapPoint[] };
  const allHorizontalSnaps: SnapMatch[] = [];

  targets.horizontal.forEach((targetY) => {
    const horizontalPoints = snapPoints.filter(
      (p) => p.direction === "horizontal"
    );

    horizontalPoints.forEach((snapPoint) => {
      const distance = Math.abs(targetY - snapPoint.value);
      const screenDistance = distance * viewport.zoom;

      if (screenDistance <= SNAP_THRESHOLD) {
        // Check if we already have a snap at this exact value
        let existingSnap = allHorizontalSnaps.find(
          (snap) => Math.abs(snap.value - snapPoint.value) < 0.1
        );

        if (existingSnap) {
          // Add to existing snap group
          existingSnap.points.push(snapPoint);
          // Update distance to the minimum (closest target)
          existingSnap.distance = Math.min(
            existingSnap.distance,
            screenDistance
          );
        } else {
          // Create new snap group
          allHorizontalSnaps.push({
            distance: screenDistance,
            value: snapPoint.value,
            points: [snapPoint],
          });
        }
      }
    });
  });

  // Find the best horizontal snap for positioning (closest one)
  const bestHorizontalSnap = allHorizontalSnaps.reduce<SnapMatch | null>(
    (best, current) =>
      !best || current.distance < best.distance ? current : best,
    null
  );

  // Find ALL vertical snaps within threshold (not just the best one)
  const allVerticalSnaps: SnapMatch[] = [];

  targets.vertical.forEach((targetX) => {
    const verticalPoints = snapPoints.filter((p) => p.direction === "vertical");

    verticalPoints.forEach((snapPoint) => {
      const distance = Math.abs(targetX - snapPoint.value);
      const screenDistance = distance * viewport.zoom;

      if (screenDistance <= SNAP_THRESHOLD) {
        // Check if we already have a snap at this exact value
        let existingSnap = allVerticalSnaps.find(
          (snap) => Math.abs(snap.value - snapPoint.value) < 0.1
        );

        if (existingSnap) {
          // Add to existing snap group
          existingSnap.points.push(snapPoint);
          // Update distance to the minimum (closest target)
          existingSnap.distance = Math.min(
            existingSnap.distance,
            screenDistance
          );
        } else {
          // Create new snap group
          allVerticalSnaps.push({
            distance: screenDistance,
            value: snapPoint.value,
            points: [snapPoint],
          });
        }
      }
    });
  });

  // Find the best vertical snap for positioning (closest one)
  const bestVerticalSnap = allVerticalSnaps.reduce<SnapMatch | null>(
    (best, current) =>
      !best || current.distance < best.distance ? current : best,
    null
  );

  // Calculate snapped position
  if (bestHorizontalSnap) {
    const snap: SnapMatch = bestHorizontalSnap;
    // Find which target point was snapped
    const targetIndex = targets.horizontal.findIndex(
      (y) => Math.abs(y - snap.value) * viewport.zoom <= SNAP_THRESHOLD
    );

    if (targetIndex !== -1) {
      const offset = targets.horizontal[targetIndex] - bounds.y;
      result.snappedY = snap.value - offset;
      result.snapPoints.push(...snap.points);
    }
  }

  if (bestVerticalSnap) {
    const snap: SnapMatch = bestVerticalSnap;
    // Find which target point was snapped
    const targetIndex = targets.vertical.findIndex(
      (x) => Math.abs(x - snap.value) * viewport.zoom <= SNAP_THRESHOLD
    );

    if (targetIndex !== -1) {
      const offset = targets.vertical[targetIndex] - bounds.x;
      result.snappedX = snap.value - offset;
      result.snapPoints.push(...snap.points);
    }
  }

  return result;
}

/**
 * Finds snap matches and calculates the snapped position with guides
 */
export function findSnapMatchesWithGuides(
  bounds: SnapBounds,
  snapPoints: SnapPoint[],
  objects: Record<string, CanvasObject>,
  viewport: Viewport
): SnapResult {
  const result = findSnapMatches(bounds, snapPoints, viewport);

  // Generate guides for ALL valid snaps, not just the best one
  const targets = calculateSnapTargets(bounds);
  const allHorizontalGuides: SnapGuide[] = [];
  const allVerticalGuides: SnapGuide[] = [];

  // Find all horizontal snaps within threshold
  targets.horizontal.forEach((targetY) => {
    const horizontalPoints = snapPoints.filter(
      (p) => p.direction === "horizontal"
    );

    const snapsAtThisTarget: SnapPoint[] = [];
    horizontalPoints.forEach((snapPoint) => {
      const distance = Math.abs(targetY - snapPoint.value);
      const screenDistance = distance * viewport.zoom;
      if (screenDistance <= SNAP_THRESHOLD) {
        snapsAtThisTarget.push(snapPoint);
      }
    });

    // Group by snap value and generate guides
    const snapsByValue = new Map<number, SnapPoint[]>();
    snapsAtThisTarget.forEach((point) => {
      const key = Math.round(point.value * 10) / 10;
      if (!snapsByValue.has(key)) {
        snapsByValue.set(key, []);
      }
      snapsByValue.get(key)!.push(point);
    });

    snapsByValue.forEach((points, snapValue) => {
      const guides = generateHorizontalGuides(
        snapValue,
        points,
        bounds,
        objects,
        viewport
      );
      allHorizontalGuides.push(...guides);
    });
  });

  // Find all vertical snaps within threshold
  targets.vertical.forEach((targetX) => {
    const verticalPoints = snapPoints.filter((p) => p.direction === "vertical");

    const snapsAtThisTarget: SnapPoint[] = [];
    verticalPoints.forEach((snapPoint) => {
      const distance = Math.abs(targetX - snapPoint.value);
      const screenDistance = distance * viewport.zoom;
      if (screenDistance <= SNAP_THRESHOLD) {
        snapsAtThisTarget.push(snapPoint);
      }
    });

    // Group by snap value and generate guides
    const snapsByValue = new Map<number, SnapPoint[]>();
    snapsAtThisTarget.forEach((point) => {
      const key = Math.round(point.value * 10) / 10;
      if (!snapsByValue.has(key)) {
        snapsByValue.set(key, []);
      }
      snapsByValue.get(key)!.push(point);
    });

    snapsByValue.forEach((points, snapValue) => {
      const guides = generateVerticalGuides(
        snapValue,
        points,
        bounds,
        objects,
        viewport
      );
      allVerticalGuides.push(...guides);
    });
  });

  // Use the comprehensive guides
  result.horizontalGuides = allHorizontalGuides;
  result.verticalGuides = allVerticalGuides;

  return result;
}

/**
 * Generates horizontal snap guide lines
 */
function generateHorizontalGuides(
  snapValue: number,
  snapPoints: SnapPoint[],
  draggedBounds: SnapBounds,
  objects: Record<string, CanvasObject>,
  viewport: Viewport
): SnapGuide[] {
  const guides: SnapGuide[] = [];
  const screenY = worldToScreen({ x: 0, y: snapValue }, viewport).y;

  // Calculate the precise extent of the guide line
  const hasParentMidpoint = snapPoints.some((p) => p.sourceEdge === "midpoint");

  let minX: number;
  let maxX: number;

  if (hasParentMidpoint) {
    // For parent midpoints, extend from source center to dragged object center
    const draggedCenterX = draggedBounds.x + draggedBounds.width / 2;
    minX = draggedCenterX;
    maxX = draggedCenterX;

    snapPoints.forEach((point) => {
      if (point.sourceEdge === "midpoint") {
        const sourceObj = objects[point.sourceId];
        if (sourceObj) {
          const sourcePos = getAbsolutePosition(point.sourceId, objects);
          const sourceCenterX = sourcePos.x + sourceObj.width / 2;
          // Guide extends from source center to dragged center only
          minX = Math.min(sourceCenterX, draggedCenterX);
          maxX = Math.max(sourceCenterX, draggedCenterX);
        }
      }
    });
  } else {
    // Check if dragged center is involved in snap
    const draggedCenterY = draggedBounds.y + draggedBounds.height / 2;
    const isDraggedCenterSnap = Math.abs(snapValue - draggedCenterY) < 1;

    if (isDraggedCenterSnap) {
      // When dragged center aligns with anything, guide should end at dragged center
      const draggedCenterX = draggedBounds.x + draggedBounds.width / 2;
      minX = draggedCenterX;
      maxX = draggedCenterX;

      snapPoints.forEach((point) => {
        const sourceObj = objects[point.sourceId];
        if (sourceObj) {
          const sourcePos = getAbsolutePosition(point.sourceId, objects);
          minX = Math.min(minX, sourcePos.x);
          maxX = Math.max(maxX, sourcePos.x + sourceObj.width);
        }
      });
    } else {
      // For regular edge snapping, span between source objects AND include dragged object
      minX = draggedBounds.x;
      maxX = draggedBounds.x + draggedBounds.width;

      snapPoints.forEach((point) => {
        const sourceObj = objects[point.sourceId];
        if (sourceObj) {
          const sourcePos = getAbsolutePosition(point.sourceId, objects);
          minX = Math.min(minX, sourcePos.x);
          maxX = Math.max(maxX, sourcePos.x + sourceObj.width);
        }
      });
    }
  }

  const startScreen = worldToScreen({ x: minX, y: snapValue }, viewport);
  const endScreen = worldToScreen({ x: maxX, y: snapValue }, viewport);

  // Calculate snap points for horizontal guides - analyze ALL snap points for this value
  const calculatedSnapPoints: { x: number; y: number }[] = [];

  // Group snap points by sourceId to handle multiple snap types from same object
  const snapPointsBySource = new Map<string, SnapPoint[]>();
  snapPoints.forEach((point) => {
    if (!snapPointsBySource.has(point.sourceId)) {
      snapPointsBySource.set(point.sourceId, []);
    }
    snapPointsBySource.get(point.sourceId)!.push(point);
  });

  // Process each source object
  snapPointsBySource.forEach((points, sourceId) => {
    const sourceObj = objects[sourceId];
    if (!sourceObj) return;

    const sourcePos = getAbsolutePosition(sourceId, objects);
    const hasEdgeSnap = points.some((p) => p.type === "edge");
    const hasCenterSnap = points.some((p) => p.type === "center");

    // Detect special snap scenarios
    const draggedCenterY = draggedBounds.y + draggedBounds.height / 2;
    const sourceCenterY = sourcePos.y + sourceObj.height / 2;

    // Check if dragged center is involved in any snap
    const isDraggedCenterSnap = Math.abs(snapValue - draggedCenterY) < 1;

    // Edge-to-midpoint: dragged edge snaps to source center (we have a center snap point)
    const isEdgeToMidpoint =
      hasCenterSnap &&
      Math.abs(snapValue - sourceCenterY) < 1 &&
      !isDraggedCenterSnap;

    if (isDraggedCenterSnap) {
      // When dragged center aligns with anything: show center cross on dragged + crosses on matched
      const draggedCenterX = draggedBounds.x + draggedBounds.width / 2;
      calculatedSnapPoints.push(
        worldToScreen({ x: draggedCenterX, y: snapValue }, viewport)
      );

      // Also show crosses on the matched object
      if (hasEdgeSnap) {
        // Dragged center aligns with source edge - show corner crosses
        const sourceTopLeft = worldToScreen(
          { x: sourcePos.x, y: snapValue },
          viewport
        );
        const sourceTopRight = worldToScreen(
          { x: sourcePos.x + sourceObj.width, y: snapValue },
          viewport
        );
        calculatedSnapPoints.push(sourceTopLeft, sourceTopRight);
      } else if (hasCenterSnap) {
        // Dragged center aligns with source center - show crosses at source edges
        const sourceTopLeft = worldToScreen(
          { x: sourcePos.x, y: snapValue },
          viewport
        );
        const sourceTopRight = worldToScreen(
          { x: sourcePos.x + sourceObj.width, y: snapValue },
          viewport
        );
        calculatedSnapPoints.push(sourceTopLeft, sourceTopRight);
      }
    } else if (isEdgeToMidpoint) {
      // Edge-to-midpoint: Show crosses at midpoint on edges of snapped object
      const midpointLeft = worldToScreen(
        { x: sourcePos.x, y: snapValue },
        viewport
      );
      const midpointRight = worldToScreen(
        { x: sourcePos.x + sourceObj.width, y: snapValue },
        viewport
      );
      calculatedSnapPoints.push(midpointLeft, midpointRight);

      // Show corners of dragged item
      const draggedTopLeft = worldToScreen(
        { x: draggedBounds.x, y: snapValue },
        viewport
      );
      const draggedTopRight = worldToScreen(
        { x: draggedBounds.x + draggedBounds.width, y: snapValue },
        viewport
      );
      calculatedSnapPoints.push(draggedTopLeft, draggedTopRight);
    } else {
      // Default behavior for other cases
      if (hasEdgeSnap) {
        // For edge snaps, show corners at both ends of the edge
        const topLeft = worldToScreen(
          { x: sourcePos.x, y: snapValue },
          viewport
        );
        const topRight = worldToScreen(
          { x: sourcePos.x + sourceObj.width, y: snapValue },
          viewport
        );
        calculatedSnapPoints.push(topLeft, topRight);

        // Also add corners for the dragged object at the snap line
        const draggedTopLeft = worldToScreen(
          { x: draggedBounds.x, y: snapValue },
          viewport
        );
        const draggedTopRight = worldToScreen(
          { x: draggedBounds.x + draggedBounds.width, y: snapValue },
          viewport
        );
        calculatedSnapPoints.push(draggedTopLeft, draggedTopRight);
      }

      if (hasCenterSnap) {
        // For center snaps, show center point on source object
        const centerX = sourcePos.x + sourceObj.width / 2;
        calculatedSnapPoints.push(
          worldToScreen({ x: centerX, y: snapValue }, viewport)
        );

        // Show center point on dragged object
        const draggedCenterX = draggedBounds.x + draggedBounds.width / 2;
        calculatedSnapPoints.push(
          worldToScreen({ x: draggedCenterX, y: snapValue }, viewport)
        );
      }
    }
  });

  // Determine guide type - prefer "edge" if mixed types
  const hasEdge = snapPoints.some((p) => p.type === "edge");
  const guideType = hasEdge ? "edge" : "center";

  guides.push({
    position: screenY,
    start: startScreen.x,
    end: endScreen.x,
    direction: "horizontal",
    type: guideType,
    snapPoints: calculatedSnapPoints,
  });

  return guides;
}

/**
 * Generates vertical snap guide lines
 */
function generateVerticalGuides(
  snapValue: number,
  snapPoints: SnapPoint[],
  draggedBounds: SnapBounds,
  objects: Record<string, CanvasObject>,
  viewport: Viewport
): SnapGuide[] {
  const guides: SnapGuide[] = [];
  const screenX = worldToScreen({ x: snapValue, y: 0 }, viewport).x;

  // Calculate the precise extent of the guide line
  const hasParentMidpoint = snapPoints.some((p) => p.sourceEdge === "midpoint");

  let minY: number;
  let maxY: number;

  if (hasParentMidpoint) {
    // For parent midpoints, extend from source center to dragged object center
    const draggedCenterY = draggedBounds.y + draggedBounds.height / 2;
    minY = draggedCenterY;
    maxY = draggedCenterY;

    snapPoints.forEach((point) => {
      if (point.sourceEdge === "midpoint") {
        const sourceObj = objects[point.sourceId];
        if (sourceObj) {
          const sourcePos = getAbsolutePosition(point.sourceId, objects);
          const sourceCenterY = sourcePos.y + sourceObj.height / 2;
          // Guide extends from source center to dragged center only
          minY = Math.min(sourceCenterY, draggedCenterY);
          maxY = Math.max(sourceCenterY, draggedCenterY);
        }
      }
    });
  } else {
    // Check if dragged center is involved in snap
    const draggedCenterX = draggedBounds.x + draggedBounds.width / 2;
    const isDraggedCenterSnap = Math.abs(snapValue - draggedCenterX) < 1;

    if (isDraggedCenterSnap) {
      // When dragged center aligns with anything, guide should end at dragged center
      const draggedCenterY = draggedBounds.y + draggedBounds.height / 2;
      minY = draggedCenterY;
      maxY = draggedCenterY;

      snapPoints.forEach((point) => {
        const sourceObj = objects[point.sourceId];
        if (sourceObj) {
          const sourcePos = getAbsolutePosition(point.sourceId, objects);
          minY = Math.min(minY, sourcePos.y);
          maxY = Math.max(maxY, sourcePos.y + sourceObj.height);
        }
      });
    } else {
      // For regular edge snapping, span between source objects AND include dragged object
      minY = draggedBounds.y;
      maxY = draggedBounds.y + draggedBounds.height;

      snapPoints.forEach((point) => {
        const sourceObj = objects[point.sourceId];
        if (sourceObj) {
          const sourcePos = getAbsolutePosition(point.sourceId, objects);
          minY = Math.min(minY, sourcePos.y);
          maxY = Math.max(maxY, sourcePos.y + sourceObj.height);
        }
      });
    }
  }

  const startScreen = worldToScreen({ x: snapValue, y: minY }, viewport);
  const endScreen = worldToScreen({ x: snapValue, y: maxY }, viewport);

  // Calculate snap points for vertical guides - analyze ALL snap points for this value
  const calculatedSnapPoints: { x: number; y: number }[] = [];

  // Group snap points by sourceId to handle multiple snap types from same object
  const snapPointsBySource = new Map<string, SnapPoint[]>();
  snapPoints.forEach((point) => {
    if (!snapPointsBySource.has(point.sourceId)) {
      snapPointsBySource.set(point.sourceId, []);
    }
    snapPointsBySource.get(point.sourceId)!.push(point);
  });

  // Process each source object
  snapPointsBySource.forEach((points, sourceId) => {
    const sourceObj = objects[sourceId];
    if (!sourceObj) return;

    const sourcePos = getAbsolutePosition(sourceId, objects);
    const hasEdgeSnap = points.some((p) => p.type === "edge");
    const hasCenterSnap = points.some((p) => p.type === "center");

    // Detect special snap scenarios
    const draggedCenterX = draggedBounds.x + draggedBounds.width / 2;
    const sourceCenterX = sourcePos.x + sourceObj.width / 2;

    // Check if dragged center is involved in any snap
    const isDraggedCenterSnap = Math.abs(snapValue - draggedCenterX) < 1;

    // Edge-to-midpoint: dragged edge snaps to source center (we have a center snap point)
    const isEdgeToMidpoint =
      hasCenterSnap &&
      Math.abs(snapValue - sourceCenterX) < 1 &&
      !isDraggedCenterSnap;

    if (isDraggedCenterSnap) {
      // When dragged center aligns with anything: show center cross on dragged + crosses on matched
      const draggedCenterY = draggedBounds.y + draggedBounds.height / 2;
      calculatedSnapPoints.push(
        worldToScreen({ x: snapValue, y: draggedCenterY }, viewport)
      );

      // Also show crosses on the matched object
      if (hasEdgeSnap) {
        // Dragged center aligns with source edge - show corner crosses
        const sourceTopLeft = worldToScreen(
          { x: snapValue, y: sourcePos.y },
          viewport
        );
        const sourceBottomLeft = worldToScreen(
          { x: snapValue, y: sourcePos.y + sourceObj.height },
          viewport
        );
        calculatedSnapPoints.push(sourceTopLeft, sourceBottomLeft);
      } else if (hasCenterSnap) {
        // Dragged center aligns with source center - show crosses at source edges
        const sourceTopLeft = worldToScreen(
          { x: snapValue, y: sourcePos.y },
          viewport
        );
        const sourceBottomLeft = worldToScreen(
          { x: snapValue, y: sourcePos.y + sourceObj.height },
          viewport
        );
        calculatedSnapPoints.push(sourceTopLeft, sourceBottomLeft);
      }
    } else if (isEdgeToMidpoint) {
      // Edge-to-midpoint: Show crosses at midpoint on edges of snapped object
      const midpointTop = worldToScreen(
        { x: snapValue, y: sourcePos.y },
        viewport
      );
      const midpointBottom = worldToScreen(
        { x: snapValue, y: sourcePos.y + sourceObj.height },
        viewport
      );
      calculatedSnapPoints.push(midpointTop, midpointBottom);

      // Show corners of dragged item
      const draggedTopLeft = worldToScreen(
        { x: snapValue, y: draggedBounds.y },
        viewport
      );
      const draggedBottomLeft = worldToScreen(
        { x: snapValue, y: draggedBounds.y + draggedBounds.height },
        viewport
      );
      calculatedSnapPoints.push(draggedTopLeft, draggedBottomLeft);
    } else {
      // Default behavior for other cases
      if (hasEdgeSnap) {
        // For edge snaps, show corners at both ends of the edge
        const topLeft = worldToScreen(
          { x: snapValue, y: sourcePos.y },
          viewport
        );
        const bottomLeft = worldToScreen(
          { x: snapValue, y: sourcePos.y + sourceObj.height },
          viewport
        );
        calculatedSnapPoints.push(topLeft, bottomLeft);

        // Also add corners for the dragged object at the snap line
        const draggedTopLeft = worldToScreen(
          { x: snapValue, y: draggedBounds.y },
          viewport
        );
        const draggedBottomLeft = worldToScreen(
          { x: snapValue, y: draggedBounds.y + draggedBounds.height },
          viewport
        );
        calculatedSnapPoints.push(draggedTopLeft, draggedBottomLeft);
      }

      if (hasCenterSnap) {
        // For center snaps, show center point on source object
        const centerY = sourcePos.y + sourceObj.height / 2;
        calculatedSnapPoints.push(
          worldToScreen({ x: snapValue, y: centerY }, viewport)
        );

        // Show center point on dragged object
        const draggedCenterY = draggedBounds.y + draggedBounds.height / 2;
        calculatedSnapPoints.push(
          worldToScreen({ x: snapValue, y: draggedCenterY }, viewport)
        );
      }
    }
  });

  // Determine guide type - prefer "edge" if mixed types
  const hasEdge = snapPoints.some((p) => p.type === "edge");
  const guideType = hasEdge ? "edge" : "center";

  guides.push({
    position: screenX,
    start: startScreen.y,
    end: endScreen.y,
    direction: "vertical",
    type: guideType,
    snapPoints: calculatedSnapPoints,
  });

  return guides;
}

/**
 * Applies snapping to a drag operation
 */
export function applyDragSnapping(
  originalBounds: SnapBounds,
  newBounds: SnapBounds,
  objects: Record<string, CanvasObject>,
  viewport: Viewport,
  excludeIds: string[] = [],
  selectedIds: string[] = []
): { bounds: SnapBounds; snapResult: SnapResult } {
  const snapPoints = getSnapPoints(objects, viewport, excludeIds, selectedIds);
  const snapResult = findSnapMatchesWithGuides(
    newBounds,
    snapPoints,
    objects,
    viewport
  );

  const snappedBounds = { ...newBounds };
  let hasSnap = false;

  if (snapResult.snappedX !== undefined) {
    snappedBounds.x = snapResult.snappedX;
    hasSnap = true;
  }

  if (snapResult.snappedY !== undefined) {
    snappedBounds.y = snapResult.snappedY;
    hasSnap = true;
  }

  // If snapping occurred, regenerate guides using the snapped bounds
  if (hasSnap) {
    const updatedSnapResult = findSnapMatchesWithGuides(
      snappedBounds,
      snapPoints,
      objects,
      viewport
    );
    // Keep the original snap values but use the updated guides
    snapResult.horizontalGuides = updatedSnapResult.horizontalGuides;
    snapResult.verticalGuides = updatedSnapResult.verticalGuides;
  }

  return { bounds: snappedBounds, snapResult };
}

/**
 * Finds snap matches for resize operations using only the relevant edges
 */
export function findResizeSnapMatches(
  bounds: SnapBounds,
  resizeHandle: string,
  snapPoints: SnapPoint[],
  objects: Record<string, CanvasObject>,
  viewport: Viewport
): SnapResult {
  const targets = calculateResizeSnapTargets(bounds, resizeHandle);

  const result: SnapResult = {
    snapPoints: [],
    horizontalGuides: [],
    verticalGuides: [],
  };

  // Find horizontal snaps (for top/bottom resize)
  type SnapMatch = { distance: number; value: number; points: SnapPoint[] };
  let bestHorizontalSnap: SnapMatch | null = null;

  targets.horizontal.forEach((targetY) => {
    // For resize operations, only snap to edges, never to centers or midpoints
    const horizontalPoints = snapPoints.filter(
      (p) => p.direction === "horizontal" && p.type === "edge"
    );

    horizontalPoints.forEach((snapPoint) => {
      const distance = Math.abs(targetY - snapPoint.value);
      const screenDistance = distance * viewport.zoom;

      if (screenDistance <= SNAP_THRESHOLD) {
        if (
          !bestHorizontalSnap ||
          screenDistance < bestHorizontalSnap.distance
        ) {
          bestHorizontalSnap = {
            distance: screenDistance,
            value: snapPoint.value,
            points: [snapPoint],
          };
        } else if (
          bestHorizontalSnap &&
          screenDistance === bestHorizontalSnap.distance
        ) {
          bestHorizontalSnap.points.push(snapPoint);
        }
      }
    });
  });

  // Find vertical snaps (for left/right resize)
  let bestVerticalSnap: SnapMatch | null = null;

  targets.vertical.forEach((targetX) => {
    // For resize operations, only snap to edges, never to centers or midpoints
    const verticalPoints = snapPoints.filter(
      (p) => p.direction === "vertical" && p.type === "edge"
    );

    verticalPoints.forEach((snapPoint) => {
      const distance = Math.abs(targetX - snapPoint.value);
      const screenDistance = distance * viewport.zoom;

      if (screenDistance <= SNAP_THRESHOLD) {
        if (!bestVerticalSnap || screenDistance < bestVerticalSnap.distance) {
          bestVerticalSnap = {
            distance: screenDistance,
            value: snapPoint.value,
            points: [snapPoint],
          };
        } else if (
          bestVerticalSnap &&
          screenDistance === bestVerticalSnap.distance
        ) {
          bestVerticalSnap.points.push(snapPoint);
        }
      }
    });
  });

  // Set snapped values based on which edge was snapped
  if (bestHorizontalSnap) {
    const snap: SnapMatch = bestHorizontalSnap;
    result.snappedY = snap.value;
    result.snapPoints.push(...snap.points);

    // Generate guides
    result.horizontalGuides = generateHorizontalGuides(
      snap.value,
      snap.points,
      bounds,
      objects,
      viewport
    );
  }

  if (bestVerticalSnap) {
    const snap: SnapMatch = bestVerticalSnap;
    result.snappedX = snap.value;
    result.snapPoints.push(...snap.points);

    // Generate guides
    result.verticalGuides = generateVerticalGuides(
      snap.value,
      snap.points,
      bounds,
      objects,
      viewport
    );
  }

  return result;
}

/**
 * Helper function to check if an object is a child of auto layout and get the direction
 */
function getAutoLayoutConstraints(
  objectId: string,
  objects: Record<string, CanvasObject>
): { isAutoLayoutChild: boolean; parentDirection?: "horizontal" | "vertical" } {
  const object = objects[objectId];
  if (!object?.parentId) {
    return { isAutoLayoutChild: false };
  }

  const parent = objects[object.parentId];
  if (!parent || parent.type !== "frame") {
    return { isAutoLayoutChild: false };
  }

  // Check for auto layout in parent - handle both regular frames and instances
  const autoLayout =
    parent.properties?.type === "frame"
      ? parent.properties.autoLayout
      : (parent as any).autoLayout || (parent.properties as any)?.autoLayout;

  if (!autoLayout || autoLayout.mode === "none") {
    return { isAutoLayoutChild: false };
  }

  if (autoLayout.mode === "horizontal" || autoLayout.mode === "vertical") {
    return {
      isAutoLayoutChild: true,
      parentDirection: autoLayout.mode,
    };
  }

  return { isAutoLayoutChild: false };
}

/**
 * Applies snapping to a resize operation
 */
export function applyResizeSnapping(
  originalBounds: SnapBounds,
  newBounds: SnapBounds,
  resizeHandle: string,
  objects: Record<string, CanvasObject>,
  viewport: Viewport,
  excludeIds: string[] = [],
  selectedIds: string[] = []
): { bounds: SnapBounds; snapResult: SnapResult } {
  const currentTime = Date.now();

  // Apply temporal damping for auto layout scenarios to prevent feedback loops
  const shouldApplyDamping = selectedIds.some((id) => {
    const obj = objects[id];
    if (!obj?.parentId) return false;

    const parent = objects[obj.parentId];
    const isAutoLayoutParent =
      parent?.type === "frame" &&
      parent.properties?.type === "frame" &&
      (parent.properties as any).autoLayout?.mode !== "none";

    if (isAutoLayoutParent) {
      const autoLayout = (parent.properties as any).autoLayout;
      return (
        autoLayout?.primaryAxisSizing === "hug" ||
        autoLayout?.counterAxisSizing === "hug"
      );
    }

    return false;
  });

  // Note: Hug-content parent edge exclusion is now handled in getSnapPoints()
  // This eliminates the need for complex proximity-based filtering

  // Root cause fixed: hug-content parent edges are excluded from snap targets
  // No need for temporal damping or complex proximity checks
  // Check auto layout constraints FIRST, before generating snap points
  const autoLayoutConstraints = selectedIds.map((id) =>
    getAutoLayoutConstraints(id, objects)
  );
  const hasAutoLayoutChild = autoLayoutConstraints.some(
    (constraint) => constraint.isAutoLayoutChild
  );
  const autoLayoutDirection = hasAutoLayoutChild
    ? autoLayoutConstraints.find((constraint) => constraint.isAutoLayoutChild)
        ?.parentDirection
    : undefined;

  // Determine which snap directions to skip based on auto layout constraints
  const shouldSkipHorizontalSnap =
    hasAutoLayoutChild && autoLayoutDirection === "horizontal";
  const shouldSkipVerticalSnap =
    hasAutoLayoutChild && autoLayoutDirection === "vertical";

  // Debug logging for auto layout constraints
  if (hasAutoLayoutChild) {
    console.log("🎯 SNAP: Auto layout child detected", {
      selectedIds,
      autoLayoutDirection,
      resizeHandle,
      constraints: autoLayoutConstraints,
      shouldSkipHorizontalSnap,
      shouldSkipVerticalSnap,
    });
  }

  // Early return with empty snap result if all snapping is disabled
  if (
    shouldSkipHorizontalSnap &&
    (resizeHandle.includes("left") || resizeHandle.includes("right")) &&
    shouldSkipVerticalSnap &&
    (resizeHandle.includes("top") || resizeHandle.includes("bottom"))
  ) {
    console.log(
      "🎯 SNAP: Skipping all snapping due to auto layout constraints"
    );
    return {
      bounds: newBounds,
      snapResult: {
        snapPoints: [],
        horizontalGuides: [],
        verticalGuides: [],
      },
    };
  }

  const snapPoints = getSnapPoints(
    objects,
    viewport,
    excludeIds,
    selectedIds,
    "resize",
    true // Enable auto layout affected object exclusion
  );
  const snapResult = findResizeSnapMatches(
    newBounds,
    resizeHandle,
    snapPoints,
    objects,
    viewport
  );

  const snappedBounds = { ...newBounds };
  let hasSnap = false;

  // Apply auto layout constraints to filter snap results and guides
  let filteredSnapResult = { ...snapResult };

  // Clear horizontal snapping if constrained by horizontal auto layout
  if (shouldSkipHorizontalSnap) {
    console.log(
      "🎯 SNAP: Filtering out horizontal snap guides due to horizontal auto layout"
    );
    filteredSnapResult.snappedX = undefined;
    filteredSnapResult.verticalGuides = []; // Vertical guides are for horizontal snapping
  }

  // Clear vertical snapping if constrained by vertical auto layout
  if (shouldSkipVerticalSnap) {
    console.log(
      "🎯 SNAP: Filtering out vertical snap guides due to vertical auto layout"
    );
    filteredSnapResult.snappedY = undefined;
    filteredSnapResult.horizontalGuides = []; // Horizontal guides are for vertical snapping
  }

  // For resize, we need to be more careful about which edges can snap
  if (filteredSnapResult.snappedX !== undefined) {
    const canSnapHorizontally =
      resizeHandle.includes("left") ||
      resizeHandle.includes("right") ||
      resizeHandle.includes("center");

    if (canSnapHorizontally) {
      hasSnap = true;
      if (resizeHandle.includes("left")) {
        // Left edge snaps - adjust x and width
        snappedBounds.x = filteredSnapResult.snappedX;
        snappedBounds.width =
          originalBounds.x + originalBounds.width - filteredSnapResult.snappedX;
      } else if (resizeHandle.includes("right")) {
        // Right edge snaps - keep x, adjust width
        snappedBounds.width = filteredSnapResult.snappedX - originalBounds.x;
      } else {
        // Center resize - adjust both sides
        snappedBounds.x = filteredSnapResult.snappedX;
      }
    }
  }

  if (filteredSnapResult.snappedY !== undefined) {
    const canSnapVertically =
      resizeHandle.includes("top") ||
      resizeHandle.includes("bottom") ||
      resizeHandle.includes("center");

    if (canSnapVertically) {
      hasSnap = true;

      if (resizeHandle.includes("top")) {
        // Top edge snaps - adjust y and height
        snappedBounds.y = filteredSnapResult.snappedY;
        snappedBounds.height =
          originalBounds.y +
          originalBounds.height -
          filteredSnapResult.snappedY;
      } else if (resizeHandle.includes("bottom")) {
        // Bottom edge snaps - keep y, adjust height
        snappedBounds.height = filteredSnapResult.snappedY - originalBounds.y;
      } else {
        // Center resize - adjust both sides
        snappedBounds.y = filteredSnapResult.snappedY;
      }
    }
  }

  // If snapping occurred, regenerate guides using the snapped bounds
  if (hasSnap) {
    const updatedSnapResult = findResizeSnapMatches(
      snappedBounds,
      resizeHandle,
      snapPoints,
      objects,
      viewport
    );
    // Keep the original snap values but use the updated guides, filtered by auto layout constraints
    if (!shouldSkipHorizontalSnap) {
      filteredSnapResult.verticalGuides = updatedSnapResult.verticalGuides;
    }
    if (!shouldSkipVerticalSnap) {
      filteredSnapResult.horizontalGuides = updatedSnapResult.horizontalGuides;
    }
  }

  return { bounds: snappedBounds, snapResult: filteredSnapResult };
}
