/**
 * Global registry for live Make preview handles.
 *
 * Each MakeCanvasPreview registers its SameOriginInspectPreviewHandle
 * on mount and unregisters on unmount. The context menu (and other
 * consumers) can look up the live preview document by Make object ID
 * to walk the current interactive DOM state instead of creating a
 * fresh iframe that always renders the initial state.
 */

import type { SameOriginInspectPreviewHandle } from "@/components/SameOriginInspectPreview";

const registry = new Map<string, SameOriginInspectPreviewHandle>();

export function registerPreview(
  objectId: string,
  handle: SameOriginInspectPreviewHandle
): void {
  registry.set(objectId, handle);
}

export function unregisterPreview(objectId: string): void {
  registry.delete(objectId);
}

/**
 * Get the live iframe Document for a Make object.
 * Returns null if the preview isn't mounted or the document isn't accessible.
 */
export function getPreviewDocument(objectId: string): Document | null {
  const handle = registry.get(objectId);
  if (!handle) return null;
  return handle.getIframeDocument();
}
