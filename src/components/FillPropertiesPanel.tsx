"use client";

import { useColorChange } from "@/core/hooks/useColorChange";
import { useAppStore } from "@/core/state/store";
import { getAbsolutePosition } from "@/core/utils/coordinates";
import {
  addFill,
  createCheckerboardPattern,
  createImageFill,
  createSolidFill,
  getMostFrequentFillCombination,
  isEmptyImageUrl,
} from "@/core/utils/fills";
import {
  CanvasObject,
  Fill,
  ImageAdjustments,
  ImageFill,
  SolidFill,
} from "@/types/canvas";
import Color from "color";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon24EyeSmall } from "./icons/icon-24-eye-small";
import { Icon24HiddenSmall } from "./icons/icon-24-hidden-small";
import { Icon24MinusSmall } from "./icons/icon-24-minus-small";
import { Icon24Plus } from "./icons/icon-24-plus";
import FillPopoverContent from "./ui/FillPopoverContent";
import FillTrigger from "./ui/FillTrigger";
import PropertyPopover from "./ui/PropertyPopover";
import PropertyPopoverHeader from "./ui/PropertyPopoverHeader";

interface FillPropertiesPanelProps {
  objects: CanvasObject[];
}

// Helper functions to convert between hex and rgba
const hexToRgba = (hex: string, alpha: number = 1) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b, a: alpha };
};

const rgbaToHex = (rgba: { r: number; g: number; b: number; a: number }) => {
  return Color.rgb(rgba.r, rgba.g, rgba.b).hex().toUpperCase();
};

export default function FillPropertiesPanel({
  objects,
}: FillPropertiesPanelProps) {
  const dispatch = useAppStore((state) => state.dispatch);
  const setCropMode = useAppStore((state) => state.setCropMode);
  const colorChange = useColorChange({ undoDelay: 500 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fillSectionRef = useRef<HTMLDivElement>(null);

  // State for color/image picker popover
  const [activePopover, setActivePopoverState] = useState<string | null>(null);

  // Wrap setActivePopover with logging
  const setActivePopover = (value: string | null) => {
    setActivePopoverState(value);
  };
  const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState<"solid" | "image">("solid");
  // PropertyPopover will handle all click protection

  // Handle crop mode deactivation when popover closes
  useEffect(() => {
    if (!activePopover) {
      setCropMode(false);
    }
  }, [activePopover]); // setCropMode is stable in Zustand

  // Listen for double-click events to open fill popover
  useEffect(() => {
    const handleOpenFillPopover = (event: CustomEvent) => {
      const { objectId, fillId, position } = event.detail;

      // Only handle if this panel is for the correct object
      if (objects.length === 1 && objects[0].id === objectId) {
        // Set up the popover position and state (same as normal fill click)
        if (fillSectionRef.current) {
          const fillSectionRect =
            fillSectionRef.current.getBoundingClientRect();
          const x = fillSectionRect.left - 240; // 240px width + gap to the left
          const y = fillSectionRect.top;
          setPickerPosition({ x, y });
        } else {
          // Fallback if ref is not available
          setPickerPosition({ x: position.x - 240, y: position.y });
        }

        setActiveTab("image"); // Switch to image tab
        setActivePopover(fillId);

        // Check if this is a crop image fill and activate crop mode
        const imageFill = objects[0].fills?.find((f) => f.id === fillId) as any;
        if (imageFill?.type === "image" && imageFill.fit === "crop") {
          // Calculate the correct original dimensions for re-entering crop mode
          const originalDimensions = calculateOriginalDimensions(
            objects[0],
            imageFill,
            "crop" // previousFit is "crop" when re-entering crop mode
          );

          setCropMode(true, objects[0].id, fillId, originalDimensions);
        }
      }
    };

    window.addEventListener(
      "openFillPopover",
      handleOpenFillPopover as EventListener
    );

    return () => {
      window.removeEventListener(
        "openFillPopover",
        handleOpenFillPopover as EventListener
      );
    };
  }, [objects, setActivePopover, setPickerPosition, setActiveTab, setCropMode]);

  // Get fills from selected objects, handle mixed states
  const { fills, hasMixedFills } = useMemo(() => {
    if (objects.length === 0) return { fills: [], hasMixedFills: false };

    if (objects.length === 1) {
      return {
        fills: (objects[0].fills || []) as Fill[],
        hasMixedFills: false,
      };
    }

    // Check if all objects have the same fills
    const firstObjectFills = objects[0].fills || [];

    // More robust comparison - check if fills are functionally the same
    const allSame = objects.every((obj) => {
      const objFills = obj.fills || [];

      // If different number of fills, definitely mixed
      if (objFills.length !== firstObjectFills.length) return false;

      // Check each fill matches (considering only essential properties)
      return objFills.every((fill, index) => {
        const firstFill = firstObjectFills[index];
        if (!firstFill) return false;

        // Compare type first
        if (fill.type !== firstFill.type) return false;

        // Compare essential properties based on type
        if (fill.type === "solid" && firstFill.type === "solid") {
          return (
            fill.color === firstFill.color &&
            Math.abs(fill.opacity - firstFill.opacity) < 0.001
          );
        }

        if (fill.type === "image" && firstFill.type === "image") {
          return (
            (fill as ImageFill).imageUrl ===
              (firstFill as ImageFill).imageUrl &&
            Math.abs(fill.opacity - firstFill.opacity) < 0.001
          );
        }

        // For other types, fall back to basic comparison
        return fill.id === firstFill.id;
      });
    });

    if (allSame) {
      return { fills: firstObjectFills as Fill[], hasMixedFills: false };
    } else {
      // Get most frequent fills for mixed state
      const mostFrequent = getMostFrequentFillCombination(objects);
      return { fills: mostFrequent as Fill[], hasMixedFills: true };
    }
  }, [objects]);

  // Handlers for fill operations
  const handleAddFill = (type: "solid" | "image" = "solid") => {
    if (hasMixedFills) {
      // Apply the most common fill combination to all objects
      const mostFrequent = getMostFrequentFillCombination(objects);
      objects.forEach((object) => {
        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes: { fills: mostFrequent },
            previousValues: { fills: object.fills },
          },
        });
      });
      return;
    }

    const newFill =
      type === "solid" ? createSolidFill("#000000") : createImageFill();

    objects.forEach((object) => {
      const updatedObject = addFill(object, newFill);
      dispatch({
        type: "object.updated",
        payload: {
          id: object.id,
          changes: { fills: updatedObject.fills },
          previousValues: { fills: object.fills },
        },
      });
    });

    // Auto-select the new fill in the flyout
    if (!fillSectionRef.current) return;

    const fillSectionRect = fillSectionRef.current.getBoundingClientRect();
    const x = fillSectionRect.left - 240;
    const y = fillSectionRect.top;

    setPickerPosition({ x, y });
    setActivePopover(newFill.id);
  };

  const handleChangeFillColor = (
    fillId: string,
    color: string,
    opacity?: number
  ) => {
    // Find the fill index in the unified fills array
    const unifiedFillIndex = fills.findIndex((f) => f.id === fillId);
    if (unifiedFillIndex === -1) return;

    objects.forEach((object) => {
      const objectFills = object.fills || [];
      // Use the same index position across all objects instead of matching by ID
      if (
        unifiedFillIndex < objectFills.length &&
        objectFills[unifiedFillIndex].type === "solid"
      ) {
        const updatedFills = objectFills.map((fill, index) =>
          index === unifiedFillIndex
            ? {
                ...fill,
                color,
                ...(opacity !== undefined && { opacity: opacity }),
              }
            : fill
        );
        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes: { fills: updatedFills },
            previousValues: { fills: object.fills },
          },
        });
      }
    });
  };

  const handleRgbaColorChange = (
    fillId: string,
    rgba: { r: number; g: number; b: number; a: number }
  ) => {
    const hexColor = rgbaToHex(rgba);

    // Find the fill index in the unified fills array
    const unifiedFillIndex = fills.findIndex((f) => f.id === fillId);
    if (unifiedFillIndex === -1) return;

    objects.forEach((object) => {
      const objectFills = object.fills || [];
      // Use the same index position across all objects instead of matching by ID
      if (
        unifiedFillIndex < objectFills.length &&
        objectFills[unifiedFillIndex].type === "solid"
      ) {
        const updatedFills = objectFills.map((fill, index) =>
          index === unifiedFillIndex
            ? {
                ...fill,
                color: hexColor,
                opacity: rgba.a,
              }
            : fill
        );

        const action = {
          type: "object.updated",
          payload: {
            id: object.id,
            changes: { fills: updatedFills },
            previousValues: { fills: object.fills },
          },
        };

        colorChange.updateColor(action, `${object.id}_fills`);
      }
    });
  };

  // New handlers for color picker interaction start/end
  const handleColorPickerStart = (fillId: string) => {
    // Find the fill index in the unified fills array
    const unifiedFillIndex = fills.findIndex((f) => f.id === fillId);
    if (unifiedFillIndex === -1) return;

    objects.forEach((object) => {
      const objectFills = object.fills || [];
      // Use the same index position across all objects instead of matching by ID
      if (unifiedFillIndex < objectFills.length) {
        colorChange.startColorChange(`${object.id}_fills`, {
          fills: object.fills,
        });
      }
    });
  };

  const handleColorPickerEnd = () => {
    colorChange.finishColorChange();
  };

  const handleChangeFillOpacity = (fillId: string, opacity: number) => {
    // Find the fill index in the unified fills array
    const unifiedFillIndex = fills.findIndex((f) => f.id === fillId);
    if (unifiedFillIndex === -1) return;

    objects.forEach((object) => {
      const objectFills = object.fills || [];
      // Use the same index position across all objects instead of matching by ID
      if (unifiedFillIndex < objectFills.length) {
        const updatedFills = objectFills.map((fill, index) =>
          index === unifiedFillIndex
            ? { ...fill, opacity: opacity / 100 }
            : fill
        );
        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes: { fills: updatedFills },
            previousValues: { fills: object.fills },
          },
        });
      }
    });
  };

  const handleRemoveFill = (fillId: string) => {
    objects.forEach((object) => {
      const fills = object.fills || [];
      const updatedFills = fills.filter((fill) => fill.id !== fillId);
      dispatch({
        type: "object.updated",
        payload: {
          id: object.id,
          changes: { fills: updatedFills },
          previousValues: { fills: object.fills },
        },
      });
    });

    // Close flyout if the removed fill was active
    if (activePopover === fillId) {
      setActivePopover(null);
    }
  };

  const handleToggleFillVisibility = (fillId: string) => {
    // Find the fill index in the unified fills array
    const unifiedFillIndex = fills.findIndex((f) => f.id === fillId);
    if (unifiedFillIndex === -1) return;

    objects.forEach((object) => {
      const objectFills = object.fills || [];
      // Use the same index position across all objects instead of matching by ID
      if (unifiedFillIndex < objectFills.length) {
        const updatedFills = objectFills.map((fill, index) =>
          index === unifiedFillIndex
            ? { ...fill, visible: !fill.visible }
            : fill
        );
        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes: { fills: updatedFills },
            previousValues: { fills: object.fills },
          },
        });
      }
    });
  };

  const handleImageUpload = (fillId?: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.dataset.fillId = fillId || "";
      fileInputRef.current.click();
    }
  };

  // Helper function to calculate original dimensions based on current image rendering
  const calculateOriginalDimensions = (
    object: CanvasObject,
    imageFill: ImageFill,
    previousFit: "fill" | "fit" | "crop" | "tile"
  ): { width: number; height: number } => {
    const { imageWidth, imageHeight, scale = 1, fit = "fill" } = imageFill;

    // If we don't have image dimensions, fall back to current object size
    if (!imageWidth || !imageHeight) {
      return { width: object.width, height: object.height };
    }

    // If previous fit was 'crop', calculate the original node dimensions
    // based on the current scale relationship
    if (previousFit === "crop") {
      // The scale values tell us the relationship: currentImageSize = originalNodeSize * scale
      // So: originalNodeSize = currentImageSize / scale
      const currentScaleX = imageFill.scaleX || imageFill.scale || 1;
      const currentScaleY = imageFill.scaleY || imageFill.scale || 1;

      // The overlay should match the current image size on canvas exactly
      // Current image size = nodeSize * scale
      const currentImageWidth = object.width * currentScaleX;
      const currentImageHeight = object.height * currentScaleY;

      return { width: currentImageWidth, height: currentImageHeight };
    }

    // Calculate the actual rendered image size based on the current fill properties
    // This gives us the WYSIWYG dimensions that should be shown in the overlay
    let renderedWidth = imageWidth * scale;
    let renderedHeight = imageHeight * scale;

    // For 'fill' mode, the image is stretched to fill the object completely
    if (previousFit === "fill") {
      // The image was stretched to match the object size
      // But we want to show what the image size would be at its natural aspect ratio
      const imageAspectRatio = imageWidth / imageHeight;
      const objectAspectRatio = object.width / object.height;

      if (imageAspectRatio > objectAspectRatio) {
        // Image is wider - it would extend beyond object width to maintain aspect ratio
        renderedHeight = object.height;
        renderedWidth = object.height * imageAspectRatio;
      } else {
        // Image is taller - it would extend beyond object height to maintain aspect ratio
        renderedWidth = object.width;
        renderedHeight = object.width / imageAspectRatio;
      }
    } else if (previousFit === "fit") {
      // For 'fit' mode, image maintains aspect ratio and fits within object bounds
      const imageAspectRatio = imageWidth / imageHeight;
      const objectAspectRatio = object.width / object.height;

      if (imageAspectRatio > objectAspectRatio) {
        // Image is wider - width matches object, height is smaller
        renderedWidth = object.width;
        renderedHeight = object.width / imageAspectRatio;
      } else {
        // Image is taller - height matches object, width is smaller
        renderedHeight = object.height;
        renderedWidth = object.height * imageAspectRatio;
      }
    }

    return { width: renderedWidth, height: renderedHeight };
  };

  const handleImageFitChange = (
    fillId: string,
    fit: "fill" | "fit" | "crop" | "tile"
  ) => {
    // Find the fill index in the unified fills array
    const unifiedFillIndex = fills.findIndex((f) => f.id === fillId);
    if (unifiedFillIndex === -1) return;

    // Get the current fill to check previous fit mode
    const currentFill = fills[unifiedFillIndex] as ImageFill;
    const previousFit = currentFill.fit || "fill";

    objects.forEach((object) => {
      const objectFills = object.fills || [];
      // Use the same index position across all objects instead of matching by ID
      if (
        unifiedFillIndex < objectFills.length &&
        objectFills[unifiedFillIndex].type === "image"
      ) {
        const updatedFills = objectFills.map((fill, index) =>
          index === unifiedFillIndex ? { ...fill, fit } : fill
        );
        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes: { fills: updatedFills },
            previousValues: { fills: object.fills },
          },
        });
      }
    });

    // Activate crop mode if switching to crop fit
    if (fit === "crop" && objects.length === 1) {
      const originalDimensions = calculateOriginalDimensions(
        objects[0],
        currentFill,
        previousFit
      );

      // CRITICAL: When switching to crop mode, we need to center the image
      // Calculate the center offsets for the background image
      const objectWidth = objects[0].width;
      const objectHeight = objects[0].height;
      const imageWidth = originalDimensions.width;
      const imageHeight = originalDimensions.height;

      // Calculate center position as percentage offsets
      const centerOffsetX = (objectWidth - imageWidth) / (2 * objectWidth);
      const centerOffsetY = (objectHeight - imageHeight) / (2 * objectHeight);

      // Calculate the scale needed to show the image at its natural size in current object
      // This should match what the overlay calculates
      const scaleX = imageWidth / objectWidth;
      const scaleY = imageHeight / objectHeight;
      // Use the larger scale to ensure the image covers properly
      const correctScale = Math.max(scaleX, scaleY);

      // Update the fill with center offsets
      dispatch({
        type: "object.updated",
        payload: {
          id: objects[0].id,
          changes: {
            fills: objects[0].fills?.map((f) =>
              f.id === fillId
                ? {
                    ...f,
                    fit,
                    offsetX: centerOffsetX,
                    offsetY: centerOffsetY,
                    scale: correctScale,
                  }
                : f
            ),
          },
        },
      });

      setCropMode(true, objects[0].id, fillId, originalDimensions);
    } else if (fit !== "crop") {
      // Deactivate crop mode if switching away from crop
      setCropMode(false);
    }
  };

  const handleImageRotation = (fillId: string) => {
    // For WebGL-based rotation, we trigger reprocessing with a rotation flag
    // This will cause the image to be rotated in the WebGL processor
    objects.forEach((object) => {
      const fills = object.fills || [];
      const fillIndex = fills.findIndex((f) => f.id === fillId);
      if (fillIndex !== -1 && fills[fillIndex].type === "image") {
        const currentFill = fills[fillIndex] as ImageFill;

        // Add a temporary rotation flag to the adjustments to trigger reprocessing
        const updatedAdjustments = {
          ...currentFill.adjustments,
          // Use a special flag that WebGL processor can detect
          _rotate90: ((currentFill.adjustments as any)?._rotate90 || 0) + 1,
        };

        const updatedFills = fills.map((fill, index) =>
          index === fillIndex
            ? { ...fill, adjustments: updatedAdjustments }
            : fill
        );

        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes: { fills: updatedFills },
            previousValues: { fills: object.fills },
          },
        });
      }
    });
  };

  const handleBlendModeChange = (fillId: string, blendMode: string) => {
    objects.forEach((object) => {
      const fills = object.fills || [];
      const fillIndex = fills.findIndex((f) => f.id === fillId);
      if (fillIndex !== -1) {
        // Now works for ALL fill types, not just image
        const updatedFills = fills.map((fill, index) =>
          index === fillIndex
            ? {
                ...fill,
                blendMode: blendMode === "pass-through" ? undefined : blendMode,
              }
            : fill
        );
        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes: { fills: updatedFills },
            previousValues: { fills: object.fills },
          },
        });
      }
    });
  };

  const handleImageScaleChange = (fillId: string, scale: number) => {
    objects.forEach((object) => {
      const fills = object.fills || [];
      const fillIndex = fills.findIndex((f) => f.id === fillId);
      if (fillIndex !== -1 && fills[fillIndex].type === "image") {
        const updatedFills = fills.map((fill, index) =>
          index === fillIndex ? { ...fill, scale } : fill
        );
        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes: { fills: updatedFills },
            previousValues: { fills: object.fills },
          },
        });
      }
    });
  };

  const handleImageTileScaleChange = (fillId: string, tileScale: number) => {
    objects.forEach((object) => {
      const fills = object.fills || [];
      const fillIndex = fills.findIndex((f) => f.id === fillId);
      if (fillIndex !== -1 && fills[fillIndex].type === "image") {
        const updatedFills = fills.map((fill, index) =>
          index === fillIndex ? { ...fill, tileScale } : fill
        );
        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes: { fills: updatedFills },
            previousValues: { fills: object.fills },
          },
        });
      }
    });
  };

  const handleImageAdjustmentChange = (
    fillId: string,
    adjustmentType: keyof ImageAdjustments,
    value: number
  ) => {
    objects.forEach((object) => {
      const fills = object.fills || [];
      const fillIndex = fills.findIndex((f) => f.id === fillId);
      if (fillIndex !== -1 && fills[fillIndex].type === "image") {
        const currentFill = fills[fillIndex] as ImageFill;
        const updatedAdjustments = {
          ...currentFill.adjustments,
          [adjustmentType]: value,
        };
        const updatedFills = fills.map((fill, index) =>
          index === fillIndex
            ? { ...fill, adjustments: updatedAdjustments }
            : fill
        );
        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes: { fills: updatedFills },
            previousValues: { fills: object.fills },
          },
        });
      }
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const fillId = event.target.dataset.fillId;

    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;

        if (fillId) {
          // Update existing fill
          objects.forEach((object) => {
            const fills = object.fills || [];
            const fillIndex = fills.findIndex((f) => f.id === fillId);
            if (fillIndex !== -1) {
              const updatedFills = fills.map((fill, index) =>
                index === fillIndex
                  ? { ...fill, type: "image", imageUrl, fit: "fill" }
                  : fill
              );
              dispatch({
                type: "object.updated",
                payload: {
                  id: object.id,
                  changes: { fills: updatedFills },
                  previousValues: { fills: object.fills },
                },
              });
            }
          });
        } else {
          // Add new image fill
          const newFill = createImageFill(imageUrl);
          objects.forEach((object) => {
            const updatedObject = addFill(object, newFill);
            dispatch({
              type: "object.updated",
              payload: {
                id: object.id,
                changes: { fills: updatedObject.fills },
                previousValues: { fills: object.fills },
              },
            });
          });
        }
        // Keep the flyout open after image upload
      };
      reader.readAsDataURL(file);
    }
  };

  const openPopover = (fillId: string, event: React.MouseEvent) => {
    if (!fillSectionRef.current) return;

    // Always switch to the clicked fill (even if it's the same one)
    // Get the Fill section's position
    const fillSectionRect = fillSectionRef.current.getBoundingClientRect();

    // Position the flyout to the left of the Fill section
    const x = fillSectionRect.left - 240; // 240px width + 40px gap
    const y = fillSectionRect.top;

    // Set tab based on fill type
    const activeFill = fills.find((f) => f.id === fillId);
    setActiveTab(activeFill?.type === "image" ? "image" : "solid");

    setPickerPosition({ x, y });
    setActivePopover(fillId);

    // Check if this is a crop image fill and activate crop mode
    if (
      activeFill?.type === "image" &&
      (activeFill as any).fit === "crop" &&
      objects.length === 1
    ) {
      // Calculate the correct original dimensions for re-entering crop mode
      const imageFill = activeFill as ImageFill;
      const originalDimensions = calculateOriginalDimensions(
        objects[0],
        imageFill,
        "crop" // previousFit is "crop" when re-entering crop mode
      );

      setCropMode(true, objects[0].id, fillId, originalDimensions);
    }
  };

  const closePopover = () => {
    // Before exiting crop mode, save the final adjusted scale to maintain visual appearance
    const cropMode = useAppStore.getState().cropMode;
    if (
      cropMode.isActive &&
      cropMode.originalDimensions &&
      objects.length > 0
    ) {
      const object = objects[0];
      const imageFill = object.fills?.find(
        (f) => f.id === cropMode.fillId
      ) as ImageFill;

      if (imageFill && imageFill.fit === "crop") {
        // Handle exit calculation whether currentTransform exists or not
        let newOffsetX, newOffsetY, newScaleX, newScaleY, newScale;

        // Calculate image natural size (used in logging)
        const imageNaturalWidth = imageFill.imageWidth || 900;
        const imageNaturalHeight = imageFill.imageHeight || 900;

        if (cropMode.currentTransform) {
          // Case 1: currentTransform exists (from image overlay resize)
          console.log("🌾 [CROP] EXIT CASE 1: Using currentTransform");
          const { imageWorldX, imageWorldY, imageWidth, imageHeight } =
            cropMode.currentTransform;

          // For nested objects, we need to use absolute position, not relative position
          const objectAbsolutePos = object.parentId
            ? getAbsolutePosition(object.id, useAppStore.getState().objects)
            : { x: object.x, y: object.y };

          // Calculate new offsetX/offsetY (relative to object)
          newOffsetX = (imageWorldX - objectAbsolutePos.x) / object.width;
          newOffsetY = (imageWorldY - objectAbsolutePos.y) / object.height;

          console.log("🌾 [CROP] EXIT OFFSET CALCULATION DEBUG:", {
            imageWorldCoords: { x: imageWorldX, y: imageWorldY },
            objectRelativeCoords: { x: object.x, y: object.y },
            objectAbsoluteCoords: objectAbsolutePos,
            objectSize: { width: object.width, height: object.height },
            calculatedOffsets: { x: newOffsetX, y: newOffsetY },
            isNested: !!object.parentId,
            reasoning:
              "Converting absolute world coords to relative offsets for nested objects",
          });

          // Calculate new scale based on currentTransform dimensions
          newScaleX = imageWidth / object.width;
          newScaleY = imageHeight / object.height;
          newScale = Math.max(newScaleX, newScaleY);
        } else {
          // Case 2: No currentTransform (crop area was resized but no image overlay resize)

          // The current fill properties already have the correct offsets from crop area resize
          newOffsetX = imageFill.offsetX || 0;
          newOffsetY = imageFill.offsetY || 0;

          // For scaling, use originalDimensions as the reference image size
          // This preserves the current visual appearance
          newScaleX = cropMode.originalDimensions.width / object.width;
          newScaleY = cropMode.originalDimensions.height / object.height;
          newScale = Math.max(newScaleX, newScaleY);
        }

        // Update the fill with the correctly calculated values
        const updatedFill = {
          ...imageFill,
          offsetX: newOffsetX,
          offsetY: newOffsetY,
          scale: newScale,
          scaleX: newScaleX,
          scaleY: newScaleY,
        };

        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes: {
              fills: object.fills?.map((f: any) =>
                f.id === imageFill.id ? updatedFill : f
              ),
            },
          },
        });
      }
    }

    setActivePopover(null);
    // Deactivate crop mode when popover closes
    setCropMode(false);
  };

  const handleTabChange = (tabType: "solid" | "image") => {
    if (!activePopover) return;

    setActiveTab(tabType);

    // Convert fill type if needed
    const currentFill = fills.find((f) => f.id === activePopover);
    if (!currentFill) return;

    if (tabType === "solid" && currentFill.type !== "solid") {
      // Convert to solid fill
      const newFill = createSolidFill("#FFFFFF");
      newFill.id = currentFill.id; // Keep same ID
      newFill.blendMode = currentFill.blendMode; // Preserve blend mode
      newFill.opacity = currentFill.opacity; // Preserve opacity

      objects.forEach((object) => {
        const fills = object.fills || [];
        const updatedFills = fills.map((fill) =>
          fill.id === activePopover ? newFill : fill
        );
        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes: { fills: updatedFills },
            previousValues: { fills: object.fills },
          },
        });
      });
    } else if (tabType === "image" && currentFill.type !== "image") {
      // Convert to image fill
      const newFill = createImageFill();
      newFill.id = currentFill.id; // Keep same ID
      newFill.blendMode = currentFill.blendMode; // Preserve blend mode
      newFill.opacity = currentFill.opacity; // Preserve opacity

      objects.forEach((object) => {
        const fills = object.fills || [];
        const updatedFills = fills.map((fill) =>
          fill.id === activePopover ? newFill : fill
        );
        dispatch({
          type: "object.updated",
          payload: {
            id: object.id,
            changes: { fills: updatedFills },
            previousValues: { fills: object.fills },
          },
        });
      });
    }
  };

  const renderFillPreview = (fill: Fill) => {
    if (fill.type === "solid") {
      return (
        <div
          className="w-full h-full rounded-[2px]"
          style={{ backgroundColor: (fill as SolidFill).color }}
        />
      );
    } else if (fill.type === "image") {
      const imageFill = fill as ImageFill;
      const imageUrl = isEmptyImageUrl(imageFill.imageUrl)
        ? createCheckerboardPattern()
        : imageFill.imageUrl;

      const isPlaceholder = isEmptyImageUrl(imageFill.imageUrl);

      return (
        <div
          className="w-full h-full rounded-[2px]"
          style={{
            backgroundImage: `url('${imageUrl}')`,
            backgroundSize: isPlaceholder ? "24px 24px" : "cover",
            backgroundRepeat: isPlaceholder ? "repeat" : "no-repeat",
            backgroundPosition: isPlaceholder ? "0 0" : "center center",
          }}
        />
      );
    }
    return (
      <div className="w-full h-6 rounded-[5px] border border-gray-200 bg-gray-100" />
    );
  };

  return (
    <div className="" ref={fillSectionRef}>
      <div
        className="text-xs font-medium text-gray-900 h-10 grid grid-cols-[1fr_auto] items-center pl-4 pr-2 "
        style={{
          color:
            fills.length > 0 || hasMixedFills
              ? "var(--color-text)"
              : "var(--color-text-secondary)",
        }}
        onClick={() => {
          if (fills.length === 0 && !hasMixedFills) {
            handleAddFill("solid");
          }
        }}
      >
        <div className="hover:text-default">Fill</div>

        {/* Add Fill Button */}
        <button
          onClick={() => handleAddFill("solid")}
          className="w-6 h-6 rounded-[5px] hover:bg-secondary"
        >
          <Icon24Plus />
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Fill Properties Popover */}
      <PropertyPopover
        isOpen={!!activePopover}
        onClose={closePopover}
        position={pickerPosition}
        onPositionChange={setPickerPosition}
        width={240}
        protectedZoneRef={fillSectionRef}
        debug={false} // Debugging disabled
      >
        <PropertyPopoverHeader onClose={closePopover} />

        <FillPopoverContent
          activeTab={activeTab}
          onTabChange={handleTabChange}
          activeFill={(() => {
            // Handle mixed fills: if we can't find by ID in unified fills,
            // find the fill by index position in the first object
            let foundFill = fills.find((f) => f.id === activePopover);
            if (!foundFill && hasMixedFills && objects.length > 0) {
              // Find which fill index was clicked by looking at the first object
              const firstObjectFills = objects[0].fills || [];
              const clickedFillIndex = firstObjectFills.findIndex(
                (f) => f.id === activePopover
              );
              if (clickedFillIndex !== -1 && clickedFillIndex < fills.length) {
                foundFill = fills[clickedFillIndex];
              }
            }
            return foundFill as SolidFill | ImageFill | undefined;
          })()}
          onClose={closePopover}
          onBlendModeChange={(blendMode) => {
            if (activePopover) {
              handleBlendModeChange(activePopover, blendMode);
            }
          }}
          onColorChange={(color) =>
            handleChangeFillColor(activePopover!, color)
          }
          onRgbaChange={(rgba) => handleRgbaColorChange(activePopover!, rgba)}
          onColorPickerStart={() => handleColorPickerStart(activePopover!)}
          onColorPickerEnd={handleColorPickerEnd}
          onImageFitChange={(fit) => handleImageFitChange(activePopover!, fit)}
          onImageRotation={() => handleImageRotation(activePopover!)}
          onImageUpload={() => handleImageUpload(activePopover || undefined)}
          onImageAdjustmentChange={(adjustment, value) =>
            handleImageAdjustmentChange(
              activePopover!,
              adjustment as keyof ImageAdjustments,
              value
            )
          }
          onImageTileScaleChange={(tileScale) =>
            handleImageTileScaleChange(activePopover!, tileScale)
          }
        />
      </PropertyPopover>

      <div className="">
        {hasMixedFills ? (
          <div className="text-xs text-tertiary px-4 pb-4 pt-2">
            Click + to replace mixed content
          </div>
        ) : (
          fills
            .slice()
            .reverse()
            .map((fill, index) => (
              <div key={fill.id} className="last:pb-2">
                {/* Main fill control grid */}
                <div className="grid grid-cols-[1fr_auto] gap-2 items-center pl-4 pr-2 h-8 ">
                  <FillTrigger
                    fill={fill}
                    onTriggerClick={(e) => openPopover(fill.id, e)}
                    onColorChange={(color) =>
                      handleChangeFillColor(fill.id, color)
                    }
                    onOpacityChange={(opacity) =>
                      handleChangeFillOpacity(fill.id, opacity)
                    }
                    size="sm"
                    showLabel={true}
                    showOpacity={true}
                  />

                  <div className="flex items-center gap-1">
                    {/* Visibility toggle */}
                    <button
                      onClick={() => handleToggleFillVisibility(fill.id)}
                      className="w-6 h-6 rounded-[5px] text-xs flex items-center justify-center hover:bg-secondary"
                      title={fill.visible ? "Hide fill" : "Show fill"}
                    >
                      {fill.visible ? (
                        <Icon24EyeSmall />
                      ) : (
                        <Icon24HiddenSmall />
                      )}
                    </button>

                    {/* Remove fill */}
                    <button
                      onClick={() => handleRemoveFill(fill.id)}
                      className="w-6 h-6 rounded-[5px] text-xs flex items-center justify-center hover:bg-secondary "
                      title="Remove fill"
                    >
                      <Icon24MinusSmall />
                    </button>
                  </div>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
