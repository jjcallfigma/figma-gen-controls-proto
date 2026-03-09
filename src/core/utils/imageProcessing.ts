import { ImageAdjustments } from "@/types/canvas";
import { getCanvasProcessor } from "./canvasImageProcessor";
import { getWebGLProcessor, isWebGLSupported } from "./webglImageProcessor";

/**
 * Applies advanced image adjustments using WebGL shaders or Canvas processing
 *
 * Uses WebGL for best performance, falls back to Canvas processing,
 * and finally to CSS filters for basic adjustments.
 */
export async function applyAdvancedAdjustments(
  imageUrl: string,
  adjustments: ImageAdjustments
): Promise<string> {
  try {
    // Check if we have any adjustments - use WebGL/Canvas for ALL adjustments now
    const needsAdvancedProcessing = shouldUseAdvancedProcessing(adjustments);

    if (!needsAdvancedProcessing) {
      return imageUrl; // Return original if no adjustments
    }

    // Convert -100 to 100 range to -1 to 1 range for processors
    const processorAdjustments = {
      exposure: (adjustments.exposure || 0) / 100,
      contrast: (adjustments.contrast || 0) / 100,
      saturation: (adjustments.saturation || 0) / 100,
      temperature: (adjustments.temperature || 0) / 100,
      tint: (adjustments.tint || 0) / 100,
      highlights: (adjustments.highlights || 0) / 100,
      shadows: (adjustments.shadows || 0) / 100,
      rotation90Count: (adjustments as any)?._rotate90 || 0,
    };

    // Try WebGL first (fastest)
    if (isWebGLSupported()) {
      try {
        const webglProcessor = getWebGLProcessor();
        await webglProcessor.initialize();

        console.log("🚀 Processing image with WebGL:", processorAdjustments);
        const result = await webglProcessor.processImage(
          imageUrl,
          processorAdjustments
        );
        console.log(
          "✅ WebGL processing completed, result URL length:",
          result.length
        );
        return result;
      } catch (webglError) {
        console.warn(
          "WebGL processing failed, falling back to Canvas:",
          webglError
        );
      }
    }

    // Fallback to Canvas processing
    try {
      const canvasProcessor = getCanvasProcessor();
      console.log("🎨 Processing image with Canvas:", processorAdjustments);
      const result = await canvasProcessor.processImage(
        imageUrl,
        processorAdjustments
      );
      console.log(
        "✅ Canvas processing completed, result URL length:",
        result.length
      );
      return result;
    } catch (canvasError) {
      console.warn(
        "❌ Canvas processing failed, using original image:",
        canvasError
      );
      return imageUrl;
    }
  } catch (error) {
    console.warn("Advanced image processing failed, using original:", error);
    return imageUrl; // Fallback to original image
  }
}

/**
 * Determines which adjustments should use CSS filters vs advanced processing
 */
export function shouldUseAdvancedProcessing(
  adjustments: ImageAdjustments
): boolean {
  return (
    // Use WebGL/Canvas processing for ANY image adjustment for better quality
    (adjustments.exposure != null && Math.abs(adjustments.exposure) > 0) ||
    (adjustments.contrast != null && Math.abs(adjustments.contrast) > 0) ||
    (adjustments.saturation != null && Math.abs(adjustments.saturation) > 0) ||
    (adjustments.temperature != null &&
      Math.abs(adjustments.temperature) > 0) ||
    (adjustments.tint != null && Math.abs(adjustments.tint) > 0) ||
    (adjustments.highlights != null && Math.abs(adjustments.highlights) > 0) ||
    (adjustments.shadows != null && Math.abs(adjustments.shadows) > 0) ||
    // Also trigger for rotation
    ((adjustments as any)?._rotate90 != null &&
      (adjustments as any)._rotate90 > 0)
  );
}

/**
 * Gets the CSS-only adjustments (for real-time preview)
 */
export function getCssOnlyAdjustments(
  adjustments: ImageAdjustments
): ImageAdjustments {
  return {
    // Use CSS for contrast and saturation (always work well)
    contrast: adjustments.contrast,
    saturation: adjustments.saturation,

    // Use CSS for light temperature/tint adjustments
    temperature:
      Math.abs(adjustments.temperature || 0) <= 20
        ? adjustments.temperature
        : 0,
    tint: Math.abs(adjustments.tint || 0) <= 20 ? adjustments.tint : 0,

    // Don't use CSS for these - they work better with advanced processing
    exposure: 0,
    highlights: 0,
    shadows: 0,
  };
}
