import {
  CanvasObject,
  Fill,
  ImageAdjustments,
  ImageFill,
  SolidFill,
} from "@/types/canvas";

// Generate unique IDs for fills
export function generateFillId(): string {
  return `fill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Generate a crisp SVG checkerboard pattern for placeholder images
export function createCheckerboardPattern(): string {
  const svg = `
    <svg width="24" height="24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#fafafa"/>
      <rect width="12" height="12" fill="#ebebeb"/>
      <rect x="12" y="12" width="12" height="12" fill="#ebebeb"/>
    </svg>
  `.trim();

  return "data:image/svg+xml;base64," + btoa(svg);
}

// Check if an image URL is empty or placeholder
export function isEmptyImageUrl(imageUrl: string): boolean {
  return (
    !imageUrl ||
    imageUrl.trim() === "" ||
    imageUrl === "placeholder" ||
    imageUrl.trim() === "placeholder"
  );
}

// Factory function for creating solid fills
export function createSolidFill(
  color: string,
  opacity: number = 1,
  visible: boolean = true
): SolidFill {
  return {
    id: generateFillId(),
    type: "solid",
    color,
    opacity,
    visible,
    blendMode: "normal",
  };
}

// Factory function for creating image fills
export function createImageFill(
  imageUrl: string = "placeholder",
  fit: "fill" | "fit" | "crop" | "tile" = "fill",
  opacity: number = 1,
  visible: boolean = true
): ImageFill {
  return {
    id: generateFillId(),
    type: "image",
    imageUrl,
    fit,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    opacity,
    visible,
    blendMode: "normal",
    adjustments: {
      exposure: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
    },
  };
}

// Cache for image dimensions to avoid re-loading
const imageDimensionsCache = new Map<
  string,
  { width: number; height: number }
>();

// Utility function to get image dimensions
export async function getImageDimensions(
  imageUrl: string
): Promise<{ width: number; height: number }> {
  // Check cache first
  if (imageDimensionsCache.has(imageUrl)) {
    return imageDimensionsCache.get(imageUrl)!;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const dimensions = { width: img.naturalWidth, height: img.naturalHeight };
      imageDimensionsCache.set(imageUrl, dimensions);
      resolve(dimensions);
    };
    img.onerror = () => {
      // Fallback dimensions if image fails to load
      const fallback = { width: 400, height: 400 };
      imageDimensionsCache.set(imageUrl, fallback);
      resolve(fallback);
    };
    img.src = imageUrl;
  });
}

// Simple fill manipulation functions
export function addFill(object: CanvasObject, fill: Fill): CanvasObject {
  return {
    ...object,
    fills: [...(object.fills || []), fill],
  };
}

export function removeFill(object: CanvasObject, fillId: string): CanvasObject {
  return {
    ...object,
    fills: (object.fills || []).filter((fill) => fill.id !== fillId),
  };
}

// CSS generation result interface
export interface FillCssResult {
  backgroundImage?: string;
  backgroundColor?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
  backgroundPosition?: string;
  opacity?: number;
  filter?: string; // CSS filter for image adjustments
  mixBlendMode?: string; // CSS blend mode for image fills
  transform?: string; // CSS transform for image rotation
  needsBackgroundWrapper?: boolean; // Whether background wrapper is needed
}

// Enhanced CSS generation for fills
export function fillToCss(fill: Fill): string {
  if (!fill.visible) return "transparent";

  if (fill.type === "solid") {
    const solidFill = fill as SolidFill;
    if (fill.opacity < 1) {
      return addOpacityToColor(solidFill.color, fill.opacity);
    }
    return solidFill.color;
  }

  if (fill.type === "image") {
    const imageFill = fill as ImageFill;
    // For simple usage, just return the URL - advanced properties handled by fillToCssProperties
    return `url('${imageFill.imageUrl}')`;
  }

  return "transparent";
}

// Advanced CSS generation that returns detailed properties for image fills
export function fillToCssProperties(
  fill: Fill,
  processedImageUrl?: string,
  frameDimensions?: { width: number; height: number },
  cropModeOverride?: { originalDimensions: { width: number; height: number } }
): FillCssResult {
  if (!fill.visible) {
    return { backgroundColor: "transparent" };
  }

  if (fill.type === "solid") {
    const solidFill = fill as SolidFill;
    const color =
      fill.opacity < 1
        ? addOpacityToColor(solidFill.color, fill.opacity)
        : solidFill.color;

    const result: FillCssResult = { backgroundColor: color };

    // Add blend mode if specified
    if (fill.blendMode && fill.blendMode !== "normal") {
      result.mixBlendMode = fill.blendMode;
      result.needsBackgroundWrapper = true;
    }

    return result;
  }

  if (fill.type === "image") {
    const imageFill = fill as ImageFill;
    const {
      imageUrl,
      fit,
      offsetX = 0,
      offsetY = 0,
      scale = 1,
      scaleX,
      scaleY,
      tileScale,
      rotation = 0,
      adjustments,
      blendMode,
    } = imageFill;

    let backgroundSize = "cover";
    let backgroundRepeat = "no-repeat";
    let backgroundPosition = "center center";

    // Use actual frame dimensions if available, otherwise fallback
    const frameWidth = frameDimensions?.width || 400;
    const frameHeight = frameDimensions?.height || 400;

    switch (fit) {
      case "fill":
        backgroundSize = "cover";
        backgroundPosition = "center center";
        break;
      case "fit":
        backgroundSize = "contain";
        backgroundPosition = "center center";
        break;
      case "crop":
        // CRITICAL: Use simple percentage calculation to match overlay
        const cropScale = scale || 1; // Default scale to 1 if undefined
        const cropOffsetX = offsetX || 0; // Default offset to 0 if undefined
        const cropOffsetY = offsetY || 0; // Default offset to 0 if undefined

        // CRITICAL: Use current frame dimensions to match overlay calculations exactly
        // The overlay uses object.width/height, so background must use frameWidth/frameHeight
        const calculationWidth = frameWidth;
        const calculationHeight = frameHeight;

        // CRITICAL: Calculate scale to match overlay size exactly
        let finalScale = cropScale;
        if (cropModeOverride?.originalDimensions) {
          // During crop mode: calculate the scale needed to make background match overlay size
          // Overlay shows originalDimensions (900x900), background should scale to match that
          const targetWidth = cropModeOverride.originalDimensions.width;
          const targetHeight = cropModeOverride.originalDimensions.height;

          // Scale needed: targetSize / currentNodeSize (DIFFERENT for width/height!)
          const scaleForWidth = targetWidth / calculationWidth;
          const scaleForHeight = targetHeight / calculationHeight;

          // Use separate percentages for width and height to account for node aspect ratio
          backgroundSize = `${scaleForWidth * 100}% ${scaleForHeight * 100}%`;
        } else {
          backgroundSize = `${finalScale * 100}% ${finalScale * 100}%`;
        }

        // CRITICAL: Use pixel-based positioning to match pixel-based sizing
        const directOffsetX = cropOffsetX;
        const directOffsetY = cropOffsetY;

        // Always use percentage positioning for consistency
        backgroundPosition = `${directOffsetX * 100}% ${directOffsetY * 100}%`;

        console.log("🌾 [CROP] Background CSS calculation:", {
          fillOffsets: { x: cropOffsetX, y: cropOffsetY },
          direct: { x: directOffsetX, y: directOffsetY },
          rawScale: cropScale,
          adjustedScale: finalScale,
          scaleAdjustment: cropModeOverride?.originalDimensions
            ? {
                scaleFactors: {
                  x:
                    calculationWidth /
                    cropModeOverride.originalDimensions.width,
                  y:
                    calculationHeight /
                    cropModeOverride.originalDimensions.height,
                },
                originalDimensions: cropModeOverride.originalDimensions,
              }
            : null,
          calculationDimensions: {
            width: calculationWidth,
            height: calculationHeight,
          },
          currentFrame: { width: frameWidth, height: frameHeight },
          finalCSS: {
            backgroundSize,
            backgroundPosition,
          },
          hasCropModeOverride: !!cropModeOverride?.originalDimensions,
          overlayTargetSize: cropModeOverride?.originalDimensions,
          backgroundSizeCalculation: cropModeOverride?.originalDimensions
            ? `Overlay shows ${cropModeOverride.originalDimensions.width}x${
                cropModeOverride.originalDimensions.height
              }, background uses ${finalScale * 100}%`
            : `No overlay reference, using standard scale ${finalScale * 100}%`,
          reasoning: cropModeOverride?.originalDimensions
            ? "CROP MODE: Background should match overlay size"
            : "NORMAL MODE: Using percentage scale",
        });
        break;
      case "tile":
        // They need to be converted considering the image's scale
        let offsetXPx = offsetX;
        let offsetYPx = offsetY;

        // Position calculation with inverted scaling
        if (Math.abs(offsetX) <= 1 && Math.abs(offsetY) <= 1) {
          // Method 1: Direct position scaling using real frame size
          const directOffsetXPx = offsetX * frameWidth * (scaleX || 1);
          const directOffsetYPx = offsetY * frameHeight * (scaleY || 1);

          // Method 2: Position scaled by CSS scale ratio using real frame size
          const scaleRatioX = ((scaleX || 1) * 100) / 100; // How much bigger CSS background is
          const scaleRatioY = ((scaleY || 1) * 100) / 100;
          const scaledOffsetXPx = offsetX * frameWidth * scaleRatioX;
          const scaledOffsetYPx = offsetY * frameHeight * scaleRatioY;

          // Method 3: Try different coordinate origins
          // CSS background-position: 0,0 = top-left, but Figma might use center origin
          const centerOffsetXPx =
            offsetX * frameWidth * scaleRatioX +
            (frameWidth * (scaleRatioX - 1)) / 2;
          const centerOffsetYPx =
            offsetY * frameHeight * scaleRatioY +
            (frameHeight * (scaleRatioY - 1)) / 2;

          // Method 4: Try flipped Y coordinate
          const flippedOffsetXPx = scaledOffsetXPx;
          const flippedOffsetYPx = -scaledOffsetYPx;

          // Method 5: Try flipped signs (opposite directions)
          const negativeOffsetXPx = -scaledOffsetXPx;
          const negativeOffsetYPx = -scaledOffsetYPx;

          // Method 6: Try flipped X only
          const flippedXOnlyOffsetXPx = -scaledOffsetXPx;
          const flippedXOnlyOffsetYPx = scaledOffsetYPx;

          // Try the direct scaled approach (simpler)
          offsetXPx = scaledOffsetXPx;
          offsetYPx = scaledOffsetYPx;
        }

        // Try different percentage scaling approaches
        const approach1X = -offsetX * 100; // Simple flip and scale to %
        const approach1Y = -offsetY * 100;

        const approach2X = offsetX * 100 * (((scaleX || 1) * 100) / 100); // Scale by CSS ratio
        const approach2Y = offsetY * 100 * (((scaleY || 1) * 100) / 100);

        const approach3X = -offsetX * 50; // Flip and smaller scale
        const approach3Y = -offsetY * 50;

        // Try the simple flipped approach
        const offsetXPercent = approach1X;
        const offsetYPercent = approach1Y;

        // Convert to pixels using actual frame size directly
        const scale1X = offsetX * frameWidth * 1; // Direct frame size
        const scaleCssX = offsetX * frameWidth * (((scaleX || 1) * 100) / 100); // CSS scale reference

        // Use direct frame size
        const finalOffsetXPx = scale1X;
        const finalOffsetYPx = offsetY * frameHeight;

        backgroundPosition = `${finalOffsetXPx}px ${finalOffsetYPx}px`;

        break;
      case "tile":
        // Use tileScale (percentage) for tile size, defaults to 100%
        // 100% = original image size, calculated based on stored dimensions or fallback
        const tileScaleValue = tileScale || 100;
        const scaleMultiplier = tileScaleValue / 100;

        // Use stored image dimensions if available, otherwise fallback to reasonable defaults
        const imgWidth = imageFill.imageWidth || 400;
        const imgHeight = imageFill.imageHeight || 400;

        const tileWidthPx = imgWidth * scaleMultiplier;
        const tileHeightPx = imgHeight * scaleMultiplier;
        backgroundSize = `${tileWidthPx}px ${tileHeightPx}px`;
        backgroundRepeat = "repeat";
        backgroundPosition = "0 0";
        break;
    }

    // Use processed image URL if available, otherwise use original, or checkerboard if empty
    let finalImageUrl = processedImageUrl || imageUrl;
    const isPlaceholder = isEmptyImageUrl(finalImageUrl);

    // Use checkerboard pattern if no image is provided
    if (isPlaceholder) {
      finalImageUrl = createCheckerboardPattern();
      // Override background settings for checkerboard pattern
      backgroundSize = "24px 24px"; // Match the SVG pattern size
      backgroundRepeat = "repeat";
      backgroundPosition = "0 0";
    }

    const result: FillCssResult = {
      backgroundImage: `url('${finalImageUrl}')`,
      backgroundSize,
      backgroundRepeat,
      backgroundPosition,
    };

    // Add rotation if specified (note: CSS background-image rotation is limited)
    // For complex rotations, this would need a separate transformation layer
    if (rotation && rotation !== 0) {
      result.needsBackgroundWrapper = true;
      result.transform = `rotate(${rotation}deg)`;
    }

    // Add blend mode if specified
    if (blendMode && blendMode !== "normal") {
      result.mixBlendMode = blendMode;
      result.needsBackgroundWrapper = true;
    }

    // No CSS filters needed - all processing is done by WebGL/Canvas
    // If we have a processed image, it already includes all adjustments
    const cssFilter = processedImageUrl
      ? ""
      : adjustmentsToCssFilter(adjustments);
    if (cssFilter) {
      result.filter = cssFilter;
    }

    return result;
  }

  return { backgroundColor: "transparent" };
}

// Convert image adjustments to CSS filter string
function adjustmentsToCssFilter(adjustments?: ImageAdjustments): string {
  if (!adjustments) return "";

  const filters: string[] = [];

  // Exposure - simulate with brightness (CSS brightness affects all channels)
  if (adjustments.exposure !== undefined && adjustments.exposure !== 0) {
    // Convert -100 to 100 range to CSS brightness values
    // -100 = 0.0 (black), 0 = 1.0 (normal), 100 = 2.0 (very bright)
    const brightness = Math.max(0, 1 + adjustments.exposure / 100);
    filters.push(`brightness(${brightness})`);
  }

  // Contrast - direct CSS mapping
  if (adjustments.contrast !== undefined && adjustments.contrast !== 0) {
    // Convert -100 to 100 range to CSS contrast values
    // -100 = 0.0 (gray), 0 = 1.0 (normal), 100 = 2.0 (high contrast)
    const contrast = Math.max(0, 1 + adjustments.contrast / 100);
    filters.push(`contrast(${contrast})`);
  }

  // Saturation - direct CSS mapping
  if (adjustments.saturation !== undefined && adjustments.saturation !== 0) {
    // Convert -100 to 100 range to CSS saturate values
    // -100 = 0.0 (grayscale), 0 = 1.0 (normal), 100 = 2.0 (very saturated)
    const saturation = Math.max(0, 1 + adjustments.saturation / 100);
    filters.push(`saturate(${saturation})`);
  }

  // Temperature - simulate with hue rotation (approximate)
  if (adjustments.temperature !== undefined && adjustments.temperature !== 0) {
    // Temperature shift: negative = cooler (more blue), positive = warmer (more red/yellow)
    // This is a rough approximation - real temperature adjustment is more complex
    const hueShift = adjustments.temperature * 0.6; // Scale down for subtlety
    filters.push(`hue-rotate(${hueShift}deg)`);
  }

  // Tint - another hue rotation (perpendicular to temperature)
  if (adjustments.tint !== undefined && adjustments.tint !== 0) {
    // Tint: negative = more green, positive = more magenta
    // We'll combine this with temperature for a compound hue shift
    const tintShift = adjustments.tint * 0.3;
    if ((adjustments.temperature ?? 0) === 0) {
      filters.push(`hue-rotate(${tintShift + 90}deg)`); // 90° offset for green-magenta axis
    }
  }

  // Highlights and Shadows - Approximate with CSS filters for now
  // This is a basic approximation - the WebGL/Canvas processors provide better results
  if (adjustments.highlights !== undefined && adjustments.highlights !== 0) {
    // Highlights: use a combination of brightness and contrast
    // Negative highlights = darker highlights, positive = brighter highlights
    const highlightBrightness = 1 + adjustments.highlights / 200; // More subtle effect
    filters.push(`brightness(${Math.max(0.1, highlightBrightness)})`);
  }

  if (adjustments.shadows !== undefined && adjustments.shadows !== 0) {
    // Shadows: use contrast to simulate shadow adjustment
    // Negative shadows = darker shadows, positive = brighter shadows
    const shadowContrast = 1 + adjustments.shadows / 150; // Subtle contrast adjustment
    filters.push(`contrast(${Math.max(0.1, shadowContrast)})`);
  }

  return filters.length > 0 ? filters.join(" ") : "";
}

// Convert array of fills to CSS multi-background
export function fillArrayToCss(fills: Fill[]): string {
  if (fills.length === 0) return "transparent";

  const visibleFills = fills.filter((fill) => fill.visible);
  if (visibleFills.length === 0) return "transparent";

  // For multi-background CSS, we need to reverse the order (CSS applies first = top layer)
  const reversedFills = [...visibleFills].reverse();

  // Generate background-image values for all fills
  const backgroundImages = reversedFills
    .map((fill) => {
      if (fill.type === "solid") {
        const solidFill = fill as SolidFill;
        const color =
          fill.opacity < 1
            ? addOpacityToColor(solidFill.color, fill.opacity)
            : solidFill.color;
        return `linear-gradient(${color}, ${color})`; // Solid color as gradient
      } else if (fill.type === "image") {
        const imageFill = fill as ImageFill;
        return `url('${imageFill.imageUrl}')`;
      }
      return "none";
    })
    .filter((bg) => bg !== "none");

  return backgroundImages.join(", ");
}

// Get effective background styles for objects with complex fills (multi-layer support)
export function getEffectiveBackgroundStyles(
  object: CanvasObject,
  processedImageUrls?: Record<string, string>,
  cropModeOverride?: {
    originalDimensions: { width: number; height: number } | null;
  }
): React.CSSProperties {
  if (object.fills && object.fills.length > 0) {
    // Filter out image fills since they're now rendered as <img> elements
    const visibleFills = object.fills.filter(
      (fill) => fill.visible && fill.type !== "image"
    );

    if (visibleFills.length === 0) {
      return { backgroundColor: "transparent" };
    }

    if (visibleFills.length === 1) {
      // Single fill - use simple properties with proper opacity handling
      const fill = visibleFills[0];
      const processedUrl = processedImageUrls?.[fill.id];

      // Always use current object dimensions as frame dimensions for calculations
      const dimensions = {
        width: object.width,
        height: object.height,
      };

      let cssProps = fillToCssProperties(
        fill,
        processedUrl,
        dimensions,
        cropModeOverride?.originalDimensions &&
          cropModeOverride.originalDimensions !== null
          ? { originalDimensions: cropModeOverride.originalDimensions }
          : undefined
      );

      // No override needed - fillToCssProperties now handles the adjusted scale calculation correctly
      return {
        backgroundColor: cssProps.backgroundColor,
        backgroundImage: cssProps.backgroundImage,
        backgroundSize: cssProps.backgroundSize,
        backgroundRepeat: cssProps.backgroundRepeat,
        backgroundPosition: cssProps.backgroundPosition,
        filter: cssProps.filter, // Include CSS filter for image adjustments
        // Note: Don't set opacity here anymore since we always use multi-layer now
        // Individual fill opacity is handled by the multi-layer div elements
      };
    }

    // Multiple fills - use CSS multi-background
    // For images with opacity in multi-layer, we'll use a different approach
    const reversedFills = [...visibleFills].reverse();

    const backgroundImages: string[] = [];
    const backgroundSizes: string[] = [];
    const backgroundRepeats: string[] = [];
    const backgroundPositions: string[] = [];

    reversedFills.forEach((fill) => {
      if (fill.type === "solid") {
        const solidFill = fill as SolidFill;
        const color =
          fill.opacity < 1
            ? addOpacityToColor(solidFill.color, fill.opacity)
            : solidFill.color;
        backgroundImages.push(`linear-gradient(${color}, ${color})`);
        backgroundSizes.push("auto");
        backgroundRepeats.push("no-repeat");
        backgroundPositions.push("0% 0%");
      } else if (fill.type === "image") {
        const imageFill = fill as ImageFill;
        const processedUrl = processedImageUrls?.[fill.id];
        const {
          imageUrl,
          fit,
          offsetX = 0,
          offsetY = 0,
          scale = 1,
          tileScale,
        } = imageFill;

        // Use processed image URL if available, otherwise original, or checkerboard if empty
        let finalImageUrl = processedUrl || imageUrl;
        const isPlaceholder = isEmptyImageUrl(finalImageUrl);

        // Use checkerboard pattern if no image is provided
        if (isPlaceholder) {
          finalImageUrl = createCheckerboardPattern();
        }

        // For images with opacity < 1, create a masked version using CSS
        if (fill.opacity < 1) {
          // Better approach: use CSS filter to control opacity
          // This preserves the image colors while applying opacity
          backgroundImages.push(`url('${finalImageUrl}')`);
        } else {
          backgroundImages.push(`url('${finalImageUrl}')`);
        }

        let backgroundSize = "cover";
        let backgroundRepeat = "no-repeat";
        let backgroundPosition = "center center";

        if (isPlaceholder) {
          // Override settings for checkerboard pattern
          backgroundSize = "24px 24px";
          backgroundRepeat = "repeat";
          backgroundPosition = "0 0";
        } else {
          switch (fit) {
            case "fill":
              backgroundSize = "cover";
              backgroundPosition = "center center";
              break;
            case "fit":
              backgroundSize = "contain";
              backgroundPosition = "center center";
              break;
            case "crop":
              const cropScale = scale || 1; // Default scale to 1 if undefined
              const cropOffsetX = offsetX || 0; // Default offset to 0 if undefined
              const cropOffsetY = offsetY || 0; // Default offset to 0 if undefined
              backgroundSize = `${cropScale * 100}%`;
              backgroundPosition = `${cropOffsetX * 100}% ${
                cropOffsetY * 100
              }%`;
              break;
            case "tile":
              // Use tileScale (percentage) for tile size, defaults to 100%
              // 100% = original image size, calculated based on stored dimensions or fallback
              const tileScaleValue = tileScale || 100;
              const scaleMultiplier = tileScaleValue / 100;

              // Use stored image dimensions if available, otherwise fallback
              const imgWidth = imageFill.imageWidth || 400;
              const imgHeight = imageFill.imageHeight || 400;

              const tileWidthPx = imgWidth * scaleMultiplier;
              const tileHeightPx = imgHeight * scaleMultiplier;
              backgroundSize = `${tileWidthPx}px ${tileHeightPx}px`;
              backgroundRepeat = "repeat";
              backgroundPosition = "0 0";
              break;
          }
        }

        backgroundSizes.push(backgroundSize);
        backgroundRepeats.push(backgroundRepeat);
        backgroundPositions.push(backgroundPosition);
      }
    });

    // For multiple fills, we can't easily combine different CSS filters
    // Each layer should be rendered separately to apply individual filters
    // This path is mainly for fallback scenarios
    return {
      backgroundImage: backgroundImages.join(", "),
      backgroundSize: backgroundSizes.join(", "),
      backgroundRepeat: backgroundRepeats.join(", "),
      backgroundPosition: backgroundPositions.join(", "),
      // Note: CSS filters can't be easily applied to individual background layers
      // Multiple fills with adjustments should use separate layer rendering
    };
  }

  // Fallback to legacy properties
  const fallbackColor = object.fill || "transparent";

  return { backgroundColor: fallbackColor };
}

// Helper function to add opacity to a color
function addOpacityToColor(color: string, opacity: number): string {
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  if (color.startsWith("rgb(")) {
    const values = color.match(/\d+/g);
    if (values && values.length >= 3) {
      return `rgba(${values[0]}, ${values[1]}, ${values[2]}, ${opacity})`;
    }
  }

  return color;
}

// Get effective background for rendering
export function getEffectiveBackground(object: CanvasObject): string {
  if (object.fills && object.fills.length > 0) {
    return fillArrayToCss(object.fills);
  }

  // Fallback to legacy properties
  if (object.fill) return object.fill;

  return "transparent";
}

/**
 * Analyzes selected objects to find the most frequent fill combination
 * If frequencies are equal, picks the one from the most recently created object
 */
export function getMostFrequentFillCombination(
  objects: CanvasObject[]
): Fill[] {
  if (objects.length === 0) return [];

  // Create a map of fill combinations to their frequency and most recent timestamp
  const combinationMap = new Map<
    string,
    {
      fills: Fill[];
      count: number;
      mostRecentTimestamp: number;
    }
  >();

  objects.forEach((obj) => {
    const fills = obj.fills || [];

    // Create a stable key for this fill combination based on type, color, opacity, etc.
    const fillKey = fills
      .map((fill) => {
        if (fill.type === "solid") {
          return `solid:${fill.color}:${fill.opacity}:${fill.visible}`;
        } else if (fill.type === "image") {
          return `image:${fill.imageUrl}:${fill.fit}:${fill.scale}:${fill.opacity}:${fill.visible}`;
        }
        return `${fill.type}:${fill.opacity}:${fill.visible}`;
      })
      .join("|");

    const existing = combinationMap.get(fillKey);
    if (existing) {
      // Increment count and update most recent timestamp if this object is newer
      existing.count++;
      if (obj.createdAt > existing.mostRecentTimestamp) {
        existing.mostRecentTimestamp = obj.createdAt;
      }
    } else {
      // Create new entry with deep copy of fills (new IDs)
      const fillsCopy = fills.map((fill) => ({
        ...fill,
        id: generateFillId(), // Generate new ID for the unified fill
      }));

      combinationMap.set(fillKey, {
        fills: fillsCopy,
        count: 1,
        mostRecentTimestamp: obj.createdAt,
      });
    }
  });

  // Find the most frequent combination
  const combinations = Array.from(combinationMap.values());
  if (combinations.length === 0) return [];

  const bestCombination = combinations.reduce((best, current) => {
    if (
      current.count > best.count ||
      (current.count === best.count &&
        current.mostRecentTimestamp > best.mostRecentTimestamp)
    ) {
      return current;
    }
    return best;
  });

  return bestCombination.fills;
}

// Background wrapper utilities for blend modes and effects
export function needsBackgroundWrapper(
  object: CanvasObject,
  processedImageUrls?: Record<string, string>,
  cropModeOverride?: { originalDimensions: { width: number; height: number } }
): boolean {
  if (!object.fills || object.fills.length === 0) return false;

  // Check if any fill needs a background wrapper
  const needsWrapper = object.fills.some((fill) => {
    if (fill.type === "image") {
      const imageFill = fill as ImageFill;
      const cssProps = fillToCssProperties(
        fill,
        processedImageUrls?.[fill.id],
        {
          width: object.width,
          height: object.height,
        },
        cropModeOverride
      );
      return cssProps.needsBackgroundWrapper;
    }
    return false;
  });

  return needsWrapper;
}

export function getBackgroundWrapperStyles(
  object: CanvasObject,
  processedImageUrls?: Record<string, string>,
  cropModeOverride?: { originalDimensions: { width: number; height: number } }
): React.CSSProperties {
  const effectiveBackground = getEffectiveBackgroundStyles(
    object,
    processedImageUrls,
    cropModeOverride
  );

  // Extract only background-related and effect properties
  const backgroundStyles: React.CSSProperties = {};

  if (effectiveBackground.backgroundImage) {
    backgroundStyles.backgroundImage = effectiveBackground.backgroundImage;
  }
  if (effectiveBackground.backgroundSize) {
    backgroundStyles.backgroundSize = effectiveBackground.backgroundSize;
  }
  if (effectiveBackground.backgroundRepeat) {
    backgroundStyles.backgroundRepeat = effectiveBackground.backgroundRepeat;
  }
  if (effectiveBackground.backgroundPosition) {
    backgroundStyles.backgroundPosition =
      effectiveBackground.backgroundPosition;
  }
  if (effectiveBackground.backgroundColor) {
    backgroundStyles.backgroundColor = effectiveBackground.backgroundColor;
  }
  if (effectiveBackground.filter) {
    backgroundStyles.filter = effectiveBackground.filter;
  }

  // Apply blend mode if available
  object.fills?.forEach((fill) => {
    if (fill.type === "image") {
      const imageFill = fill as ImageFill;
      if (imageFill.blendMode && imageFill.blendMode !== "normal") {
        backgroundStyles.mixBlendMode = imageFill.blendMode;
      }
    }
  });

  return backgroundStyles;
}

export function getPositioningSafeStyles(
  cssProps: FillCssResult
): React.CSSProperties {
  const safeStyles: React.CSSProperties = {};

  // Include background properties that don't interfere with positioning
  if (cssProps.backgroundColor) {
    safeStyles.backgroundColor = cssProps.backgroundColor;
  }

  // Exclude mixBlendMode and other effects that need wrapper
  if (!cssProps.needsBackgroundWrapper) {
    if (cssProps.backgroundImage) {
      safeStyles.backgroundImage = cssProps.backgroundImage;
    }
    if (cssProps.backgroundSize) {
      safeStyles.backgroundSize = cssProps.backgroundSize;
    }
    if (cssProps.backgroundRepeat) {
      safeStyles.backgroundRepeat = cssProps.backgroundRepeat;
    }
    if (cssProps.backgroundPosition) {
      safeStyles.backgroundPosition = cssProps.backgroundPosition;
    }
    if (cssProps.filter) {
      safeStyles.filter = cssProps.filter;
    }
  }

  return safeStyles;
}
