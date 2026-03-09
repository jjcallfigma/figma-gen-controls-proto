"use client";

import { CanvasObject, SolidStroke, Stroke } from "@/types/canvas";
import React from "react";
import { useAppStore } from "../../core/state/store";

interface StrokeWrapperProps {
  object: CanvasObject;
  children?: React.ReactNode; // Made optional for single-layer objects
  className?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties; // Additional styles for the content container
  borderRadius?: import("@/types/canvas").BorderRadius | string; // Raw border radius data for stroke calculations
  [key: string]: any; // Allow other props to pass through to wrapper
}

/**
 * StrokeWrapper implements the wrapper approach for stroke rendering.
 * Structure:
 * - Wrapper div (handles positioning and sizing)
 *   - Content div (contains the actual object content)
 *   - Stroke div (sibling to content, renders all strokes)
 */
export default function StrokeWrapper({
  object,
  children,
  className = "",
  style = {},
  contentStyle = {},
  borderRadius,
  ...props
}: StrokeWrapperProps) {
  // Get canvas background color for cutout
  const canvasBackgroundColor = useAppStore(
    (state) => state.canvasSettings.backgroundColor
  );

  // Check if we have strokes (new system) or legacy stroke
  const hasNewStrokes = object.strokes && object.strokes.length > 0;
  const hasLegacyStroke =
    object.stroke && (object.strokeWidth !== undefined || object.strokeWidths);

  const hasStrokes = hasNewStrokes || hasLegacyStroke;

  const strokePosition = object.strokePosition || "inside";

  // Calculate stroke expansion needed for outside strokes
  const getStrokeExpansion = () => {
    if (strokePosition !== "outside") return 0;

    // Handle individual stroke widths
    if (object.strokeWidths) {
      const strokeWidths = object.strokeWidths;
      return Math.max(
        strokeWidths.top || 0,
        strokeWidths.right || 0,
        strokeWidths.bottom || 0,
        strokeWidths.left || 0
      );
    }

    return object.strokeWidth || 0;
  };

  const strokeExpansion = getStrokeExpansion();

  // Wrapper style - contains everything, preserve original positioning
  const wrapperStyle: React.CSSProperties = {
    ...style,
    // Don't override position - preserve the original positioning logic
  };

  // Content style - positions content within wrapper and includes passed contentStyle
  const finalContentStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    zIndex: 100, // Base z-index for content - strokes position relative to this
    ...contentStyle,
  };

  // Render all strokes
  const renderStrokes = () => {
    const strokesToRender: (Stroke | null)[] = [];

    // Add new strokes (render all stroke positions)
    if (hasNewStrokes) {
      strokesToRender.push(
        ...object.strokes!.filter((stroke) => stroke.visible)
      );
    }

    // Add legacy stroke (render all stroke positions)
    if (hasLegacyStroke && !hasNewStrokes) {
      const legacyStroke: SolidStroke = {
        id: "legacy-stroke",
        type: "solid",
        color: object.stroke!,
        opacity: object.strokeOpacity || 1,
        visible: true,
        blendMode: "normal",
      };
      strokesToRender.push(legacyStroke);
    }

    // Removed: StrokeWrapper logging that triggered on every render

    return strokesToRender.map((stroke, index) => renderStroke(stroke, index));
  };

  // Helper function to calculate adjusted border radius for stroke positioning
  const calculateAdjustedBorderRadius = (
    strokeWidth: number,
    strokePosition: string,
    strokeWidths?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    }
  ) => {
    // Use passed borderRadius prop, fallback to object properties, then to 0
    let baseBorderRadius = borderRadius;
    if (!baseBorderRadius) {
      const frameProps =
        object.properties?.type === "frame"
          ? object.properties
          : object.properties?.type === "rectangle"
          ? object.properties
          : { borderRadius: 0 };
      baseBorderRadius = frameProps.borderRadius || 0;
    }

    // Handle string border radius (like "50%" for ellipses)
    if (typeof baseBorderRadius === "string") {
      // For percentage-based border radius (ellipses), return the string with adjustments
      if (baseBorderRadius === "50%") {
        // For circular shapes, we can't easily calculate adjustments, so return as-is
        return baseBorderRadius;
      }
      // For other string values, try to parse or return as-is
      return baseBorderRadius;
    }

    // If base border radius is 0, stroke should also have 0 border radius
    if (typeof baseBorderRadius === "number" && baseBorderRadius === 0) {
      return 0;
    }

    // Check if all individual border radii are 0
    if (typeof baseBorderRadius === "object") {
      const allRadiiZero =
        (baseBorderRadius.topLeft || 0) === 0 &&
        (baseBorderRadius.topRight || 0) === 0 &&
        (baseBorderRadius.bottomLeft || 0) === 0 &&
        (baseBorderRadius.bottomRight || 0) === 0;

      if (allRadiiZero) {
        return {
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
        };
      }
    }

    // If we have individual stroke widths, calculate corner-specific adjustments
    if (strokeWidths) {
      const positionMultiplier =
        strokePosition === "outside"
          ? 1
          : strokePosition === "center"
          ? 0.5
          : 0;

      // Calculate corner radius using geometric relationship
      // For outside strokes, the corner radius should account for both adjacent stroke widths
      const getCornerRadii = (
        baseRadius: number,
        horizontalStroke: number,
        verticalStroke: number
      ) => {
        if (strokePosition === "outside") {
          // For outside strokes, add the stroke widths to maintain proper geometric relationship
          const horizontalRadius = Math.max(0, baseRadius + horizontalStroke);
          const verticalRadius = Math.max(0, baseRadius + verticalStroke);
          return `${horizontalRadius}px ${verticalRadius}px`;
        } else if (strokePosition === "center") {
          const horizontalRadius = Math.max(
            0,
            baseRadius + horizontalStroke * 0.5
          );
          const verticalRadius = Math.max(0, baseRadius + verticalStroke * 0.5);
          return `${horizontalRadius}px ${verticalRadius}px`;
        } else {
          // Inside strokes use the base radius
          return `${baseRadius}px`;
        }
      };

      // Apply geometric border radius adjustments for each corner
      if (typeof baseBorderRadius === "object") {
        return {
          borderStartStartRadius: getCornerRadii(
            baseBorderRadius.topLeft || 0,
            strokeWidths.left || 0,
            strokeWidths.top || 0
          ),
          borderStartEndRadius: getCornerRadii(
            baseBorderRadius.topRight || 0,
            strokeWidths.right || 0,
            strokeWidths.top || 0
          ),
          borderEndStartRadius: getCornerRadii(
            baseBorderRadius.bottomLeft || 0,
            strokeWidths.left || 0,
            strokeWidths.bottom || 0
          ),
          borderEndEndRadius: getCornerRadii(
            baseBorderRadius.bottomRight || 0,
            strokeWidths.right || 0,
            strokeWidths.bottom || 0
          ),
        };
      } else {
        // For uniform border radius, calculate geometric radii for each corner
        const baseRadius = baseBorderRadius as number;
        return {
          borderStartStartRadius: getCornerRadii(
            baseRadius,
            strokeWidths.left || 0,
            strokeWidths.top || 0
          ),
          borderStartEndRadius: getCornerRadii(
            baseRadius,
            strokeWidths.right || 0,
            strokeWidths.top || 0
          ),
          borderEndStartRadius: getCornerRadii(
            baseRadius,
            strokeWidths.left || 0,
            strokeWidths.bottom || 0
          ),
          borderEndEndRadius: getCornerRadii(
            baseRadius,
            strokeWidths.right || 0,
            strokeWidths.bottom || 0
          ),
        };
      }
    }

    // Fallback to uniform adjustment for backward compatibility
    const adjustment =
      strokePosition === "outside"
        ? strokeWidth
        : strokePosition === "center"
        ? strokeWidth / 2
        : 0;

    // For individual border radii (when borderRadius is an object)
    if (typeof baseBorderRadius === "object") {
      return {
        borderStartStartRadius: Math.max(
          0,
          (baseBorderRadius.topLeft || 0) + adjustment
        ),
        borderStartEndRadius: Math.max(
          0,
          (baseBorderRadius.topRight || 0) + adjustment
        ),
        borderEndStartRadius: Math.max(
          0,
          (baseBorderRadius.bottomLeft || 0) + adjustment
        ),
        borderEndEndRadius: Math.max(
          0,
          (baseBorderRadius.bottomRight || 0) + adjustment
        ),
      };
    }

    // For uniform border radius (when borderRadius is a number)
    return Math.max(0, (baseBorderRadius as number) + adjustment);
  };

  // Helper function to render a single stroke
  const renderStroke = (stroke: Stroke | null, index: number = 0) => {
    if (!stroke) return null;

    // Removed: renderStroke logging that triggered on every stroke render

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
      const strokeWidths = object.strokeWidths!;

      if (strokePosition === "inside") {
        // Removed: Individual width inside stroke logging

        // Calculate border radius with individual stroke width adjustments
        const adjustedBorderRadius = calculateAdjustedBorderRadius(
          0, // Not used when strokeWidths is provided
          "inside",
          strokeWidths
        );

        return (
          <div
            key={`stroke-${index}`}
            className="absolute pointer-events-none"
            style={{
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              borderTopWidth: strokeWidths.top || 0,
              borderRightWidth: strokeWidths.right || 0,
              borderBottomWidth: strokeWidths.bottom || 0,
              borderLeftWidth: strokeWidths.left || 0,
              borderStyle: "solid",
              borderColor: strokeColor,
              borderRadius: "inherit",
              boxSizing: "border-box",
              zIndex: 200 + index, // Above content
              ...(typeof adjustedBorderRadius === "object"
                ? adjustedBorderRadius
                : {
                    borderRadius: adjustedBorderRadius,
                  }),
              ...(strokeBlendMode !== "normal" && {
                mixBlendMode:
                  strokeBlendMode as React.CSSProperties["mixBlendMode"],
              }),
            }}
          />
        );
      } else if (strokePosition === "center") {
        // Removed: Individual width center stroke logging

        // For center strokes with individual widths - use CSS mask approach
        // Get base border radius for mask calculation
        let baseBorderRadius = borderRadius;
        if (!baseBorderRadius) {
          const frameProps =
            object.properties?.type === "frame"
              ? object.properties
              : object.properties?.type === "rectangle"
              ? object.properties
              : { borderRadius: 0 };
          baseBorderRadius = frameProps.borderRadius || 0;
        }

        const halfTop = (strokeWidths.top || 0) / 2;
        const halfRight = (strokeWidths.right || 0) / 2;
        const halfBottom = (strokeWidths.bottom || 0) / 2;
        const halfLeft = (strokeWidths.left || 0) / 2;

        // For center strokes, Figma's logic:
        // - If stroke = 0: use max stroke value from all sides
        // - If stroke > 0: use actual stroke value
        const maxHalfStroke = Math.max(
          halfTop,
          halfRight,
          halfBottom,
          halfLeft
        );

        const getCenterCornerRadius = (
          baseRadius: number,
          verticalStroke: number,
          horizontalStroke: number
        ) => {
          // Exception: if base radius is 0, always return 0
          if (baseRadius === 0) {
            return 0;
          }

          // Check if either stroke is 0
          if (verticalStroke === 0 && horizontalStroke === 0) {
            return baseRadius + maxHalfStroke;
          }
          if (verticalStroke === 0) {
            return baseRadius + horizontalStroke;
          }
          if (horizontalStroke === 0) {
            return baseRadius + verticalStroke;
          }
          // Both strokes exist - use min for geometric alignment (smallest adjacent stroke determines the corner)
          return baseRadius + Math.min(verticalStroke, horizontalStroke);
        };

        // For center strokes, use content radius so inner edge aligns perfectly (no gaps)
        const outerBorderRadiusCorners =
          typeof baseBorderRadius === "object"
            ? {
                borderTopLeftRadius: `${baseBorderRadius.topLeft || 0}px`,
                borderTopRightRadius: `${baseBorderRadius.topRight || 0}px`,
                borderBottomRightRadius: `${
                  baseBorderRadius.bottomRight || 0
                }px`,
                borderBottomLeftRadius: `${baseBorderRadius.bottomLeft || 0}px`,
              }
            : typeof baseBorderRadius === "string"
            ? { borderRadius: baseBorderRadius }
            : {
                borderRadius: `${baseBorderRadius}px`,
              };

        // Calculate inner size for mask
        const innerWidth = `calc(100% - ${halfLeft + halfRight}px)`;
        const innerHeight = `calc(100% - ${halfTop + halfBottom}px)`;

        return (
          <div
            key={`stroke-${index}`}
            className="absolute pointer-events-none"
            style={{
              top: -halfTop,
              right: -halfRight,
              bottom: -halfBottom,
              left: -halfLeft,
              width: `calc(100% + ${halfLeft + halfRight}px)`,
              height: `calc(100% + ${halfTop + halfBottom}px)`,
              borderTopWidth: strokeWidths.top || 0,
              borderRightWidth: strokeWidths.right || 0,
              borderBottomWidth: strokeWidths.bottom || 0,
              borderLeftWidth: strokeWidths.left || 0,
              borderStyle: "solid",
              borderColor: strokeColor,
              ...outerBorderRadiusCorners,
              boxSizing: "border-box",
              zIndex: 150 + index, // Above content but below inside strokes
              ...(strokeBlendMode !== "normal" && {
                mixBlendMode:
                  strokeBlendMode as React.CSSProperties["mixBlendMode"],
              }),
            }}
          />
        );
      } else {
        // Outside strokes with individual widths - use CSS mask approach
        // Get base border radius for mask calculation
        let baseBorderRadius = borderRadius;
        if (!baseBorderRadius) {
          const frameProps =
            object.properties?.type === "frame"
              ? object.properties
              : object.properties?.type === "rectangle"
              ? object.properties
              : { borderRadius: 0 };
          baseBorderRadius = frameProps.borderRadius || 0;
        }

        // Calculate outer container size and inner content size for mask
        const topStroke = strokeWidths.top || 0;
        const rightStroke = strokeWidths.right || 0;
        const bottomStroke = strokeWidths.bottom || 0;
        const leftStroke = strokeWidths.left || 0;

        // For outside strokes, Figma's logic:
        // - If stroke = 0: use max stroke value from all sides
        // - If stroke > 0: use actual stroke value
        const maxStroke = Math.max(
          topStroke,
          rightStroke,
          bottomStroke,
          leftStroke
        );

        const getCornerRadius = (
          baseRadius: number,
          verticalStroke: number,
          horizontalStroke: number
        ) => {
          // Exception: if base radius is 0, always return 0
          if (baseRadius === 0) {
            return 0;
          }

          // Check if either stroke is 0
          if (verticalStroke === 0 && horizontalStroke === 0) {
            return baseRadius + maxStroke;
          }
          if (verticalStroke === 0) {
            return baseRadius + horizontalStroke;
          }
          if (horizontalStroke === 0) {
            return baseRadius + verticalStroke;
          }
          // Both strokes exist - use min for geometric alignment (smallest adjacent stroke determines the corner)
          return baseRadius + Math.min(verticalStroke, horizontalStroke);
        };

        const outerBorderRadiusCorners =
          typeof baseBorderRadius === "object"
            ? {
                borderTopLeftRadius: `${getCornerRadius(
                  baseBorderRadius.topLeft || 0,
                  topStroke,
                  leftStroke
                )}px`,
                borderTopRightRadius: `${getCornerRadius(
                  baseBorderRadius.topRight || 0,
                  topStroke,
                  rightStroke
                )}px`,
                borderBottomRightRadius: `${getCornerRadius(
                  baseBorderRadius.bottomRight || 0,
                  bottomStroke,
                  rightStroke
                )}px`,
                borderBottomLeftRadius: `${getCornerRadius(
                  baseBorderRadius.bottomLeft || 0,
                  bottomStroke,
                  leftStroke
                )}px`,
              }
            : typeof baseBorderRadius === "string"
            ? { borderRadius: baseBorderRadius }
            : (() => {
                const topLeft = getCornerRadius(
                  baseBorderRadius as number,
                  topStroke,
                  leftStroke
                );
                const topRight = getCornerRadius(
                  baseBorderRadius as number,
                  topStroke,
                  rightStroke
                );
                const bottomRight = getCornerRadius(
                  baseBorderRadius as number,
                  bottomStroke,
                  rightStroke
                );
                const bottomLeft = getCornerRadius(
                  baseBorderRadius as number,
                  bottomStroke,
                  leftStroke
                );

                // Force 4 values by ensuring they're all slightly different to prevent CSS optimization
                const ensureUnique = (values: number[]) => {
                  const unique = [...values];
                  for (let i = 1; i < unique.length; i++) {
                    const duplicateIndex = unique
                      .slice(0, i)
                      .findIndex((v) => v === unique[i]);
                    if (duplicateIndex !== -1) {
                      unique[i] += 0.0001 * (i - duplicateIndex);
                    }
                  }
                  return unique;
                };

                const [
                  uniqueTopLeft,
                  uniqueTopRight,
                  uniqueBottomRight,
                  uniqueBottomLeft,
                ] = ensureUnique([topLeft, topRight, bottomRight, bottomLeft]);

                return {
                  borderTopLeftRadius: `${uniqueTopLeft}px`,
                  borderTopRightRadius: `${uniqueTopRight}px`,
                  borderBottomRightRadius: `${uniqueBottomRight}px`,
                  borderBottomLeftRadius: `${uniqueBottomLeft}px`,
                };
              })();

        // Convert border radius to CSS string for inner mask
        const innerBorderRadius =
          typeof baseBorderRadius === "object"
            ? `${baseBorderRadius.topLeft || 0}px ${
                baseBorderRadius.topRight || 0
              }px ${baseBorderRadius.bottomRight || 0}px ${
                baseBorderRadius.bottomLeft || 0
              }px`
            : typeof baseBorderRadius === "string"
            ? baseBorderRadius
            : `${baseBorderRadius}px`;

        // Create a simple mask using clip-path
        const innerWidth = `calc(100% - ${leftStroke + rightStroke}px)`;
        const innerHeight = `calc(100% - ${topStroke + bottomStroke}px)`;

        return (
          <div
            key={`stroke-${index}`}
            className="absolute pointer-events-none"
            style={{
              top: -topStroke,
              right: -rightStroke,
              bottom: -bottomStroke,
              left: -leftStroke,
              width: `calc(100% + ${leftStroke + rightStroke}px)`,
              height: `calc(100% + ${topStroke + bottomStroke}px)`,
              backgroundColor: strokeColor,
              ...outerBorderRadiusCorners,
              zIndex:
                (object.strokePosition || "inside") === "outside"
                  ? -1 - index
                  : 10 + index, // Outside behind, center/inside on top
              ...(strokeBlendMode !== "normal" && {
                mixBlendMode:
                  strokeBlendMode as React.CSSProperties["mixBlendMode"],
              }),
            }}
          >
            {/* Inner div to cut out the content area - only for outside strokes */}
            {(object.strokePosition || "inside") === "outside" && (
              <div
                style={{
                  position: "absolute",
                  top: topStroke,
                  right: rightStroke,
                  bottom: bottomStroke,
                  left: leftStroke,
                  backgroundColor: canvasBackgroundColor || "#f5f5f5",
                  borderRadius: innerBorderRadius,
                }}
              />
            )}
          </div>
        );
      }
    }

    // Uniform stroke width
    const strokeWidth = object.strokeWidth || 0;

    if (strokePosition === "inside") {
      // Inside stroke - overlay that doesn't affect content size
      const strokeWidths = object.strokeWidths || {
        top: strokeWidth,
        right: strokeWidth,
        bottom: strokeWidth,
        left: strokeWidth,
      };

      // Removed: Inside stroke rendering logging

      return (
        <div
          key={`stroke-${index}`}
          className="absolute pointer-events-none"
          style={{
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderTopWidth: strokeWidths.top || 0,
            borderRightWidth: strokeWidths.right || 0,
            borderBottomWidth: strokeWidths.bottom || 0,
            borderLeftWidth: strokeWidths.left || 0,
            borderStyle: "solid",
            borderColor: strokeColor,
            borderRadius: "inherit",
            boxSizing: "border-box",
            zIndex: 200 + index, // Above content
            ...(strokeBlendMode !== "normal" && {
              mixBlendMode:
                strokeBlendMode as React.CSSProperties["mixBlendMode"],
            }),
          }}
        />
      );
    } else if (strokePosition === "center") {
      // Center stroke - half of stroke width goes inward, half outward
      const halfStroke = strokeWidth / 2;
      const adjustedBorderRadius = calculateAdjustedBorderRadius(
        strokeWidth,
        "center"
      );

      return (
        <div
          key={`stroke-${index}`}
          className="absolute pointer-events-none"
          style={{
            borderWidth: strokeWidth,
            borderStyle: "solid",
            borderColor: strokeColor,
            ...(typeof adjustedBorderRadius === "object"
              ? adjustedBorderRadius
              : {
                  borderRadius: adjustedBorderRadius,
                }),
            // Position to expand outward by half stroke width
            top: -halfStroke,
            right: -halfStroke,
            bottom: -halfStroke,
            left: -halfStroke,
            // Content area becomes the original size + stroke width
            width: `calc(100% + ${strokeWidth}px)`,
            height: `calc(100% + ${strokeWidth}px)`,
            boxSizing: "border-box",
            zIndex: 1000 + index,
            ...(strokeBlendMode !== "normal" && {
              mixBlendMode:
                strokeBlendMode as React.CSSProperties["mixBlendMode"],
            }),
          }}
        />
      );
    } else {
      // Outside stroke - stroke expands completely outward from content edge
      const adjustedBorderRadius = calculateAdjustedBorderRadius(
        strokeWidth,
        "outside"
      );

      return (
        <div
          key={`stroke-${index}`}
          className="absolute pointer-events-none"
          style={{
            borderWidth: strokeWidth,
            borderStyle: "solid",
            borderColor: strokeColor,
            ...(typeof adjustedBorderRadius === "object"
              ? adjustedBorderRadius
              : {
                  borderRadius: adjustedBorderRadius,
                }),
            top: -strokeWidth,
            right: -strokeWidth,
            bottom: -strokeWidth,
            left: -strokeWidth,
            width: `calc(100% + ${strokeWidth * 2}px)`,
            height: `calc(100% + ${strokeWidth * 2}px)`,
            boxSizing: "border-box",
            zIndex: 1000 + index,
            ...(strokeBlendMode !== "normal" && {
              mixBlendMode:
                strokeBlendMode as React.CSSProperties["mixBlendMode"],
            }),
          }}
        />
      );
    }
  };

  return (
    <div className={className} style={wrapperStyle} {...props}>
      {/* Content container */}
      <div style={finalContentStyle}>{children}</div>

      {/* Stroke container - sibling to content */}
      {hasStrokes && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: "inherit", // Inherit border radius from wrapper
            // No zIndex here - individual strokes control their own z-index
          }}
        >
          {renderStrokes()}
        </div>
      )}
    </div>
  );
}
