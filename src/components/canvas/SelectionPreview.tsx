import { useAppStore } from "@/core/state/store";
import {
  getAbsolutePosition,
  getVisualBoundsFromDOM,
  worldToScreen,
} from "@/core/utils/coordinates";
import React, { useEffect, useRef, useState } from "react";

interface SelectionPreviewProps {
  isVisible: boolean;
  previewTargetId?: string | null;
}

export const SelectionPreview: React.FC<SelectionPreviewProps> = ({
  isVisible,
  previewTargetId,
}) => {
  const objects = useAppStore((s) => s.objects);
  const viewport = useAppStore((s) => s.viewport);
  const [previewTarget, setPreviewTarget] = useState<{
    objectId: string;
    bounds: { x: number; y: number; width: number; height: number };
  } | null>(null);

  // Update preview target when previewTargetId changes
  useEffect(() => {
    if (!isVisible || !previewTargetId) {
      setPreviewTarget(null);
      return;
    }

    const targetObject = objects[previewTargetId];
    if (!targetObject) {
      setPreviewTarget(null);
      return;
    }

    // Use DOM bounds for pixel-perfect accuracy.
    const domBounds = getVisualBoundsFromDOM(previewTargetId, objects, viewport);

    const screenTopLeft = worldToScreen(
      { x: domBounds.x, y: domBounds.y },
      viewport
    );
    const screenBottomRight = worldToScreen(
      { x: domBounds.x + domBounds.width, y: domBounds.y + domBounds.height },
      viewport
    );

    setPreviewTarget({
      objectId: previewTargetId,
      bounds: {
        x: screenTopLeft.x,
        y: screenTopLeft.y,
        width: screenBottomRight.x - screenTopLeft.x,
        height: screenBottomRight.y - screenTopLeft.y,
      },
    });
  }, [isVisible, previewTargetId, objects, viewport]);

  if (!previewTarget || !isVisible) {
    return null;
  }

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        left: previewTarget.bounds.x - 1,
        top: previewTarget.bounds.y - 1,
        width: previewTarget.bounds.width + 2,
        height: previewTarget.bounds.height + 2,
        border: "2px solid var(--ramp-blue-500)",
      }}
    />
  );
};
