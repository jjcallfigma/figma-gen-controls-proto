"use client";

import { useAppStore, useObjects } from "@/core/state/store";
import { getAbsolutePosition } from "@/core/utils/coordinates";
import { getPreviewDocument } from "@/core/utils/makePreviewRegistry";
import React, { useEffect, useState } from "react";

/**
 * Screen-space overlay for extract mode.
 *
 * Reads the iframe DOM for elements marked with `.__extract-hover` and
 * `.__extract-selected` CSS classes (applied by MakeCanvasPreview),
 * maps their bounding rects from iframe-viewport coords to canvas
 * screen-space coords, and renders true screen-space overlays that
 * never clip at the iframe boundary and maintain constant pixel sizes.
 */
const MakeExtractOverlay = React.memo(function MakeExtractOverlay() {
  const extractMode = useAppStore((s) => s.extractMode);
  const viewport = useAppStore((s) => s.viewport);
  const objects = useObjects();

  // Tick counter bumped by custom events from MakeCanvasPreview
  // to trigger re-renders when hover / selection classes change.
  const [, setTick] = useState(0);

  const makeObjectId =
    extractMode.isActive ? extractMode.makeObjectId : null;

  useEffect(() => {
    if (!makeObjectId) return;
    const handler = () => setTick((t) => t + 1);
    window.addEventListener("extract-overlay-update", handler);
    return () => window.removeEventListener("extract-overlay-update", handler);
  }, [makeObjectId]);

  if (!makeObjectId) return null;

  const doc = getPreviewDocument(makeObjectId);
  const makeObj = objects[makeObjectId];
  if (!doc || !makeObj) return null;

  const absPos = getAbsolutePosition(makeObjectId, objects);

  // --- Read hover element ---
  let hoverRect: ScreenRect | null = null;
  let hoverName: string | null = null;
  const hoverEl = doc.querySelector(".__extract-hover");
  if (hoverEl) {
    const r = hoverEl.getBoundingClientRect();
    hoverRect = iframeRectToScreen(r, absPos, viewport);
    hoverName = elementDisplayName(hoverEl);
  }

  // --- Read selected elements ---
  const selectedEls = doc.querySelectorAll(".__extract-selected");
  const selectedRects: ScreenRect[] = Array.from(selectedEls).map((el) =>
    iframeRectToScreen(el.getBoundingClientRect(), absPos, viewport),
  );

  return (
    <>
      {/* Selection outlines */}
      {selectedRects.map((rect, i) => (
        <div
          key={`extract-sel-${i}`}
          className="absolute pointer-events-none"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            outline: "2px solid #3b82f6",
            outlineOffset: "-2px",
          }}
        />
      ))}

      {/* Hover outline */}
      {hoverRect && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: hoverRect.x,
            top: hoverRect.y,
            width: hoverRect.w,
            height: hoverRect.h,
            outline: "1.5px dashed #3b82f6",
            outlineOffset: "-1.5px",
          }}
        />
      )}

      {/* Hover label badge */}
      {hoverRect && hoverName && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: hoverRect.x,
            top: labelTop(hoverRect),
            background: "#3b82f6",
            color: "#fff",
            font: "500 10px/1 system-ui, sans-serif",
            padding: "3px 6px",
            borderRadius: 3,
            whiteSpace: "nowrap",
            boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
            letterSpacing: "0.01em",
            zIndex: 1,
          }}
        >
          {hoverName}
        </div>
      )}
    </>
  );
});

export default MakeExtractOverlay;

// ─── Helpers ─────────────────────────────────────────────────────────

interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Convert an iframe-viewport DOMRect to canvas screen-space coords.
 *
 * The iframe fills the Make object exactly (width:100% height:100%),
 * so iframe-viewport pixel offsets equal world-unit offsets from the
 * Make object's top-left corner.
 */
function iframeRectToScreen(
  rect: DOMRect,
  makeWorldPos: { x: number; y: number },
  viewport: { zoom: number; panX: number; panY: number },
): ScreenRect {
  return {
    x: (makeWorldPos.x + rect.left) * viewport.zoom + viewport.panX,
    y: (makeWorldPos.y + rect.top) * viewport.zoom + viewport.panY,
    w: rect.width * viewport.zoom,
    h: rect.height * viewport.zoom,
  };
}

/** Position the label badge above the element, or below if it would overflow. */
function labelTop(rect: ScreenRect): number {
  const LABEL_H = 18;
  const GAP = 2;
  const above = rect.y - LABEL_H - GAP;
  return above >= 0 ? above : rect.y + rect.h + GAP;
}

/** Derive a compact display name from a DOM element (same logic as MakeCanvasPreview). */
function elementDisplayName(el: Element): string {
  const dataName = el.getAttribute("data-make-name");
  if (dataName) return dataName;
  const tag = el.tagName.toLowerCase();
  const cls = el.className;
  if (typeof cls === "string" && cls.trim()) {
    const firstClass = cls.trim().split(/\s+/)[0];
    if (firstClass.length <= 24 && !firstClass.startsWith("__extract")) {
      return `${tag}.${firstClass}`;
    }
  }
  return tag;
}
