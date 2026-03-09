/**
 * Utility for detecting if a mouse event is over a selected object
 * Uses the same logic as the drag detection system for consistency
 */

import { useAppStore } from "@/core/state/store";

/**
 * Check if a mouse event is over a currently selected object
 * Uses document.elementsFromPoint() to get all elements under the mouse,
 * just like the selection and drag systems do
 *
 * @param event - Mouse or pointer event
 * @returns Object ID if clicking on a selected object, null otherwise
 */
export function getSelectedObjectUnderMouse(
  event: MouseEvent | PointerEvent
): string | null {
  const selectedIds = useAppStore.getState().selection.selectedIds;

  if (selectedIds.length === 0) {
    return null;
  }

  // Use the same elementsFromPoint logic as the selection system
  const screenPoint = { x: event.clientX, y: event.clientY };
  const elementsAtPoint = document.elementsFromPoint(
    screenPoint.x,
    screenPoint.y
  );

  // Check if any element under the mouse has a data-object-id that's selected
  for (const element of elementsAtPoint) {
    const objectId = element.getAttribute("data-object-id");
    if (objectId && selectedIds.includes(objectId)) {
      return objectId;
    }
  }

  return null;
}

/**
 * Check if a mouse event is over any selected object (boolean version)
 * Convenience function that returns true/false instead of object ID
 *
 * @param event - Mouse or pointer event
 * @returns true if clicking on a selected object, false otherwise
 */
export function isClickingOnSelectedObject(
  event: MouseEvent | PointerEvent
): boolean {
  return getSelectedObjectUnderMouse(event) !== null;
}

/**
 * Get any canvas object (selected or not) under the mouse
 * Useful for detecting canvas interactions vs UI interactions
 *
 * @param event - Mouse or pointer event
 * @returns Object ID if clicking on any canvas object, null otherwise
 */
export function getCanvasObjectUnderMouse(
  event: MouseEvent | PointerEvent
): string | null {
  const screenPoint = { x: event.clientX, y: event.clientY };
  const elementsAtPoint = document.elementsFromPoint(
    screenPoint.x,
    screenPoint.y
  );

  // Check if any element under the mouse has a data-object-id (any canvas object)
  for (const element of elementsAtPoint) {
    const objectId = element.getAttribute("data-object-id");
    if (objectId) {
      return objectId;
    }
  }
  return null;
}
