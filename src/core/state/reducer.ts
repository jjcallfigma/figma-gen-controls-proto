import { CanvasObject, getDefaultAutoLayoutSizing } from "@/types/canvas";
import { CanvasEvent } from "@/types/events";
import { WritableDraft } from "immer";
import { nanoid } from "nanoid";
import { setPropertyOverride } from "../utils/componentSync";
import { createSolidFill } from "../utils/fills";
import { DEFAULT_REACT_CODE } from "../utils/makeUtils";
import { migrateObjectsToPages } from "../utils/migration";
import {
  addChildToParent,
  convertToRelativeCoordinates,
  findParentFrame,
} from "../utils/nesting";
import { AppState } from "./store";

/**
 * Pure function that applies events to state
 * This is the core of our event sourcing system
 */
/**
 * Check if a frame has auto layout enabled
 */
function checkAutoLayout(frame: CanvasObject): boolean {
  if (frame.type !== "frame") return false;

  // Check for auto layout in properties (for regular frames)
  const autoLayout =
    frame.properties?.type === "frame"
      ? (frame.properties as any).autoLayout
      : (frame.properties as any)?.autoLayout;

  return autoLayout && autoLayout.mode && autoLayout.mode !== "none";
}

export function applyEventToState(
  draft: WritableDraft<
    Omit<
      AppState,
      | "dispatch"
      | "undo"
      | "redo"
      | "canUndo"
      | "canRedo"
      | "getSelectedObjects"
      | "getVisibleObjects"
      | "getObjectById"
      | "getObjectChildren"
    >
  >,
  event: CanvasEvent
): void {
  switch (event.type) {
    case "canvas.clear": {
      draft.objects = {};
      draft.objectIds = [];
      draft.selection.selectedIds = [];
      draft.selection.hoveredId = undefined;
      draft.selection.selectionBounds = undefined;
      break;
    }

    case "canvas.background.changed": {
      const { backgroundColor } = event.payload;
      draft.canvasSettings.backgroundColor = backgroundColor;
      break;
    }

    case "canvas.background.opacity.changed": {
      const { backgroundOpacity } = event.payload;
      draft.canvasSettings.backgroundOpacity = backgroundOpacity;
      break;
    }

    // Preview versions of events for immediate visual feedback without undo history
    case "canvas.background.changed.preview": {
      const { backgroundColor } = event.payload;
      draft.canvasSettings.backgroundColor = backgroundColor;
      break;
    }

    case "canvas.background.opacity.changed.preview": {
      const { backgroundOpacity } = event.payload;
      draft.canvasSettings.backgroundOpacity = backgroundOpacity;
      break;
    }

    case "object.created": {
      const { object } = event.payload;
      draft.objects[object.id] = object;
      if (!draft.objectIds.includes(object.id)) {
        draft.objectIds.push(object.id);
      }

      if (draft.currentPageId && draft.pages[draft.currentPageId]) {
        const pageIds = draft.pages[draft.currentPageId].objectIds;
        if (!pageIds.includes(object.id)) {
          pageIds.push(object.id);
        }
      }

      // Component sync is now handled by the holistic observer in store.ts

      break;
    }

    case "object.updated": {
      const { id, changes, skipOverrideCreation } = event.payload;
      const existingObject = draft.objects[id];
      if (existingObject) {
        // CROP MODE: If this object is in crop mode and its size/position is changing,
        // we need to adjust the image fill to keep it fixed in world space
        const isCropModeObject =
          draft.cropMode.isActive && draft.cropMode.objectId === id;
        if (
          isCropModeObject &&
          (changes.width !== undefined ||
            changes.height !== undefined ||
            changes.x !== undefined ||
            changes.y !== undefined)
        ) {
          const hasImageFill = existingObject.fills?.some(
            (fill: any) => fill.type === "image" && fill.fit === "crop"
          );

          if (hasImageFill) {
            // Calculate the world position of the image before resize
            const imageFill = existingObject.fills?.find(
              (fill: any) => fill.type === "image" && fill.fit === "crop"
            );
            if (imageFill) {
              const oldImageWorldX =
                existingObject.x +
                ((imageFill as any).offsetX || 0) * existingObject.width;
              const oldImageWorldY =
                existingObject.y +
                ((imageFill as any).offsetY || 0) * existingObject.height;

              // Calculate new object dimensions
              const newWidth = changes.width ?? existingObject.width;
              const newHeight = changes.height ?? existingObject.height;
              const newX = changes.x ?? existingObject.x;
              const newY = changes.y ?? existingObject.y;

              // Calculate new offset to keep image at same world position
              const newOffsetX = (oldImageWorldX - newX) / newWidth;
              const newOffsetY = (oldImageWorldY - newY) / newHeight;

              // Update the image fill with compensating offsets
              changes.fills = existingObject.fills?.map((fill: any) => {
                if (fill.type === "image" && fill.fit === "crop") {
                  return {
                    ...fill,
                    offsetX: newOffsetX,
                    offsetY: newOffsetY,
                  };
                }
                return fill;
              });

              // DISABLED: Don't create currentTransform during crop area resize to avoid overlay jumps
              // This logic is commented out to prevent overlay jumps
              if (false && draft.cropMode.originalDimensions && imageFill) {
                // Calculate image size based on current scaling
                const currentScale = (imageFill as any).scale || 1;
                const currentScaleX = (imageFill as any).scaleX || currentScale;
                const currentScaleY = (imageFill as any).scaleY || currentScale;

                const newImageWidth =
                  draft.cropMode.originalDimensions!.width * currentScaleX;
                const newImageHeight =
                  draft.cropMode.originalDimensions!.height * currentScaleY;

                // Create or update currentTransform
                if (!draft.cropMode.currentTransform) {
                  // Create currentTransform if it doesn't exist
                  // CRITICAL: Use originalDimensions for size to match what overlay was showing
                  draft.cropMode.currentTransform = {
                    imageWorldX: oldImageWorldX,
                    imageWorldY: oldImageWorldY,
                    imageWidth: draft.cropMode.originalDimensions!.width, // Use original, not scaled
                    imageHeight: draft.cropMode.originalDimensions!.height, // Use original, not scaled
                  };

                  console.log(
                    "🌾 [CROP] CREATED CURRENT TRANSFORM for crop area resize:",
                    {
                      newCurrentTransform: draft.cropMode.currentTransform,
                      originalDimensions: draft.cropMode.originalDimensions,
                      scaledDimensions: {
                        width: newImageWidth,
                        height: newImageHeight,
                      },
                      reasoning:
                        "Using originalDimensions for size to prevent overlay jump (position fixed, size unchanged)",
                    }
                  );
                } else if (draft.cropMode.currentTransform) {
                  // Update existing currentTransform
                  draft.cropMode.currentTransform!.imageWorldX = oldImageWorldX;
                  draft.cropMode.currentTransform!.imageWorldY = oldImageWorldY;
                  draft.cropMode.currentTransform!.imageWidth = newImageWidth;
                  draft.cropMode.currentTransform!.imageHeight = newImageHeight;

                  console.log(
                    "🌾 [CROP] UPDATED EXISTING CURRENT TRANSFORM for crop area resize:",
                    {
                      updatedCurrentTransform: draft.cropMode.currentTransform,
                      reasoning:
                        "Updated existing currentTransform to track final state",
                    }
                  );
                }
              }
            }
          }
        }

        // Debug: Log absolutePositioned changes specifically
        if (changes.absolutePositioned !== undefined) {
          // IMPORTANT: When setting absolutePositioned to true, convert any "fill" sizing to "fixed"
          // Absolutely positioned objects cannot participate in auto-layout flow
          if (
            changes.absolutePositioned === true &&
            existingObject.autoLayoutSizing
          ) {
            const currentSizing = existingObject.autoLayoutSizing;
            const needsConversion =
              currentSizing.horizontal === "fill" ||
              currentSizing.vertical === "fill";

            if (needsConversion) {
              const newSizing = { ...currentSizing };
              if (currentSizing.horizontal === "fill") {
                newSizing.horizontal = "fixed";
              }
              if (currentSizing.vertical === "fill") {
                newSizing.vertical = "fixed";
              }

              // Add the sizing change to the same update
              changes.autoLayoutSizing = newSizing;
            }
          }
        }

        Object.assign(existingObject, changes);

        // Component sync is now handled by the holistic observer in store.ts
        // Override handling for instances is still done here
        // But skip override creation if this update is from component sync
        if (existingObject.componentId && !skipOverrideCreation) {
          // Find the specific instance that contains this object
          let targetInstanceObj: any = null;

          // If this object itself is an instance, it stores its own overrides
          if (existingObject.isComponentInstance) {
            targetInstanceObj = existingObject;
          } else {
            // Otherwise, find the instance that contains this object in its hierarchy
            // We need to traverse up the parent chain to find which instance this belongs to
            let currentParentId = existingObject.parentId;
            const visited = new Set<string>();

            while (currentParentId && !visited.has(currentParentId)) {
              visited.add(currentParentId);
              const parentObj = draft.objects[currentParentId];

              if (!parentObj) break;

              // If we found an instance object, this is our target
              if (
                parentObj.isComponentInstance &&
                parentObj.componentId === existingObject.componentId
              ) {
                targetInstanceObj = parentObj;
                break;
              }

              currentParentId = parentObj.parentId;
            }
          }

          // Only create overrides if we found a target instance
          if (targetInstanceObj) {
            // Initialize overrides if they don't exist
            if (!targetInstanceObj.overrides) {
              targetInstanceObj.overrides = {};
            }

            // Mark the changed properties as overridden
            let newOverrides = targetInstanceObj.overrides;
            Object.keys(changes).forEach((propertyPath) => {
              newOverrides = setPropertyOverride(
                newOverrides,
                id,
                propertyPath,
                changes[propertyPath as keyof typeof changes]
              );
            });
            targetInstanceObj.overrides = newOverrides;
          }
        }

        // Special case: Clean up width/height overrides when autoLayoutSizing changes from fill to fixed
        // This allows the new fixed dimensions to sync from main component to instances
        if (changes.autoLayoutSizing && existingObject.componentId) {
          const newSizing = changes.autoLayoutSizing;
          const isNowFixed =
            newSizing.horizontal === "fixed" || newSizing.vertical === "fixed";

          if (isNowFixed) {
            // Find the instance that contains this object and clean up size overrides
            let targetInstanceObj: any = null;

            if (existingObject.isComponentInstance) {
              targetInstanceObj = existingObject;
            } else {
              // Find parent instance
              let currentParentId = existingObject.parentId;
              const visited = new Set<string>();

              while (currentParentId && !visited.has(currentParentId)) {
                visited.add(currentParentId);
                const parentObj = draft.objects[currentParentId];

                if (!parentObj) break;

                if (parentObj.isComponentInstance) {
                  targetInstanceObj = parentObj;
                  break;
                }

                currentParentId = parentObj.parentId;
              }
            }

            if (targetInstanceObj?.overrides) {
              const overridesBefore = JSON.parse(
                JSON.stringify(targetInstanceObj.overrides)
              );
              let overridesChanged = false;

              // Remove width override if horizontal is now fixed
              if (
                newSizing.horizontal === "fixed" &&
                targetInstanceObj.overrides[id]?.width !== undefined
              ) {
                delete targetInstanceObj.overrides[id].width;
                overridesChanged = true;
              }

              // Remove height override if vertical is now fixed
              if (
                newSizing.vertical === "fixed" &&
                targetInstanceObj.overrides[id]?.height !== undefined
              ) {
                delete targetInstanceObj.overrides[id].height;
                overridesChanged = true;
              }

              // Clean up empty override objects
              if (
                targetInstanceObj.overrides[id] &&
                Object.keys(targetInstanceObj.overrides[id]).length === 0
              ) {
                delete targetInstanceObj.overrides[id];
                overridesChanged = true;
              }
            }
          }
        }

        // Additional cleanup: Remove overrides when size changes on fixed-sizing objects
        // This catches cases where autoLayoutSizing changed earlier but size changes later
        if (
          (changes.width !== undefined || changes.height !== undefined) &&
          existingObject.componentId
        ) {
          // Convert proxy to plain object to avoid corruption
          const currentSizing = JSON.parse(
            JSON.stringify(existingObject.autoLayoutSizing || {})
          );
          const isFixedSizing =
            currentSizing?.horizontal === "fixed" ||
            currentSizing?.vertical === "fixed";

          if (isFixedSizing) {
            // Find the instance that contains this object and clean up size overrides
            let targetInstanceObj: any = null;

            if (existingObject.isComponentInstance) {
              targetInstanceObj = existingObject;
            } else {
              // Find parent instance
              let currentParentId = existingObject.parentId;
              const visited = new Set<string>();

              while (currentParentId && !visited.has(currentParentId)) {
                visited.add(currentParentId);
                const parentObj = draft.objects[currentParentId];

                if (!parentObj) break;

                if (parentObj.isComponentInstance) {
                  targetInstanceObj = parentObj;
                  break;
                }

                currentParentId = parentObj.parentId;
              }
            }

            if (targetInstanceObj?.overrides) {
              const overridesBefore = JSON.parse(
                JSON.stringify(targetInstanceObj.overrides)
              );
              let overridesChanged = false;

              // Remove width override if width is changing and horizontal is fixed
              if (
                changes.width !== undefined &&
                currentSizing?.horizontal === "fixed" &&
                targetInstanceObj.overrides[id]?.width !== undefined
              ) {
                delete targetInstanceObj.overrides[id].width;
                overridesChanged = true;
              }

              // Remove height override if height is changing and vertical is fixed
              if (
                changes.height !== undefined &&
                currentSizing?.vertical === "fixed" &&
                targetInstanceObj.overrides[id]?.height !== undefined
              ) {
                delete targetInstanceObj.overrides[id].height;
                overridesChanged = true;
              }

              // Clean up empty override objects
              if (
                targetInstanceObj.overrides[id] &&
                Object.keys(targetInstanceObj.overrides[id]).length === 0
              ) {
                delete targetInstanceObj.overrides[id];
                overridesChanged = true;
              }
            }
          }
        }
      }
      break;
    }

    case "object.updated.preview": {
      // Preview version of object.updated for immediate visual feedback without undo history
      // This is a simplified version without logging or override handling
      const { id, changes } = event.payload;
      const existingObject = draft.objects[id];
      if (existingObject) {
        Object.assign(existingObject, changes);
      }
      break;
    }

    case "objects.updated.batch": {
      const { updates, skipOverrideCreation } = event.payload;

      // Apply all the updates
      updates.forEach(({ id, changes }) => {
        const existingObject = draft.objects[id];
        if (existingObject) {
          Object.assign(existingObject, changes);

          // Override handling for instances (same logic as object.updated case)
          // Check if this is an object within a component instance being manually modified
          // But skip override creation if this update is from component sync
          if (
            existingObject.componentId &&
            !skipOverrideCreation &&
            Object.keys(changes).length > 0
          ) {
            // Find the specific instance that contains this object
            let targetInstanceObj: any = null;

            // If this object itself is an instance, it stores its own overrides
            if (existingObject.isComponentInstance) {
              targetInstanceObj = existingObject;
            } else {
              // Otherwise, find the instance that contains this object in its hierarchy
              // We need to traverse up the parent chain to find which instance this belongs to
              let currentParentId = existingObject.parentId;
              const visited = new Set<string>();

              while (currentParentId && !visited.has(currentParentId)) {
                visited.add(currentParentId);
                const parentObj = draft.objects[currentParentId];

                if (!parentObj) break;

                // If we found an instance object, this is our target
                if (
                  parentObj.isComponentInstance &&
                  parentObj.componentId === existingObject.componentId
                ) {
                  targetInstanceObj = parentObj;
                  break;
                }

                currentParentId = parentObj.parentId;
              }
            }

            // Only create overrides if we found a target instance
            if (targetInstanceObj) {
              // Initialize overrides if they don't exist
              if (!targetInstanceObj.overrides) {
                targetInstanceObj.overrides = {};
              }

              // Mark the changed properties as overridden
              let newOverrides = targetInstanceObj.overrides;
              Object.keys(changes).forEach((propertyPath) => {
                newOverrides = setPropertyOverride(
                  newOverrides,
                  id,
                  propertyPath,
                  changes[propertyPath as keyof typeof changes]
                );
              });
              targetInstanceObj.overrides = newOverrides;
            }
          }
        }
      });

      // Component sync is now handled by the holistic observer in store.ts
      break;
    }

    case "object.deleted": {
      const { id } = event.payload;
      const objectToDelete = draft.objects[id];

      // Remove from parent's childIds if it has a parent
      if (objectToDelete && objectToDelete.parentId) {
        const parent = draft.objects[objectToDelete.parentId];
        if (parent) {
          // Remove from parent's childIds
          parent.childIds = parent.childIds.filter((childId) => childId !== id);
        }
      }

      delete draft.objects[id];
      draft.objectIds = draft.objectIds.filter((objId) => objId !== id);

      // Remove from selection if selected
      draft.selection.selectedIds = draft.selection.selectedIds.filter(
        (selectedId) => selectedId !== id
      );

      // Remove from all pages
      Object.values(draft.pages).forEach((page) => {
        page.objectIds = page.objectIds.filter((objId) => objId !== id);
      });

      break;
    }

    case "objects.deleted.batch": {
      const { ids } = event.payload;
      const idsToDelete = new Set(ids);

      for (const id of idsToDelete) {
        const objectToDelete = draft.objects[id];
        if (objectToDelete?.parentId && !idsToDelete.has(objectToDelete.parentId)) {
          const parent = draft.objects[objectToDelete.parentId];
          if (parent) {
            parent.childIds = parent.childIds.filter(
              (childId) => !idsToDelete.has(childId)
            );
          }
        }
        delete draft.objects[id];
      }

      draft.objectIds = draft.objectIds.filter((id) => !idsToDelete.has(id));
      draft.selection.selectedIds = draft.selection.selectedIds.filter(
        (id) => !idsToDelete.has(id)
      );
      Object.values(draft.pages).forEach((page) => {
        page.objectIds = page.objectIds.filter((id) => !idsToDelete.has(id));
      });

      break;
    }

    case "objects.moved": {
      const { objectIds, deltaX, deltaY } = event.payload;
      objectIds.forEach((id) => {
        const obj = draft.objects[id];
        if (obj) {
          obj.x = Math.round(obj.x + deltaX);
          obj.y = Math.round(obj.y + deltaY);
        }
      });
      // Component sync is now handled by the holistic observer in store.ts
      break;
    }

    case "drag.started": {
      // This event is only for history snapshots - no state changes needed
      break;
    }

    case "drag.completed": {
      const { reparentedUpdates, movedObjects } = event.payload;

      // Apply position updates for reparented objects
      reparentedUpdates.forEach(({ objectId, newPosition }) => {
        const obj = draft.objects[objectId];
        if (obj) {
          obj.x = Math.round(newPosition.x);
          obj.y = Math.round(newPosition.y);
        }
      });

      // Apply movement for non-reparented objects
      if (movedObjects) {
        movedObjects.objectIds.forEach((id) => {
          const obj = draft.objects[id];
          if (obj) {
            obj.x = Math.round(obj.x + movedObjects.deltaX);
            obj.y = Math.round(obj.y + movedObjects.deltaY);
          }
        });
      }

      // Component sync is now handled by the holistic observer in store.ts
      break;
    }

    case "resize.started": {
      // This event is only for history snapshots - no state changes needed
      break;
    }

    case "resize.completed": {
      // Resize changes are applied live via object.updated events
      // This event is for completion tracking
      break;
    }

    case "objects.duplicated": {
      const { duplicatedObjects, originalIds } = event.payload;

      duplicatedObjects.forEach((obj) => {
        draft.objects[obj.id] = obj;
        draft.objectIds.push(obj.id);

        // Add object to current page
        if (draft.currentPageId && draft.pages[draft.currentPageId]) {
          draft.pages[draft.currentPageId].objectIds.push(obj.id);
        }

        // CRITICAL: Add to parent's childIds if it has a parent
        if (obj.parentId && draft.objects[obj.parentId]) {
          const parent = draft.objects[obj.parentId];
          if (!parent.childIds) {
            parent.childIds = [];
          }

          // Only add if not already present (avoid duplicates)
          if (!parent.childIds.includes(obj.id)) {
            // Check if parent has auto layout to determine insertion strategy
            const hasAutoLayout = checkAutoLayout(parent);

            if (hasAutoLayout) {
              // For auto layout frames, try to find a corresponding original object
              // This is a simplified approach since we don't have the exact mapping
              const correspondingOriginal = originalIds.find(
                (originalId) =>
                  draft.objects[originalId]?.parentId === obj.parentId
              );

              if (correspondingOriginal) {
                const originalIndex = parent.childIds.indexOf(
                  correspondingOriginal
                );
                if (originalIndex !== -1) {
                  // Insert immediately after the original
                  parent.childIds.splice(originalIndex + 1, 0, obj.id);
                } else {
                  // Fallback: add at the end
                  parent.childIds.push(obj.id);
                }
              } else {
                // No original found, add at the end
                parent.childIds.push(obj.id);
              }
            } else {
              // For non-auto layout frames, just add at the end
              parent.childIds.push(obj.id);
            }
          }
        }
      });

      break;
    }

    case "selection.changed": {
      const { selectedIds } = event.payload;

      // Exit text edit mode if we're deselecting a text object that was being edited
      const previousSelection = draft.selection.selectedIds;

      // Find any text objects that were previously selected and are now deselected
      const deselectedIds = previousSelection.filter(
        (id) => !selectedIds.includes(id)
      );

      deselectedIds.forEach((id) => {
        const obj = draft.objects[id];
        if (
          obj &&
          obj.type === "text" &&
          obj.properties.type === "text" &&
          (obj.properties as any).isEditing
        ) {
          // Exit edit mode for this text object
          const currentProperties = obj.properties;
          obj.properties = {
            ...currentProperties,
            isEditing: false,
          };
        }
      });

      draft.selection.selectedIds = selectedIds;

      // Update selection bounds if needed
      if (selectedIds.length > 0) {
        // Calculate selection bounds - we'll implement this later
        draft.selection.selectionBounds = undefined; // TODO: calculate bounds
      } else {
        draft.selection.selectionBounds = undefined;
      }
      break;
    }

    case "object.hovered": {
      const { objectId } = event.payload;
      draft.selection.hoveredId = objectId;
      break;
    }

    case "viewport.changed": {
      const { viewport } = event.payload;
      draft.viewport = viewport;
      break;
    }

    case "tool.changed": {
      const { tool } = event.payload;
      draft.tools.activeTool = tool;
      break;
    }

    case "tool.interaction.started": {
      const { tool, startPoint } = event.payload;
      draft.tools.isCreating = true;

      // Create initial preview based on tool type
      if (tool === "rectangle" || tool === "frame" || tool === "ellipse" || tool === "make") {
        const defaultFills =
          tool === "frame" || tool === "make"
            ? [createSolidFill("#ffffff", 1, true)] // White fill for frames and makes
            : tool === "rectangle"
            ? [createSolidFill("#D9D9D9", 1, true)] // Light gray fill for rectangles
            : [createSolidFill("#f59e0b", 1, true)]; // Orange fill for ellipses

        draft.tools.creationPreview = {
          id: "preview",
          type: tool,
          name: tool === "make" ? "Make" : tool.charAt(0).toUpperCase() + tool.slice(1),
          createdAt: Date.now(),
          x: Math.round(startPoint.x),
          y: Math.round(startPoint.y),
          width: 0,
          height: 0,
          rotation: 0,
          fills: defaultFills, // Use new fills system for all shapes
          fill: undefined, // Don't use legacy fill
          stroke:
            tool === "frame" || tool === "make"
              ? undefined
              : tool === "rectangle"
              ? undefined
              : "#d97706",
          strokeWidth: tool === "frame" || tool === "make" ? 0 : tool === "rectangle" ? 0 : 2,
          opacity: 1,
          parentId: undefined,
          childIds: [],
          zIndex: 0,
          visible: true,
          locked: false,
          properties:
            tool === "make"
              ? {
                  type: "make" as const,
                  mode: "react" as const,
                  code: DEFAULT_REACT_CODE,
                  chatHistory: [],
                  playing: false,
                  borderRadius: 8,
                  overflow: "hidden" as const,
                }
              : tool === "frame"
              ? {
                  type: "frame",
                  borderRadius: 0,
                  overflow: "hidden",
                }
              : tool === "rectangle"
              ? { type: "rectangle", borderRadius: 0 }
              : { type: "ellipse" },
        };
      } else if (tool === "text") {
        // Text tool: defer creation until completion to detect click vs drag
        draft.tools.isCreating = true;

        // Don't create preview initially - only create during drag
        draft.tools.creationPreview = undefined;
      }
      break;
    }

    case "tool.interaction.updated": {
      const { currentPoint, startPoint, tool } = event.payload;

      if (draft.tools.creationPreview) {
        // Calculate bounds from start and current point
        const minX = Math.min(startPoint.x, currentPoint.x);
        const minY = Math.min(startPoint.y, currentPoint.y);
        const maxX = Math.max(startPoint.x, currentPoint.x);
        const maxY = Math.max(startPoint.y, currentPoint.y);

        draft.tools.creationPreview.x = Math.round(minX);
        draft.tools.creationPreview.y = Math.round(minY);
        draft.tools.creationPreview.width = Math.round(maxX - minX);
        draft.tools.creationPreview.height = Math.round(maxY - minY);
      } else if (tool === "text" && draft.tools.isCreating) {
        // For text tool, create preview only when there's movement
        const deltaX = Math.abs(currentPoint.x - startPoint.x);
        const deltaY = Math.abs(currentPoint.y - startPoint.y);

        // Only create preview if there's enough movement to indicate dragging
        if (deltaX > 5 || deltaY > 5) {
          const minX = Math.min(startPoint.x, currentPoint.x);
          const minY = Math.min(startPoint.y, currentPoint.y);
          const maxX = Math.max(startPoint.x, currentPoint.x);
          const maxY = Math.max(startPoint.y, currentPoint.y);

          draft.tools.creationPreview = {
            x: Math.round(minX),
            y: Math.round(minY),
            width: Math.round(maxX - minX),
            height: Math.round(maxY - minY),
          };
        }
      }
      break;
    }

    case "tool.interaction.completed": {
      const { tool, startPoint, endPoint } = event.payload;

      // Text tool: create with click vs drag detection
      if (tool === "text") {
        // Calculate if this was a click (same point) or drag (different points)
        const deltaX = Math.abs(endPoint.x - startPoint.x);
        const deltaY = Math.abs(endPoint.y - startPoint.y);
        const isDrag = deltaX > 5 || deltaY > 5; // Threshold for drag detection

        // Determine text bounds and resize mode based on interaction type
        let textBounds;
        let resizeMode: "auto-width" | "fixed";

        if (isDrag) {
          // Drag mode: create fixed-size text with dragged dimensions
          const minX = Math.round(Math.min(startPoint.x, endPoint.x));
          const minY = Math.round(Math.min(startPoint.y, endPoint.y));
          const maxX = Math.round(Math.max(startPoint.x, endPoint.x));
          const maxY = Math.round(Math.max(startPoint.y, endPoint.y));

          textBounds = {
            x: minX,
            y: minY,
            width: Math.max(50, maxX - minX), // Minimum width of 50px
            height: Math.max(20, maxY - minY), // Minimum height of 20px
          };
          resizeMode = "fixed";
        } else {
          // Click mode: create auto-width text at click point
          textBounds = {
            x: Math.round(startPoint.x),
            y: Math.round(startPoint.y),
            width: 1, // Minimal width for auto-width
            height: 20, // Single line height
          };
          resizeMode = "auto-width";
        }

        // Find appropriate parent frame for automatic nesting
        const parentFrameId = findParentFrame(textBounds, draft.objects);

        // Convert coordinates to be relative to parent if nested
        const relativeCoords = convertToRelativeCoordinates(
          textBounds,
          parentFrameId,
          draft.objects
        );

        // Create the text object
        const newTextObject: CanvasObject = {
          id: nanoid(),
          type: "text",
          name: "Text",
          createdAt: Date.now(),
          x: Math.round(relativeCoords.x),
          y: Math.round(relativeCoords.y),
          width: Math.round(relativeCoords.width),
          height: Math.round(relativeCoords.height),
          rotation: 0,
          fills: undefined, // Text doesn't use fills
          fill: undefined,
          stroke: undefined,
          strokeWidth: 0,
          opacity: 1,
          parentId: parentFrameId,
          childIds: [],
          zIndex: draft.objectIds.length,
          visible: true,
          locked: false,
          autoLayoutSizing:
            resizeMode === "auto-width"
              ? { horizontal: "hug" as const, vertical: "hug" as const }
              : getDefaultAutoLayoutSizing(),
          properties: {
            type: "text",
            content: "",
            fontSize: 16,
            fontFamily: "Inter, sans-serif",
            fontWeight: 400,
            textAlign: "left",
            verticalAlign: "top",
            lineHeight: { value: 19, unit: "px" },
            letterSpacing: { value: 0, unit: "px" },
            resizeMode,
            isEditing: true, // Start in edit mode immediately
          },
        };

        // Add to objects and update indices
        draft.objects[newTextObject.id] = newTextObject;
        draft.objectIds.push(newTextObject.id);

        // Add object to current page
        if (draft.currentPageId && draft.pages[draft.currentPageId]) {
          draft.pages[draft.currentPageId].objectIds.push(newTextObject.id);
        }

        // Update parent frame's children list if nested
        if (parentFrameId) {
          addChildToParent(newTextObject.id, parentFrameId, draft.objects);
        }

        // Always select text objects after creation (they need to be selected for editing)
        draft.selection.selectedIds = [newTextObject.id];

        // Clean up creation state
        draft.tools.isCreating = false;
        draft.tools.creationPreview = undefined;
        draft.tools.activeTool = "select";
        break;
      }

      // Calculate final bounds with rounding for drag-based tools
      const minX = Math.round(Math.min(startPoint.x, endPoint.x));
      const minY = Math.round(Math.min(startPoint.y, endPoint.y));
      const maxX = Math.round(Math.max(startPoint.x, endPoint.x));
      const maxY = Math.round(Math.max(startPoint.y, endPoint.y));
      const width = maxX - minX;
      const height = maxY - minY;

      // Only create object if it has meaningful size
      if (width > 5 && height > 5) {
        // Find appropriate parent frame for automatic nesting
        const objectBounds = { x: minX, y: minY, width, height };
        const parentFrameId = findParentFrame(objectBounds, draft.objects);

        // Convert coordinates to be relative to parent if nested
        const relativeCoords = convertToRelativeCoordinates(
          objectBounds,
          parentFrameId,
          draft.objects
        );

        // Create the actual object
        const newObject: CanvasObject = {
          id: nanoid(),
          type: tool as any,
          name: tool === "make" ? "Make" : tool.charAt(0).toUpperCase() + tool.slice(1),
          createdAt: Date.now(),
          x: Math.round(relativeCoords.x),
          y: Math.round(relativeCoords.y),
          width: Math.round(relativeCoords.width),
          height: Math.round(relativeCoords.height),
          rotation: 0,
          fills:
            tool === "frame" || tool === "make"
              ? [createSolidFill("#ffffff", 1, true)] // White fill for frames and makes
              : tool === "rectangle"
              ? [createSolidFill("#D9D9D9", 1, true)] // Light gray fill for rectangles
              : [createSolidFill("#f59e0b", 1, true)], // Orange fill for ellipses
          fill: undefined, // Don't use legacy fill
          stroke:
            tool === "frame" || tool === "make"
              ? undefined
              : tool === "rectangle"
              ? undefined
              : "#d97706",
          strokeWidth: tool === "frame" || tool === "make" ? 0 : tool === "rectangle" ? 0 : 2,
          opacity: 1,
          parentId: parentFrameId,
          childIds: [],
          zIndex: draft.objectIds.length,
          visible: true,
          locked: false,
          autoLayoutSizing: getDefaultAutoLayoutSizing(),
          properties:
            tool === "make"
              ? {
                  type: "make" as const,
                  mode: "react" as const,
                  code: DEFAULT_REACT_CODE,
                  chatHistory: [],
                  playing: false,
                  borderRadius: 0,
                  overflow: "hidden" as const,
                }
              : tool === "frame"
              ? {
                  type: "frame",
                  borderRadius: 0,
                  overflow: "hidden",
                  autoLayout: {
                    mode: "none",
                    gap: 8,
                    padding: { top: 16, right: 16, bottom: 16, left: 16 },
                    alignItems: "start",
                    justifyContent: "start",
                  },
                }
              : tool === "rectangle"
              ? { type: "rectangle", borderRadius: 0 }
              : { type: "ellipse" },
        };

        // Add to objects and update indices
        draft.objects[newObject.id] = newObject;
        draft.objectIds.push(newObject.id);

        // Add object to current page
        if (draft.currentPageId && draft.pages[draft.currentPageId]) {
          draft.pages[draft.currentPageId].objectIds.push(newObject.id);
        }

        // Update parent frame's children list if nested
        if (parentFrameId) {
          addChildToParent(newObject.id, parentFrameId, draft.objects);

          // Component sync is now handled by the holistic observer in store.ts
        }

        // For frames: reparent sibling objects that are fully enclosed
        // within the new frame's bounds. This makes it easy to "draw a
        // frame around" existing objects to group them.
        if (tool === "frame") {
          const frameX = newObject.x;
          const frameY = newObject.y;
          const frameRight = frameX + newObject.width;
          const frameBottom = frameY + newObject.height;

          // Find siblings — objects sharing the same parent
          const siblingIds = parentFrameId
            ? (draft.objects[parentFrameId]?.childIds || []).filter(
                (id: string) => id !== newObject.id
              )
            : draft.objectIds.filter((id: string) => {
                const obj = draft.objects[id];
                return obj && !obj.parentId && id !== newObject.id;
              });

          const enclosedIds: string[] = [];
          for (const sibId of siblingIds) {
            const sib = draft.objects[sibId];
            if (!sib || sib.locked) continue;

            // Check if fully enclosed
            if (
              sib.x >= frameX &&
              sib.y >= frameY &&
              sib.x + sib.width <= frameRight &&
              sib.y + sib.height <= frameBottom
            ) {
              enclosedIds.push(sibId);
            }
          }

          // Reparent enclosed objects into the new frame
          for (const enclosedId of enclosedIds) {
            const enclosed = draft.objects[enclosedId];
            if (!enclosed) continue;

            // Remove from old parent's childIds
            if (parentFrameId && draft.objects[parentFrameId]) {
              const parentChildren = draft.objects[parentFrameId].childIds;
              const idx = parentChildren.indexOf(enclosedId);
              if (idx !== -1) parentChildren.splice(idx, 1);
            }

            // Add to new frame's childIds
            draft.objects[newObject.id].childIds.push(enclosedId);

            // Update parentId and convert coordinates to be relative
            // to the new frame
            enclosed.parentId = newObject.id;
            enclosed.x = enclosed.x - frameX;
            enclosed.y = enclosed.y - frameY;
          }
        }

        // Only select if there was enough movement (5 pixels)
        const deltaX = Math.abs(endPoint.x - startPoint.x);
        const deltaY = Math.abs(endPoint.y - startPoint.y);
        if (deltaX >= 5 || deltaY >= 5) {
          draft.selection.selectedIds = [newObject.id];
        }

      }

      // Clean up creation state after object creation
      draft.tools.isCreating = false;
      draft.tools.creationPreview = undefined;
      // Auto-switch back to select tool after creating object
      draft.tools.activeTool = "select";

      break;
    }

    case "object.reparented": {
      const { objectId, newParentId, previousParentId, newIndex } =
        event.payload;
      const obj = draft.objects[objectId];

      if (obj) {
        // Remove from previous parent's children
        if (previousParentId) {
          const previousParent = draft.objects[previousParentId];
          if (previousParent) {
            previousParent.childIds = previousParent.childIds.filter(
              (id) => id !== objectId
            );
          }
        }

        // Add to new parent's children
        if (newParentId) {
          const newParent = draft.objects[newParentId];
          if (newParent) {
            newParent.childIds.splice(newIndex, 0, objectId);
          }
        }

        // Update object's parent reference
        obj.parentId = newParentId;
      }
      break;
    }

    case "object.reordered": {
      const { objectId, parentId, newIndex, previousIndex } = event.payload;
      const parent = draft.objects[parentId];

      if (parent && parent.childIds) {
        // Remove from current position
        const childToMove = parent.childIds.splice(previousIndex, 1)[0];

        // Insert at new position
        parent.childIds.splice(newIndex, 0, childToMove);
      }
      break;
    }

    case "objects.reordered.batch": {
      const { parentId, reorders } = event.payload;
      const parent = draft.objects[parentId];

      if (parent && parent.childIds) {
        // Sort reorders by descending previousIndex to avoid index shifting issues
        const sortedReorders = [...reorders].sort(
          (a, b) => b.previousIndex - a.previousIndex
        );

        // Remove all items first (from highest index to lowest)
        const itemsToMove: { objectId: string; newIndex: number }[] = [];
        sortedReorders.forEach(({ objectId, previousIndex, newIndex }) => {
          const removedChild = parent.childIds.splice(previousIndex, 1)[0];
          itemsToMove.push({ objectId: removedChild, newIndex });
        });

        // Sort by final insertion index and insert
        itemsToMove.sort((a, b) => a.newIndex - b.newIndex);
        itemsToMove.forEach(({ objectId, newIndex }) => {
          parent.childIds.splice(newIndex, 0, objectId);
        });
      }
      break;
    }

    case "object.reparented.withCoordinates": {
      const {
        objectId,
        newParentId,
        previousParentId,
        newIndex,
        newPosition,
        previousPosition,
      } = event.payload;
      // const isLiveReparenting = event.payload.isLiveReparenting || false;
      const obj = draft.objects[objectId];

      if (obj) {
        // STEP 1: Handle parent relationships
        // Remove from previous parent's children
        if (previousParentId) {
          const previousParent = draft.objects[previousParentId];
          if (previousParent) {
            previousParent.childIds = previousParent.childIds.filter(
              (id) => id !== objectId
            );
          }
        }

        // Add to new parent's children
        if (newParentId) {
          const newParent = draft.objects[newParentId];
          if (newParent) {
            newParent.childIds.splice(newIndex, 0, objectId);
          }
        }

        // Update object's parent reference
        obj.parentId = newParentId;

        // STEP 1.5: Reset absolute positioning only when leaving original parent
        // Only reset if moving to a different parent (not just reordering within same parent)
        if (obj.absolutePositioned && previousParentId !== newParentId) {
          obj.absolutePositioned = false;
        }
        // Use original drag state if available, otherwise fall back to basic logic
        const {
          shouldRestoreAbsolute,
          wasOriginallyAbsolute,
          originalParentId,
        } = event.payload;

        if (shouldRestoreAbsolute) {
          // OLD RESTORATION LOGIC DISABLED - we always want to reset absolutePositioned
          // obj.absolutePositioned = wasOriginallyAbsolute; // DISABLED
        } else if (obj.absolutePositioned) {
          // Apply standard logic for other reparenting cases
          const newParent = newParentId ? draft.objects[newParentId] : null;
          const newParentHasAutoLayout =
            newParent?.type === "frame" &&
            newParent.properties?.type === "frame" &&
            newParent.properties.autoLayout?.mode !== "none";

          // Turn off absolute positioning if:
          // 1. Moving to root canvas (no parent) - absolute positioning only makes sense within AL frames
          // 2. Moving to a frame that has no auto layout
          if (
            !newParentId ||
            (newParent && newParent.type === "frame" && !newParentHasAutoLayout)
          ) {
            obj.absolutePositioned = false;
          }
        }

        // STEP 1.6: Handle component membership when moving into a component
        if (newParentId) {
          const newParent = draft.objects[newParentId];
          if (newParent?.componentId) {
            // Object is being moved into a component, assign the componentId
            obj.componentId = newParent.componentId;

            // Clear any existing position overrides for this object in all instances
            // since this is a new addition to the component
            const component = draft.components[newParent.componentId];
            if (component) {
              Object.values(draft.objects).forEach((otherObj) => {
                if (
                  otherObj.isComponentInstance &&
                  otherObj.componentId === newParent.componentId &&
                  otherObj.overrides
                ) {
                  // Remove position overrides for the newly added object
                  const updatedOverrides = { ...otherObj.overrides };
                  delete updatedOverrides[objectId];
                  otherObj.overrides = updatedOverrides;
                }
              });
            }
          }
        } else if (previousParentId) {
          const previousParent = draft.objects[previousParentId];
          if (previousParent?.componentId && obj.componentId) {
            // Object is being moved out of a component, remove componentId
            delete obj.componentId;
          }
        }

        obj.x = Math.round(newPosition.x);
        obj.y = Math.round(newPosition.y);
      }
      break;
    }

    // Component events
    case "component.created": {
      const { component, sourceObjectIds } = event.payload;

      // Add component to registry
      draft.components[component.id] = component;
      draft.componentIds.push(component.id);

      // Mark ALL source objects as part of the component
      sourceObjectIds.forEach((objectId) => {
        const object = draft.objects[objectId];
        if (object) {
          object.componentId = component.id;
          // Only the main object gets the isMainComponent flag - but preserve original type
          if (objectId === component.mainObjectId) {
            object.isMainComponent = true;
            // Don't change the type - preserve original (frame, rectangle, etc.)
          }
        }
      });

      break;
    }

    case "component.updated": {
      const { componentId, changes } = event.payload;
      const existingComponent = draft.components[componentId];
      if (existingComponent) {
        Object.assign(existingComponent, changes);
      }
      break;
    }

    case "component.deleted": {
      const { componentId } = event.payload;

      // Remove component from registry
      delete draft.components[componentId];
      draft.componentIds = draft.componentIds.filter(
        (id) => id !== componentId
      );

      // Find and update all instances of this component
      Object.values(draft.objects).forEach((obj) => {
        if (obj.isComponentInstance && obj.componentId === componentId) {
          // Convert instance back to regular object or delete
          // Remove the component reference and instance flag
          delete obj.componentId;
          delete obj.variantId;
          delete obj.overrides;
          delete obj.isComponentInstance;
          // Keep original type - no need to convert to frame
        }
      });

      // Find and update the main component object
      Object.values(draft.objects).forEach((obj) => {
        if (obj.componentId === componentId && obj.isMainComponent) {
          delete obj.componentId;
          delete obj.isMainComponent;
        }
      });

      break;
    }

    case "instance.created": {
      const { instance } = event.payload;

      // Add instance to objects
      draft.objects[instance.id] = instance;
      draft.objectIds.push(instance.id);

      // Add object to current page
      if (draft.currentPageId && draft.pages[draft.currentPageId]) {
        draft.pages[draft.currentPageId].objectIds.push(instance.id);
      }

      break;
    }

    case "instance.updated": {
      const { instanceId, overrides } = event.payload;
      const instance = draft.objects[instanceId];
      if (instance && instance.isComponentInstance) {
        instance.overrides = overrides;
      }
      break;
    }

    case "component.synced": {
      const { componentId, changes } = event.payload;

      // Apply changes to all instances
      changes.forEach(({ instanceId, objectUpdates }) => {
        objectUpdates.forEach(({ id, changes: objectChanges }) => {
          const obj = draft.objects[id];
          if (obj) {
            Object.assign(obj, objectChanges);
          }
        });
      });

      break;
    }

    // Clipboard events
    case "objects.copied": {
      // Copy events are primarily for logging/tracking - no state changes needed
      const { sourceIds } = event.payload;

      break;
    }

    case "objects.cut": {
      // Cut events now immediately remove objects from canvas
      const { sourceIds, removedObjectIds } = event.payload;

      if (removedObjectIds) {
        removedObjectIds.forEach((id) => {
          // Remove from objects and objectIds
          delete draft.objects[id];
          const objectIndex = draft.objectIds.indexOf(id);
          if (objectIndex !== -1) {
            draft.objectIds.splice(objectIndex, 1);
          }

          // Remove from parent's children
          Object.values(draft.objects).forEach((obj) => {
            if (obj && obj.childIds.includes(id)) {
              const childIndex = obj.childIds.indexOf(id);
              obj.childIds.splice(childIndex, 1);
            }
          });

          // Remove from current page
          if (draft.currentPageId && draft.pages[draft.currentPageId]) {
            const pageIndex =
              draft.pages[draft.currentPageId].objectIds.indexOf(id);
            if (pageIndex !== -1) {
              draft.pages[draft.currentPageId].objectIds.splice(pageIndex, 1);
            }
          }

          // Clear from selection if selected
          const selectionIndex = draft.selection.selectedIds.indexOf(id);
          if (selectionIndex !== -1) {
            draft.selection.selectedIds.splice(selectionIndex, 1);
          }
        });
      }

      break;
    }

    case "objects.pasted": {
      const { pastedObjects, selectPasted = true } = event.payload;

      // Add the pasted objects
      pastedObjects.forEach((obj) => {
        draft.objects[obj.id] = obj;
        draft.objectIds.push(obj.id);

        // Add to current page
        if (draft.currentPageId && draft.pages[draft.currentPageId]) {
          draft.pages[draft.currentPageId].objectIds.push(obj.id);
        }

        // If object has a parent, add it to parent's children
        if (obj.parentId && draft.objects[obj.parentId]) {
          const parent = draft.objects[obj.parentId];
          if (!parent.childIds.includes(obj.id)) {
            parent.childIds.push(obj.id);
          }
        }
      });

      // Select only top-level pasted objects unless selectPasted is false (e.g. AI-generated)
      if (selectPasted) {
        const topLevelPastedObjects = pastedObjects.filter(
          (obj) =>
            !obj.parentId || !pastedObjects.find((p) => p.id === obj.parentId)
        );
        draft.selection.selectedIds = topLevelPastedObjects.map((obj) => obj.id);
        draft.selection.hoveredId = undefined;
        draft.selection.selectionBounds = undefined;
      }

      break;
    }

    case "objects.duplicated": {
      const { duplicatedObjects } = event.payload;

      // Add the duplicated objects
      duplicatedObjects.forEach((obj) => {
        draft.objects[obj.id] = obj;
        draft.objectIds.push(obj.id);

        // Add to current page
        if (draft.currentPageId && draft.pages[draft.currentPageId]) {
          draft.pages[draft.currentPageId].objectIds.push(obj.id);
        }

        // If object has a parent, add it to parent's children
        if (obj.parentId && draft.objects[obj.parentId]) {
          const parent = draft.objects[obj.parentId];
          if (!parent.childIds.includes(obj.id)) {
            // For auto layout frames, insert at the end to preserve order
            parent.childIds.push(obj.id);
          }
        }
      });

      break;
    }

    case "image.pasted": {
      const { imageObject } = event.payload;

      // Add the image object
      draft.objects[imageObject.id] = imageObject;
      draft.objectIds.push(imageObject.id);

      // Add to current page
      if (draft.currentPageId && draft.pages[draft.currentPageId]) {
        draft.pages[draft.currentPageId].objectIds.push(imageObject.id);
      }

      // If object has a parent, add it to parent's children
      if (imageObject.parentId && draft.objects[imageObject.parentId]) {
        const parent = draft.objects[imageObject.parentId];
        if (!parent.childIds.includes(imageObject.id)) {
          parent.childIds.push(imageObject.id);
        }
      }

      // Select the pasted image
      draft.selection.selectedIds = [imageObject.id];
      draft.selection.hoveredId = undefined;
      draft.selection.selectionBounds = undefined;

      break;
    }

    case "LOAD_DEMO_SCENE": {
      const { objects, objectIds, pages, pageIds, currentPageId } =
        event.payload;

      // Clear current state and load demo scene
      draft.objects = objects;
      draft.objectIds = objectIds;
      draft.pages = pages;
      draft.pageIds = pageIds;
      draft.currentPageId = currentPageId;

      // Clear selection
      draft.selection.selectedIds = [];
      draft.selection.hoveredId = undefined;
      draft.selection.selectionBounds = undefined;

      break;
    }

    case "canvas.state.loaded": {
      // Load entire canvas state from persistence
      const payload = event.payload as {
        objects: Record<string, any>;
        objectIds: string[];
        pages: Record<string, any>;
        pageIds: string[];
        currentPageId: string | null;
        components: Record<string, any>;
        componentIds: string[];
        canvasSettings: any;
      };

      // Replace entire state with loaded data
      draft.objects = payload.objects;
      draft.objectIds = payload.objectIds;
      draft.pages = payload.pages;
      draft.pageIds = payload.pageIds;
      draft.currentPageId = payload.currentPageId;
      draft.components = payload.components;
      draft.componentIds = payload.componentIds;
      draft.canvasSettings = payload.canvasSettings;

      // One-time migration + cleanup when loading from storage
      Object.values(draft.objects).forEach((obj: any) => {
        if (!obj.autoLayoutSizing) {
          obj.autoLayoutSizing = getDefaultAutoLayoutSizing();
        }
        if (obj.type === "text" && obj.properties && obj.properties.isEditing) {
          obj.properties.isEditing = false;
        }
      });

      // Clear selection when loading
      draft.selection.selectedIds = [];
      draft.selection.hoveredId = undefined;
      draft.selection.selectionBounds = undefined;

      // Ensure objects are migrated to pages (in case of legacy data)
      migrateObjectsToPages(draft);

      console.log("📂 [PERSISTENCE] Canvas state loaded from storage");
      break;
    }

    case "canvas.state.reset": {
      // Reset to fresh canvas state
      draft.objects = {};
      draft.objectIds = [];
      draft.pages = {
        "page-1": {
          id: "page-1",
          name: "Page 1",
          objectIds: [],
        },
      };
      draft.pageIds = ["page-1"];
      draft.currentPageId = "page-1";
      draft.components = {};
      draft.componentIds = [];
      draft.selection.selectedIds = [];
      draft.selection.hoveredId = undefined;
      draft.selection.selectionBounds = undefined;
      draft.canvasSettings = {
        backgroundColor: "#f5f5f5",
        backgroundOpacity: 1,
      };

      console.log("🆕 [PERSISTENCE] Canvas reset to fresh state");
      break;
    }

    default:
      // Unknown event type - log for debugging but don't throw
      break;
  }
}
