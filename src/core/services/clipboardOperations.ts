import { CanvasObject } from "@/types/canvas";
import { nanoid } from "nanoid";
import { ClipboardService } from "./clipboard";

/**
 * High-level clipboard operations that integrate with the store
 */
export class ClipboardOperations {
  private static pasteEventListenerAdded = false;

  /**
   * Initialize global paste event listener (call once on app startup)
   */
  static initializePasteEventListener(): void {
    if (this.pasteEventListenerAdded) {
      return;
    }

    document.addEventListener("paste", (event: ClipboardEvent) => {
      // Process files immediately while the event is fresh
      if (event.clipboardData) {
        const files = event.clipboardData.files;
        const items = event.clipboardData.items;

        // Extract and store all image files immediately
        const imageFiles: File[] = [];

        // Check files first (this is where Finder images appear)
        for (let i = 0; i < files.length; i++) {
          const file = files[i];

          if (file.type.startsWith("image/")) {
            imageFiles.push(file);
          }
        }

        // If no files, check items
        if (imageFiles.length === 0) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (item.type.startsWith("image/")) {
              const file = item.getAsFile();
              if (file) {
                imageFiles.push(file);
              }
            }
          }
        }

        // Store all found image files
        if (imageFiles.length > 0) {
          ClipboardService.setImageFiles(imageFiles);
        }
      }

      ClipboardService.setPasteEvent(event);
    });

    this.pasteEventListenerAdded = true;
  }
  /**
   * Copy selected objects to clipboard
   */
  static async copySelectedObjects(
    selectedObjects: CanvasObject[],
    allObjects: Record<string, CanvasObject>,
    dispatch: (event: any) => void
  ): Promise<boolean> {
    if (selectedObjects.length === 0) {
      return false;
    }

    try {
      // Copy to clipboard
      const success = await ClipboardService.copyObjects(
        selectedObjects,
        allObjects
      );

      if (success) {
        // Dispatch copy event for tracking/undo
        const serializedObjects = ClipboardService.serializeObjectsWithChildren(
          selectedObjects,
          allObjects
        );
        dispatch({
          type: "objects.copied",
          payload: {
            copiedObjects: serializedObjects,
            sourceIds: selectedObjects.map((obj) => obj.id),
          },
        });
      }

      return success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Cut selected objects to clipboard
   */
  static async cutSelectedObjects(
    selectedObjects: CanvasObject[],
    allObjects: Record<string, CanvasObject>,
    dispatch: (event: any) => void
  ): Promise<boolean> {
    if (selectedObjects.length === 0) {
      return false;
    }

    try {
      // Cut to clipboard
      const success = await ClipboardService.cutObjects(
        selectedObjects,
        allObjects
      );

      if (success) {
        // Get all objects that need to be removed (including children)
        const serializedObjects = ClipboardService.serializeObjectsWithChildren(
          selectedObjects,
          allObjects
        );

        // Immediately remove the objects from canvas
        dispatch({
          type: "objects.cut",
          payload: {
            cutObjects: serializedObjects,
            sourceIds: selectedObjects.map((obj) => obj.id),
            removedObjectIds: serializedObjects.map((obj) => obj.id),
          },
        });
      }

      return success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Paste objects from clipboard with smart positioning
   */
  static async pasteObjects(
    dispatch: (event: any) => void,
    viewport: { zoom: number; panX: number; panY: number },
    selectedObjects: CanvasObject[],
    allObjects: Record<string, CanvasObject>,
    canvasCenter?: { x: number; y: number }
  ): Promise<boolean> {
    try {
      // Simple approach: Check what's in the system clipboard
      // First check for our object data
      const clipboardData = await ClipboardService.getClipboardData();
      if (clipboardData && clipboardData.objects.length > 0) {
        // Continue with object paste logic below
      } else {
        // No object data, check for images
        const hasImage = await ClipboardService.hasImageData();
        if (hasImage) {
          return await this.pasteImagesAsRectangles(
            dispatch,
            selectedObjects,
            canvasCenter
          );
        }

        return false;
      }

      // Determine paste target and position
      const pasteStrategy = this.determinePasteStrategy(
        selectedObjects,
        allObjects
      );
      const pastePosition = this.calculatePastePosition(
        clipboardData.objects,
        pasteStrategy,
        viewport,
        canvasCenter
      );

      // Prepare objects for pasting
      const pastedObjects = ClipboardService.prepareObjectsForPaste(
        clipboardData.objects,
        {
          targetParentId: pasteStrategy.targetParentId,
          position: pastePosition,
        }
      );

      // Handle parent-child relationships for multi-frame pasting
      if (
        pasteStrategy.type === "multiple-frames" &&
        pasteStrategy.targetFrameIds
      ) {
        return await this.pasteIntoMultipleFrames(
          pastedObjects,
          pasteStrategy.targetFrameIds,
          dispatch
        );
      }

      // Dispatch paste event
      dispatch({
        type: "objects.pasted",
        payload: {
          pastedObjects,
          targetParentId: pasteStrategy.targetParentId,
          position: pastePosition,
        },
      });

      // Clear cut state since objects were already removed on cut
      ClipboardService.clearCutState();

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Paste multiple images from clipboard as rectangles with image fills
   */
  private static async pasteImagesAsRectangles(
    dispatch: (event: any) => void,
    selectedObjects: CanvasObject[],
    canvasCenter?: { x: number; y: number }
  ): Promise<boolean> {
    try {
      const imageFiles = await ClipboardService.getImageFiles();
      if (imageFiles.length === 0) {
        return false;
      }

      // If only one image, handle it directly here instead of calling pasteImageAsRectangle
      if (imageFiles.length === 1) {
        const imageFile = imageFiles[0];
        // Convert to data URL for persistence instead of blob URL
        const imageUrl = await this.convertFileToDataURL(imageFile);
        const dimensions = await this.getImageDimensions(imageUrl);

        // Determine where to place the image
        let targetParentId: string | undefined;
        let position = canvasCenter || { x: 0, y: 0 };
        let shouldCenter = true;

        if (
          selectedObjects.length === 1 &&
          selectedObjects[0].type === "frame"
        ) {
          // Paste inside the selected frame
          targetParentId = selectedObjects[0].id;
          position = { x: 10, y: 10 }; // Small offset from frame origin
          shouldCenter = false; // Don't center when pasting inside frames
        }

        // Calculate position for the image
        const imageX = shouldCenter
          ? position.x - dimensions.width / 2
          : position.x;
        const imageY = shouldCenter
          ? position.y - dimensions.height / 2
          : position.y;

        // Create rectangle with image fill
        const rectangle: CanvasObject = {
          id: nanoid(),
          type: "rectangle",
          name: (() => {
            const nameWithoutExtension = imageFile.name.replace(
              /\.[^/.]+$/,
              ""
            );
            // If the name is generic "image" (common for web images), use "Image" instead
            return nameWithoutExtension === "image"
              ? "Image"
              : nameWithoutExtension || "Image";
          })(),
          createdAt: Date.now(),
          x: imageX,
          y: imageY,
          width: dimensions.width,
          height: dimensions.height,
          rotation: 0,
          autoLayoutSizing: {
            horizontal: "fixed",
            vertical: "fixed",
          },
          zIndex: 0,
          opacity: 1,
          visible: true,
          locked: false,
          fills: [
            {
              type: "image",
              imageUrl: imageUrl,
              fit: "fill",
              imageWidth: dimensions.width,
              imageHeight: dimensions.height,
              id: nanoid(),
              visible: true,
              opacity: 1,
            },
          ],
          strokes: [],
          strokeWidth: 0,
          parentId: targetParentId,
          childIds: [],
          properties: {
            type: "rectangle",
            borderRadius: 0,
          },
        };

        // Dispatch the paste event
        dispatch({
          type: "image.pasted",
          payload: {
            imageObject: rectangle,
            timestamp: Date.now(),
          },
        });

        return true;
      }

      // Multiple images - paste them side by side with padding
      const PADDING = 20; // pixels between images

      // Determine where to place the images (frame vs canvas)
      let targetParentId: string | undefined;
      let basePosition = canvasCenter || { x: 0, y: 0 };
      let shouldCenter = true;

      if (selectedObjects.length === 1 && selectedObjects[0].type === "frame") {
        // Paste inside the selected frame
        targetParentId = selectedObjects[0].id;
        basePosition = { x: 10, y: 10 }; // Small offset from frame origin
        shouldCenter = false; // Don't center when pasting inside frames
      }

      // Calculate total width and starting position
      const imageData = [];
      for (const imageFile of imageFiles) {
        // Convert to data URL for persistence (do this once per file)
        const imageUrl = await this.convertFileToDataURL(imageFile);
        const dimensions = await this.getImageDimensions(imageUrl);
        imageData.push({ imageFile, imageUrl, dimensions });
      }

      const totalWidth =
        imageData.reduce((sum, data) => sum + data.dimensions.width, 0) +
        (imageFiles.length - 1) * PADDING;

      const startX = shouldCenter
        ? basePosition.x - totalWidth / 2
        : basePosition.x;
      const startY = basePosition.y;

      let currentX = startX;

      for (let i = 0; i < imageData.length; i++) {
        const { imageFile, imageUrl, dimensions } = imageData[i];

        // Calculate position for this image - align tops
        const imagePosition = {
          x: currentX,
          y: startY, // All images aligned at the same Y position (top-aligned)
        };

        // Create rectangle with image fill
        const rectangleId = nanoid();
        const rectangle: CanvasObject = {
          id: rectangleId,
          type: "rectangle",
          name: (() => {
            const nameWithoutExtension = imageFile.name.replace(
              /\.[^/.]+$/,
              ""
            );
            // If the name is generic "image" (common for web images), use "Image" instead
            return nameWithoutExtension === "image"
              ? "Image"
              : nameWithoutExtension || "Image";
          })(),
          createdAt: Date.now(),
          x: imagePosition.x,
          y: imagePosition.y,
          width: dimensions.width,
          height: dimensions.height,
          rotation: 0,
          autoLayoutSizing: {
            horizontal: "fixed",
            vertical: "fixed",
          },
          zIndex: 0,
          opacity: 1,
          visible: true,
          locked: false,
          fills: [
            {
              type: "image",
              imageUrl: imageUrl,
              fit: "fill",
              imageWidth: dimensions.width,
              imageHeight: dimensions.height,
              id: nanoid(),
              visible: true,
              opacity: 1,
            },
          ],
          strokes: [],
          strokeWidth: 0,
          childIds: [],
          parentId: targetParentId,
          properties: {
            type: "rectangle",
            borderRadius: 0,
          },
        };

        // Dispatch the paste event
        dispatch({
          type: "image.pasted",
          payload: {
            imageObject: rectangle,
            timestamp: Date.now(),
          },
        });

        // Move to next position
        currentX += dimensions.width + PADDING;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Paste image from clipboard as rectangle with image fill
   */
  private static async pasteImageAsRectangle(
    dispatch: (event: any) => void,
    selectedObjects: CanvasObject[],
    canvasCenter?: { x: number; y: number }
  ): Promise<boolean> {
    try {
      const imageBlob = await ClipboardService.getImageData();
      if (!imageBlob) {
        return false;
      }

      // Convert blob to data URL for persistence and get image dimensions
      const imageUrl = await this.convertBlobToDataURL(imageBlob);
      const { width: imageWidth, height: imageHeight } =
        await this.getImageDimensions(imageUrl);

      // Determine where to place the image
      let targetParentId: string | undefined;
      let position = canvasCenter || { x: 0, y: 0 };
      let shouldCenter = true;

      if (selectedObjects.length === 1 && selectedObjects[0].type === "frame") {
        // Paste inside the selected frame
        targetParentId = selectedObjects[0].id;
        position = { x: 10, y: 10 }; // Small offset from frame origin
        shouldCenter = false; // Don't center when pasting inside frames
      }

      // Calculate position for the image
      const imageX = shouldCenter ? position.x - imageWidth / 2 : position.x;
      const imageY = shouldCenter ? position.y - imageHeight / 2 : position.y;

      // Create rectangle with image fill using original image dimensions
      const imageObject: CanvasObject = {
        id: nanoid(),
        type: "rectangle",
        name: "Image",
        createdAt: Date.now(),
        x: imageX,
        y: imageY,
        width: imageWidth,
        height: imageHeight,
        rotation: 0,
        autoLayoutSizing: {
          horizontal: "fixed", // Use fixed sizing for images
          vertical: "fixed",
        },
        fills: [
          {
            id: nanoid(),
            type: "image",
            imageUrl,
            fit: "fill", // Use fill mode to cover the entire rectangle
            visible: true,
            opacity: 1,
            imageWidth, // Store original dimensions
            imageHeight,
          },
        ],
        strokes: [],
        strokeWidth: 0,
        parentId: targetParentId,
        childIds: [],
        zIndex: 0,
        visible: true,
        locked: false,
        properties: {
          type: "rectangle",
          borderRadius: 0,
        },
      };

      // Dispatch image paste event
      dispatch({
        type: "image.pasted",
        payload: {
          imageObject,
          imageUrl,
          targetParentId,
          position,
        },
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get image dimensions from URL
   */
  private static getImageDimensions(
    imageUrl: string
  ): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        // Fallback to default size if image can't be loaded
        console.warn(
          "📋 CLIPBOARD: Could not get image dimensions, using default size"
        );
        resolve({ width: 200, height: 150 });
      };
      img.src = imageUrl;
    });
  }

  /**
   * Convert File to data URL for persistence
   */
  private static convertFileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        console.log("📋 CLIPBOARD: Converted file to data URL:", {
          fileName: file.name,
          fileSize: file.size,
          dataUrlLength: result.length,
        });
        resolve(result);
      };
      reader.onerror = () => {
        console.error("📋 CLIPBOARD: Failed to convert file to data URL");
        reject(new Error("Failed to convert file to data URL"));
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Convert Blob to data URL for persistence
   */
  private static convertBlobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        console.log("📋 CLIPBOARD: Converted blob to data URL:", {
          blobSize: blob.size,
          blobType: blob.type,
          dataUrlLength: result.length,
        });
        resolve(result);
      };
      reader.onerror = () => {
        console.error("📋 CLIPBOARD: Failed to convert blob to data URL");
        reject(new Error("Failed to convert blob to data URL"));
      };
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Determine the best paste strategy based on current selection
   */
  private static determinePasteStrategy(
    selectedObjects: CanvasObject[],
    allObjects: Record<string, CanvasObject>
  ): {
    type: "canvas" | "single-frame" | "multiple-frames";
    targetParentId?: string;
    targetFrameIds?: string[];
  } {
    if (selectedObjects.length === 0) {
      return { type: "canvas" };
    }

    if (selectedObjects.length === 1 && selectedObjects[0].type === "frame") {
      return {
        type: "single-frame",
        targetParentId: selectedObjects[0].id,
      };
    }

    const frameObjects = selectedObjects.filter((obj) => obj.type === "frame");
    if (frameObjects.length > 1) {
      return {
        type: "multiple-frames",
        targetFrameIds: frameObjects.map((obj) => obj.id),
      };
    }

    return { type: "canvas" };
  }

  /**
   * Calculate where to paste objects based on strategy
   */
  private static calculatePastePosition(
    objectsToPaste: CanvasObject[],
    strategy: { type: string; targetParentId?: string },
    viewport: { zoom: number; panX: number; panY: number },
    canvasCenter?: { x: number; y: number }
  ): { x: number; y: number } {
    switch (strategy.type) {
      case "single-frame":
        // Paste inside frame at a small offset
        return { x: 20, y: 20 };

      case "canvas":
      default:
        // Paste at canvas center or with small offset
        if (canvasCenter) {
          return canvasCenter;
        }

        // Calculate canvas center from viewport
        const centerX =
          (-viewport.panX + window.innerWidth / 2) / viewport.zoom;
        const centerY =
          (-viewport.panY + window.innerHeight / 2) / viewport.zoom;

        return { x: centerX, y: centerY };
    }
  }

  /**
   * Duplicate selected objects with smart positioning
   */
  static async duplicateSelectedObjects(
    selectedObjects: CanvasObject[],
    allObjects: Record<string, CanvasObject>,
    dispatch: (event: any) => void
  ): Promise<boolean> {
    if (selectedObjects.length === 0) {
      return false;
    }

    try {
      // Group objects by their parent to apply different placement strategies
      const objectsByParent = new Map<string | undefined, CanvasObject[]>();

      selectedObjects.forEach((obj) => {
        const parentId = obj.parentId;
        if (!objectsByParent.has(parentId)) {
          objectsByParent.set(parentId, []);
        }
        objectsByParent.get(parentId)!.push(obj);
      });

      const allDuplicatedObjects: CanvasObject[] = [];
      const allIdMappings = new Map<string, string>();

      // Handle each parent group separately
      for (const [parentId, objects] of objectsByParent) {
        const result = await this.duplicateObjectGroup(
          objects,
          parentId,
          allObjects,
          objectsByParent.size > 1 // mixed parents
        );
        allDuplicatedObjects.push(...result.duplicatedObjects);

        // Merge ID mappings
        result.idMapping.forEach((newId, originalId) => {
          allIdMappings.set(originalId, newId);
        });
      }

      // Calculate top-level objects for selection (objects that don't have parents within the duplicated set)
      const topLevelDuplicatedObjects = allDuplicatedObjects.filter(
        (obj) =>
          !obj.parentId ||
          !allDuplicatedObjects.find((p) => p.id === obj.parentId)
      );

      // Convert Map to Record for the payload
      const originalToDuplicatedMap: Record<string, string> = {};
      allIdMappings.forEach((newId, originalId) => {
        originalToDuplicatedMap[originalId] = newId;
      });

      // Dispatch the duplication event (without selection handling)
      dispatch({
        type: "objects.duplicated",
        payload: {
          duplicatedObjects: allDuplicatedObjects,
          originalIds: selectedObjects.map((obj) => obj.id),
          originalToDuplicatedMap,
        },
      });

      // Dispatch a separate selection event immediately after
      // This ensures the selection change happens after the objects are created
      setTimeout(() => {
        dispatch({
          type: "selection.changed",
          payload: {
            selectedIds: topLevelDuplicatedObjects.map((obj) => obj.id),
            previousSelection: selectedObjects.map((obj) => obj.id),
            source: "duplicate_operation",
          },
        });
      }, 0);

      // Notify listeners (e.g. useDesignChat) so they can spawn threads
      // for duplicated objects that have an active AI session.
      console.log("[clipboardOps] dispatching canvas-objects-duplicated, map:", originalToDuplicatedMap);
      window.dispatchEvent(
        new CustomEvent("canvas-objects-duplicated", {
          detail: {
            originalToDuplicatedMap,
            originalIds: selectedObjects.map((obj) => obj.id),
          },
        }),
      );

      return true;
    } catch (error) {
      console.error("🔄 DUPLICATE: Error duplicating objects:", error);
      return false;
    }
  }

  /**
   * Duplicate a group of objects that share the same parent
   */
  private static async duplicateObjectGroup(
    objects: CanvasObject[],
    parentId: string | undefined,
    allObjects: Record<string, CanvasObject>,
    hasMixedParents: boolean
  ): Promise<{
    duplicatedObjects: CanvasObject[];
    idMapping: Map<string, string>;
  }> {
    const parent = parentId ? allObjects[parentId] : null;

    // Determine placement strategy based on parent type
    let placementStrategy:
      | "canvas-shift"
      | "canvas-same"
      | "frame-same"
      | "frame-autolayout";

    if (!parent) {
      // Canvas objects
      placementStrategy = hasMixedParents ? "canvas-same" : "canvas-shift";
    } else if (parent.type === "frame") {
      // Check if parent has auto layout
      const hasAutoLayout = this.frameHasAutoLayout(parent);
      placementStrategy = hasAutoLayout ? "frame-autolayout" : "frame-same";
    } else {
      // Other parent types (shouldn't happen but fallback)
      placementStrategy = "frame-same";
    }

    const result = ClipboardService.prepareObjectsForDuplication(objects, {
      targetParentId: parentId,
      placementStrategy,
      allObjects,
    });

    return result;
  }

  /**
   * Check if a frame has auto layout enabled
   */
  private static frameHasAutoLayout(frame: CanvasObject): boolean {
    if (frame.type !== "frame") return false;

    // Check for auto layout in properties (for regular frames)
    const autoLayout =
      frame.properties?.type === "frame"
        ? (frame.properties as any).autoLayout
        : (frame.properties as any)?.autoLayout;

    return autoLayout && autoLayout.mode && autoLayout.mode !== "none";
  }

  /**
   * Paste objects into multiple frames
   */
  private static async pasteIntoMultipleFrames(
    objectsToPaste: CanvasObject[],
    targetFrameIds: string[],
    dispatch: (event: any) => void
  ): Promise<boolean> {
    try {
      const allPastedObjects: CanvasObject[] = [];

      // Create a copy for each frame
      for (const frameId of targetFrameIds) {
        const frameObjects = ClipboardService.prepareObjectsForPaste(
          objectsToPaste,
          {
            targetParentId: frameId,
            position: { x: 20, y: 20 }, // Small offset inside frame
          }
        );

        allPastedObjects.push(...frameObjects);
      }

      // Dispatch paste event for all objects
      dispatch({
        type: "objects.pasted",
        payload: {
          pastedObjects: allPastedObjects,
          targetParentId: undefined, // Multiple targets
          position: undefined,
          wasCut: false, // Multiple paste is always copy
        },
      });

      return true;
    } catch (error) {
      console.error("📋 CLIPBOARD: Error pasting into multiple frames:", error);
      return false;
    }
  }
}
