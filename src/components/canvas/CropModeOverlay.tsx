"use client";

import { useAppStore } from "@/core/state/store";
import { getAbsolutePosition, worldToScreen } from "@/core/utils/coordinates";
import { getEffectiveBackgroundStyles } from "@/core/utils/fills";
import { useCursor } from "@/hooks/useCursor";
import { ImageAdjustments, ImageFill } from "@/types/canvas";
import { RESIZE_HANDLE_CURSORS } from "@/types/cursor";
import React, { useCallback, useEffect, useRef } from "react";

interface CropModeOverlayProps {
  object: any;
  imageFill: ImageFill;
  onImageTransformChange?: (transform: {
    offsetX: number;
    offsetY: number;
    scale: number;
  }) => void;
  onGetCurrentTransform?: () => {
    imageWorldX: number;
    imageWorldY: number;
    imageWidth: number;
    imageHeight: number;
  };
}

export default function CropModeOverlay({
  object,
  imageFill,
  onImageTransformChange,
  onGetCurrentTransform,
}: CropModeOverlayProps) {
  const viewport = useAppStore((state) => state.viewport);
  const dispatch = useAppStore((state) => state.dispatch);
  const cropMode = useAppStore((state) => state.cropMode);
  const { setCursor, resetCursor } = useCursor();
  const updateCropModeTransform = useAppStore(
    (state) => state.updateCropModeTransform
  );

  // Convert image adjustments to CSS filter string (same as fills.ts)
  const adjustmentsToCssFilter = (adjustments?: ImageAdjustments): string => {
    if (!adjustments) return "";

    const filters: string[] = [];

    // Exposure - simulate with brightness
    if (adjustments.exposure !== undefined && adjustments.exposure !== 0) {
      const brightness = Math.max(0, 1 + adjustments.exposure / 100);
      filters.push(`brightness(${brightness})`);
    }

    // Contrast - direct CSS mapping
    if (adjustments.contrast !== undefined && adjustments.contrast !== 0) {
      const contrast = Math.max(0, 1 + adjustments.contrast / 100);
      filters.push(`contrast(${contrast})`);
    }

    // Saturation - direct CSS mapping
    if (adjustments.saturation !== undefined && adjustments.saturation !== 0) {
      const saturation = Math.max(0, 1 + adjustments.saturation / 100);
      filters.push(`saturate(${saturation})`);
    }

    // Temperature - simulate with hue rotation
    if (
      adjustments.temperature !== undefined &&
      adjustments.temperature !== 0
    ) {
      const hueShift = adjustments.temperature * 0.6;
      filters.push(`hue-rotate(${hueShift}deg)`);
    }

    // Tint - another hue rotation
    if (adjustments.tint !== undefined && adjustments.tint !== 0) {
      const tintShift = adjustments.tint * 0.3;
      filters.push(`hue-rotate(${tintShift}deg)`);
    }

    // Note: highlights and shadows would need more complex processing
    // For now, we'll only apply the CSS-compatible adjustments

    return filters.join(" ");
  };

  // Helper function to get cursor for crop resize handles
  const getCropResizeCursor = (handle: string) => {
    const cursorMap: Record<string, keyof typeof RESIZE_HANDLE_CURSORS> = {
      nw: "top-left",
      ne: "top-right",
      sw: "bottom-left",
      se: "bottom-right",
      n: "top-center",
      s: "bottom-center",
      w: "middle-left",
      e: "middle-right",
    };

    const mappedHandle = cursorMap[handle];
    return mappedHandle ? RESIZE_HANDLE_CURSORS[mappedHandle] : null;
  };

  // Helper function to get cursor for image resize handles
  const getImageResizeCursor = (handle: string) => {
    const cursorMap: Record<string, keyof typeof RESIZE_HANDLE_CURSORS> = {
      nw: "top-left",
      ne: "top-right",
      sw: "bottom-left",
      se: "bottom-right",
      n: "top-center",
      s: "bottom-center",
      w: "middle-left",
      e: "middle-right",
    };

    const mappedHandle = cursorMap[handle];
    return mappedHandle ? RESIZE_HANDLE_CURSORS[mappedHandle] : null;
  };

  // Drag state - using refs to avoid stale closure issues
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const initialTransformRef = useRef<{
    offsetX: number;
    offsetY: number;
    scale: number;
  } | null>(null);

  // Track object dimensions to detect resize and adjust image position accordingly
  const previousObjectSize = useRef<{ width: number; height: number } | null>(
    null
  );
  const previousImagePosition = useRef<{ x: number; y: number } | null>(null);
  const fixedImageSize = useRef<{ width: number; height: number } | null>(null);

  // When object is resized in crop mode, adjust image offsets to keep image in same world position
  useEffect(() => {
    if (!previousObjectSize.current || !previousImagePosition.current) {
      // First render - store initial values
      previousObjectSize.current = {
        width: object.width,
        height: object.height,
      };

      // Calculate initial absolute image position in world coordinates
      const cssProperties = getEffectiveBackgroundStyles(
        object,
        undefined,
        cropMode.originalDimensions
          ? { originalDimensions: cropMode.originalDimensions }
          : undefined
      );
      const parseBackgroundPosition = (bgPos: string) => {
        if (bgPos.includes("%")) {
          const parts = bgPos.split(" ");
          const xPercent = parseFloat(parts[0]) || 0;
          const yPercent = parseFloat(parts[1] || parts[0]) || 0;
          return {
            x: (object.width * xPercent) / 100,
            y: (object.height * yPercent) / 100,
          };
        }
        return {
          x: (imageFill.offsetX || 0) * object.width,
          y: (imageFill.offsetY || 0) * object.height,
        };
      };

      const parseBackgroundSize = (bgSize: string) => {
        if (bgSize.includes("%")) {
          const parts = bgSize.split(" ");
          const widthPercent = parseFloat(parts[0]) || 100;
          const heightPercent = parseFloat(parts[1] || parts[0]) || 100;
          return {
            width: (object.width * widthPercent) / 100,
            height: (object.height * heightPercent) / 100,
          };
        }
        // Fallback
        const currentScale = imageFill.scale || 1;
        return {
          width: (imageFill.imageWidth || object.width) * currentScale,
          height: (imageFill.imageHeight || object.height) * currentScale,
        };
      };

      const imagePosition = parseBackgroundPosition(
        String(cssProperties.backgroundPosition || "0% 0%")
      );
      const imageSize = parseBackgroundSize(
        String(cssProperties.backgroundSize || "")
      );
      const objectAbsolutePos = getAbsolutePosition(
        object.id,
        useAppStore.getState().objects
      );
      const absoluteImageX = objectAbsolutePos.x + imagePosition.x;
      const absoluteImageY = objectAbsolutePos.y + imagePosition.y;

      previousImagePosition.current = { x: absoluteImageX, y: absoluteImageY };
      fixedImageSize.current = {
        width: imageSize.width,
        height: imageSize.height,
      };
      return;
    }

    // Check if object size changed
    const sizeChanged =
      object.width !== previousObjectSize.current.width ||
      object.height !== previousObjectSize.current.height;

    // DISABLED: In crop mode, the image should NOT respond to crop area size changes
    // The image should only respond to direct manipulation of the image overlay
    // The crop area (object) and image are completely independent in crop mode

    if (sizeChanged && !isDraggingRef.current && !isResizingRef.current) {
      // Just update tracking values without modifying the image
      previousObjectSize.current = {
        width: object.width,
        height: object.height,
      };
    }
  }, [
    object.width,
    object.height,
    object.x,
    object.y,
    object.id,
    imageFill.id,
    dispatch,
  ]);

  // Convert object bounds to screen coordinates (this is the CROP AREA)
  // Use absolute coordinates for nested objects
  const cropAreaObjectPos = getAbsolutePosition(
    object.id,
    useAppStore.getState().objects
  );
  const cropAreaScreen = {
    x: worldToScreen(
      { x: cropAreaObjectPos.x, y: cropAreaObjectPos.y },
      viewport
    ).x,
    y: worldToScreen(
      { x: cropAreaObjectPos.x, y: cropAreaObjectPos.y },
      viewport
    ).y,
    width: object.width * viewport.zoom,
    height: object.height * viewport.zoom,
  };

  // Calculate image area using the SAME logic as the rendered image
  // This ensures perfect alignment even when the object is resized
  const cssProperties = getEffectiveBackgroundStyles(
    object,
    undefined,
    cropMode.originalDimensions
      ? { originalDimensions: cropMode.originalDimensions }
      : undefined
  );

  // Parse CSS background-size to get the actual rendered image dimensions
  const parseBackgroundSize = (bgSize: string) => {
    if (bgSize.includes("%")) {
      const parts = bgSize.split(" ");
      const widthPercent = parseFloat(parts[0]) || 100;
      const heightPercent = parseFloat(parts[1] || parts[0]) || 100;

      // CRITICAL: In crop mode, the overlay should show the ACTUAL image bounds
      // Priority: currentTransform (during resize) > originalDimensions (initial entry)
      if (imageFill.fit === "crop") {
        // Use currentTransform if available (during resize operations)
        if (cropMode.currentTransform) {
          const currentWidth = cropMode.currentTransform.imageWidth;
          const currentHeight = cropMode.currentTransform.imageHeight;

          return {
            width: currentWidth,
            height: currentHeight,
          };
        }

        // Fall back to originalDimensions (initial crop mode entry)
        if (cropMode.originalDimensions) {
          const originalWidth = cropMode.originalDimensions.width;
          const originalHeight = cropMode.originalDimensions.height;

          return {
            width: originalWidth,
            height: originalHeight,
          };
        }
      } else {
        // For other modes, use percentage-based calculation
        return {
          width: (object.width * widthPercent) / 100,
          height: (object.height * heightPercent) / 100,
        };
      }
    }
    // Fallback
    const currentScale = imageFill.scale || 1;
    return {
      width: (imageFill.imageWidth || object.width) * currentScale,
      height: (imageFill.imageHeight || object.height) * currentScale,
    };
  };

  // Parse CSS background-position to get the actual rendered image position
  const parseBackgroundPosition = (bgPos: string) => {
    // CRITICAL: In crop mode, use current fill offsets to match the image position
    if (cropMode.originalDimensions && imageFill.fit === "crop") {
      const imageWidth = cropMode.originalDimensions.width;
      const imageHeight = cropMode.originalDimensions.height;

      // Use current fill offsets to position overlay (same as image calculation)
      const currentOffsetX = imageFill.offsetX || 0;
      const currentOffsetY = imageFill.offsetY || 0;

      // Convert offsets to pixel position (same as image calculation)
      const imageX = ((currentOffsetX * 100) / 100) * object.width;
      const imageY = ((currentOffsetY * 100) / 100) * object.height;

      return {
        x: imageX,
        y: imageY,
      };
    }

    // For non-crop modes, parse the percentage normally
    if (bgPos.includes("%")) {
      const parts = bgPos.split(" ");
      const xPercent = parseFloat(parts[0]) || 0;
      const yPercent = parseFloat(parts[1] || parts[0]) || 0;
      return {
        x: (object.width * xPercent) / 100,
        y: (object.height * yPercent) / 100,
      };
    }
    // Fallback
    return {
      x: (imageFill.offsetX || 0) * object.width,
      y: (imageFill.offsetY || 0) * object.height,
    };
  };

  // CRITICAL: We need to use the ADJUSTED CSS properties, not the original ones
  // The background image uses adjusted properties from the crop mode logic in fills.ts

  let adjustedBackgroundSize = cssProperties.backgroundSize || "100%";
  let adjustedBackgroundPosition =
    cssProperties.backgroundPosition || "0px 0px";

  // If we're in crop mode, calculate the same adjustments as fills.ts
  if (cropMode.originalDimensions && imageFill.fit === "crop") {
    const originalWidth = cropMode.originalDimensions.width;
    const originalHeight = cropMode.originalDimensions.height;
    const currentWidth = object.width;
    const currentHeight = object.height;

    // Calculate the same scale adjustment as the background image
    const scaleFactorX = currentWidth / originalWidth;
    const scaleFactorY = currentHeight / originalHeight;
    const adjustedScaleX =
      (imageFill.scaleX || imageFill.scale || 1) / scaleFactorX;
    const adjustedScaleY =
      (imageFill.scaleY || imageFill.scale || 1) / scaleFactorY;
    const adjustedScale = (adjustedScaleX + adjustedScaleY) / 2;

    adjustedBackgroundSize = `${adjustedScale * 100}%`;
  }

  const imageSize = parseBackgroundSize(String(adjustedBackgroundSize));
  const imagePosition = parseBackgroundPosition(
    String(adjustedBackgroundPosition)
  );

  // Use the adjusted properties for overlay calculation
  // CRITICAL: In crop mode, always use the freshly calculated size, don't use cached values
  // that might be from before the crop mode was activated
  let imageWorldWidth = imageSize.width;
  let imageWorldHeight = imageSize.height;

  // Calculate position using absolute coordinates for nested objects
  const objectAbsolutePos = getAbsolutePosition(
    object.id,
    useAppStore.getState().objects
  );
  let imageWorldX = objectAbsolutePos.x + imagePosition.x;
  let imageWorldY = objectAbsolutePos.y + imagePosition.y;

  // If this is the first render, store the initial values

  // Convert image world coordinates to screen coordinates (this is the IMAGE AREA)
  const imageAreaScreen = {
    x: worldToScreen({ x: imageWorldX, y: imageWorldY }, viewport).x,
    y: worldToScreen({ x: imageWorldX, y: imageWorldY }, viewport).y,
    width: imageWorldWidth * viewport.zoom,
    height: imageWorldHeight * viewport.zoom,
  };

  // COMPREHENSIVE DEBUG: Let's understand the coordinate mismatch
  const cropAreaBounds = {
    worldX: object.x,
    worldY: object.y,
    worldWidth: object.width,
    worldHeight: object.height,
  };

  const overlayBounds = {
    worldX: imageWorldX,
    worldY: imageWorldY,
    worldWidth: imageWorldWidth,
    worldHeight: imageWorldHeight,
  };

  const overlap = {
    left: Math.max(cropAreaBounds.worldX, overlayBounds.worldX),
    top: Math.max(cropAreaBounds.worldY, overlayBounds.worldY),
    right: Math.min(
      cropAreaBounds.worldX + cropAreaBounds.worldWidth,
      overlayBounds.worldX + overlayBounds.worldWidth
    ),
    bottom: Math.min(
      cropAreaBounds.worldY + cropAreaBounds.worldHeight,
      overlayBounds.worldY + overlayBounds.worldHeight
    ),
  };

  const overlapArea = {
    x: overlap.left,
    y: overlap.top,
    width: Math.max(0, overlap.right - overlap.left),
    height: Math.max(0, overlap.bottom - overlap.top),
  };

  // Update the store with current transform only when drag ends (not during drag)
  const updateCurrentTransform = useCallback(() => {
    updateCropModeTransform({
      imageWorldX,
      imageWorldY,
      imageWidth: imageWorldWidth,
      imageHeight: imageWorldHeight,
    });
  }, [
    imageWorldX,
    imageWorldY,
    imageWorldWidth,
    imageWorldHeight,
    updateCropModeTransform,
  ]);

  // Drag handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      initialTransformRef.current = {
        offsetX: imageFill.offsetX || 0,
        offsetY: imageFill.offsetY || 0,
        scale: imageFill.scale || 1,
      };

      // Use pointer capture for better tracking
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [imageFill]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (
        !isDraggingRef.current ||
        !dragStartRef.current ||
        !initialTransformRef.current
      )
        return;

      e.preventDefault();
      e.stopPropagation();

      const deltaX = (e.clientX - dragStartRef.current.x) / viewport.zoom;
      const deltaY = (e.clientY - dragStartRef.current.y) / viewport.zoom;

      const newOffsetX =
        initialTransformRef.current.offsetX + deltaX / object.width;
      const newOffsetY =
        initialTransformRef.current.offsetY + deltaY / object.height;

      dispatch({
        type: "object.updated",
        payload: {
          id: object.id,
          changes: {
            fills: object.fills?.map((f: any) =>
              f.id === imageFill.id
                ? { ...f, offsetX: newOffsetX, offsetY: newOffsetY }
                : f
            ),
          },
        },
      });

      // Update tracked absolute position when user drags the image
      if (previousImagePosition.current) {
        const dragObjectAbsolutePos = getAbsolutePosition(
          object.id,
          useAppStore.getState().objects
        );
        const newAbsoluteX =
          dragObjectAbsolutePos.x + newOffsetX * object.width;
        const newAbsoluteY =
          dragObjectAbsolutePos.y + newOffsetY * object.height;
        previousImagePosition.current = { x: newAbsoluteX, y: newAbsoluteY };
      }
    },
    [viewport.zoom, object, imageFill.id, dispatch, previousImagePosition]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;

      e.preventDefault();
      e.stopPropagation();

      isDraggingRef.current = false;
      dragStartRef.current = null;
      initialTransformRef.current = null;

      // Update the store with final transform state for exit calculations
      updateCurrentTransform();

      (e.target as Element).releasePointerCapture(e.pointerId);
    },
    [updateCurrentTransform]
  );

  // Crop area resize handlers
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef<{ x: number; y: number } | null>(null);
  const resizePositionRef = useRef<string | null>(null);
  const initialObjectSizeRef = useRef<{
    width: number;
    height: number;
    x: number;
    y: number;
  } | null>(null);

  const handleCropResizeStart = useCallback(
    (e: React.PointerEvent, position: string) => {
      e.preventDefault();
      e.stopPropagation();

      isResizingRef.current = true;
      resizeStartRef.current = { x: e.clientX, y: e.clientY };
      resizePositionRef.current = position;
      initialObjectSizeRef.current = {
        width: object.width,
        height: object.height,
        x: object.x,
        y: object.y,
      };

      // Set appropriate resize cursor
      const cursorType = getCropResizeCursor(position);
      if (cursorType) {
        setCursor(cursorType);
      }

      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [object, getCropResizeCursor, setCursor]
  );

  const handleCropResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (
        !isResizingRef.current ||
        !resizeStartRef.current ||
        !resizePositionRef.current ||
        !initialObjectSizeRef.current
      )
        return;

      e.preventDefault();
      e.stopPropagation();

      const deltaX = (e.clientX - resizeStartRef.current.x) / viewport.zoom;
      const deltaY = (e.clientY - resizeStartRef.current.y) / viewport.zoom;
      const position = resizePositionRef.current;
      const initial = initialObjectSizeRef.current;

      let newWidth = initial.width;
      let newHeight = initial.height;
      let newX = initial.x;
      let newY = initial.y;

      // Calculate new dimensions based on resize handle position
      switch (position) {
        case "nw":
          newWidth = initial.width - deltaX;
          newHeight = initial.height - deltaY;
          newX = initial.x + deltaX;
          newY = initial.y + deltaY;
          break;
        case "ne":
          newWidth = initial.width + deltaX;
          newHeight = initial.height - deltaY;
          newY = initial.y + deltaY;
          break;
        case "sw":
          newWidth = initial.width - deltaX;
          newHeight = initial.height + deltaY;
          newX = initial.x + deltaX;
          break;
        case "se":
          newWidth = initial.width + deltaX;
          newHeight = initial.height + deltaY;
          break;
        case "n":
          newHeight = initial.height - deltaY;
          newY = initial.y + deltaY;
          break;
        case "s":
          newHeight = initial.height + deltaY;
          break;
        case "w":
          newWidth = initial.width - deltaX;
          newX = initial.x + deltaX;
          break;
        case "e":
          newWidth = initial.width + deltaX;
          break;
      }

      // Minimum size constraints
      newWidth = Math.max(20, newWidth);
      newHeight = Math.max(20, newHeight);

      // Round values for clean pixel alignment
      newWidth = Math.round(newWidth);
      newHeight = Math.round(newHeight);
      newX = Math.round(newX);
      newY = Math.round(newY);

      // Update the object
      dispatch({
        type: "object.updated",
        payload: {
          id: object.id,
          changes: {
            width: newWidth,
            height: newHeight,
            x: newX,
            y: newY,
          },
        },
      });
    },
    [viewport.zoom, object.id, dispatch]
  );

  const handleCropResizeEnd = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizingRef.current) return;

      e.preventDefault();
      e.stopPropagation();

      isResizingRef.current = false;
      resizeStartRef.current = null;
      resizePositionRef.current = null;
      initialObjectSizeRef.current = null;

      // Reset cursor
      resetCursor();

      (e.target as Element).releasePointerCapture(e.pointerId);
    },
    [resetCursor]
  );

  // Image resize handlers
  const imageIsResizingRef = useRef(false);
  const imageResizeStartRef = useRef<{ x: number; y: number } | null>(null);
  const imageResizeHandleRef = useRef<string | null>(null);
  const initialImageResizeSizeRef = useRef<{
    width: number;
    height: number;
    x: number;
    y: number;
  } | null>(null);
  const finalResizeSizeRef = useRef<{
    width: number;
    height: number;
    x: number;
    y: number;
  } | null>(null);

  const handleImageResizeMove = useCallback(
    (e: PointerEvent) => {
      if (
        !imageIsResizingRef.current ||
        !imageResizeStartRef.current ||
        !initialImageResizeSizeRef.current ||
        !imageResizeHandleRef.current
      )
        return;

      e.preventDefault();
      e.stopPropagation();

      const deltaX =
        (e.clientX - imageResizeStartRef.current.x) / viewport.zoom;
      const deltaY =
        (e.clientY - imageResizeStartRef.current.y) / viewport.zoom;
      const handle = imageResizeHandleRef.current;

      // Check if Ctrl is pressed (same key on Mac and Windows)
      const isCtrlPressed = e.ctrlKey || e.metaKey;

      // Calculate original aspect ratio
      const originalAspectRatio =
        initialImageResizeSizeRef.current.width /
        initialImageResizeSizeRef.current.height;

      let newWidth = initialImageResizeSizeRef.current.width;
      let newHeight = initialImageResizeSizeRef.current.height;
      let newX = initialImageResizeSizeRef.current.x;
      let newY = initialImageResizeSizeRef.current.y;

      // Apply resize based on handle position
      if (isCtrlPressed) {
        // Free resize mode (Ctrl pressed) - current behavior
        switch (handle) {
          case "se": // Southeast corner
            newWidth = Math.max(
              50,
              initialImageResizeSizeRef.current.width + deltaX
            );
            newHeight = Math.max(
              50,
              initialImageResizeSizeRef.current.height + deltaY
            );
            break;
          case "sw": // Southwest corner
            newWidth = Math.max(
              50,
              initialImageResizeSizeRef.current.width - deltaX
            );
            newHeight = Math.max(
              50,
              initialImageResizeSizeRef.current.height + deltaY
            );
            newX = initialImageResizeSizeRef.current.x + deltaX;
            break;
          case "ne": // Northeast corner
            newWidth = Math.max(
              50,
              initialImageResizeSizeRef.current.width + deltaX
            );
            newHeight = Math.max(
              50,
              initialImageResizeSizeRef.current.height - deltaY
            );
            newY = initialImageResizeSizeRef.current.y + deltaY;
            break;
          case "nw": // Northwest corner
            newWidth = Math.max(
              50,
              initialImageResizeSizeRef.current.width - deltaX
            );
            newHeight = Math.max(
              50,
              initialImageResizeSizeRef.current.height - deltaY
            );
            newX = initialImageResizeSizeRef.current.x + deltaX;
            newY = initialImageResizeSizeRef.current.y + deltaY;
            break;
          case "n": // North edge
            newHeight = Math.max(
              50,
              initialImageResizeSizeRef.current.height - deltaY
            );
            newY = initialImageResizeSizeRef.current.y + deltaY;
            break;
          case "s": // South edge
            newHeight = Math.max(
              50,
              initialImageResizeSizeRef.current.height + deltaY
            );
            break;
          case "w": // West edge
            newWidth = Math.max(
              50,
              initialImageResizeSizeRef.current.width - deltaX
            );
            newX = initialImageResizeSizeRef.current.x + deltaX;
            break;
          case "e": // East edge
            newWidth = Math.max(
              50,
              initialImageResizeSizeRef.current.width + deltaX
            );
            break;
        }
      } else {
        // Aspect ratio constrained resize (default)
        const initial = initialImageResizeSizeRef.current;

        // Determine primary resize direction and calculate constrained dimensions
        let primaryDelta = 0;
        let widthMultiplier = 0;
        let heightMultiplier = 0;

        switch (handle) {
          case "se": // Southeast corner - use larger delta
            primaryDelta =
              Math.abs(deltaX) > Math.abs(deltaY)
                ? deltaX
                : deltaY * originalAspectRatio;
            widthMultiplier = 1;
            heightMultiplier = 1;
            break;
          case "sw": // Southwest corner
            primaryDelta =
              Math.abs(deltaX) > Math.abs(deltaY)
                ? -deltaX
                : deltaY * originalAspectRatio;
            widthMultiplier = -1;
            heightMultiplier = 1;
            break;
          case "ne": // Northeast corner
            primaryDelta =
              Math.abs(deltaX) > Math.abs(deltaY)
                ? deltaX
                : deltaY * originalAspectRatio;
            widthMultiplier = 1;
            heightMultiplier = -1;
            break;
          case "nw": // Northwest corner
            primaryDelta =
              Math.abs(deltaX) > Math.abs(deltaY)
                ? deltaX
                : deltaY * originalAspectRatio;
            widthMultiplier = -1;
            heightMultiplier = -1;
            break;
          case "n": // North edge - resize height, adjust width proportionally
            primaryDelta = deltaY;
            widthMultiplier = 0; // Don't change width for edge handles
            heightMultiplier = -1;
            break;
          case "s": // South edge
            primaryDelta = deltaY;
            widthMultiplier = 0;
            heightMultiplier = 1;
            break;
          case "w": // West edge - resize width, adjust height proportionally
            primaryDelta = deltaX;
            widthMultiplier = -1;
            heightMultiplier = 0; // Don't change height for edge handles
            break;
          case "e": // East edge
            primaryDelta = deltaX;
            widthMultiplier = 1;
            heightMultiplier = 0;
            break;
        }

        // Calculate new dimensions maintaining aspect ratio
        if (widthMultiplier !== 0) {
          newWidth = Math.max(
            50,
            initial.width + primaryDelta * Math.sign(widthMultiplier)
          );
          newHeight = Math.max(50, newWidth / originalAspectRatio);
        } else {
          // Edge handles: resize one dimension and calculate the other
          if (heightMultiplier !== 0) {
            newHeight = Math.max(
              50,
              initial.height +
                (primaryDelta / originalAspectRatio) *
                  Math.sign(heightMultiplier)
            );
            newWidth = Math.max(50, newHeight * originalAspectRatio);
          }
        }

        // Adjust position for handles that move the origin
        if (handle.includes("w")) {
          newX = initial.x + (initial.width - newWidth);
        }
        if (handle.includes("n")) {
          newY = initial.y + (initial.height - newHeight);
        }

        // For edge handles, center the overlay on the opposite edge
        if (handle === "n" || handle === "s") {
          // Vertical edge resize: center horizontally
          newX = initial.x + (initial.width - newWidth) / 2;
        }
        if (handle === "w" || handle === "e") {
          // Horizontal edge resize: center vertically
          newY = initial.y + (initial.height - newHeight) / 2;
        }
      }

      // Update image fill with new size and position
      // Convert world coordinates back to relative offsets and scale
      const objectAbsolutePos = getAbsolutePosition(
        object.id,
        useAppStore.getState().objects
      );

      // Convert absolute world coordinates to object-relative offsets
      // CRITICAL: The image rendering uses object.x/object.y (relative coordinates)
      // So we need to convert from absolute world coordinates to relative coordinates
      const newOffsetX = (newX - objectAbsolutePos.x) / object.width;
      const newOffsetY = (newY - objectAbsolutePos.y) / object.height;

      const newScaleX = newWidth / object.width;
      const newScaleY = newHeight / object.height;
      const newScale = Math.max(newScaleX, newScaleY); // For backward compatibility

      // Store the final resize values for use in handleImageResizeEnd
      finalResizeSizeRef.current = {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
      };

      // Update the store's currentTransform immediately for real-time visual feedback
      updateCropModeTransform({
        imageWorldX: newX,
        imageWorldY: newY,
        imageWidth: newWidth,
        imageHeight: newHeight,
      });

      dispatch({
        type: "object.updated",
        payload: {
          id: object.id,
          changes: {
            fills: object.fills?.map((f: any) =>
              f.id === imageFill.id
                ? {
                    ...f,
                    offsetX: newOffsetX,
                    offsetY: newOffsetY,
                    scale: newScale,
                    scaleX: newScaleX,
                    scaleY: newScaleY,
                  }
                : f
            ),
          },
        },
      });
    },
    [object, imageFill, dispatch, viewport.zoom, updateCropModeTransform]
  );

  const handleImageResizeEnd = useCallback(
    (e: PointerEvent) => {
      if (!imageIsResizingRef.current) return;

      // Update store with final transform using the last resize values
      if (finalResizeSizeRef.current) {
        updateCropModeTransform({
          imageWorldX: finalResizeSizeRef.current.x,
          imageWorldY: finalResizeSizeRef.current.y,
          imageWidth: finalResizeSizeRef.current.width,
          imageHeight: finalResizeSizeRef.current.height,
        });
      } else {
        // Fallback to current values
        updateCurrentTransform();
      }

      imageIsResizingRef.current = false;
      imageResizeHandleRef.current = null;
      imageResizeStartRef.current = null;
      initialImageResizeSizeRef.current = null;
      finalResizeSizeRef.current = null;

      // Reset cursor
      resetCursor();

      // Remove global event listeners
      document.removeEventListener("pointermove", handleImageResizeMove);
      document.removeEventListener("pointerup", handleImageResizeEnd);
    },
    [
      updateCurrentTransform,
      updateCropModeTransform,
      handleImageResizeMove,
      resetCursor,
    ]
  );

  const handleImageResizeStart = useCallback(
    (e: React.PointerEvent, handle: string) => {
      e.preventDefault();
      e.stopPropagation();

      // Prevent resizing when space panning is active
      const isSpacePanning = (window as any).__figmaCloneSpacePanning;
      if (isSpacePanning) {
        return; // Don't start resize when space panning
      }

      imageIsResizingRef.current = true;
      imageResizeHandleRef.current = handle;
      imageResizeStartRef.current = { x: e.clientX, y: e.clientY };

      // Set appropriate resize cursor
      const cursorType = getImageResizeCursor(handle);
      if (cursorType) {
        setCursor(cursorType);
      }

      // Store initial image size and position
      initialImageResizeSizeRef.current = {
        width: imageWorldWidth,
        height: imageWorldHeight,
        x: imageWorldX,
        y: imageWorldY,
      };

      // Add global event listeners for move and end
      document.addEventListener("pointermove", handleImageResizeMove);
      document.addEventListener("pointerup", handleImageResizeEnd);

      // Use pointer capture for better tracking
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [
      imageWorldWidth,
      imageWorldHeight,
      imageWorldX,
      imageWorldY,
      handleImageResizeMove,
      handleImageResizeEnd,
      getImageResizeCursor,
      setCursor,
    ]
  );

  return (
    <>
      {/* Crop Area - shows the node boundary (what will be visible) */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: cropAreaScreen.x,
          top: cropAreaScreen.y,
          width: cropAreaScreen.width,
          height: cropAreaScreen.height,
          zIndex: 1001,
          backgroundColor: "transparent", // No background
          // outline: "1px solid rgba(59, 130, 246, 1)", // More subtle blue outline
          outlineOffset: "0px", // Keep outline tight to the element
        }}
      >
        {/* Crop Area Corner Marks (Crop Style) - Touching outside the area */}
        {[
          { position: "nw", cursor: "nw-resize", x: -3, y: -3, rotation: 0 },
          {
            position: "ne",
            cursor: "ne-resize",
            x: cropAreaScreen.width - 13, // -16 + 3 to account for rotation
            y: -3,
            rotation: 90,
          },
          {
            position: "sw",
            cursor: "sw-resize",
            x: -3,
            y: cropAreaScreen.height - 13, // -16 + 3 to account for rotation
            rotation: 270,
          },
          {
            position: "se",
            cursor: "se-resize",
            x: cropAreaScreen.width - 13, // -16 + 3 to account for rotation
            y: cropAreaScreen.height - 13, // -16 + 3 to account for rotation
            rotation: 180,
          },
        ].map(({ position, cursor, x, y, rotation }) => (
          <div
            key={position}
            className="absolute pointer-events-auto"
            data-crop-mode="true"
            style={{
              left: x,
              top: y,
              width: 16,
              height: 16,
              zIndex: 1003,
              transform: `rotate(${rotation}deg)`,
            }}
            onPointerDown={(e) => handleCropResizeStart(e, position)}
            onPointerMove={handleCropResizeMove}
            onPointerUp={handleCropResizeEnd}
            onPointerEnter={() => {
              const cursorType = getCropResizeCursor(position);
              if (cursorType) setCursor(cursorType);
            }}
            onPointerLeave={() => resetCursor()}
          >
            {/* Crop Mark Lines */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 10,
                height: 3,
                backgroundColor: "rgba(59, 130, 246, 1)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 3,
                height: 10,
                backgroundColor: "rgba(59, 130, 246, 1)",
              }}
            />
          </div>
        ))}

        {/* Crop Area Midpoint Edge Indicators */}
        {[
          {
            position: "n",
            x: cropAreaScreen.width / 2 - 5, // Center horizontally, 10px wide line
            y: -3, // Same as corner marks - just outside touching
            width: 10,
            height: 3,
          },
          {
            position: "s",
            x: cropAreaScreen.width / 2 - 5,
            y: cropAreaScreen.height, // At the bottom edge
            width: 10,
            height: 3,
          },
          {
            position: "w",
            x: -3, // Same as corner marks - just outside touching
            y: cropAreaScreen.height / 2 - 5, // Center vertically, 10px tall line
            width: 3,
            height: 10,
          },
          {
            position: "e",
            x: cropAreaScreen.width, // At the right edge
            y: cropAreaScreen.height / 2 - 5,
            width: 3,
            height: 10,
          },
        ].map(({ position, x, y, width, height }) => (
          <div
            key={`crop-midpoint-${position}`}
            className="absolute pointer-events-none"
            style={{
              left: x,
              top: y,
              width,
              height,
              backgroundColor: "rgba(59, 130, 246, 1)", // Same blue as crop marks
              zIndex: 1001, // Below crop marks but above image
            }}
          />
        ))}

        {/* Crop Area Edge Resize Zones */}
        {[
          {
            position: "n",
            cursor: "n-resize",
            x: 0,
            y: -4,
            width: cropAreaScreen.width,
            height: 8,
          },
          {
            position: "s",
            cursor: "s-resize",
            x: 0,
            y: cropAreaScreen.height - 4,
            width: cropAreaScreen.width,
            height: 8,
          },
          {
            position: "w",
            cursor: "w-resize",
            x: -4,
            y: 0,
            width: 8,
            height: cropAreaScreen.height,
          },
          {
            position: "e",
            cursor: "e-resize",
            x: cropAreaScreen.width - 4,
            y: 0,
            width: 8,
            height: cropAreaScreen.height,
          },
        ].map(({ position, cursor, x, y, width, height }) => (
          <div
            key={position}
            className="absolute pointer-events-auto"
            data-crop-mode="true"
            style={{
              left: x,
              top: y,
              width,
              height,
              zIndex: 1002,
              backgroundColor: "transparent", // Invisible but interactive
            }}
            onPointerDown={(e) => handleCropResizeStart(e, position)}
            onPointerMove={handleCropResizeMove}
            onPointerUp={handleCropResizeEnd}
            onPointerEnter={() => {
              const cursorType = getCropResizeCursor(position);
              if (cursorType) setCursor(cursorType);
            }}
            onPointerLeave={() => resetCursor()}
          />
        ))}
      </div>

      {/* Image Area - shows the full image that can be moved/resized */}
      <div
        className="absolute pointer-events-auto"
        data-crop-mode="true"
        style={{
          left: imageAreaScreen.x,
          top: imageAreaScreen.y,
          width: imageAreaScreen.width,
          height: imageAreaScreen.height,
          zIndex: 1000,
          backgroundImage: `url(${imageFill.imageUrl})`,
          backgroundSize: "100% 100%",
          backgroundPosition: "0 0",
          backgroundRepeat: "no-repeat",
          opacity: 0.4,
          outline: "1px solid var(--ramp-blue-500)", // More subtle green outline
          outlineOffset: "0px", // Keep outline tight to the element
          filter: adjustmentsToCssFilter(imageFill.adjustments), // Apply image adjustments to overlay
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerEnter={() => setCursor("move")}
        onPointerLeave={() => resetCursor()}
        onContextMenu={(e) => {
          // Always prevent context menu in crop mode to avoid conflicts with Ctrl+click
          e.preventDefault();
          e.stopPropagation();
        }}
      />

      {/* Image Resize Handles */}
      {[
        { position: "nw", cursor: "nw-resize", x: -4, y: -4 },
        {
          position: "ne",
          cursor: "ne-resize",
          x: imageAreaScreen.width - 4,
          y: -4,
        },
        {
          position: "sw",
          cursor: "sw-resize",
          x: -4,
          y: imageAreaScreen.height - 4,
        },
        {
          position: "se",
          cursor: "se-resize",
          x: imageAreaScreen.width - 4,
          y: imageAreaScreen.height - 4,
        },
      ].map(({ position, cursor, x, y }) => (
        <div
          key={`image-${position}`}
          className="absolute pointer-events-auto"
          data-crop-mode="true"
          style={{
            left: imageAreaScreen.x + x,
            top: imageAreaScreen.y + y,
            width: 8,
            height: 8,
            zIndex: 1004, // Higher than crop handles
            backgroundColor: "white",
            border: "1px solid var(--ramp-blue-500)",
          }}
          onPointerDown={(e) => handleImageResizeStart(e, position)}
          onPointerEnter={() => {
            const cursorType = getImageResizeCursor(position);
            if (cursorType) setCursor(cursorType);
          }}
          onPointerLeave={() => resetCursor()}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      ))}

      {/* Image Edge Resize Zones */}
      {[
        {
          position: "n",
          cursor: "n-resize",
          x: 0,
          y: -4,
          width: imageAreaScreen.width,
          height: 8,
        },
        {
          position: "s",
          cursor: "s-resize",
          x: 0,
          y: imageAreaScreen.height - 4,
          width: imageAreaScreen.width,
          height: 8,
        },
        {
          position: "w",
          cursor: "w-resize",
          x: -4,
          y: 0,
          width: 8,
          height: imageAreaScreen.height,
        },
        {
          position: "e",
          cursor: "e-resize",
          x: imageAreaScreen.width - 4,
          y: 0,
          width: 8,
          height: imageAreaScreen.height,
        },
      ].map(({ position, cursor, x, y, width, height }) => (
        <div
          key={`image-edge-${position}`}
          className="absolute pointer-events-auto"
          data-crop-mode="true"
          style={{
            left: imageAreaScreen.x + x,
            top: imageAreaScreen.y + y,
            width,
            height,
            zIndex: 1003,
            backgroundColor: "transparent", // Invisible but interactive
          }}
          onPointerDown={(e) => handleImageResizeStart(e, position)}
          onPointerEnter={() => {
            const cursorType = getImageResizeCursor(position);
            if (cursorType) setCursor(cursorType);
          }}
          onPointerLeave={() => resetCursor()}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      ))}

      {/* Crop Area Dimension Pill */}
      <div
        className="absolute bg-[var(--ramp-blue-500)] text-white text-[11px] h-4 font-medium px-[3px] rounded-[2px] pointer-events-none"
        style={{
          left: cropAreaScreen.x + cropAreaScreen.width / 2,
          top: cropAreaScreen.y + cropAreaScreen.height + 6, // Position below the crop area
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          zIndex: 1005, // Above everything else
        }}
      >
        {Math.round(object.width)} × {Math.round(object.height)}
      </div>

      {/* Labels */}
    </>
  );
}
