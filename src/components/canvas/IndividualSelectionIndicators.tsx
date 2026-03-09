import { useAppStore, useObjects } from "@/core/state/store";
import { useTransientStore } from "@/core/state/transientStore";
import {
  getAbsolutePosition,
  getVisualBoundsFromDOM,
  worldToScreen,
} from "@/core/utils/coordinates";
import React, { useLayoutEffect, useRef } from "react";

interface IndividualSelectionIndicatorsProps {
  selectedIds: string[];
  showIndividual: boolean;
  isZooming?: boolean;
  isPanning?: boolean;
}

export const IndividualSelectionIndicators: React.FC<
  IndividualSelectionIndicatorsProps
> = ({
  selectedIds,
  showIndividual,
  isZooming = false,
  isPanning = false,
}) => {
  const objects = useObjects();
  const viewport = useAppStore((state) => state.viewport);
  const resizeStates = useTransientStore((s) => s.resizeStates);

  // Track the viewport that the DOM currently reflects so that
  // DOM → world conversion stays accurate even during zoom/pan.
  const committedViewportRef = useRef(viewport);
  useLayoutEffect(() => {
    committedViewportRef.current = viewport;
  }, [viewport]);

  if (!showIndividual || selectedIds.length <= 1) {
    return null;
  }

  return (
    <>
      {selectedIds.map((objectId) => {
        const object = objects[objectId];
        if (!object) return null;

        // During resize: use state-based positions (store is updated every
        // frame via dispatch).  Otherwise: use DOM measurements with the
        // committed viewport for pixel-perfect accuracy, even during zoom/pan.
        let worldX: number, worldY: number, worldW: number, worldH: number;
        const hasResize = !!resizeStates[objectId];

        if (hasResize) {
          const absPos = getAbsolutePosition(objectId, objects);
          worldX = absPos.x;
          worldY = absPos.y;
          worldW = object.width;
          worldH = object.height;
        } else {
          const domBounds = getVisualBoundsFromDOM(
            objectId,
            objects,
            committedViewportRef.current
          );
          worldX = domBounds.x;
          worldY = domBounds.y;
          worldW = domBounds.width;
          worldH = domBounds.height;
        }

        const screenTopLeft = worldToScreen({ x: worldX, y: worldY }, viewport);
        const screenBottomRight = worldToScreen(
          { x: worldX + worldW, y: worldY + worldH },
          viewport
        );

        const bounds = {
          x: screenTopLeft.x,
          y: screenTopLeft.y,
          width: screenBottomRight.x - screenTopLeft.x,
          height: screenBottomRight.y - screenTopLeft.y,
        };

        return (
          <div
            key={`individual-${objectId}`}
            className="absolute pointer-events-none"
            style={{
              left: bounds.x,
              top: bounds.y,
              width: bounds.width,
              height: bounds.height,
              border: "1px solid var(--ramp-blue-500)",
              borderRadius: "1px",
              zIndex: 45, // Below selection box (z-index 50) but above canvas objects
            }}
          />
        );
      })}
    </>
  );
};
