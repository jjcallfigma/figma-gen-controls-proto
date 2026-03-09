import {
  BorderRadius,
  CanvasObject,
  LineHeight,
  TextResizeMode,
} from "@/types/canvas";
import { isUniformBorderRadius, normalizeBorderRadius } from "./borderRadius";

export type PropertyValue<T> = T | "Mixed";

/**
 * Calculate property value across multiple objects
 * Returns the shared value if all objects have the same value, or "Mixed" if they differ
 */
export function resolvePropertyValue<T>(
  objects: CanvasObject[],
  propertyPath: string
): PropertyValue<T> {
  if (objects.length === 0) return "Mixed";
  if (objects.length === 1) {
    return getNestedProperty(objects[0], propertyPath);
  }

  // Get the first object's value as reference
  const firstValue = getNestedProperty(objects[0], propertyPath);

  // Check if all objects have the same value
  const allSame = objects.every((obj) => {
    const objValue = getNestedProperty(obj, propertyPath);
    return deepEqual(objValue, firstValue);
  });

  return allSame ? firstValue : "Mixed";
}

/**
 * Resolve multiple property values at once for an object type
 */
export function resolvePropertyValues(
  objects: CanvasObject[],
  propertyPaths: string[]
): Record<string, PropertyValue<any>> {
  const result: Record<string, PropertyValue<any>> = {};

  propertyPaths.forEach((path) => {
    result[path] = resolvePropertyValue(objects, path);
  });

  return result;
}

/**
 * Calculate mixed states specifically for position and size
 */
export interface PositionSizeValues {
  x: PropertyValue<number>;
  y: PropertyValue<number>;
  width: PropertyValue<number>;
  height: PropertyValue<number>;
  rotation: PropertyValue<number>;
}

export function resolvePositionSizeValues(
  objects: CanvasObject[]
): PositionSizeValues {
  return {
    x: resolvePropertyValue<number>(objects, "x"),
    y: resolvePropertyValue<number>(objects, "y"),
    width: resolvePropertyValue<number>(objects, "width"),
    height: resolvePropertyValue<number>(objects, "height"),
    rotation: resolvePropertyValue<number>(objects, "rotation"),
  };
}

/**
 * Appearance property values - Universal properties for visual appearance
 */
export interface AppearancePropertyValues {
  opacity: PropertyValue<number>;
  blendMode: PropertyValue<string>;
  borderRadius: PropertyValue<BorderRadius>;
  isUniformBorderRadius: boolean; // Helper to know if we should show individual controls
  individualCorners: {
    topLeft: PropertyValue<number>;
    topRight: PropertyValue<number>;
    bottomRight: PropertyValue<number>;
    bottomLeft: PropertyValue<number>;
  };
  stroke: PropertyValue<string>;
  strokeWidth: PropertyValue<number>;
}

export function resolveAppearanceValues(
  objects: CanvasObject[]
): AppearancePropertyValues {
  // Filter objects that support these appearance properties
  const supportedObjects = objects.filter(
    (obj) =>
      obj.type === "rectangle" ||
      obj.type === "ellipse" ||
      obj.type === "frame" ||
      obj.type === "text" ||
      obj.type === "make"
  );

  // Resolve border radius
  const borderRadius = resolvePropertyValue<BorderRadius>(
    supportedObjects,
    "properties.borderRadius"
  );

  // Check if all objects have uniform border radius (all corners same)
  const allUniform = supportedObjects.every((obj) => {
    if (obj.type === "ellipse" || obj.type === "text") return true; // These don't have corner radius control
    const radius =
      obj.properties?.type === "rectangle" || obj.properties?.type === "frame" || obj.properties?.type === "make"
        ? obj.properties.borderRadius
        : undefined;
    return isUniformBorderRadius(radius);
  });

  // Calculate individual corner values
  const getCornerValue = (
    corner: "topLeft" | "topRight" | "bottomRight" | "bottomLeft"
  ): PropertyValue<number> => {
    if (supportedObjects.length === 0) return "Mixed";
    if (supportedObjects.length === 1) {
      const obj = supportedObjects[0];
      if (obj.type === "ellipse" || obj.type === "text") return 0;
      const radius =
        obj.properties?.type === "rectangle" || obj.properties?.type === "frame" || obj.properties?.type === "make"
          ? obj.properties.borderRadius
          : undefined;
      return normalizeBorderRadius(radius)[corner];
    }

    // Get the first object's value as reference
    const firstObj = supportedObjects[0];
    const firstRadius =
      firstObj.properties?.type === "rectangle" ||
      firstObj.properties?.type === "frame" ||
      firstObj.properties?.type === "make"
        ? firstObj.properties.borderRadius
        : undefined;
    const firstValue = normalizeBorderRadius(firstRadius)[corner];

    // Check if all objects have the same corner value
    const allSame = supportedObjects.every((obj) => {
      if (obj.type === "ellipse" || obj.type === "text")
        return firstValue === 0;
      const radius =
        obj.properties?.type === "rectangle" || obj.properties?.type === "frame" || obj.properties?.type === "make"
          ? obj.properties.borderRadius
          : undefined;
      return normalizeBorderRadius(radius)[corner] === firstValue;
    });

    return allSame ? firstValue : "Mixed";
  };

  const individualCorners = {
    topLeft: getCornerValue("topLeft"),
    topRight: getCornerValue("topRight"),
    bottomRight: getCornerValue("bottomRight"),
    bottomLeft: getCornerValue("bottomLeft"),
  };

  return {
    opacity: resolvePropertyValue<number>(supportedObjects, "opacity"),
    blendMode: resolvePropertyValue<string>(supportedObjects, "blendMode"),
    borderRadius,
    isUniformBorderRadius: allUniform,
    individualCorners,
    stroke: resolvePropertyValue<string>(supportedObjects, "stroke"),
    strokeWidth: resolvePropertyValue<number>(supportedObjects, "strokeWidth"),
  };
}

/**
 * Stroke property values
 */
export interface StrokePropertyValues {
  stroke: PropertyValue<string>;
  strokeWidth: PropertyValue<number>;
  strokeOpacity: PropertyValue<number>;
  strokePosition: PropertyValue<"inside" | "center" | "outside">;
  strokeWidths: PropertyValue<{
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  }>;
  strokeBlendMode: PropertyValue<string>;
}

export function resolveStrokeValues(
  objects: CanvasObject[]
): StrokePropertyValues {
  const supportedObjects = objects.filter(
    (obj) =>
      obj.type === "rectangle" || obj.type === "ellipse" || obj.type === "frame"
  );
  return {
    stroke: resolvePropertyValue<string>(supportedObjects, "stroke"),
    strokeWidth: resolvePropertyValue<number>(supportedObjects, "strokeWidth"),
    strokeOpacity: resolvePropertyValue<number>(
      supportedObjects,
      "strokeOpacity"
    ),
    strokePosition: resolvePropertyValue<"inside" | "center" | "outside">(
      supportedObjects,
      "strokePosition"
    ),
    strokeWidths: resolvePropertyValue<{
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    }>(supportedObjects, "strokeWidths"),
    strokeBlendMode: resolvePropertyValue<string>(
      supportedObjects,
      "strokeBlendMode"
    ),
  };
}

/**
 * Calculate mixed states for rectangle properties (legacy, keeping for backward compatibility)
 */
export interface RectanglePropertyValues {
  borderRadius: PropertyValue<number>;
  fill: PropertyValue<string>;
  stroke: PropertyValue<string>;
  strokeWidth: PropertyValue<number>;
}

export function resolveRectangleValues(
  objects: CanvasObject[]
): RectanglePropertyValues {
  const rectangleObjects = objects.filter((obj) => obj.type === "rectangle");

  return {
    borderRadius: resolvePropertyValue<number>(
      rectangleObjects,
      "properties.borderRadius"
    ),
    fill: resolvePropertyValue<string>(rectangleObjects, "fill"),
    stroke: resolvePropertyValue<string>(rectangleObjects, "stroke"),
    strokeWidth: resolvePropertyValue<number>(rectangleObjects, "strokeWidth"),
  };
}

/**
 * Frame property values
 */
export interface FramePropertyValues {
  backgroundColor: PropertyValue<string>;
  borderRadius: PropertyValue<number>;
  overflow: PropertyValue<"visible" | "hidden">;
}

export function resolveFrameValues(
  objects: CanvasObject[]
): FramePropertyValues {
  const frameObjects = objects.filter((obj) => obj.type === "frame");

  return {
    backgroundColor: resolvePropertyValue<string>(
      frameObjects,
      "properties.backgroundColor"
    ),
    borderRadius: resolvePropertyValue<number>(
      frameObjects,
      "properties.borderRadius"
    ),
    overflow: resolvePropertyValue<"visible" | "hidden">(
      frameObjects,
      "properties.overflow"
    ),
  };
}

/**
 * Text property values
 */
export interface TextPropertyValues {
  content: PropertyValue<string>;
  fontSize: PropertyValue<number>;
  fontFamily: PropertyValue<string>;
  fontWeight: PropertyValue<number>;
  textAlign: PropertyValue<"left" | "center" | "right">;
  verticalAlign: PropertyValue<"top" | "middle" | "bottom">;
  lineHeight: PropertyValue<LineHeight>;
  fill: PropertyValue<string>;
  resizeMode: PropertyValue<TextResizeMode>;
}

export function resolveTextValues(objects: CanvasObject[]): TextPropertyValues {
  const textObjects = objects.filter((obj) => obj.type === "text");

  return {
    content: resolvePropertyValue<string>(textObjects, "properties.content"),
    fontSize: resolvePropertyValue<number>(textObjects, "properties.fontSize"),
    fontFamily: resolvePropertyValue<string>(
      textObjects,
      "properties.fontFamily"
    ),
    fontWeight: resolvePropertyValue<number>(
      textObjects,
      "properties.fontWeight"
    ),
    textAlign: resolvePropertyValue<"left" | "center" | "right">(
      textObjects,
      "properties.textAlign"
    ),
    verticalAlign: resolvePropertyValue<"top" | "middle" | "bottom">(
      textObjects,
      "properties.verticalAlign"
    ),
    lineHeight: resolvePropertyValue<LineHeight>(
      textObjects,
      "properties.lineHeight"
    ),
    fill: resolvePropertyValue<string>(textObjects, "fill"),
    resizeMode: resolvePropertyValue<TextResizeMode>(
      textObjects,
      "properties.resizeMode"
    ),
  };
}

/**
 * Helper function to get nested property value using dot notation
 */
function getNestedProperty(obj: any, path: string): any {
  return path.split(".").reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Deep equality check for property values
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => deepEqual(a[key], b[key]));
}

/**
 * Check if a property value is mixed
 */
export function isMixed<T>(value: PropertyValue<T>): value is "Mixed" {
  return value === "Mixed";
}

/**
 * Get the actual value from a PropertyValue, handling mixed state
 */
export function getActualValue<T>(value: PropertyValue<T>, fallback: T): T {
  return isMixed(value) ? fallback : value;
}
