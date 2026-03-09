"use client";

import {
  CanvasObject as CanvasObjectType,
  SolidStroke,
  Stroke,
} from "@/types/canvas";
import React from "react";

interface StrokeLayerProps {
  object: CanvasObjectType;
}

/**
 * StrokeLayer renders multiple strokes on top of the background fills
 * Uses separate positioning techniques based on stroke position
 */
export default function StrokeLayer({ object }: StrokeLayerProps) {
  // Check if we have strokes (new system) or legacy stroke
  const hasNewStrokes = object.strokes && object.strokes.length > 0;
  const hasLegacyStroke =
    object.stroke && (object.strokeWidth !== undefined || object.strokeWidths);

  if (!hasNewStrokes && !hasLegacyStroke) {
    return null;
  }

  const strokePosition = object.strokePosition || "inside";

  // Helper function to render a single stroke
  const renderStroke = (stroke: Stroke | null, index: number = 0) => {
    if (!stroke) return null;

    // Only support solid strokes for now
    if (stroke.type !== "solid") return null;

    const solidStroke = stroke as SolidStroke;
    const strokeBlendMode = solidStroke.blendMode || "normal";

    // Parse the color and apply opacity
    let strokeColor = solidStroke.color;
    if (solidStroke.opacity < 1) {
      // Convert hex to rgba with opacity
      if (strokeColor.startsWith("#")) {
        const r = parseInt(strokeColor.slice(1, 3), 16);
        const g = parseInt(strokeColor.slice(3, 5), 16);
        const b = parseInt(strokeColor.slice(5, 7), 16);
        strokeColor = `rgba(${r}, ${g}, ${b}, ${solidStroke.opacity})`;
      }
    }

    // Handle individual stroke widths
    const hasIndividualWidths =
      object.strokeWidths &&
      (object.strokeWidths.top !== undefined ||
        object.strokeWidths.right !== undefined ||
        object.strokeWidths.bottom !== undefined ||
        object.strokeWidths.left !== undefined);

    if (hasIndividualWidths) {
      // Use border for individual widths
      const strokeWidths = object.strokeWidths!;
      const defaultWidth = object.strokeWidth || 0;

      const borderStyle: React.CSSProperties = {
        borderTopWidth: strokeWidths.top ?? defaultWidth,
        borderRightWidth: strokeWidths.right ?? defaultWidth,
        borderBottomWidth: strokeWidths.bottom ?? defaultWidth,
        borderLeftWidth: strokeWidths.left ?? defaultWidth,
        borderStyle: "solid",
        borderColor: strokeColor,
        borderRadius: "inherit",
        boxSizing: "border-box", // Ensures strokes don't expand element size
        zIndex: 1000 + index, // Ensure strokes appear on top of children, later strokes on top
        ...(strokeBlendMode !== "normal" && {
          mixBlendMode: strokeBlendMode as React.CSSProperties["mixBlendMode"],
        }),
      };

      // Adjust positioning based on stroke position
      if (strokePosition === "center") {
        // Center - border-box centers the stroke perfectly
        return (
          <div
            key={`stroke-${index}`}
            className="absolute inset-0 pointer-events-none"
            style={borderStyle}
          />
        );
      } else if (strokePosition === "outside") {
        // Outside - expand outward by the stroke width
        const top = -(strokeWidths.top ?? defaultWidth);
        const right = -(strokeWidths.right ?? defaultWidth);
        const bottom = -(strokeWidths.bottom ?? defaultWidth);
        const left = -(strokeWidths.left ?? defaultWidth);

        return (
          <div
            key={`stroke-${index}`}
            className="absolute pointer-events-none"
            style={{
              ...borderStyle,
              top,
              right,
              bottom,
              left,
            }}
          />
        );
      } else {
        // Inside - use border with border-box for better radius handling
        return (
          <div
            key={`stroke-${index}`}
            className="absolute inset-0 pointer-events-none"
            style={borderStyle}
          />
        );
      }
    }

    // Uniform stroke width - also use borders for consistency
    const strokeWidth = object.strokeWidth || 0;

    if (strokePosition === "inside") {
      // Inside - use border with border-box for better radius handling
      return (
        <div
          key={`stroke-${index}`}
          className="absolute inset-0 pointer-events-none"
          style={{
            border: `${strokeWidth}px solid ${strokeColor}`,
            borderRadius: "inherit",
            boxSizing: "border-box",
            zIndex: 1000 + index, // Ensure strokes appear on top of children, later strokes on top
            ...(strokeBlendMode !== "normal" && {
              mixBlendMode:
                strokeBlendMode as React.CSSProperties["mixBlendMode"],
            }),
          }}
        />
      );
    } else if (strokePosition === "center") {
      // Center - use border with box-sizing: border-box
      return (
        <div
          key={`stroke-${index}`}
          className="absolute inset-0 pointer-events-none"
          style={{
            border: `${strokeWidth}px solid ${strokeColor}`,
            borderRadius: "inherit",
            boxSizing: "border-box",
            zIndex: 1000 + index, // Ensure strokes appear on top of children, later strokes on top
            ...(strokeBlendMode !== "normal" && {
              mixBlendMode:
                strokeBlendMode as React.CSSProperties["mixBlendMode"],
            }),
          }}
        />
      );
    } else {
      // Outside - expand outward by the stroke width
      return (
        <div
          key={`stroke-${index}`}
          className="absolute pointer-events-none"
          style={{
            top: -strokeWidth,
            right: -strokeWidth,
            bottom: -strokeWidth,
            left: -strokeWidth,
            border: `${strokeWidth}px solid ${strokeColor}`,
            borderRadius: "inherit",
            zIndex: 1000 + index, // Ensure strokes appear on top of children, later strokes on top
            ...(strokeBlendMode !== "normal" && {
              mixBlendMode:
                strokeBlendMode as React.CSSProperties["mixBlendMode"],
            }),
          }}
        />
      );
    }
  };

  // If we have new strokes, render them
  if (hasNewStrokes) {
    return (
      <>
        {object
          .strokes!.filter((stroke) => stroke.visible)
          .map((stroke, index) => renderStroke(stroke, index))}
      </>
    );
  }

  // Legacy stroke support - convert to new format temporarily
  if (hasLegacyStroke) {
    const legacyStroke: SolidStroke = {
      id: "legacy-stroke",
      type: "solid",
      color: object.stroke!,
      opacity: object.strokeOpacity || 1,
      visible: true,
      blendMode: "normal",
    };

    return renderStroke(legacyStroke, 0);
  }

  return null;
}
