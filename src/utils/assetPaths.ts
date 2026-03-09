/**
 * Utility functions for handling asset paths with base path support
 */

// Get the base path from the Next.js configuration
// This will be injected at build time if using a custom base path
function getBasePath(): string {
  // In a static export with base path, Next.js injects the base path into the HTML
  // We can detect it from the current URL or use a build-time environment variable
  if (typeof window !== "undefined") {
    // Try to detect base path from current URL
    const pathname = window.location.pathname;

    // Common base paths to check for
    const commonBasePaths = ["/frame-labels", "/figma-clone", "/demo"];

    for (const basePath of commonBasePaths) {
      if (pathname.startsWith(basePath)) {
        return basePath;
      }
    }
  }

  // Fallback: check for build-time environment variable
  return process.env.NEXT_PUBLIC_BASE_PATH || "";
}

/**
 * Convert an absolute asset path to work with base path
 * @param assetPath - The asset path (e.g., "/cursors/cursor-move.svg")
 * @returns Base path aware asset URL
 */
export function getAssetUrl(assetPath: string): string {
  // If it's already a full URL (http/https), return as is
  if (assetPath.startsWith("http://") || assetPath.startsWith("https://")) {
    return assetPath;
  }

  // If it's already a data URL, return as is
  if (assetPath.startsWith("data:")) {
    return assetPath;
  }

  const basePath = getBasePath();

  // If no base path or asset path is relative, return as is
  if (!basePath || !assetPath.startsWith("/")) {
    return assetPath;
  }

  // Prepend base path to absolute asset paths
  return `${basePath}${assetPath}`;
}

/**
 * Get the current base path (useful for debugging)
 */
export function getCurrentBasePath(): string {
  return getBasePath();
}
