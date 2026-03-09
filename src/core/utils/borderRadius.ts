import { BorderRadius } from "@/types/canvas";

/**
 * Utility functions for working with border radius values
 */

/**
 * Converts a BorderRadius value to CSS border-radius string
 */
export function borderRadiusToCSS(borderRadius?: BorderRadius): string {
  if (!borderRadius) return "0";

  if (typeof borderRadius === "number") {
    return `${borderRadius}px`;
  }

  // CSS border-radius order: top-left top-right bottom-right bottom-left
  return `${borderRadius.topLeft}px ${borderRadius.topRight}px ${borderRadius.bottomRight}px ${borderRadius.bottomLeft}px`;
}

/**
 * Converts Figma corner radii to our BorderRadius type
 * @param cornerRadius - Uniform corner radius (fallback)
 * @param rectangleCornerRadii - Array of 4 corner radii [topLeft, topRight, bottomRight, bottomLeft] (clockwise from top-left)
 */
export function convertFigmaCornerRadii(
  cornerRadius?: number,
  rectangleCornerRadii?: number[]
): BorderRadius {
  // If rectangleCornerRadii is provided and has 4 values, use individual corners
  if (rectangleCornerRadii && rectangleCornerRadii.length === 4) {
    const [topLeft, topRight, bottomRight, bottomLeft] = rectangleCornerRadii;

    // Check if all corners are the same - if so, return the uniform value
    const allSame =
      topLeft === topRight &&
      topRight === bottomRight &&
      bottomRight === bottomLeft;
    if (allSame) {
      return topLeft;
    }

    // Return individual corner object
    return {
      topLeft,
      topRight,
      bottomRight,
      bottomLeft,
    };
  }

  // Otherwise, use the uniform corner radius
  return cornerRadius ?? 0;
}

/**
 * Normalizes a BorderRadius to individual corner values
 */
export function normalizeBorderRadius(borderRadius?: BorderRadius): {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
} {
  if (!borderRadius) {
    return { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
  }

  if (typeof borderRadius === "number") {
    return {
      topLeft: borderRadius,
      topRight: borderRadius,
      bottomRight: borderRadius,
      bottomLeft: borderRadius,
    };
  }

  return borderRadius;
}

/**
 * Checks if all corners have the same radius value
 */
export function isUniformBorderRadius(borderRadius?: BorderRadius): boolean {
  if (!borderRadius) return true;
  if (typeof borderRadius === "number") return true;

  const { topLeft, topRight, bottomRight, bottomLeft } = borderRadius;
  return (
    topLeft === topRight &&
    topRight === bottomRight &&
    bottomRight === bottomLeft
  );
}

/**
 * Converts individual corner radii back to a uniform number if all corners are the same
 */
export function simplifyBorderRadius(
  borderRadius?: BorderRadius
): BorderRadius {
  if (!borderRadius) return 0;
  if (typeof borderRadius === "number") return borderRadius;

  if (isUniformBorderRadius(borderRadius)) {
    return borderRadius.topLeft;
  }

  return borderRadius;
}
