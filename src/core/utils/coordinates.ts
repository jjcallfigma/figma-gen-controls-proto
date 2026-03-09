import {
  Bounds,
  Point,
  ScreenBounds,
  ScreenPoint,
  Viewport,
  WorldBounds,
  WorldPoint,
} from "@/types/canvas";

/**
 * Convert world coordinates to screen coordinates
 * World space is the zoomable/pannable canvas content
 * Screen space is fixed relative to the viewport
 */
export function worldToScreen(
  worldPoint: WorldPoint,
  viewport: Viewport
): ScreenPoint {
  return {
    x: worldPoint.x * viewport.zoom + viewport.panX,
    y: worldPoint.y * viewport.zoom + viewport.panY,
  };
}

/**
 * Convert screen coordinates to world coordinates
 * Essential for mouse interactions on the canvas
 */
export function screenToWorld(
  screenPoint: ScreenPoint,
  viewport: Viewport
): WorldPoint {
  return {
    x: (screenPoint.x - viewport.panX) / viewport.zoom,
    y: (screenPoint.y - viewport.panY) / viewport.zoom,
  };
}

/**
 * Convert world bounds to screen bounds
 */
export function worldBoundsToScreen(
  worldBounds: WorldBounds,
  viewport: Viewport
): ScreenBounds {
  const topLeft = worldToScreen(
    { x: worldBounds.x, y: worldBounds.y },
    viewport
  );

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: worldBounds.width * viewport.zoom,
    height: worldBounds.height * viewport.zoom,
  };
}

/**
 * Convert screen bounds to world bounds
 */
export function screenBoundsToWorld(
  screenBounds: ScreenBounds,
  viewport: Viewport
): WorldBounds {
  const topLeft = screenToWorld(
    { x: screenBounds.x, y: screenBounds.y },
    viewport
  );

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: screenBounds.width / viewport.zoom,
    height: screenBounds.height / viewport.zoom,
  };
}

/**
 * Get the world bounds that are currently visible in the viewport
 * Useful for viewport culling and determining what objects to render
 */
export function getVisibleWorldBounds(viewport: Viewport): WorldBounds {
  return screenBoundsToWorld(viewport.viewportBounds, viewport);
}

/**
 * Check if a point is within bounds
 */
export function pointInBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

/**
 * Check if two bounds intersect
 */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Get the bounds that contain all the given bounds
 */
export function getBoundingRect(bounds: Bounds[]): Bounds | null {
  if (bounds.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const bound of bounds) {
    minX = Math.min(minX, bound.x);
    minY = Math.min(minY, bound.y);
    maxX = Math.max(maxX, bound.x + bound.width);
    maxY = Math.max(maxY, bound.y + bound.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculate distance between two points
 */
export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert DOM mouse event to screen coordinates relative to the canvas
 */
export function getCanvasCoordinatesFromEvent(
  event: MouseEvent | PointerEvent,
  canvasElement: HTMLElement
): ScreenPoint {
  const rect = canvasElement.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

/**
 * Convert DOM mouse event directly to world coordinates
 */
export function getWorldCoordinatesFromEvent(
  event: MouseEvent | PointerEvent,
  canvas: HTMLElement,
  viewport: Viewport
): WorldPoint {
  const rect = canvas.getBoundingClientRect();
  const screenX = event.clientX - rect.left;
  const screenY = event.clientY - rect.top;

  return {
    x: (screenX - viewport.panX) / viewport.zoom,
    y: (screenY - viewport.panY) / viewport.zoom,
  };
}

export function getScreenCoordinatesFromWorld(
  worldPoint: WorldPoint,
  viewport: Viewport
): Point {
  return {
    x: worldPoint.x * viewport.zoom + viewport.panX,
    y: worldPoint.y * viewport.zoom + viewport.panY,
  };
}

/**
 * Convert world coordinates to parent-relative coordinates
 * This is essential for nested objects where child positions are relative to parent
 */
export function worldToParentRelative(
  worldPoint: WorldPoint,
  parent: { x: number; y: number }
): WorldPoint {
  return {
    x: worldPoint.x - parent.x,
    y: worldPoint.y - parent.y,
  };
}

/**
 * Convert parent-relative coordinates to world coordinates
 * Used when positioning nested objects or calculating absolute positions
 */
export function parentRelativeToWorld(
  relativePoint: WorldPoint,
  parent: { x: number; y: number }
): WorldPoint {
  return {
    x: relativePoint.x + parent.x,
    y: relativePoint.y + parent.y,
  };
}

/**
 * Calculate the absolute position of an object in world coordinates
 * Accounts for all parent transformations and border offsets
 */
export function getAbsolutePosition(
  objectId: string,
  objects: Record<string, any>
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

    // Move up to the next parent
    currentParentId = parent.parentId;
  }

  return { x: absoluteX, y: absoluteY };
}

/**
 * Convert an absolute world position to be relative to a specific parent
 * Used during reparenting operations
 */
export function convertToParentSpace(
  absolutePosition: WorldPoint,
  newParentId: string | undefined,
  objects: Record<string, any>
): WorldPoint {
  if (!newParentId) {
    // No parent means position remains absolute
    return absolutePosition;
  }

  const parentAbsolute = getAbsolutePosition(newParentId, objects);
  return worldToParentRelative(absolutePosition, parentAbsolute);
}

/**
 * Check if a point is inside a rectangle (used for frame detection)
 */
export function isPointInRect(
  point: WorldPoint,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Get all frames that contain a specific point, sorted by hierarchy depth
 * This is used for accurate nesting detection during drag operations
 */
export function getFramesContainingPoint(
  point: WorldPoint,
  objects: Record<string, any>,
  excludeIds: string[] = []
): Array<{ frame: any; depth: number }> {
  const containingFrames: Array<{ frame: any; depth: number }> = [];

  // Check all frame objects
  Object.values(objects).forEach((object: any) => {
    if (
      object.type === "frame" &&
      !excludeIds.includes(object.id) &&
      object.visible &&
      !object.locked
    ) {
      // Get absolute position of frame for accurate hit testing
      const frameAbsolute = getAbsolutePosition(object.id, objects);
      const frameRect = {
        x: frameAbsolute.x,
        y: frameAbsolute.y,
        width: object.width,
        height: object.height,
      };

      if (isPointInRect(point, frameRect)) {
        // Calculate hierarchy depth (how deeply nested this frame is)
        let depth = 0;
        let currentId = object.parentId;
        while (currentId) {
          depth++;
          const parent = objects[currentId];
          currentId = parent?.parentId;
        }

        containingFrames.push({ frame: object, depth });
      }
    }
  });

  // Sort by depth (deepest first) - this ensures we select the most nested frame
  return containingFrames.sort((a, b) => b.depth - a.depth);
}

/**
 * Check if a world point is visible (not clipped by parent frame overflow)
 * This is crucial for proper selection behavior with frame overflow
 */
export function isPointVisibleInHierarchy(
  worldPoint: WorldPoint,
  objectId: string,
  objects: Record<string, any>
): boolean {
  const object = objects[objectId];
  if (!object) return false;

  // Check if point is within the object's bounds first
  const objectAbsolute = getAbsolutePosition(objectId, objects);
  const withinObject = isPointInRect(worldPoint, {
    x: objectAbsolute.x,
    y: objectAbsolute.y,
    width: object.width,
    height: object.height,
  });

  if (!withinObject) return false;

  // Walk up the parent hierarchy and check for clipping
  let currentParentId = object.parentId;
  while (currentParentId) {
    const parentObject = objects[currentParentId];
    if (!parentObject) break;

    // If parent is a frame with hidden overflow, check if point is within parent bounds
    if (
      parentObject.type === "frame" &&
      parentObject.properties?.overflow === "hidden"
    ) {
      const parentAbsolute = getAbsolutePosition(currentParentId, objects);
      const withinParent = isPointInRect(worldPoint, {
        x: parentAbsolute.x,
        y: parentAbsolute.y,
        width: parentObject.width,
        height: parentObject.height,
      });

      // If point is outside a clipping parent, it's not visible
      if (!withinParent) return false;
    }

    currentParentId = parentObject.parentId;
  }

  return true;
}

/**
 * Get the visual bounds of an object excluding borders (like HTML/CSS content-box)
 * This is used for accurate selection box positioning
 */
export function getVisualBounds(
  objectId: string,
  objects: Record<string, any>,
  dragPosition?: { x: number; y: number }
): { x: number; y: number; width: number; height: number } {
  const object = objects[objectId];
  if (!object) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  // Get the world position (either drag position or absolute position)
  const worldPosition = dragPosition || getAbsolutePosition(objectId, objects);

  // For HTML/CSS-like behavior, selection should match the content area (excluding borders)
  // This matches how selection works in browsers with box-sizing: content-box
  return {
    x: worldPosition.x,
    y: worldPosition.y,
    width: object.width,
    height: object.height,
  };
}

/**
 * Get visual bounds from DOM for auto layout children.
 * Computes world position entirely from DOM screen coordinates and
 * the viewport transform, avoiding any reliance on potentially-stale
 * state positions.  This keeps selection/hover overlays pixel-perfect
 * with the rendered elements even when the auto-layout sync hasn't
 * reconciled stored x/y values yet.
 */
export function getVisualBoundsFromDOM(
  objectId: string,
  objects: Record<string, any>,
  viewport: any,
  fallbackPosition?: { x: number; y: number }
): { x: number; y: number; width: number; height: number } {
  const object = objects[objectId];
  if (!object) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  // Check if this object is a child of an auto layout frame
  const parent = object.parentId ? objects[object.parentId] : null;
  const isAutoLayoutChild =
    parent?.type === "frame" &&
    parent.properties?.type === "frame" &&
    parent.properties.autoLayout?.mode !== "none";

  if (isAutoLayoutChild) {
    // Try to get position entirely from DOM
    const element = document.querySelector(`[data-object-id="${objectId}"]`);
    if (element) {
      const rect = element.getBoundingClientRect();

      // Find the canvas area container to get screen-space origin
      const canvasArea = document.querySelector('[data-canvas-area="true"]');
      if (canvasArea) {
        const canvasRect = canvasArea.getBoundingClientRect();

        // Element's position relative to canvas container (screen coordinates)
        const screenRelX = rect.left - canvasRect.left;
        const screenRelY = rect.top - canvasRect.top;

        // Convert screen coords to world coords using viewport transform:
        // screen = world * zoom + pan  =>  world = (screen - pan) / zoom
        return {
          x: (screenRelX - viewport.panX) / viewport.zoom,
          y: (screenRelY - viewport.panY) / viewport.zoom,
          width: rect.width / viewport.zoom,
          height: rect.height / viewport.zoom,
        };
      }
    }
  }

  // Fallback to regular getVisualBounds for non-auto-layout children
  return getVisualBounds(objectId, objects, fallbackPosition);
}
