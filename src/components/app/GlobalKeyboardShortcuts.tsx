"use client";

import {
  createUndoRedoShortcuts,
  useKeyboardShortcuts,
} from "@/core/hooks/useKeyboardShortcuts";
import { useSettingsShortcuts } from "@/core/hooks/useSettingsShortcuts";
import { ClipboardOperations } from "@/core/services/clipboardOperations";
import { applyAutoLayout } from "@/core/utils/applyAutoLayout";
import { calculateGroupBounds } from "@/core/utils/selection";
import { worldToScreen } from "@/core/utils/coordinates";
import { useAppStore } from "@/core/state/store";
import { useNavigation } from "@/contexts/NavigationContext";
import { useCallback, useEffect, useRef } from "react";

/**
 * Global keyboard shortcuts that work across the entire application
 * Place this component at the app level to enable system-wide shortcuts
 */
export default function GlobalKeyboardShortcuts() {
  // Enable settings keyboard shortcuts
  useSettingsShortcuts();
  const { setActiveTab } = useNavigation();

  // Store references to zoom functions from canvas
  const zoomToFitRef = useRef<(() => void) | null>(null);
  const zoomTo100Ref = useRef<(() => void) | null>(null);
  const zoomInRef = useRef<(() => void) | null>(null);
  const zoomOutRef = useRef<(() => void) | null>(null);
  const zoomToPercentRef = useRef<((percent: number) => void) | null>(null);

  // Initialize paste event listener on mount
  useEffect(() => {
    ClipboardOperations.initializePasteEventListener();
  }, []);

  // Expose zoom functions globally via window object
  useEffect(() => {
    (window as any).__figmaCloneZoomToFit = zoomToFitRef;
    (window as any).__figmaCloneZoomTo100 = zoomTo100Ref;
    (window as any).__figmaCloneZoomIn = zoomInRef;
    (window as any).__figmaCloneZoomOut = zoomOutRef;
    (window as any).__figmaCloneZoomToPercent = zoomToPercentRef;
    return () => {
      delete (window as any).__figmaCloneZoomToFit;
      delete (window as any).__figmaCloneZoomTo100;
      delete (window as any).__figmaCloneZoomIn;
      delete (window as any).__figmaCloneZoomOut;
      delete (window as any).__figmaCloneZoomToPercent;
    };
  }, []);

  const dispatch = useAppStore((state) => state.dispatch);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const activeTool = useAppStore((state) => state.tools.activeTool);
  const selectedIds = useAppStore((state) => state.selection.selectedIds);
  const objects = useAppStore((state) => state.objects);
  const getViewport = useCallback(() => useAppStore.getState().viewport, []);
  const createComponent = useAppStore((state) => state.createComponent);
  const createInstance = useAppStore((state) => state.createInstance);
  const getSelectedObjects = useAppStore((state) => state.getSelectedObjects);

  const getComponentByObjectId = useAppStore(
    (state) => state.getComponentByObjectId
  );

  // Check if text is currently being edited (used to skip shortcuts during text editing)
  const isTextBeingEdited = useCallback(() => {
    return Object.values(objects).some((obj) => {
      return (
        obj &&
        obj.type === "text" &&
        obj.properties.type === "text" &&
        (obj.properties as any).isEditing
      );
    });
  }, [objects]);

  // Arrow key handlers for AL reordering
  const moveItemsInAutoLayout = useCallback(
    (direction: "left" | "right" | "up" | "down") => {
      if (isTextBeingEdited()) {
        return;
      }

      if (selectedIds.length === 0) {
        return;
      }

      // Group selected items by their AL parent
      const alChildrenGroups: Record<string, string[]> = {};

      selectedIds.forEach((objectId) => {
        const object = objects[objectId];
        if (object?.parentId) {
          const parent = objects[object.parentId];
          // Check if parent is an AL frame
          if (
            parent?.type === "frame" &&
            parent.properties?.type === "frame" &&
            parent.properties.autoLayout?.mode &&
            parent.properties.autoLayout.mode !== "none"
          ) {
            const alMode = parent.properties.autoLayout.mode;
            // Check if direction matches AL orientation
            const isValidDirection =
              (alMode === "horizontal" &&
                (direction === "left" || direction === "right")) ||
              (alMode === "vertical" &&
                (direction === "up" || direction === "down"));

            if (isValidDirection) {
              if (!alChildrenGroups[object.parentId]) {
                alChildrenGroups[object.parentId] = [];
              }
              alChildrenGroups[object.parentId].push(objectId);
            }
          }
        }
      });

      if (Object.keys(alChildrenGroups).length === 0) {
        return;
      }

      // Process each AL parent group
      Object.entries(alChildrenGroups).forEach(([parentId, childIds]) => {
        const parent = objects[parentId];
        if (!parent?.childIds) return;

        const isLeftOrUp = direction === "left" || direction === "up";
        const isRightOrDown = direction === "right" || direction === "down";

        // For multi-selection: different behavior for contiguous vs non-contiguous selections
        if (childIds.length > 1) {
          // Get all selected indices and sort them
          const selectedIndices = childIds
            .map((id) => parent.childIds.indexOf(id))
            .filter((index) => index !== -1)
            .sort((a, b) => a - b);

          if (selectedIndices.length === 0) return;

          // Check if selection is contiguous (consecutive indices)
          const isContiguous = selectedIndices.every((index, i) => {
            if (i === 0) return true; // First item is always contiguous
            return index === selectedIndices[i - 1] + 1; // Each subsequent item should be +1 from previous
          });

          if (isContiguous) {
            // CONTIGUOUS SELECTION: Move as a block (all-or-nothing)
            let canGroupMove = false;

            if (isLeftOrUp) {
              // For left/up movement, check if the first item can move
              const firstIndex = selectedIndices[0];
              canGroupMove = firstIndex > 0;
            } else {
              // For right/down movement, check if the last item can move
              const lastIndex = selectedIndices[selectedIndices.length - 1];
              canGroupMove = lastIndex < parent.childIds.length - 1;
            }

            if (canGroupMove) {
              // Sort children by their current index to process in correct order
              const sortedChildren = childIds
                .map((id) => ({ id, index: parent.childIds.indexOf(id) }))
                .filter((item) => item.index !== -1)
                .sort((a, b) =>
                  isLeftOrUp ? a.index - b.index : b.index - a.index
                );

              // Move all items as a block
              const movesToMake = sortedChildren.map(({ id, index }) => ({
                id,
                currentIndex: index,
                newIndex: isLeftOrUp ? index - 1 : index + 1,
              }));

              dispatch({
                type: "objects.reordered.batch",
                payload: {
                  parentId: parentId,
                  reorders: movesToMake.map((move) => ({
                    objectId: move.id,
                    newIndex: move.newIndex,
                    previousIndex: move.currentIndex,
                  })),
                },
              });
            } else {
            }
          } else {
            // NON-CONTIGUOUS SELECTION: Move items individually
            const sortedChildren = childIds
              .map((id) => ({ id, index: parent.childIds.indexOf(id) }))
              .filter((item) => item.index !== -1)
              .sort((a, b) =>
                isLeftOrUp ? a.index - b.index : b.index - a.index
              );

            const movesToMake: Array<{
              id: string;
              currentIndex: number;
              newIndex: number;
            }> = [];

            for (const { id, index } of sortedChildren) {
              const canMove = isLeftOrUp
                ? index > 0
                : index < parent.childIds.length - 1;

              if (canMove) {
                const newIndex = isLeftOrUp ? index - 1 : index + 1;

                // Check: don't move into another selected item's position
                const targetWillBeOccupiedBySelected = sortedChildren.some(
                  (other) => other.index === newIndex && other.id !== id
                );

                if (!targetWillBeOccupiedBySelected) {
                  movesToMake.push({
                    id,
                    currentIndex: index,
                    newIndex,
                  });
                }
              }
            }

            // Execute the moves if any are possible
            if (movesToMake.length > 0) {
              dispatch({
                type: "objects.reordered.batch",
                payload: {
                  parentId: parentId,
                  reorders: movesToMake.map((move) => ({
                    objectId: move.id,
                    newIndex: move.newIndex,
                    previousIndex: move.currentIndex,
                  })),
                },
              });
            } else {
            }
          }
        } else {
          // Single item: simple reordering
          const objectId = childIds[0];
          const currentIndex = parent.childIds.indexOf(objectId);

          if (currentIndex === -1) return;

          const canMove = isLeftOrUp
            ? currentIndex > 0
            : currentIndex < parent.childIds.length - 1;

          if (canMove) {
            const newIndex = isLeftOrUp ? currentIndex - 1 : currentIndex + 1;

            dispatch({
              type: "object.reordered",
              payload: {
                objectId: objectId,
                parentId: parentId,
                newIndex: newIndex,
                previousIndex: currentIndex,
              },
            });
          }
        }
      });
    },
    [selectedIds, objects, dispatch, isTextBeingEdited]
  );

  // Tool switching callbacks
  const switchToSelectTool = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }

      if (activeTool !== "select") {
        dispatch({
          type: "tool.changed",
          payload: {
            tool: "select",
            previousTool: activeTool,
          },
        });
      }
    },
    [dispatch, activeTool, isTextBeingEdited]
  );

  const switchToRectangleTool = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }

      if (activeTool !== "rectangle") {
        dispatch({
          type: "tool.changed",
          payload: {
            tool: "rectangle",
            previousTool: activeTool,
          },
        });
      }
    },
    [dispatch, activeTool, isTextBeingEdited]
  );

  const switchToFrameTool = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }

      if (activeTool !== "frame") {
        dispatch({
          type: "tool.changed",
          payload: {
            tool: "frame",
            previousTool: activeTool,
          },
        });
      }
    },
    [dispatch, activeTool, isTextBeingEdited]
  );

  const switchToEllipseTool = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }

      if (activeTool !== "ellipse") {
        dispatch({
          type: "tool.changed",
          payload: {
            tool: "ellipse",
            previousTool: activeTool,
          },
        });
      }
    },
    [dispatch, activeTool, isTextBeingEdited]
  );

  const switchToMakeTool = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }

      if (activeTool !== "make") {
        dispatch({
          type: "tool.changed",
          payload: {
            tool: "make",
            previousTool: activeTool,
          },
        });
      }
    },
    [dispatch, activeTool, isTextBeingEdited]
  );

  const switchToTextTool = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }

      if (activeTool !== "text") {
        dispatch({
          type: "tool.changed",
          payload: {
            tool: "text",
            previousTool: activeTool,
          },
        });
      }
    },
    [dispatch, activeTool, isTextBeingEdited]
  );

  // Clear selection (and exit current tool first if not on select)
  const clearSelection = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }

      // If a non-select tool is active, switch back to select first
      if (activeTool !== "select") {
        dispatch({
          type: "tool.changed",
          payload: {
            tool: "select",
            previousTool: activeTool,
          },
        });
        return;
      }

      if (selectedIds.length > 0) {
        dispatch({
          type: "selection.changed",
          payload: {
            selectedIds: [],
            previousSelection: selectedIds,
          },
        });
      }
    },
    [dispatch, selectedIds, activeTool, isTextBeingEdited]
  );

  // Select all or siblings
  const selectAllOrSiblings = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }

      if (selectedIds.length === 0) {
        // No selection: select all top-level objects
        const topLevelObjects = Object.values(objects).filter(
          (obj) => !obj.parentId
        );
        const topLevelIds = topLevelObjects.map((obj) => obj.id);

        if (topLevelIds.length > 0) {
          dispatch({
            type: "selection.changed",
            payload: {
              selectedIds: topLevelIds,
              previousSelection: selectedIds,
            },
          });
        }
      } else {
        // Selection exists: select all siblings of all selected nodes
        const allSiblings = new Set<string>();

        selectedIds.forEach((selectedId) => {
          const selectedObject = objects[selectedId];
          if (selectedObject) {
            if (selectedObject.parentId) {
              // Find siblings within the same parent
              const parent = objects[selectedObject.parentId];
              if (parent) {
                parent.childIds.forEach((siblingId) =>
                  allSiblings.add(siblingId)
                );
              }
            } else {
              // Top-level object: find all other top-level objects
              Object.values(objects).forEach((obj) => {
                if (!obj.parentId) {
                  allSiblings.add(obj.id);
                }
              });
            }
          }
        });

        const siblingIds = Array.from(allSiblings);
        if (siblingIds.length > 0) {
          dispatch({
            type: "selection.changed",
            payload: {
              selectedIds: siblingIds,
              previousSelection: selectedIds,
            },
          });
        }
      }
    },
    [dispatch, selectedIds, objects, isTextBeingEdited]
  );

  // Select children
  const selectChildren = useCallback(
    (event?: KeyboardEvent) => {
      if (selectedIds.length === 0) return;

      if (isTextBeingEdited()) {
        return;
      }

      const allChildren = new Set<string>();

      selectedIds.forEach((selectedId) => {
        const selectedObject = objects[selectedId];
        if (selectedObject && selectedObject.childIds.length > 0) {
          selectedObject.childIds.forEach((childId) =>
            allChildren.add(childId)
          );
        }
      });

      const childIds = Array.from(allChildren);
      if (childIds.length > 0) {
        dispatch({
          type: "selection.changed",
          payload: {
            selectedIds: childIds,
            previousSelection: selectedIds,
          },
        });
      }
    },
    [dispatch, selectedIds, objects, isTextBeingEdited]
  );

  // Select parents
  const selectParents = useCallback(
    (event?: KeyboardEvent) => {
      if (selectedIds.length === 0) return;

      if (isTextBeingEdited()) {
        return;
      }

      const allParents = new Set<string>();

      selectedIds.forEach((selectedId) => {
        const selectedObject = objects[selectedId];
        if (selectedObject && selectedObject.parentId) {
          allParents.add(selectedObject.parentId);
        }
      });

      const parentIds = Array.from(allParents);
      if (parentIds.length > 0) {
        dispatch({
          type: "selection.changed",
          payload: {
            selectedIds: parentIds,
            previousSelection: selectedIds,
          },
        });
      }
    },
    [dispatch, selectedIds, objects, isTextBeingEdited]
  );

  // Create component from selection
  const createComponentFromSelection = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }


      if (selectedIds.length === 0) {
        return;
      }

      // Prevent default browser behavior
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      // Generate a default component name
      const componentName =
        selectedIds.length === 1
          ? `${objects[selectedIds[0]]?.name || "Object"} Component`
          : `Component ${Date.now().toString().slice(-4)}`;

      createComponent(componentName, selectedIds);
    },
    [createComponent, selectedIds, objects, isTextBeingEdited]
  );

  // Create instance from selected component
  const createInstanceFromSelection = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }


      if (selectedIds.length !== 1) {
        return;
      }

      const selectedObject = objects[selectedIds[0]];
      if (!selectedObject) {
        return;
      }

      // Find the component (either if this is a main component or instance)
      let componentId: string | undefined;
      if (selectedObject.isMainComponent && selectedObject.componentId) {
        componentId = selectedObject.componentId;
      } else if (
        selectedObject.isComponentInstance &&
        selectedObject.componentId
      ) {
        componentId = selectedObject.componentId;
      } else {
        return;
      }

      // Prevent default browser behavior
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      // Create instance at offset position
      const position = {
        x: selectedObject.x + 50,
        y: selectedObject.y + 50,
      };

      createInstance(componentId, position, selectedObject.parentId);
    },
    [createInstance, selectedIds, objects, getComponentByObjectId, isTextBeingEdited]
  );

  // Delete selected objects and all their descendants
  const deleteSelected = useCallback(
    (event?: KeyboardEvent) => {
      // Don't delete objects if focus is in an input, textarea, or contenteditable element.
      // Note: the empty-field case (Delete/Backspace with no text) is handled upstream
      // in useKeyboardShortcuts which blurs the field before calling this callback.
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.getAttribute("contenteditable") === "true")
      ) {
        return; // Don't prevent default, let input handle it naturally
      }

      // Prevent default browser behavior only when we're actually deleting objects
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }


      if (selectedIds.length > 0) {
        // Collect all objects to delete: selected objects + all their descendants
        const objectsToDelete = new Set<string>();

        // Helper function to recursively collect descendants
        const collectDescendants = (objectId: string) => {
          if (objectsToDelete.has(objectId)) return; // Already processed

          const object = objects[objectId];
          if (!object) return;

          objectsToDelete.add(objectId);

          // Recursively add all children
          if (object.childIds && object.childIds.length > 0) {
            object.childIds.forEach((childId) => {
              collectDescendants(childId);
            });
          }
        };

        // Start with selected objects and collect all descendants
        selectedIds.forEach((selectedId) => {
          collectDescendants(selectedId);
        });

        const allObjectsToDelete = Array.from(objectsToDelete);
        const deletedObjects: Record<string, any> = {};
        for (const id of allObjectsToDelete) {
          const object = objects[id];
          if (object) deletedObjects[id] = object;
        }

        if (Object.keys(deletedObjects).length > 0) {
          dispatch({
            type: "objects.deleted.batch",
            payload: {
              ids: Object.keys(deletedObjects),
              objects: deletedObjects,
            },
          });
        }
      }
    },
    [dispatch, selectedIds, objects]
  );

  // Clipboard operations
  const copySelected = useCallback(
    async (event?: KeyboardEvent) => {
      // Don't copy if focus is in an input, textarea, or contenteditable element
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.getAttribute("contenteditable") === "true")
      ) {
        return; // Let input handle it naturally
      }

      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      const selectedObjects = getSelectedObjects();
      if (selectedObjects.length > 0) {
        const success = await ClipboardOperations.copySelectedObjects(
          selectedObjects,
          objects,
          dispatch
        );
      }
    },
    [getSelectedObjects, objects, dispatch]
  );

  const cutSelected = useCallback(
    async (event?: KeyboardEvent) => {
      // Don't cut if focus is in an input, textarea, or contenteditable element
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.getAttribute("contenteditable") === "true")
      ) {
        return; // Let input handle it naturally
      }

      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      const selectedObjects = getSelectedObjects();
      if (selectedObjects.length > 0) {
        const success = await ClipboardOperations.cutSelectedObjects(
          selectedObjects,
          objects,
          dispatch
        );
      }
    },
    [getSelectedObjects, objects, dispatch]
  );

  const pasteFromClipboard = useCallback(
    async (event?: KeyboardEvent) => {
      // Don't paste if focus is in an input, textarea, or contenteditable element (except for images)
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.getAttribute("contenteditable") === "true")
      ) {
        return; // Let input handle it naturally
      }

      // Don't prevent default - we want the paste event to fire first
      // Add a small delay to let the paste event fire and be processed
      setTimeout(async () => {
        const selectedObjects = getSelectedObjects();

        // Calculate canvas center for pasting
        const vp = getViewport();
        const canvasCenter = {
          x: (-vp.panX + window.innerWidth / 2) / vp.zoom,
          y: (-vp.panY + window.innerHeight / 2) / vp.zoom,
        };

        const success = await ClipboardOperations.pasteObjects(
          dispatch,
          vp,
          selectedObjects,
          objects,
          canvasCenter
        );
      }, 10); // 10ms delay to let paste event fire first
    },
    [dispatch, getViewport, getSelectedObjects, objects]
  );

  const duplicateSelected = useCallback(
    async (event?: KeyboardEvent) => {
      // Don't duplicate if focus is in an input, textarea, or contenteditable element
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.getAttribute("contenteditable") === "true")
      ) {
        return; // Let input handle it naturally
      }

      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      const selectedObjects = getSelectedObjects();
      if (selectedObjects.length > 0) {
        const success = await ClipboardOperations.duplicateSelectedObjects(
          selectedObjects,
          objects,
          dispatch
        );
      }
    },
    [getSelectedObjects, objects, dispatch]
  );

  // Zoom to fit handler
  const handleZoomToFit = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }

      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      // Call zoom to fit function from canvas if available
      if (zoomToFitRef.current) {
        zoomToFitRef.current();
      }
    },
    [isTextBeingEdited]
  );

  // Zoom to 100% handler
  const handleZoomTo100 = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }

      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (zoomTo100Ref.current) {
        zoomTo100Ref.current();
      }
    },
    [isTextBeingEdited]
  );

  // Zoom in handler
  const handleZoomIn = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }

      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (zoomInRef.current) {
        zoomInRef.current();
      }
    },
    [isTextBeingEdited]
  );

  // Zoom out handler
  const handleZoomOut = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) {
        return;
      }

      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (zoomOutRef.current) {
        zoomOutRef.current();
      }
    },
    [isTextBeingEdited]
  );

  // Apply auto layout to selection (Shift+A)
  const handleApplyAutoLayout = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) return;
      if (selectedIds.length === 0) return;

      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      applyAutoLayout(dispatch);
    },
    [dispatch, selectedIds, isTextBeingEdited]
  );

  // Open on-canvas AI mini prompt with current selection (Cmd+Enter)
  const openAiAssistantWithSelection = useCallback(
    (event?: KeyboardEvent) => {
      if (isTextBeingEdited()) return;
      const ids = selectedIds;
      if (ids.length === 0) return;

      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      window.dispatchEvent(new CustomEvent("ai-assistant-open-with-selection"));

      const fp = [...ids].sort().join(",");
      const state = useAppStore.getState();
      const worldBounds = calculateGroupBounds(ids, state.objects);
      if (worldBounds) {
        state.openOnCanvasAiPrompt(
          fp,
          worldBounds.x + worldBounds.width,
          worldBounds.y
        );
      }
    },
    [selectedIds, isTextBeingEdited]
  );

  // Setup all global shortcuts
  useKeyboardShortcuts([
    // Undo/Redo (most important!)
    ...createUndoRedoShortcuts(
      (event?: KeyboardEvent) => {
        undo();
      },
      (event?: KeyboardEvent) => {
        redo();
      }
    ),

    // Tool switching
    {
      key: "v",
      callback: switchToSelectTool,
      description: "Select tool",
    },
    {
      key: "r",
      callback: switchToRectangleTool,
      description: "Rectangle tool",
    },
    {
      key: "f",
      callback: switchToFrameTool,
      description: "Frame tool",
    },
    {
      key: "o",
      callback: switchToEllipseTool,
      description: "Ellipse tool",
    },
    {
      key: "e",
      callback: switchToMakeTool,
      description: "Make tool",
    },
    {
      key: "t",
      callback: switchToTextTool,
      description: "Text tool",
    },

    // Apply auto layout (Shift+A)
    {
      key: "A", // Shift+A produces uppercase "A"
      shiftKey: true,
      callback: handleApplyAutoLayout,
      description: "Apply auto layout to selection",
    },

    // Component creation
    {
      key: "k",
      metaKey: true,
      callback: createComponentFromSelection,
      description: "Create component from selection",
    },

    // Instance creation
    {
      key: "i",
      metaKey: true,
      callback: createInstanceFromSelection,
      description: "Create instance from selected component",
    },

    // Open AI assistant with selection (Cmd+Enter)
    {
      key: "Enter",
      metaKey: true,
      callback: openAiAssistantWithSelection,
      description: "Open AI assistant with current selection",
    },

    // Clipboard operations
    {
      key: "c",
      metaKey: true,
      callback: copySelected,
      description: "Copy selection",
    },
    {
      key: "x",
      metaKey: true,
      callback: cutSelected,
      description: "Cut selection",
    },
    {
      key: "v",
      metaKey: true,
      preventDefault: false, // Allow paste event to fire
      callback: pasteFromClipboard,
      description: "Paste from clipboard",
    },
    {
      key: "d",
      metaKey: true,
      callback: duplicateSelected,
      description: "Duplicate selection",
    },

    // Clear selection with Escape
    {
      key: "Escape",
      callback: clearSelection,
      description: "Clear selection",
    },

    // Select all or siblings (CMD+A)
    {
      key: "a",
      metaKey: true,
      callback: selectAllOrSiblings,
      description: "Select all or siblings",
    },

    // Select ancestors (CMD+Alt+A)
    {
      key: "a",
      metaKey: true,
      altKey: true,
      callback: () => {
        // Select all ancestors of currently selected objects
        if (selectedIds.length === 0) {
          return;
        }

        const ancestors = new Set<string>();

        for (const selectedId of selectedIds) {
          let currentParentId = objects[selectedId]?.parentId;
          while (currentParentId && objects[currentParentId]) {
            ancestors.add(currentParentId);
            currentParentId = objects[currentParentId].parentId;
          }
        }

        const ancestorIds = Array.from(ancestors);

        if (ancestorIds.length > 0) {
          dispatch({
            type: "selection.changed",
            payload: {
              selectedIds: ancestorIds,
              previousSelection: selectedIds,
            },
          });
        }
      },
      description: "Select all ancestors",
    },

    // Arrow keys for auto layout reordering
    {
      key: "ArrowLeft",
      callback: () => moveItemsInAutoLayout("left"),
      preventDefault: false, // Let text editor handle if text is being edited
      description: "Move items left in horizontal auto layout",
    },
    {
      key: "ArrowRight",
      callback: () => moveItemsInAutoLayout("right"),
      preventDefault: false,
      description: "Move items right in horizontal auto layout",
    },
    {
      key: "ArrowUp",
      callback: () => moveItemsInAutoLayout("up"),
      preventDefault: false,
      description: "Move items up in vertical auto layout",
    },
    {
      key: "ArrowDown",
      callback: () => moveItemsInAutoLayout("down"),
      preventDefault: false,
      description: "Move items down in vertical auto layout",
    },

    // Select children (Enter) or play a paused Make
    {
      key: "Enter",
      callback: (event?: KeyboardEvent) => {
        if (isTextBeingEdited()) {
          return;
        }
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }

        // If a single make is selected and paused, play it
        if (selectedIds.length === 1) {
          const obj = objects[selectedIds[0]];
          if (obj && obj.properties.type === "make" && !obj.properties.playing) {
            dispatch({
              type: "object.updated",
              payload: {
                id: obj.id,
                changes: {
                  properties: { ...obj.properties, playing: true },
                },
                previousValues: { properties: obj.properties },
              },
            });
            return;
          }
        }

        selectChildren(event);
      },
      preventDefault: false,
      description: "Select direct children or play Make",
    },

    // Select parents (Shift+Enter) - but not during text editing
    {
      key: "Enter",
      shiftKey: true,
      callback: (event?: KeyboardEvent) => {
        if (isTextBeingEdited()) {
          // Don't prevent default - let text editor handle Shift+Enter
          return;
        }
        // Prevent default and handle selection
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        selectParents(event);
      },
      preventDefault: false, // We'll handle preventDefault conditionally inside the callback
      description: "Select parents",
    },

    // Delete selected objects - don't prevent default to allow input deletion
    {
      key: "Backspace",
      callback: deleteSelected,
      preventDefault: false, // Let input fields handle their own behavior
      description: "Delete selected objects",
    },
    {
      key: "Delete",
      callback: deleteSelected,
      preventDefault: false, // Let input fields handle their own behavior
      description: "Delete selected objects",
    },

    // Zoom to fit (Shift+1) - using code to avoid Shift+1 = ! issue
    {
      code: "Digit1", // Use physical key code instead of key value
      shiftKey: true,
      callback: handleZoomToFit,
      description: "Zoom to fit all objects",
    },

    // Zoom to 100% (Cmd+0)
    {
      code: "Digit0",
      metaKey: true,
      callback: handleZoomTo100,
      description: "Zoom to 100%",
    },

    // Zoom in (Cmd++)
    {
      key: "=", // Plus key without shift
      metaKey: true,
      callback: handleZoomIn,
      description: "Zoom in",
    },

    // Zoom out (Cmd+-)
    {
      key: "-", // Minus key
      metaKey: true,
      callback: handleZoomOut,
      description: "Zoom out",
    },
  ]);

  // This component doesn't render anything
  return null;
}
