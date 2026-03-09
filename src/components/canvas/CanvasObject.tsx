"use client";

import { useAppStore } from "@/core/state/store";
import { AutoLayoutObserverAPI } from "@/core/utils/autoLayout";
import { getAbsolutePosition } from "@/core/utils/coordinates";
import {
  createCheckerboardPattern,
  getBackgroundWrapperStyles,
  getEffectiveBackgroundStyles,
  isEmptyImageUrl,
  needsBackgroundWrapper,
} from "@/core/utils/fills";
import { useProcessedImageFills } from "@/hooks/useProcessedImageFill";
import { CanvasObject as CanvasObjectType, ImageFill } from "@/types/canvas";
import { useTransientStore } from "@/core/state/transientStore";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";
// import AutoLayoutDragPlaceholder from "./AutoLayoutDragPlaceholder";
import { borderRadiusToCSS } from "@/core/utils/borderRadius";
import { effectsToCssStyles, innerShadowCss } from "@/core/utils/effects";
import MakeCanvasPreview from "./MakeCanvasPreview";
import StrokeWrapper from "./StrokeWrapper";
import TextRenderer from "./TextRenderer";

let _cachedSelectedIds: string[] = [];
let _cachedSelectedSet: Set<string> = new Set();
function getSelectedIdsSet(selectedIds: string[]): Set<string> {
  if (selectedIds !== _cachedSelectedIds) {
    _cachedSelectedIds = selectedIds;
    _cachedSelectedSet = new Set(selectedIds);
  }
  return _cachedSelectedSet;
}

/**
 * Renders SVG inner content via a ref so React never tracks the children.
 * This prevents "removeChild" errors caused by browser SVG DOM normalization
 * conflicting with React's reconciliation.
 */
function SvgInner({
  html,
  viewBox,
}: {
  html: string;
  viewBox: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = html;
    }
    return () => {
      if (ref.current) {
        ref.current.innerHTML = "";
      }
    };
  }, [html]);
  return (
    <svg
      ref={ref}
      width="100%"
      height="100%"
      viewBox={viewBox}
      style={{ overflow: "visible" }}
    />
  );
}

/** Pulse overlay shown on a Make while AI is generating. */
function MakeGeneratingPulse() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(255,255,255,0.5)",
          animation: "make-pulse 1.8s ease-in-out infinite",
          borderRadius: 2,
        }}
      />
      <style>{`
        @keyframes make-pulse {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Helper function to render image fills as <img> elements
// Convert our fill data to crop-prototype imageTransform format
const convertFillToImageTransform = (
  fill: ImageFill,
  object: CanvasObjectType,
  cropModeOverride?: { originalDimensions: { width: number; height: number } }
) => {
  let scale = fill.scale || 1;
  const offsetX = fill.offsetX || 0;
  const offsetY = fill.offsetY || 0;

  // CRITICAL: Don't use scale in crop mode - overlay uses originalDimensions directly!
  if (cropModeOverride?.originalDimensions) {
    // In crop mode, ignore scale completely - the size comes from originalDimensions
    scale = 1.0; // Always 1.0 in crop mode
  }

  // Calculate world position (like crop-prototype imageTransform.x/y)
  // For crop mode active rendering, we need to use absolute coordinates
  // but this function is called within the component context where we don't have direct access to objects
  // The crop mode overlay handles the absolute positioning, so we can use relative coordinates here
  const imageWorldX = object.x + offsetX * object.width;
  const imageWorldY = object.y + offsetY * object.height;

  return {
    x: imageWorldX,
    y: imageWorldY,
    scale: scale,
    scaleX: undefined,
    scaleY: undefined,
  };
};

const renderImageFill = (
  fill: ImageFill,
  object: CanvasObjectType,
  processedImageUrls: Record<string, string>,
  cropModeOverride?: { originalDimensions: { width: number; height: number } },
  cropMode?: any
): React.ReactNode => {
  if (fill.type !== "image" || !fill.visible || !fill.imageUrl) return null;

  // Get the processed URL or fallback to original
  const imageUrl = processedImageUrls[fill.id] || fill.imageUrl;
  const opacity = fill.opacity ?? 1;

  // Check if this is a placeholder URL and use checkerboard pattern instead
  const isPlaceholder = isEmptyImageUrl(imageUrl);
  const finalImageUrl = isPlaceholder ? createCheckerboardPattern() : imageUrl;

  if (fill.fit === "crop" && cropModeOverride) {
    // CROP-PROTOTYPE APPROACH: Only when crop mode is ACTIVE
    const imageTransform = convertFillToImageTransform(
      fill,
      object,
      cropModeOverride
    );
    // Use currentTransform if available (during resize), otherwise originalDimensions
    let imageNatural;
    if (cropMode?.currentTransform) {
      // During resize: use live currentTransform dimensions (same as overlay)
      imageNatural = {
        width: cropMode.currentTransform.imageWidth,
        height: cropMode.currentTransform.imageHeight,
      };
    } else {
      // Initial crop mode: use originalDimensions
      imageNatural = cropModeOverride.originalDimensions || {
        width: fill.imageWidth || 900,
        height: fill.imageHeight || 900,
      };
    }
    const rect = {
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
    };

    const cropModeImageLeft = imageTransform.x - rect.x;
    const cropModeImageTop = imageTransform.y - rect.y;
    const cropModeImageWidth =
      imageNatural.width * (imageTransform.scaleX || imageTransform.scale);
    const cropModeImageHeight =
      imageNatural.height * (imageTransform.scaleY || imageTransform.scale);

    // EXACT CROP-PROTOTYPE RENDERING - Copy their exact code
    return (
      <div
        key={fill.id}
        className="absolute inset-0"
        style={{
          overflow: "hidden",
          borderRadius: "inherit",
          opacity: opacity,
          ...(fill.blendMode &&
            fill.blendMode !== "normal" && {
              mixBlendMode:
                fill.blendMode as React.CSSProperties["mixBlendMode"],
            }),
        }}
      >
        {isPlaceholder ? (
          <div
            style={{
              position: "absolute",
              left: imageTransform.x - rect.x, // EXACT crop-prototype formula
              top: imageTransform.y - rect.y, // EXACT crop-prototype formula
              width:
                imageNatural.width *
                (imageTransform.scaleX || imageTransform.scale),
              height:
                imageNatural.height *
                (imageTransform.scaleY || imageTransform.scale),
              maxWidth: "none",
              maxHeight: "none",
              userSelect: "none",
              pointerEvents: "none",
              opacity: 1, // Opacity handled by wrapper
              backgroundImage: `url('${finalImageUrl}')`,
              backgroundSize: "24px 24px",
              backgroundRepeat: "repeat",
              backgroundPosition: "0 0",
            }}
          />
        ) : (
          <img
            src={finalImageUrl}
            alt=""
            style={{
              position: "absolute",
              left: imageTransform.x - rect.x, // EXACT crop-prototype formula
              top: imageTransform.y - rect.y, // EXACT crop-prototype formula
              width:
                imageNatural.width *
                (imageTransform.scaleX || imageTransform.scale),
              height:
                imageNatural.height *
                (imageTransform.scaleY || imageTransform.scale),
              maxWidth: "none",
              maxHeight: "none",
              userSelect: "none",
              pointerEvents: "none",
              opacity: 1, // Opacity handled by wrapper
            }}
            draggable={false}
          />
        )}
      </div>
    );
  }

  // Handle all non-crop-mode cases (including crop when not active)
  let imageStyles: React.CSSProperties = {
    position: "absolute",
    pointerEvents: "none",
    userSelect: "none",
  };

  if (fill.fit === "crop") {
    const offsetX = fill.offsetX || 0;
    const offsetY = fill.offsetY || 0;
    const currentScale = fill.scale || 1;
    const imageNaturalWidth = fill.imageWidth || 900;
    const imageNaturalHeight = fill.imageHeight || 900;

    // Position scales with node size (percentage-based positioning)
    const actualImageX = offsetX * object.width;
    const actualImageY = offsetY * object.height;

    // CRITICAL: Use separate scaleX and scaleY for exact overlay matching AND stretching
    // This allows independent width/height scaling for perfect fit
    const currentScaleX = fill.scaleX || currentScale;
    const currentScaleY = fill.scaleY || currentScale;

    let actualImageWidth = object.width * currentScaleX;
    let actualImageHeight = object.height * currentScaleY;

    imageStyles = {
      ...imageStyles,
      left: `${actualImageX}px`,
      top: `${actualImageY}px`,
      width: `${actualImageWidth}px`,
      height: `${actualImageHeight}px`,
      maxWidth: "none",
      maxHeight: "none",
      // No objectFit - let the browser scale the image content to fill the dimensions
    };
  }

  if (fill.fit === "fill") {
    // Fill mode: cover entire object
    imageStyles = {
      ...imageStyles,
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
    };
  } else if (fill.fit === "fit") {
    // Fit mode: contain within object
    imageStyles = {
      ...imageStyles,
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      objectFit: "contain",
    };
  }

  // Blend mode and opacity are handled by wrapper div

  return (
    <div
      key={fill.id}
      className="absolute inset-0"
      style={{
        overflow: "hidden", // Always clip image to node bounds
        borderRadius: "inherit",
        opacity: opacity,
        ...(fill.blendMode &&
          fill.blendMode !== "normal" && {
            mixBlendMode: fill.blendMode as React.CSSProperties["mixBlendMode"],
          }),
      }}
    >
      {isPlaceholder ? (
        <div
          style={{
            ...imageStyles,
            opacity: 1, // Opacity is handled by wrapper
            backgroundImage: `url('${finalImageUrl}')`,
            backgroundSize: "24px 24px",
            backgroundRepeat: "repeat",
            backgroundPosition: "0 0",
          }}
        />
      ) : (
        <img
          src={finalImageUrl}
          alt=""
          style={{
            ...imageStyles,
            opacity: 1, // Opacity is handled by wrapper
          }}
          draggable={false}
        />
      )}
    </div>
  );
};

/** Overlay div that renders inset box-shadows on top of fill layers. */
function InnerShadowOverlay({ effects }: { effects?: import("@/types/canvas").Effect[] }) {
  const shadow = innerShadowCss(effects);
  if (!shadow) return null;
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        borderRadius: "inherit",
        boxShadow: shadow,
      }}
    />
  );
}

interface CanvasObjectProps {
  object: CanvasObjectType;
  children?: React.ReactNode;
  isNested?: boolean;
  parentHasAutoLayout?: boolean;
  isBeingDraggedOverAutoLayout?: boolean;
}

/**
 * CanvasObject renders an individual canvas object as a DOM element
 * Positioned using CSS transforms for optimal performance
 * Supports nested objects for Frames with proper coordinate handling
 */
const CanvasObject = React.memo(function CanvasObject({
  object,
  children,
  isNested = false,
  parentHasAutoLayout = false,
  isBeingDraggedOverAutoLayout = false,
}: CanvasObjectProps) {
  // console.log("🔄 [CanvasObject] Component re-render:", {
  //   objectId: object.id,
  //   opacity: object.opacity,
  //   timestamp: Date.now(),
  // });

  const parentObject = useAppStore((state) =>
    object.parentId ? state.objects[object.parentId] : null
  );
  const dispatch = useAppStore((state) => state.dispatch);
  const getComponentById = useAppStore((state) => state.getComponentById);
  const cropMode = useAppStore((state) => state.cropMode);
  const isSelected = useAppStore((state) =>
    getSelectedIdsSet(state.selection.selectedIds).has(object.id)
  );
  const isInExtractMode = useAppStore((state) =>
    state.extractMode.isActive && state.extractMode.makeObjectId === object.id
  );
  const isMakeGenerating = useAppStore((state) =>
    object.type === "make" ? !!state.generatingMakeIds[object.id] : false
  );

  // Subscribe to the top-level objects dict so frames re-render when any child changes.
  // Zustand uses reference equality: `state.objects` only changes when Immer produces
  // a new draft (i.e., an actual mutation happened). During zoom/pan, objects stays
  // the same reference, so this does NOT cause re-renders on viewport changes.
  const objectsRef = useAppStore((state) => state.objects);

  const getObject = useCallback(
    (id: string) => objectsRef[id],
    [objectsRef]
  );

  // Single transient-store subscription per CanvasObject (shallow equality).
  // Only re-renders when this object's drag/resize changes, or when the
  // drag metadata dicts swap (start/end of a drag).
  const {
    dragPosition,
    resizeState,
    draggedAutoLayoutChildren,
    autoLayoutPlaceholderPositions,
  } = useTransientStore(
    (s) => ({
      dragPosition: s.dragPositions[object.id] as { x: number; y: number } | undefined,
      resizeState: s.resizeStates[object.id] as { x: number; y: number; width: number; height: number } | undefined,
      draggedAutoLayoutChildren: s.draggedAutoLayoutChildren,
      autoLayoutPlaceholderPositions: s.autoLayoutPlaceholderPositions,
    }),
    shallow,
  );

  // Get processed image URLs for advanced adjustments (highlights/shadows)
  const imageFills =
    (object.fills?.filter((fill) => fill.type === "image") as ImageFill[]) ||
    [];
  const processedImageUrls = useProcessedImageFills(imageFills);

  // Check if this object is in crop mode and prepare crop mode override
  const isInCropMode = cropMode.isActive && cropMode.objectId === object.id;
  const cropModeOverride =
    isInCropMode && cropMode.originalDimensions
      ? { originalDimensions: cropMode.originalDimensions }
      : undefined;

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (object.type === "frame") {
        AutoLayoutObserverAPI.unobserveFrame(object.id);
      }
    };
  }, [object.id, object.type]);

  // Auto layout observer effect - moved outside switch to maintain consistent hooks
  useEffect(() => {
    if (object.type === "frame") {
      // Check for auto layout in both places: properties.autoLayout (main frames) and direct autoLayout (instances)
      const autoLayout =
        object.properties?.type === "frame"
          ? object.properties.autoLayout
          : (object as any).autoLayout; // For instance frames

      const needsObservation =
        autoLayout &&
        (autoLayout.mode !== "none" ||
          object.autoLayoutSizing?.horizontal === "hug" ||
          object.autoLayoutSizing?.vertical === "hug");

      if (needsObservation) {
        // Use requestAnimationFrame to ensure DOM is ready
        const frame = requestAnimationFrame(() => {
          const freshState = useAppStore.getState();
          AutoLayoutObserverAPI.observeFrame(
            object.id,
            freshState.objects,
            freshState.viewport,
            dispatch
          );
        });

        return () => {
          cancelAnimationFrame(frame);
          AutoLayoutObserverAPI.unobserveFrame(object.id);
        };
      } else {
        // Stop observing if auto layout is disabled
        AutoLayoutObserverAPI.unobserveFrame(object.id);
      }
    }
  }, [
    object.type,
    object.id,
    object.properties?.type === "frame"
      ? object.properties.autoLayout?.mode
      : (object as any).autoLayout?.mode,
    object.autoLayoutSizing?.horizontal,
    object.autoLayoutSizing?.vertical,
    dispatch,
  ]);

  // Handle coordinate space conversion for drag positions and resize states.
  // dragPosition always wins if present — it means a drag is active and the
  // user is actively moving the object. resizeState is only used during an
  // active resize when no drag is happening.
  let currentX = object.x;
  let currentY = object.y;
  let currentWidth = object.width;
  let currentHeight = object.height;

  if (dragPosition) {
    if (isNested && object.parentId) {
      if (parentObject) {
        const currentObjects = useAppStore.getState().objects;
        const parentAbsolute = getAbsolutePosition(object.parentId, currentObjects);
        currentX = dragPosition.x - parentAbsolute.x;
        currentY = dragPosition.y - parentAbsolute.y;
      } else {
        currentX = dragPosition.x;
        currentY = dragPosition.y;
      }
    } else {
      currentX = dragPosition.x;
      currentY = dragPosition.y;
    }
  } else if (resizeState) {
    currentX = resizeState.x;
    currentY = resizeState.y;
    currentWidth = resizeState.width;
    currentHeight = resizeState.height;
  }

  // CSS styles for positioning and appearance
  let opacity = typeof object.opacity === "number" ? object.opacity : 1;
  // console.log("🎨 [CanvasObject] Opacity for object:", {
  //   objectId: object.id,
  //   objectType: object.type,
  //   objectOpacity: object.opacity,
  //   finalOpacity: opacity,
  // });

  // Reduce opacity when being dragged over auto layout frames for better visual feedback
  if (isBeingDraggedOverAutoLayout) {
    opacity = opacity * 0.5; // Make semi-transparent
  }

  // Get parent's auto layout direction if this is an auto layout child
  const parentAutoLayout =
    parentObject?.type === "frame" && parentObject.properties?.type === "frame"
      ? parentObject.properties.autoLayout
      : null;
  const isParentVertical = parentAutoLayout?.mode === "vertical";
  const isParentHorizontal = parentAutoLayout?.mode === "horizontal";
  const isParentGrid = parentAutoLayout?.mode === "grid";

  // Check if this object is being dragged from an auto layout frame
  const isDraggedAutoLayoutChild = object.id in draggedAutoLayoutChildren;

  // Check if this object should be absolutely positioned
  // This includes: dragged auto layout children OR objects marked as absolutely positioned
  const shouldUseAbsolutePositioning =
    (isDraggedAutoLayoutChild && dragPosition) || object.absolutePositioned;

  const style: React.CSSProperties = shouldUseAbsolutePositioning
    ? {
        // Absolute positioning for: dragged auto layout children OR objects marked as absolutely positioned
        position: "absolute",
        left: `${currentX}px`,
        top: `${currentY}px`,
        width: `${currentWidth}px`,
        height: `${currentHeight}px`,
        transform: object.rotation
          ? `rotate(${object.rotation}deg)`
          : undefined,
        transformOrigin: "center center",
        opacity: opacity,
        pointerEvents: object.locked ? "none" : "auto",
        visibility: object.visible ? "visible" : "hidden",
        display: object.visible ? "block" : "none", // Remove from layout when hidden
        zIndex: 1000, // Bring to front during drag
      }
    : parentHasAutoLayout
    ? {
        // For auto layout children, use relative positioning and let flexbox/grid handle positioning
        position: "relative",
        // Handle auto layout sizing
        // Grid children use width/height: 100% for fill; flex children use flexGrow/alignSelf
        width:
          object.autoLayoutSizing?.horizontal === "fill"
            ? isParentGrid
              ? "100%"
              : undefined
            : object.type === "text" && object.autoLayoutSizing?.horizontal === "hug"
              ? "max-content"
              : `${currentWidth}px`,
        height:
          object.autoLayoutSizing?.vertical === "fill"
            ? isParentGrid
              ? "100%"
              : undefined
            : `${currentHeight}px`,
        // Flex properties - these depend on parent's flex-direction (no effect on grid children)
        flexGrow: isParentVertical
          ? object.autoLayoutSizing?.vertical === "fill"
            ? 1
            : 0
          : isParentHorizontal
          ? object.autoLayoutSizing?.horizontal === "fill"
            ? 1
            : 0
          : 0,
        flexShrink: isParentVertical
          ? object.autoLayoutSizing?.vertical === "fill"
            ? 1
            : 0
          : isParentHorizontal
          ? object.autoLayoutSizing?.horizontal === "fill"
            ? 1
            : 0
          : 0,
        // Use flexBasis: 0 for main-axis fill to distribute space equally
        flexBasis: isParentHorizontal
          ? object.autoLayoutSizing?.horizontal === "fill"
            ? 0
            : undefined
          : isParentVertical
          ? object.autoLayoutSizing?.vertical === "fill"
            ? 0
            : undefined
          : undefined,
        // Override min-width/min-height auto default for main-axis fill
        // so flex items can shrink below their content's intrinsic size
        minWidth:
          isParentHorizontal &&
          object.autoLayoutSizing?.horizontal === "fill"
            ? 0
            : undefined,
        minHeight:
          isParentVertical &&
          object.autoLayoutSizing?.vertical === "fill"
            ? 0
            : undefined,
        alignSelf: isParentGrid
          ? object.autoLayoutSizing?.vertical === "fill"
            ? "stretch"
            : "auto"
          : isParentVertical
          ? object.autoLayoutSizing?.horizontal === "fill"
            ? "stretch"
            : "auto"
          : isParentHorizontal
          ? object.autoLayoutSizing?.vertical === "fill"
            ? "stretch"
            : "auto"
          : "auto",
        // For centered parents, use margin:auto as a robust centering fallback.
        ...(isParentVertical &&
          parentAutoLayout?.alignItems === "center" &&
          object.autoLayoutSizing?.horizontal !== "fill" && {
            marginLeft: "auto",
            marginRight: "auto",
          }),
        ...(isParentHorizontal &&
          parentAutoLayout?.alignItems === "center" &&
          object.autoLayoutSizing?.vertical !== "fill" && {
            marginTop: "auto",
            marginBottom: "auto",
          }),
        transform: object.rotation
          ? `rotate(${object.rotation}deg)`
          : undefined,
        transformOrigin: "center center",
        opacity: opacity,
        pointerEvents: object.locked ? "none" : "auto",
        visibility: object.visible ? "visible" : "hidden",
        display: object.visible ? "block" : "none", // Remove from layout when hidden
      }
    : {
        // For normal positioning, use absolute
        position: "absolute",
        left: 0,
        top: 0,
        width: `${currentWidth}px`,
        height: `${currentHeight}px`,
        transform: `translate(${currentX}px, ${currentY}px) rotate(${object.rotation}deg)`,
        transformOrigin: "0 0",
        opacity: opacity,
        zIndex: object.zIndex,
        pointerEvents: object.locked ? "none" : "auto",
        visibility: object.visible ? "visible" : "hidden",
        display: object.visible ? "block" : "none", // Remove from layout when hidden
      };

  // Debug the final style object
  // console.log("🎨 [CanvasObject] Final CSS style:", {
  //   objectId: object.id,
  //   opacity: style.opacity,
  //   fullStyle: style,
  // });

  // Base classes for all objects
  const baseClasses = parentHasAutoLayout
    ? "select-none leading-[0px]"
    : "absolute select-none leading-[0px]";

  // Render based on object type
  const renderObjectContent = () => {
    switch (object.type) {
      case "rectangle": {
        const backgroundStyles = getEffectiveBackgroundStyles(
          object,
          processedImageUrls,
          cropModeOverride
        );

        // Check if we have images with opacity that need special handling
        const hasImageWithOpacity = object.fills?.some(
          (fill) => fill.visible && fill.type === "image" && fill.opacity < 1
        );

        // Check if we have blend modes that need individual layer rendering OR if the node itself has a blend mode
        // For isolation purposes, we consider explicit NORMAL as "having a blend mode"
        const hasBlendModes =
          object.fills?.some(
            (fill) =>
              fill.visible && fill.blendMode && fill.blendMode !== "normal"
          ) || !!object.blendMode; // Any explicit blend mode (including "normal")

        // Always use multi-layer rendering to properly support individual fill opacity
        // without conflicting with object-level opacity
        const usingMultiLayer = !!(object.fills && object.fills.length > 0);

        // Build effects styles
        const effectsStyles = effectsToCssStyles(object.effects);

        // Split styles between wrapper and content for stroke positioning
        const wrapperStyle: React.CSSProperties = {
          ...style,
          borderRadius:
            object.properties.type === "rectangle"
              ? borderRadiusToCSS(object.properties.borderRadius)
              : "0",
          // Apply node-level blend mode
          ...(object.blendMode &&
            object.blendMode !== "normal" && {
              mixBlendMode:
                object.blendMode as React.CSSProperties["mixBlendMode"],
            }),
          // Apply effects (shadows, blurs)
          ...effectsStyles,
        };

        const contentStyle: React.CSSProperties = {
          // Only include background styles for single fills, not multi-layer
          ...(usingMultiLayer ? {} : backgroundStyles),
          borderRadius: "inherit", // Inherit from wrapper
        };

        // Get border radius for stroke calculations
        const borderRadius =
          object.properties.type === "rectangle"
            ? object.properties.borderRadius
            : undefined;

        if (usingMultiLayer) {
          // For multiple fills, always render layers separately to support blend modes

          return (
            <StrokeWrapper
              object={object}
              className={baseClasses}
              style={wrapperStyle}
              contentStyle={contentStyle}
              borderRadius={borderRadius}
              data-object-id={object.id}
              data-object-type={object.type}
              data-locked={object.locked}
              data-nested={isNested}
              data-is-main-component={object.isMainComponent}
            >
              {/* Component badge indicator for main components */}
              {object.isMainComponent && (
                <div
                  className="absolute -top-2 -left-2 z-10 bg-purple-600 text-white text-xs px-1 py-0.5 rounded text-center pointer-events-none"
                  style={{ fontSize: "10px", lineHeight: "12px" }}
                >
                  ◆
                </div>
              )}
              {/* Render each fill as a separate layer */}
              {object.fills
                ?.filter((fill) => fill.visible)
                .map((fill, index) => {
                  if (fill.type === "image") {
                    // Render image fills as <img> elements
                    return renderImageFill(
                      fill,
                      object,
                      processedImageUrls,
                      cropModeOverride,
                      cropMode
                    );
                  } else {
                    // Render non-image fills as background divs
                    return (
                      <div
                        key={fill.id}
                        className="absolute inset-0"
                        style={{
                          ...getEffectiveBackgroundStyles(
                            {
                              ...object,
                              fills: [fill],
                            },
                            processedImageUrls,
                            cropModeOverride
                          ),
                          borderRadius: "inherit",
                          opacity: fill.opacity,
                          // Apply blend mode to individual fill layers
                          ...(fill.blendMode &&
                            fill.blendMode !== "normal" && {
                              mixBlendMode:
                                fill.blendMode as React.CSSProperties["mixBlendMode"],
                            }),
                        }}
                      />
                    );
                  }
                })}

              {/* Inner shadow overlay — on top of fills so inset shadows are visible */}
              <InnerShadowOverlay effects={object.effects} />

              {/* Stroke layer - rendered after fills */}
            </StrokeWrapper>
          );
        }

        // Check if we need a background wrapper for blend modes or other effects
        const needsWrapper = needsBackgroundWrapper(
          object,
          processedImageUrls,
          cropModeOverride
        );

        if (needsWrapper) {
          // Use background wrapper pattern for blend modes and effects
          const wrapperStyles = getBackgroundWrapperStyles(
            object,
            processedImageUrls,
            cropModeOverride
          );
          const positioningStyle = { ...style }; // Only positioning, no background

          return (
            <StrokeWrapper
              object={object}
              className={baseClasses}
              style={positioningStyle}
              contentStyle={{}}
              borderRadius={borderRadius}
              data-object-id={object.id}
              data-object-type={object.type}
              data-locked={object.locked}
              data-nested={isNested}
              data-is-main-component={object.isMainComponent}
            >
              {/* Background wrapper for blend modes and effects */}
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius:
                    object.properties.type === "rectangle"
                      ? borderRadiusToCSS(object.properties.borderRadius)
                      : "0",
                  ...wrapperStyles,
                }}
              />
            </StrokeWrapper>
          );
        }

        return (
          <StrokeWrapper
            object={object}
            className={baseClasses}
            style={wrapperStyle}
            contentStyle={contentStyle}
            borderRadius={borderRadius}
            data-object-id={object.id}
            data-object-type={object.type}
            data-locked={object.locked}
            data-nested={isNested}
            data-is-main-component={object.isMainComponent}
          />
        );
      }

      case "ellipse": {
        const backgroundStyles = getEffectiveBackgroundStyles(
          object,
          processedImageUrls,
          cropModeOverride
        );

        // Check if we have images with opacity that need special handling
        const hasImageWithOpacity = object.fills?.some(
          (fill) => fill.visible && fill.type === "image" && fill.opacity < 1
        );

        // Check if we have blend modes that need individual layer rendering OR if the node itself has a blend mode
        // For isolation purposes, we consider explicit NORMAL as "having a blend mode"
        const hasBlendModes =
          object.fills?.some(
            (fill) =>
              fill.visible && fill.blendMode && fill.blendMode !== "normal"
          ) || !!object.blendMode; // Any explicit blend mode (including "normal")

        // Always use multi-layer rendering to properly support individual fill opacity
        // without conflicting with object-level opacity
        const usingMultiLayer = !!(object.fills && object.fills.length > 0);

        // Build effects styles
        const effectsStyles = effectsToCssStyles(object.effects);

        // Split styles between wrapper and content for stroke positioning
        const wrapperStyle: React.CSSProperties = {
          ...style,
          borderRadius: "50%",
          // Apply node-level blend mode
          ...(object.blendMode &&
            object.blendMode !== "normal" && {
              mixBlendMode:
                object.blendMode as React.CSSProperties["mixBlendMode"],
            }),
          // Apply effects (shadows, blurs)
          ...effectsStyles,
        };

        const contentStyle: React.CSSProperties = {
          // Only include background styles for single fills, not multi-layer
          ...(usingMultiLayer ? {} : backgroundStyles),
          borderRadius: "inherit", // Inherit from wrapper
        };

        // Ellipses always have 50% border radius (circular)
        const borderRadius = "50%";

        if (usingMultiLayer) {
          // For multiple fills, always render layers separately to support blend modes
          return (
            <StrokeWrapper
              object={object}
              className={baseClasses}
              style={wrapperStyle}
              contentStyle={contentStyle}
              borderRadius={borderRadius}
              data-object-id={object.id}
              data-object-type={object.type}
              data-locked={object.locked}
              data-nested={isNested}
              data-is-main-component={object.isMainComponent}
            >
              {/* Component badge indicator for main components */}
              {object.isMainComponent && (
                <div
                  className="absolute -top-2 -left-2 z-10 bg-purple-600 text-white text-xs px-1 py-0.5 rounded text-center pointer-events-none"
                  style={{ fontSize: "10px", lineHeight: "12px" }}
                >
                  ◆
                </div>
              )}
              {/* Render each fill as a separate layer */}
              {object.fills
                ?.filter((fill) => fill.visible)
                .map((fill, index) => {
                  if (fill.type === "image") {
                    // Render image fills as <img> elements with circular clipping
                    const imgElement = renderImageFill(
                      fill,
                      object,
                      processedImageUrls,
                      cropModeOverride,
                      cropMode
                    );
                    return imgElement ? (
                      <div
                        key={fill.id}
                        className="absolute inset-0"
                        style={{ borderRadius: "50%", overflow: "hidden" }}
                      >
                        {imgElement}
                      </div>
                    ) : null;
                  } else {
                    // Render non-image fills as background divs
                    return (
                      <div
                        key={fill.id}
                        className="absolute inset-0"
                        style={{
                          ...getEffectiveBackgroundStyles(
                            {
                              ...object,
                              fills: [fill],
                            },
                            processedImageUrls,
                            cropModeOverride
                          ),
                          borderRadius: "50%",
                          opacity: fill.opacity,
                          // Apply blend mode to individual fill layers
                          ...(fill.blendMode &&
                            fill.blendMode !== "normal" && {
                              mixBlendMode:
                                fill.blendMode as React.CSSProperties["mixBlendMode"],
                            }),
                        }}
                      />
                    );
                  }
                })}

              {/* Inner shadow overlay — on top of fills so inset shadows are visible */}
              <InnerShadowOverlay effects={object.effects} />

              {/* Stroke layer - rendered after fills */}
            </StrokeWrapper>
          );
        }

        return (
          <StrokeWrapper
            object={object}
            className={baseClasses}
            style={wrapperStyle}
            contentStyle={contentStyle}
            borderRadius={borderRadius}
            data-object-id={object.id}
            data-object-type={object.type}
            data-locked={object.locked}
            data-nested={isNested}
            data-is-main-component={object.isMainComponent}
          />
        );
      }

      case "text": {
        return (
          <TextRenderer
            object={object}
            style={style}
            baseClasses={baseClasses}
          />
        );
      }

      case "frame": {
        const frameProps =
          object.properties.type === "frame"
            ? object.properties
            : {
                type: "frame" as const,
                backgroundColor: "transparent",
                borderRadius: 0,
                overflow: "visible" as const,
                autoLayout: undefined,
              };

        const backgroundStyles = getEffectiveBackgroundStyles(
          object,
          processedImageUrls,
          cropModeOverride
        );

        // Check if we have images with opacity that need special handling
        const hasImageWithOpacity = object.fills?.some(
          (fill) => fill.visible && fill.type === "image" && fill.opacity < 1
        );

        // Auto layout styling
        const autoLayoutStyles: React.CSSProperties = {};
        // Check for auto layout in multiple places: frameProps.autoLayout (main frames), direct object.autoLayout (instances), and instance frame properties
        const autoLayout =
          frameProps.autoLayout ||
          (object as any).autoLayout ||
          (object.properties?.type === "frame"
            ? (object.properties as any).autoLayout
            : undefined);

        if (autoLayout && autoLayout.mode !== "none") {
          // Common auto layout styles
          if (autoLayout.padding) {
            autoLayoutStyles.padding = `${autoLayout.padding.top}px ${autoLayout.padding.right}px ${autoLayout.padding.bottom}px ${autoLayout.padding.left}px`;
          }

          if (autoLayout.gap && autoLayout.mode !== "grid") {
            autoLayoutStyles.gap = `${autoLayout.gap}px`;
          }

          // Mode-specific styles
          switch (autoLayout.mode) {
            case "horizontal":
              autoLayoutStyles.display = "flex";
              autoLayoutStyles.flexDirection =
                autoLayout.direction === "reverse" ? "row-reverse" : "row";
              autoLayoutStyles.alignItems = autoLayout.alignItems || "start";
              autoLayoutStyles.justifyContent =
                autoLayout.justifyContent || "start";
              break;

            case "vertical":
              autoLayoutStyles.display = "flex";
              autoLayoutStyles.flexDirection =
                autoLayout.direction === "reverse"
                  ? "column-reverse"
                  : "column";
              autoLayoutStyles.alignItems = autoLayout.alignItems || "start";
              autoLayoutStyles.justifyContent =
                autoLayout.justifyContent || "start";
              break;

            case "grid":
              autoLayoutStyles.display = "grid";
              if (autoLayout.gridColumns) {
                autoLayoutStyles.gridTemplateColumns = `repeat(${autoLayout.gridColumns}, 1fr)`;
              }
              if (autoLayout.gridRows) {
                autoLayoutStyles.gridTemplateRows = `repeat(${autoLayout.gridRows}, 1fr)`;
              }
              autoLayoutStyles.columnGap = `${autoLayout.gap ?? 0}px`;
              autoLayoutStyles.rowGap = `${autoLayout.counterAxisSpacing ?? autoLayout.gap ?? 0}px`;
              autoLayoutStyles.alignItems = autoLayout.alignItems || "start";
              autoLayoutStyles.justifyContent =
                autoLayout.justifyContent || "start";
              break;
          }
        }

        // Handle frame hug sizing - now using autoLayoutSizing
        if (object.autoLayoutSizing?.horizontal === "hug") {
          autoLayoutStyles.width = "fit-content";
          autoLayoutStyles.minWidth = "min-content";
          autoLayoutStyles.maxWidth = "max-content";
        }
        if (object.autoLayoutSizing?.vertical === "hug") {
          autoLayoutStyles.height = "fit-content";
          autoLayoutStyles.minHeight = "min-content";
          autoLayoutStyles.maxHeight = "max-content";
        }

        // Check if we have a single fill with blend mode that should be promoted to wrapper
        const fillsWithBlendModes =
          object.fills?.filter(
            (fill) =>
              fill.visible && fill.blendMode && fill.blendMode !== "normal"
          ) || [];

        const singleFillBlendMode =
          fillsWithBlendModes.length === 1 ? fillsWithBlendModes[0] : null;

        // Build effects styles
        const effectsStyles = effectsToCssStyles(object.effects);

        // Split styles between wrapper and content
        const wrapperStyle: React.CSSProperties = {
          ...style,
          borderRadius: borderRadiusToCSS(frameProps.borderRadius),
          // Apply node-level blend mode (takes precedence over fill blend modes)
          ...(object.blendMode &&
            object.blendMode !== "normal" && {
              mixBlendMode:
                object.blendMode as React.CSSProperties["mixBlendMode"],
            }),
          // If there's a single fill with blend mode and no explicit node blend mode, promote it to wrapper
          // This allows the fill blend mode to work with canvas background (Figma behavior)
          // PASS_THROUGH (undefined) allows promotion, explicit NORMAL prevents it
          ...(!object.blendMode &&
            singleFillBlendMode && {
              mixBlendMode:
                singleFillBlendMode.blendMode as React.CSSProperties["mixBlendMode"],
            }),
          // Override height for hug frames - the wrapper must also hug
          ...(object.autoLayoutSizing?.vertical === "hug" && {
            height: "fit-content",
          }),
          ...(object.autoLayoutSizing?.horizontal === "hug" && {
            width: "fit-content",
          }),
          // Apply effects (shadows, blurs)
          ...effectsStyles,
        };

        // Check if any fills have blend modes OR if the node itself has a blend mode
        // For isolation purposes, we consider explicit NORMAL as "having a blend mode"
        const hasBlendModes =
          object.fills?.some(
            (fill) =>
              fill.visible && fill.blendMode && fill.blendMode !== "normal"
          ) || !!object.blendMode; // Any explicit blend mode (including "normal")

        const contentStyle: React.CSSProperties = {
          // Always use layered background rendering for consistency
          // Auto layout styles need to be applied to the content container that holds children
          ...autoLayoutStyles,
          overflow:
            frameProps.overflow === "hidden" ? "clip" : frameProps.overflow,
          // Only use isolation when necessary - avoid it when blend modes are present
          // as it creates a stacking context that prevents blend modes from working
          isolation:
            frameProps.overflow === "hidden" && !hasBlendModes
              ? "isolate"
              : "auto",
          borderRadius: "inherit", // Inherit from wrapper
          // Note: Blend modes are applied only to individual fill layers, not the container
        };

        // Observer updates are handled by the useEffect above

        // Always use layered rendering approach for consistency
        return (
          <StrokeWrapper
            object={object}
            className={baseClasses}
            style={wrapperStyle}
            contentStyle={contentStyle}
            borderRadius={frameProps.borderRadius}
            data-object-id={object.id}
            data-object-type={object.type}
            data-locked={object.locked}
            data-nested={isNested}
          >
            {/* Background layers */}
            {object.fills
              ?.filter((fill) => fill.visible)
              .map((fill, index) => {
                if (fill.type === "image") {
                  // Render image fills as <img> elements
                  return renderImageFill(
                    fill,
                    object,
                    processedImageUrls,
                    cropModeOverride,
                    cropMode
                  );
                } else {
                  // Render non-image fills as background divs
                  return (
                    <div
                      key={fill.id}
                      className="absolute inset-0"
                      style={{
                        ...getEffectiveBackgroundStyles(
                          {
                            ...object,
                            fills: [fill],
                          },
                          processedImageUrls,
                          cropModeOverride
                        ),
                        borderRadius: "inherit",
                        opacity: fill.opacity,
                        // Apply blend mode to individual fill layers
                        // Skip if this fill's blend mode was promoted to wrapper level (single fill case)
                        ...(fill.blendMode &&
                          fill.blendMode !== "normal" &&
                          !(
                            singleFillBlendMode && fill === singleFillBlendMode
                          ) && {
                            mixBlendMode:
                              fill.blendMode as React.CSSProperties["mixBlendMode"],
                          }),
                      }}
                    />
                  );
                }
              })}

            {/* Inner shadow overlay — on top of fills so inset shadows are visible */}
            <InnerShadowOverlay effects={object.effects} />

            {/* Children content */}
            {(() => {
              const hasAutoLayout = autoLayout && autoLayout.mode !== "none";

              // Create the render order with dynamic placeholders
              const createRenderOrder = () => {
                if (!hasAutoLayout) {
                  return object.childIds.map((id) => ({
                    type: "child" as const,
                    id,
                  }));
                }

                // Find dragged children that currently have placeholders in this frame

                const draggedChildrenInFrame = Object.entries(
                  autoLayoutPlaceholderPositions
                )
                  .filter(
                    ([_, placeholderPos]) =>
                      placeholderPos.parentId === object.id
                  )
                  .map(([id, placeholderPos]) => {
                    const originalInfo = draggedAutoLayoutChildren[id];
                    return {
                      draggedId: id,
                      originalIndex: originalInfo?.originalIndex ?? 0,
                      targetIndex: placeholderPos.insertionIndex,
                    };
                  });

                // Start with non-dragged children
                // Include children that are temporarily outside their original parent
                const nonDraggedChildren = object.childIds.filter((id) => {
                  const draggedInfo = draggedAutoLayoutChildren[id];

                  // If not tracked as dragged AL child, always include for normal rendering
                  if (!draggedInfo) return true;

                  // If this parent is the original AL parent and object is NOT temporarily outside,
                  // then it should render absolutely positioned (exclude from normal rendering)
                  if (
                    draggedInfo.parentId === object.id &&
                    !draggedInfo.isTemporarilyOutside
                  ) {
                    return false; // Will render absolutely positioned instead
                  }

                  // All other cases: include for normal rendering
                  return true;
                });

                // Create result array
                const result: Array<{
                  type: "child" | "placeholder";
                  id: string;
                  draggedId?: string;
                }> = [];

                // If no dragged children in this frame, return normal order
                if (draggedChildrenInFrame.length === 0) {
                  return nonDraggedChildren.map((id) => ({
                    type: "child" as const,
                    id,
                  }));
                }

                // Build a map of insertion-index → placeholders to insert at
                // that position. Multiple dragged children from the same frame
                // each get their own placeholder, sorted by their target index.
                const sortedDragged = [...draggedChildrenInFrame].sort(
                  (a, b) =>
                    a.targetIndex - b.targetIndex ||
                    a.originalIndex - b.originalIndex
                );

                // Collect which indices have placeholders
                const placeholdersByIndex = new Map<
                  number,
                  typeof draggedChildrenInFrame
                >();
                for (const dc of sortedDragged) {
                  const existing = placeholdersByIndex.get(dc.targetIndex);
                  if (existing) {
                    existing.push(dc);
                  } else {
                    placeholdersByIndex.set(dc.targetIndex, [dc]);
                  }
                }

                // Interleave non-dragged children with placeholders
                for (let i = 0; i <= nonDraggedChildren.length; i++) {
                  // Insert any placeholders destined for this position
                  const placeholdersHere = placeholdersByIndex.get(i);
                  if (placeholdersHere) {
                    for (const dc of placeholdersHere) {
                      result.push({
                        type: "placeholder",
                        id: `${dc.draggedId}-placeholder`,
                        draggedId: dc.draggedId,
                      });
                    }
                  }

                  // Add non-dragged child if there is one at this position
                  if (i < nonDraggedChildren.length) {
                    result.push({ type: "child", id: nonDraggedChildren[i] });
                  }
                }

                return result;
              };

              const renderOrder = createRenderOrder();

              return [
                // Render children and placeholders in calculated order
                ...renderOrder.map((item) => {
                  if (item.type === "placeholder") {
                    const draggedObject = getObject(item.draggedId!);

                    return (
                      <div
                        key={item.id}
                        style={{
                          width: `${draggedObject.width}px`,
                          height: `${draggedObject.height}px`,
                          visibility: "hidden", // Invisible but takes up space
                          pointerEvents: "none",
                          flexShrink: 0, // Don't shrink in flex layouts
                        }}
                        data-placeholder-for={item.draggedId}
                      />
                    );
                  }

                  // Regular child
                  const childObject = getObject(item.id);
                  if (!childObject) return null;

                  return (
                    <CanvasObject
                      key={item.id}
                      object={childObject}
                      isNested={true}
                      parentHasAutoLayout={hasAutoLayout}
                      isBeingDraggedOverAutoLayout={
                        isBeingDraggedOverAutoLayout ||
                        !!(
                          useTransientStore.getState().dragPositions[item.id] &&
                          autoLayoutPlaceholderPositions[item.id] &&
                          autoLayoutPlaceholderPositions[item.id].parentId ===
                            object.id
                        )
                      }
                    />
                  );
                }),
                // Render absolutely positioned dragged items (render from original parent)
                // FIXED VERSION: Only render if object has NOT left its original parent
                ...Object.entries(draggedAutoLayoutChildren)
                  .filter(([draggedId, info]) => {
                    const isOriginalParent = info.parentId === object.id;
                    const hasLeftParent =
                      info.isTemporarilyOutside !== undefined;

                    // Only render absolutely positioned if:
                    // 1. This is the original parent AND
                    // 2. Object has NOT left the parent (hasLeftParent is false)
                    return isOriginalParent && !hasLeftParent;
                  })
                  .map(([draggedId, _]) => {
                    const draggedObject = getObject(draggedId);
                    if (!draggedObject) return null;

                    return (
                      <CanvasObject
                        key={`${draggedId}-dragged`}
                        object={draggedObject}
                        isNested={true}
                        parentHasAutoLayout={false}
                        isBeingDraggedOverAutoLayout={
                          isBeingDraggedOverAutoLayout
                        }
                      />
                    );
                  }),
              ];
            })()}
          </StrokeWrapper>
        );
      }

      case "make": {
        const makeProps =
          object.properties.type === "make"
            ? object.properties
            : {
                type: "make" as const,
                mode: "html" as const,
                code: "",
                chatHistory: [],
                playing: false,
                borderRadius: 8,
                overflow: "hidden" as const,
              };

        const makeBorderRadius = borderRadiusToCSS(makeProps.borderRadius);
        const openMakeEditor = useAppStore.getState().openMakeEditor;

        const makeWrapperStyle: React.CSSProperties = {
          ...style,
          borderRadius: makeBorderRadius,
          overflow: "hidden",
          // Apply effects (shadows, blurs)
          ...effectsToCssStyles(object.effects),
        };

        return (
          <div
            className={baseClasses}
            style={makeWrapperStyle}
            data-object-id={object.id}
            data-object-type={object.type}
            data-locked={object.locked}
            data-nested={isNested}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (!makeProps.playing) {
                useAppStore.getState().dispatch({
                  type: "object.updated",
                  payload: {
                    id: object.id,
                    changes: {
                      properties: { ...makeProps, playing: true },
                    },
                    previousValues: { properties: makeProps },
                  },
                });
              }
            }}
            onPointerDown={(e: React.PointerEvent) => {
              if (isSelected && (makeProps.playing || isInExtractMode)) {
                e.stopPropagation();
              }
            }}
          >
            <MakeCanvasPreview code={makeProps.code} objectId={object.id} playing={!!makeProps.playing} />

            {isMakeGenerating && <MakeGeneratingPulse />}

            {/* Click shield — blocks iframe interaction when not selected+playing and not in extract mode */}
            {!(isSelected && (makeProps.playing || isInExtractMode)) && (
              <div
                className="absolute inset-0"
                style={{ pointerEvents: "auto" }}
                data-object-id={object.id}
                data-object-type={object.type}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (!makeProps.playing) {
                    useAppStore.getState().dispatch({
                      type: "object.updated",
                      payload: {
                        id: object.id,
                        changes: {
                          properties: { ...makeProps, playing: true },
                        },
                        previousValues: { properties: makeProps },
                      },
                    });
                  }
                }}
              />
            )}
          </div>
        );
      }

      case "vector": {
        const vectorProps =
          object.properties.type === "vector"
            ? object.properties
            : { vectorPaths: "", svgContent: "", svgViewBox: undefined as string | undefined, handleMirroring: "NONE" as const, windingRule: undefined as string | undefined };

        // Build effects styles
        const vectorEffectsStyles = effectsToCssStyles(object.effects);

        // For vectors, don't apply background styles to container
        const vectorStyle: React.CSSProperties = {
          ...style,
          backgroundColor: "transparent", // Keep container transparent
          // Apply effects (shadows, blurs)
          ...vectorEffectsStyles,
        };

        // Extract fill color from the first visible solid fill
        let fillColor = "currentColor";
        let fillOpacity = 1;

        if (object.fills && object.fills.length > 0) {
          const firstVisibleFill = object.fills.find(
            (fill) => fill.visible && fill.type === "solid"
          );
          if (firstVisibleFill && firstVisibleFill.type === "solid") {
            fillColor = firstVisibleFill.color;
            fillOpacity = firstVisibleFill.opacity || 1;
          }
        }

        // Extract stroke color from strokes array
        let strokeColor = "none";
        let strokeOpacity = 1;
        let strokeWidth = object.strokeWidth || 0;

        if (object.strokes && object.strokes.length > 0) {
          const firstVisibleStroke = object.strokes.find(
            (s) => s.visible && s.type === "solid"
          );
          if (firstVisibleStroke && firstVisibleStroke.type === "solid") {
            strokeColor = firstVisibleStroke.color;
            strokeOpacity = firstVisibleStroke.opacity || 1;
            if (!strokeWidth) strokeWidth = 1;
          }
        } else if (object.stroke) {
          // Legacy fallback
          strokeColor = object.stroke;
          if (!strokeWidth) strokeWidth = 1;
        }

        // Build CSS custom properties for currentColor replacement
        const svgColorStyle = fillColor !== "currentColor" ? fillColor : undefined;

        return (
          <div
            className={baseClasses}
            style={{
              ...vectorStyle,
              color: svgColorStyle, // Sets "currentColor" for SVG children
            }}
            data-object-id={object.id}
            data-object-type={object.type}
            data-locked={object.locked}
            data-nested={isNested}
          >
            {vectorProps.svgContent ? (
              <SvgInner
                html={vectorProps.svgContent}
                viewBox={
                  vectorProps.svgViewBox ||
                  `0 0 ${currentWidth} ${currentHeight}`
                }
              />
            ) : vectorProps.vectorPaths ? (
              vectorProps.vectorPaths.startsWith("http") ? (
                // If vectorPaths is a URL, render as an image
                <img
                  src={vectorProps.vectorPaths}
                  alt={object.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              ) : (
                // If vectorPaths is SVG path data, render as SVG
                <svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${currentWidth} ${currentHeight}`}
                  style={{ overflow: "visible" }}
                >
                  <path
                    d={vectorProps.vectorPaths}
                    fill={fillColor}
                    fillOpacity={fillOpacity}
                    fillRule={vectorProps.windingRule === "EVENODD" ? "evenodd" : "nonzero"}
                    stroke={strokeColor}
                    strokeOpacity={strokeOpacity}
                    strokeWidth={strokeWidth}
                  />
                </svg>
              )
            ) : null}
          </div>
        );
      }

      default:
        return (
          <div
            className={`${baseClasses} bg-red-200 border border-red-500`}
            style={style}
            data-object-id={object.id}
            data-object-type={object.type}
            data-locked={object.locked}
            data-nested={isNested}
          >
            Unknown: {object.type}
          </div>
        );
    }
  };

  return renderObjectContent();
});

export default CanvasObject;
