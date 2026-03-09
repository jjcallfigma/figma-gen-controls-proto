"use client";

import { useAppStore, useVisibleObjects } from "@/core/state/store";
import { CanvasObject as CanvasObjectType, Viewport } from "@/types/canvas";
import React, { useMemo } from "react";
import CanvasObject from "./CanvasObject";

function isObjectInViewport(
  obj: CanvasObjectType,
  viewport: Viewport,
  screenWidth: number,
  screenHeight: number
): boolean {
  const { panX, panY, zoom } = viewport;

  const effectiveWidth = screenWidth;
  const effectiveHeight = screenHeight;

  const visibleLeft = -panX / zoom;
  const visibleTop = -panY / zoom;
  const visibleWidth = effectiveWidth / zoom;
  const visibleHeight = effectiveHeight / zoom;

  const marginX = visibleWidth * 0.5;
  const marginY = visibleHeight * 0.5;

  const left = visibleLeft - marginX;
  const top = visibleTop - marginY;
  const right = visibleLeft + visibleWidth + marginX;
  const bottom = visibleTop + visibleHeight + marginY;

  return (
    obj.x + obj.width > left &&
    obj.x < right &&
    obj.y + obj.height > top &&
    obj.y < bottom
  );
}

/**
 * Memoized children list — only re-renders when visibleObjects change,
 * NOT on every viewport (zoom/pan) tick or drag frame.
 * Transient state (drag positions, resize states) is read by each
 * CanvasObject directly from the transient store.
 */
const WorldSpaceChildren = React.memo(function WorldSpaceChildren({
  visibleObjects,
}: {
  visibleObjects: CanvasObjectType[];
}) {
  const topLevel = useMemo(
    () => visibleObjects.filter((obj) => !obj.parentId),
    [visibleObjects]
  );

  return (
    <>
      {topLevel.map((object) => (
        <CanvasObject key={object.id} object={object} />
      ))}
    </>
  );
});

/**
 * WorldSpace - The zoomable/pannable content layer.
 * The CSS transform updates on every viewport tick,
 * but the children list is memoized separately.
 */
export default function WorldSpace() {
  const viewport = useAppStore((state) => state.viewport);
  const backgroundColor = useAppStore(
    (state) => state.canvasSettings.backgroundColor
  );
  const backgroundOpacity = useAppStore(
    (state) => state.canvasSettings.backgroundOpacity
  );
  const visibleObjects = useVisibleObjects();

  const transform = `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`;

  return (
    <div
      className="absolute inset-0 pointer-events-auto"
      data-world-space="true"
      style={{
        width: "0px !important",
        height: "0px !important",
        transform,
        transformOrigin: "0 0",
      }}
    >
      {/* Canvas Background Element - for blend mode compatibility */}
      <div
        className="absolute pointer-events-none"
        style={{
          backgroundColor,
          opacity: backgroundOpacity,
          left: `-${
            (viewport.panX + viewport.viewportBounds.width * 5) / viewport.zoom
          }px`,
          top: `-${
            (viewport.panY + viewport.viewportBounds.height * 5) / viewport.zoom
          }px`,
          width: `${(viewport.viewportBounds.width * 60) / viewport.zoom}px`,
          height: `${(viewport.viewportBounds.height * 60) / viewport.zoom}px`,
          zIndex: -1,
        }}
      />

      <WorldSpaceChildren visibleObjects={visibleObjects} />
    </div>
  );
}
