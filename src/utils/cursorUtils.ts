import { CURSOR_ROTATIONS, CursorType } from "@/types/cursor";
import { getAssetUrl } from "@/utils/assetPaths";

/**
 * Utility functions for cursor management
 */

// Cache for transformed cursor data URLs
const cursorCache = new Map<string, string>();

/**
 * Create a transformed cursor with rotation and drop shadow
 */
export async function createTransformedCursor(
  assetPath: string,
  cursorType: CursorType,
  hotspot: { x: number; y: number } = { x: 16, y: 16 }
): Promise<string> {
  const rotation = CURSOR_ROTATIONS[cursorType] || 0;
  const cacheKey = `${assetPath}-${rotation}-${hotspot.x}-${hotspot.y}`;

  // Return cached version if available
  if (cursorCache.has(cacheKey)) {
    return cursorCache.get(cacheKey)!;
  }

  try {
    // Convert asset path to base path aware URL
    const resolvedAssetPath = getAssetUrl(assetPath);

    // Fetch the SVG
    const response = await fetch(resolvedAssetPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch cursor: ${response.status}`);
    }

    const svgText = await response.text();

    // Parse the SVG
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
    const svgElement = svgDoc.documentElement;

    // Add drop shadow filter
    const defs = svgDoc.createElementNS("http://www.w3.org/2000/svg", "defs");
    const filter = svgDoc.createElementNS(
      "http://www.w3.org/2000/svg",
      "filter"
    );
    filter.setAttribute("id", "shadow");
    filter.setAttribute("x", "-50%");
    filter.setAttribute("y", "-50%");
    filter.setAttribute("width", "200%");
    filter.setAttribute("height", "200%");

    const dropShadow = svgDoc.createElementNS(
      "http://www.w3.org/2000/svg",
      "feDropShadow"
    );
    dropShadow.setAttribute("dx", "0");
    dropShadow.setAttribute("dy", "1");
    dropShadow.setAttribute("stdDeviation", "1");
    dropShadow.setAttribute("flood-color", "rgba(0, 0, 0, 0.5)");

    filter.appendChild(dropShadow);
    defs.appendChild(filter);

    // Create container for shadow (this won't rotate)
    const shadowContainer = svgDoc.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    shadowContainer.setAttribute("filter", "url(#shadow)");

    if (rotation === 0) {
      // No rotation needed, just add shadow to existing content
      const children = Array.from(svgElement.children);
      children.forEach((child) => {
        shadowContainer.appendChild(child);
      });

      svgElement.appendChild(defs);
      svgElement.appendChild(shadowContainer);
    } else {
      // Create rotation group INSIDE the shadow container
      const rotateGroup = svgDoc.createElementNS(
        "http://www.w3.org/2000/svg",
        "g"
      );
      rotateGroup.setAttribute("transform", `rotate(${rotation} 16 16)`);

      // Move all children to the rotate group
      const children = Array.from(svgElement.children);
      children.forEach((child) => {
        rotateGroup.appendChild(child);
      });

      // Shadow container contains the rotating group
      shadowContainer.appendChild(rotateGroup);

      svgElement.appendChild(defs);
      svgElement.appendChild(shadowContainer);
    }

    // Convert back to string and create data URL
    const serializer = new XMLSerializer();
    const transformedSvg = serializer.serializeToString(svgElement);
    const dataUrl = `data:image/svg+xml;base64,${btoa(transformedSvg)}`;

    // Cache the result
    cursorCache.set(cacheKey, dataUrl);

    return dataUrl;
  } catch (error) {
    console.error("Error creating transformed cursor:", error);
    return getAssetUrl(assetPath); // Fallback to resolved original
  }
}

/**
 * Clear the cursor cache (useful for development)
 */
export function clearCursorCache() {
  cursorCache.clear();
}

/**
 * Preload and cache cursors for better performance
 */
export async function preloadCursors(
  assetPaths: string[],
  cursorTypes: CursorType[]
) {
  const promises = assetPaths.map((path, index) =>
    createTransformedCursor(path, cursorTypes[index])
  );

  try {
    await Promise.all(promises);
    console.log("🎯 Cursors preloaded successfully");
  } catch (error) {
    console.error("Error preloading cursors:", error);
  }
}
