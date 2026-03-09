"use client";

import { NavigationContext } from "@/contexts/NavigationContext";
import { useCanvasDrag } from "@/core/hooks/useCanvasDrag";
import { useCanvasResize } from "@/core/hooks/useCanvasResize";
import { useCanvasSelection } from "@/core/hooks/useCanvasSelection";
import { useDeepSelection } from "@/core/hooks/useDeepSelection";
import { useZoomPan } from "@/core/hooks/useZoomPan";
import { nestingObserver } from "@/core/observers/nestingObserver";
import {
  getAdvancedSelectionTarget,
  getObjectsAtPoint,
} from "@/core/services/selection";
import { useAppStore, useObjects } from "@/core/state/store";
import { useTransientStore } from "@/core/state/transientStore";
import {
  getAbsolutePosition,
  getVisualBoundsFromDOM,
  getWorldCoordinatesFromEvent,
} from "@/core/utils/coordinates";
import {
  filterAncestorDescendantConflicts,
  findObjectsInRegion,
} from "@/core/utils/selection";
import { useToolCursor } from "@/hooks/useCursor";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { useLayersPanel } from "./CanvasWithPropertiesWrapper";
import PixelMatrix from "./PixelMatrix";
import Ruler from "./Ruler";
import ScreenSpace from "./ScreenSpace";
import { checkAndClearRecentlyExitedTextObject } from "./TextRenderer";
import WorldSpace from "./WorldSpace";

interface CanvasProps {
  className?: string;
  onDragStateChange?: (
    positions: Record<string, { x: number; y: number }>,
    isDragging: boolean,
  ) => void;
  onSelectionUIChange?: (setShowSelectionUI: (show: boolean) => void) => void;
}

export default function Canvas({
  className = "",
  onDragStateChange,
  onSelectionUIChange,
}: CanvasProps) {
  // Get layers panel state for ruler offset
  const { isExpanded: layersExpanded, panelWidth: layersPanelWidth } =
    useLayersPanel();

  // Get navigation context for sidebar width
  // The sidebar is fixed positioned and overlays the canvas
  // Canvas container starts after NavigationBar (48px), so rulers need to offset by sidebar width
  const navigationContext = useContext(NavigationContext);
  const sidebarWidth =
    navigationContext && !navigationContext.isNavigationCollapsed
      ? navigationContext.sidebarWidth
      : 0; // When collapsed or context unavailable, no sidebar, so no offset needed
  const canvasRef = useRef<HTMLDivElement>(null);
  const dispatch = useAppStore((state) => state.dispatch);
  const viewport = useAppStore((state) => state.viewport);
  const activeTool = useAppStore((state) => state.tools.activeTool);
  const tools = useAppStore((state) => state.tools);
  const objects = useObjects();
  const selectedIds = useAppStore((state) => state.selection.selectedIds);
  const isHoveringResizeHandle = useAppStore(
    (state) => state.isHoveringResizeHandle,
  );
  const cropMode = useAppStore((state) => state.cropMode);

  // Set cursors based on active tool
  useToolCursor();

  // Cleanup auto layout observers on unmount
  useEffect(() => {
    return () => {
      // Auto layout observer cleanup is handled per-frame now
    };
  }, []);

  // Ref to track clicked item in multi-selection for potential isolation
  const clickedItemForIsolationRef = useRef<string | null>(null);

  // Ref to manage deep selection reset timeout
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [dragPrepared, setDragPrepared] = useState(false);
  const [mouseDownPoint, setMouseDownPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [shiftWasPressed, setShiftWasPressed] = useState(false);
  const [cmdWasPressed, setCmdWasPressed] = useState(false);
  const [ignoreNextMoves, setIgnoreNextMoves] = useState(false);

  // Selection region state
  const [isSelectionRegion, setIsSelectionRegion] = useState(false);
  const [selectionRegionStart, setSelectionRegionStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectionRegionCurrent, setSelectionRegionCurrent] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Potential selection region (waiting for threshold)
  const [potentialRegion, setPotentialRegion] = useState<{
    startPoint: { x: number; y: number };
    selectionData: any;
  } | null>(null);

  // Selection preview state
  const selectionPreviewTarget = useAppStore(
    (state) => state.selectionPreviewTarget,
  );
  const selectionPreviewSource = useAppStore(
    (state) => state.selectionPreviewSource,
  );
  const setSelectionPreviewTarget = useAppStore(
    (state) => state.setSelectionPreviewTarget,
  );
  const [isCmdPressed, setIsCmdPressed] = useState(false);

  // Initialize nesting observer once; update its objects ref when they change
  useEffect(() => {
    nestingObserver.initialize(
      objects,
      (objectId: string, changes: Record<string, any>) => {
        const currentObjects = useAppStore.getState().objects;
        const object = currentObjects[objectId];
        if (object) {
          const previousValues: Record<string, any> = {};
          Object.keys(changes).forEach((key) => {
            previousValues[key] = object[key as keyof typeof object];
          });

          dispatch({
            type: "object.updated",
            payload: {
              id: objectId,
              changes: changes as Partial<typeof object>,
              previousValues: previousValues as Partial<typeof object>,
            },
          });
        }
      },
    );
    // Only re-initialize when dispatch changes (effectively once)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // Keep objects ref in sync without costly re-initialization
  useEffect(() => {
    nestingObserver.updateObjects(objects);
  }, [objects]);

  // Track CMD key for selection preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        setIsCmdPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) {
        setIsCmdPressed(false);
      }
    };

    // Handle window focus/blur to reset CMD state when app switching
    const handleWindowBlur = () => {
      setIsCmdPressed(false);
    };

    const handleWindowFocus = () => {
      setIsCmdPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  // Center viewport on initial load
  useEffect(() => {
    if (!canvasRef.current) return;

    // Only center once when the canvas first mounts and has size
    const rect = canvasRef.current.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      viewport.panX === 0 &&
      viewport.panY === 0
    ) {
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      dispatch({
        type: "viewport.changed",
        payload: {
          viewport: {
            ...viewport,
            panX: centerX,
            panY: centerY,
          },
          previousViewport: viewport,
        },
      });
    }
  }, [viewport.panX, viewport.panY, dispatch]);

  // Handle viewport updates from zoom/pan
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const handleViewportChange = useCallback(
    (newViewport: typeof viewport) => {
      dispatch({
        type: "viewport.changed",
        payload: {
          viewport: newViewport,
          previousViewport: viewportRef.current,
        },
      });
    },
    [dispatch],
  );

  // Zoom/Pan hook
  const {
    isZooming,
    isPanning,
    isSpacePanning,
    forceReset,
    zoomToFit,
    zoomToFitSelection,
    zoomTo100,
    zoomToLevel,
    zoomToPercent,
  } = useZoomPan({
    viewport,
    canvasRef,
    onViewportChange: handleViewportChange,
    disabled: activeTool !== "select",
    objects,
    layersExpanded,
    layersPanelWidth,
  });

  const resetZoomPanStates = useCallback(() => {
    if (forceReset) {
      forceReset();
    }
  }, [forceReset]);

  // Register zoom functions globally for keyboard shortcut access
  useEffect(() => {
    const globalRefs = window as any;

    // Register zoom to fit
    if (
      globalRefs.__figmaCloneZoomToFit &&
      globalRefs.__figmaCloneZoomToFit.current !== undefined
    ) {
      globalRefs.__figmaCloneZoomToFit.current = zoomToFit;
    }

    // Register zoom to 100%
    if (
      globalRefs.__figmaCloneZoomTo100 &&
      globalRefs.__figmaCloneZoomTo100.current !== undefined
    ) {
      globalRefs.__figmaCloneZoomTo100.current = zoomTo100;
    }

    // Register zoom to percent
    if (
      globalRefs.__figmaCloneZoomToPercent &&
      globalRefs.__figmaCloneZoomToPercent.current !== undefined
    ) {
      globalRefs.__figmaCloneZoomToPercent.current = zoomToPercent;
    }

    // Register zoom in/out
    if (
      globalRefs.__figmaCloneZoomIn &&
      globalRefs.__figmaCloneZoomIn.current !== undefined
    ) {
      globalRefs.__figmaCloneZoomIn.current = () => zoomToLevel("in");
    }

    if (
      globalRefs.__figmaCloneZoomOut &&
      globalRefs.__figmaCloneZoomOut.current !== undefined
    ) {
      globalRefs.__figmaCloneZoomOut.current = () => zoomToLevel("out");
    }

    return () => {
      if (
        globalRefs.__figmaCloneZoomToFit &&
        globalRefs.__figmaCloneZoomToFit.current === zoomToFit
      ) {
        globalRefs.__figmaCloneZoomToFit.current = null;
      }
      if (
        globalRefs.__figmaCloneZoomTo100 &&
        globalRefs.__figmaCloneZoomTo100.current === zoomTo100
      ) {
        globalRefs.__figmaCloneZoomTo100.current = null;
      }
      if (
        globalRefs.__figmaCloneZoomToPercent &&
        globalRefs.__figmaCloneZoomToPercent.current === zoomToPercent
      ) {
        globalRefs.__figmaCloneZoomToPercent.current = null;
      }
      if (globalRefs.__figmaCloneZoomIn) {
        globalRefs.__figmaCloneZoomIn.current = null;
      }
      if (globalRefs.__figmaCloneZoomOut) {
        globalRefs.__figmaCloneZoomOut.current = null;
      }
    };
  }, [zoomToFit, zoomTo100, zoomToLevel, zoomToPercent]);

  // Listen for focus-on-objects (e.g. when selecting a thread from left panel history)
  useEffect(() => {
    const handler = (e: Event) => {
      const objectIds = (e as CustomEvent<{ objectIds: string[] }>).detail?.objectIds;
      if (objectIds?.length && zoomToFitSelection) {
        requestAnimationFrame(() => {
          zoomToFitSelection(objectIds);
        });
      }
    };
    window.addEventListener("canvas-focus-on-objects", handler);
    return () => window.removeEventListener("canvas-focus-on-objects", handler);
  }, [zoomToFitSelection]);

  // Clear selection region state when space panning starts
  useEffect(() => {
    if (isSpacePanning) {
      setIsSelectionRegion(false);
      setSelectionRegionStart(null);
      setSelectionRegionCurrent(null);
      setPotentialRegion(null);
    }
  }, [isSpacePanning]);

  // Use hooks for canvas interactions
  const { handleSelection, showSelectionUI, setShowSelectionUI } =
    useCanvasSelection({
      canvasRef,
      viewport,
      activeTool,
      objects,
      selection: { selectedIds },
      isZooming,
      isPanning: isPanning || isSpacePanning,
      resetZoomPanStates,
    });

  // Expose setShowSelectionUI to parent component
  useEffect(() => {
    if (onSelectionUIChange) {
      onSelectionUIChange(setShowSelectionUI);
    }
  }, [onSelectionUIChange, setShowSelectionUI]);

  const {
    handleDeepSelection,
    selectSiblings,
    selectAncestors,
    resetDeepSelection,
  } = useDeepSelection({
    objects,
    selection: { selectedIds },
    activeTool,
  });

  const {
    isDragging,
    potentialParent,
    currentMouseWorldPosition,
    isOptionPressed,
    isDuplicating,
    duplicatedObjectIds,
    startDrag,
    handlePointerMove: handleDragPointerMove,
    completeDrag,
    cancelDrag,
    hasActiveDrag,
  } = useCanvasDrag({
    canvasRef,
    viewport,
    objects,
    onDragStateChange,
  });

  // Debug logging for tool state and cancel drag only on tool change
  useEffect(() => {
    // Only clear drag state when switching TO creation tools, not during creation
    if (activeTool !== "select" && !tools.isCreating) {
      setDragPrepared(false);
      cancelDrag();
    }
  }, [activeTool, cancelDrag]); // Remove isCreating and creationPreview to avoid loop

  // Reset cursor and hover states when selection changes (fixes stuck resize cursors)
  useEffect(() => {
    const store = useAppStore.getState();
    const { resetCursor, setIsHoveringResizeHandle, isResizing } = store;

    // Only reset if we're not actively resizing and not space panning
    if (!isResizing && !isSpacePanning) {
      resetCursor();
      setIsHoveringResizeHandle(false);
    }
  }, [selectedIds, isSpacePanning]); // Reset when selection changes

  // Reset cursor when switching tools (but only if it's a stuck resize cursor)
  useEffect(() => {
    const store = useAppStore.getState();
    const { resetCursor, isResizing, cursor } = store;

    // Only reset if we have a stuck resize cursor when switching tools and not space panning
    // Let the useToolCursor hook handle setting the appropriate tool cursor
    if (
      !isResizing &&
      !isSpacePanning &&
      cursor.source &&
      cursor.source.startsWith("resize:")
    ) {
      resetCursor();
    }
  }, [activeTool, isSpacePanning]);

  // Reset cursor on viewport changes (zoom/pan) to prevent stuck cursors.
  // When the viewport changes, resize handles move on screen but the pointer
  // doesn't, so the browser never fires pointerleave. We clear the hover flag
  // unconditionally and let the pointermove hit-test re-set it if the pointer
  // is genuinely still over a handle.
  useEffect(() => {
    const store = useAppStore.getState();
    const { resetCursor, isResizing, cursor } = store;

    if (
      !isResizing &&
      !isSpacePanning &&
      cursor.source &&
      cursor.source.startsWith("resize:")
    ) {
      store.setIsHoveringResizeHandle(false);
      resetCursor();
    }
  }, [viewport.zoom, viewport.panX, viewport.panY, isSpacePanning]);

  const {
    isResizing,
    resizeHandle,
    startResize,
    handlePointerMove: handleResizePointerMove,
    completeResize,
    hasActiveResize,
  } = useCanvasResize({
    canvasRef,
    viewport,
    objects,
    selectedIds: selectedIds,
  });

  // Store last mouse position for CMD key updates
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  // Update selection preview on mouse move
  useEffect(() => {
    if (
      activeTool !== "select" ||
      isDragging ||
      isSelectionRegion ||
      isHoveringResizeHandle ||
      isZooming ||
      isPanning ||
      isSpacePanning
    ) {
      setSelectionPreviewTarget(null);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      // Check if mouse is over UI panels (more reliable than canvas bounds)
      const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
      const isOverLayersPanel = elementUnderMouse?.closest(
        "[data-layers-panel]",
      );
      const isOverPropertiesPanel = elementUnderMouse?.closest(
        "[data-properties-panel]",
      );
      const isOverFrameLabel = elementUnderMouse?.closest("[data-frame-label]");
      const isOverUI =
        isOverLayersPanel || isOverPropertiesPanel || isOverFrameLabel;

      // Don't update preview if mouse is over UI panels
      if (isOverUI) {
        return;
      }

      try {
        // Get objects at this point using the same logic as actual selection
        const hitResults = getObjectsAtPoint(
          { x: e.clientX, y: e.clientY },
          {
            selectTopmost: true,
            ignoreLocked: true,
          },
        );

        // Populate the actual CanvasObject data from store
        const populatedResults = hitResults
          .map((result) => {
            const objectId = result.element.getAttribute("data-object-id");
            const object = objectId ? objects[objectId] : null;
            return {
              ...result,
              object: object || result.object,
            };
          })
          .filter(
            (result) =>
              result.object &&
              result.object.visible !== false &&
              !result.object.locked,
          );

        if (populatedResults.length === 0) {
          setSelectionPreviewTarget(null);
          return;
        }

        // Use the same advanced selection logic

        const bestTarget = getAdvancedSelectionTarget(
          populatedResults,
          selectedIds,
          objects,
          {
            isCmdClick: isCmdPressed,
            isShiftClick: false, // Mouse move preview - not a shift click
            isClickingOnLabel: false,
            labelFrameId: undefined,
          },
        );

        // Only update preview if it's not currently controlled by UI components
        // Get current value from store to avoid stale closure
        const currentState = useAppStore.getState();
        const currentPreviewSource = currentState.selectionPreviewSource;

        // Be more respectful of UI-controlled previews - only override if we have a better target
        // or if the UI preview is stale (pointing to an object not under the mouse)
        if (currentPreviewSource !== "ui") {
          if (bestTarget) {
            // Don't show preview over selected items when multiple items are selected
            const isMultiSelection = selectedIds.length > 1;
            const isHoveringOverSelected = selectedIds.includes(
              bestTarget.object.id,
            );

            if (isMultiSelection && isHoveringOverSelected) {
              setSelectionPreviewTarget(null, "canvas");
            } else {
              setSelectionPreviewTarget(bestTarget.object.id, "canvas");
            }
          } else {
            setSelectionPreviewTarget(null, "canvas");
          }
        } else {
          // UI is controlling the preview - only clear it if we detect the mouse is definitely not over UI
          // Check if current UI preview target is actually under the mouse
          const currentUITarget = currentState.selectionPreviewTarget;
          if (currentUITarget && bestTarget?.object?.id !== currentUITarget) {
            // Mouse moved away from UI element - let canvas take control again
            if (bestTarget) {
              const isMultiSelection = selectedIds.length > 1;
              const isHoveringOverSelected = selectedIds.includes(
                bestTarget.object.id,
              );
              if (!(isMultiSelection && isHoveringOverSelected)) {
                setSelectionPreviewTarget(bestTarget.object.id, "canvas");
              }
            } else {
              // Only clear if we're confident the mouse is not over UI anymore
              setTimeout(() => {
                const stillControlledByUI =
                  useAppStore.getState().selectionPreviewSource === "ui";
                if (!stillControlledByUI) {
                  setSelectionPreviewTarget(null, "canvas");
                }
              }, 10);
            }
          }
        }
      } catch (error) {
        const currentPreviewSource =
          useAppStore.getState().selectionPreviewSource;
        if (currentPreviewSource !== "ui") {
          setSelectionPreviewTarget(null, "canvas");
        }
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [
    activeTool,
    isDragging,
    isSelectionRegion,
    isHoveringResizeHandle,
    isZooming,
    isPanning,
    isSpacePanning,
    isCmdPressed,
    objects,
    selectedIds,
    // selectionPreviewSource removed - we'll check it inside the handler
  ]);

  // Update selection preview when CMD key state changes
  useEffect(() => {
    if (
      lastMousePosRef.current &&
      activeTool === "select" &&
      !isDragging &&
      !isSelectionRegion &&
      !isHoveringResizeHandle
    ) {
      // Get current value from store to avoid stale closure
      const currentPreviewSource =
        useAppStore.getState().selectionPreviewSource;
      if (currentPreviewSource !== "ui") {
        const { x, y } = lastMousePosRef.current;
        try {
          const hitResults = getObjectsAtPoint(
            { x, y },
            {
              selectTopmost: true,
              ignoreLocked: true,
            },
          );
          const populatedResults = hitResults
            .map((result) => {
              const objectId = result.element.getAttribute("data-object-id");
              const object = objectId ? objects[objectId] : null;
              return {
                ...result,
                object: object || result.object,
              };
            })
            .filter(
              (result) =>
                result.object &&
                result.object.visible !== false &&
                !result.object.locked,
            );

          if (populatedResults.length > 0) {
            const bestTarget = getAdvancedSelectionTarget(
              populatedResults,
              selectedIds,
              objects,
              {
                isCmdClick: isCmdPressed,
                isShiftClick: false, // CMD key update effect - not a shift click
                isClickingOnLabel: false,
                labelFrameId: undefined,
              },
            );

            if (bestTarget) {
              // Don't show preview over selected items when multiple items are selected
              const isMultiSelection = selectedIds.length > 1;
              const isHoveringOverSelected = selectedIds.includes(
                bestTarget.object.id,
              );

              if (isMultiSelection && isHoveringOverSelected) {
                setSelectionPreviewTarget(null, "canvas");
              } else {
                setSelectionPreviewTarget(bestTarget.object.id, "canvas");
              }
            } else {
              setSelectionPreviewTarget(null, "canvas");
            }
          } else {
            setSelectionPreviewTarget(null, "canvas");
          }
        } catch (error) {
          setSelectionPreviewTarget(null, "canvas");
        }
      }
    }
  }, [isCmdPressed]);

  // Handle pointer down events
  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Check if we're clicking on a text object that's currently being edited
      const isClickingOnEditingText = () => {
        const screenPoint = { x: event.clientX, y: event.clientY };
        const elementsAtPoint = document.elementsFromPoint(
          screenPoint.x,
          screenPoint.y,
        );

        for (const element of elementsAtPoint) {
          const objectId = element.getAttribute("data-object-id");
          const objectType = element.getAttribute("data-object-type");

          if (objectId && objectType === "text") {
            const textObject = objects[objectId];
            if (
              textObject &&
              textObject.properties.type === "text" &&
              (textObject.properties as any).isEditing
            ) {
              return true;
            }
          }
        }
        return false;
      };

      // If clicking on an editing text object, don't handle selection
      if (isClickingOnEditingText()) {
        return;
      }

      // In extract mode, let pointer events pass through to the make iframe
      const extractState = useAppStore.getState().extractMode;
      if (extractState.isActive && extractState.makeObjectId) {
        const elementsAtPoint = document.elementsFromPoint(event.clientX, event.clientY);
        for (const el of elementsAtPoint) {
          if (el.tagName === "IFRAME") {
            const makeObjEl = el.closest(`[data-object-id="${extractState.makeObjectId}"]`);
            if (makeObjEl) return;
          }
          const objId = el.getAttribute("data-object-id");
          if (objId === extractState.makeObjectId) return;
        }
      }

      // Capture pointer to ensure we get all pointer events including up
      if (canvasRef.current) {
        canvasRef.current.setPointerCapture(event.pointerId);
      }

      if (!canvasRef.current) return;

      if (activeTool === "select") {
        // Store mouse down position for potential drag detection
        const worldPoint = getWorldCoordinatesFromEvent(
          event.nativeEvent,
          canvasRef.current,
          viewport,
        );

        setMouseDownPoint({ x: worldPoint.x, y: worldPoint.y });
        setDragPrepared(false);
        setShiftWasPressed(event.shiftKey);
        setCmdWasPressed(event.metaKey || event.ctrlKey);

        // Always do selection - this now implements click-through behavior
        const selectionResult = handleSelection(event);

        // Reset deep selection state when normal selection happens
        // But only if the selection actually changed

        if (selectionResult) {
          const currentSelection = selectedIds;
          const newSelection = selectionResult.selectedIds;
          const selectionChanged =
            currentSelection.length !== newSelection.length ||
            currentSelection.some((id, index) => id !== newSelection[index]);

          // Always reset deep selection on any single click interaction
          // Clear any existing timeout
          if (resetTimeoutRef.current) {
            clearTimeout(resetTimeoutRef.current);
          }

          // Set a new timeout to reset deep selection state
          resetTimeoutRef.current = setTimeout(() => {
            resetDeepSelection();
          }, 500);
        }

        // Check if this is a selection region start
        if (
          selectionResult?.isSelectionRegion &&
          selectionResult.dragStartPoint &&
          !isSpacePanning // Don't start selection region when space panning
        ) {
          // Store as potential region, wait for movement threshold
          setPotentialRegion({
            startPoint: selectionResult.dragStartPoint,
            selectionData: selectionResult,
          });

          // Don't start region or clear selection immediately - wait for threshold
        } else if (
          selectionResult?.dragStartPoint &&
          selectionResult.dragStartPositions &&
          selectionResult.originalParents &&
          !(window as any).__originalMultiSelectionForDrag &&
          !isSpacePanning // Don't start drag when space panning
        ) {
          // Check if CMD is pressed - if so, don't start drag but allow selection to complete
          const cmdPressed = event.metaKey || event.ctrlKey;
          if (cmdPressed) {
            // Store mouse down point for potential region drag detection
            setMouseDownPoint({
              x: selectionResult.dragStartPoint.x,
              y: selectionResult.dragStartPoint.y,
            });
            setCmdWasPressed(true);
            // Don't call startDrag, but let selection complete normally
            return;
          }

          // Store drag preparation data
          setMouseDownPoint({
            x: selectionResult.dragStartPoint.x,
            y: selectionResult.dragStartPoint.y,
          });

          // Use the drag hook's startDrag method
          startDrag(
            selectionResult.selectedIds,
            selectionResult.dragStartPoint,
            selectionResult.dragStartPositions,
            selectionResult.originalParents,
            event.shiftKey,
            event,
          );
          setDragPrepared(true);
        } else {
          // If handleSelection doesn't return a region flag, but we have a CMD+click or want to allow region,
          // check if we should force a potential region anyway
          const cmdPressed = event.metaKey || event.ctrlKey;
          const worldPoint = getWorldCoordinatesFromEvent(
            event.nativeEvent,
            canvasRef.current,
            viewport,
          );

          // Force potential region when:
          // 1. CMD is pressed AND no selection result (allows region anywhere when CMD+click hits nothing)
          // 2. No selection result but not shift-click (clicking in empty space after creation)
          if (
            !isSpacePanning && // Don't start selection region when space panning
            ((cmdPressed && !selectionResult) ||
              (!selectionResult && !event.shiftKey))
          ) {
            setPotentialRegion({
              startPoint: worldPoint,
              selectionData: {
                selectedIds: event.shiftKey ? selectedIds : [],
                dragStartPoint: worldPoint,
                dragStartPositions: {},
                originalParents: {},
                isSelectionRegion: true,
              },
            });
          }
        }
        return;
      }

      // Handle creation tools
      const worldPoint = getWorldCoordinatesFromEvent(
        event.nativeEvent,
        canvasRef.current,
        viewport,
      );

      // Clear selection when starting creation to prevent drag interference
      if (selectedIds.length > 0) {
        dispatch({
          type: "selection.changed",
          payload: {
            selectedIds: [],
            previousSelection: selectedIds,
          },
        });
      }

      // Set mouse down point for creation tools
      setMouseDownPoint({ x: worldPoint.x, y: worldPoint.y });

      dispatch({
        type: "tool.interaction.started",
        payload: {
          tool: activeTool,
          startPoint: worldPoint,
          modifiers: {
            shift: event.shiftKey,
            alt: event.altKey,
            cmd: event.metaKey || event.ctrlKey,
          },
        },
      });
    },
    [
      activeTool,
      handleSelection,
      startDrag,
      dispatch,
      viewport,
      selectedIds,
      objects,
    ],
  );

  // Handle pointer up events
  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      // Check if we're releasing over a text object that's currently being edited
      const isReleasingOverEditingText = () => {
        const screenPoint = { x: event.clientX, y: event.clientY };
        const elementsAtPoint = document.elementsFromPoint(
          screenPoint.x,
          screenPoint.y,
        );

        for (const element of elementsAtPoint) {
          const objectId = element.getAttribute("data-object-id");
          const objectType = element.getAttribute("data-object-type");

          if (objectId && objectType === "text") {
            const textObject = objects[objectId];
            if (
              textObject &&
              textObject.properties.type === "text" &&
              (textObject.properties as any).isEditing
            ) {
              return true;
            }
          }
        }
        return false;
      };

      // If releasing over an editing text object, don't handle Canvas logic
      if (isReleasingOverEditingText()) {
        return;
      }

      if (hasActiveResize) {
        completeResize();
      } else if (hasActiveDrag) {
        // Temporarily hide selection UI to prevent lag during auto-layout sync
        setShowSelectionUI(false);

        completeDrag(event);
      }

      // Restore multi-selection after drag completion
      const draggedMultiSelection = (window as any).__draggedMultiSelection;
      if (draggedMultiSelection) {
        // Clear the stored data
        delete (window as any).__draggedMultiSelection;

        // Restore the dragged selection
        dispatch({
          type: "selection.changed",
          payload: {
            selectedIds: draggedMultiSelection,
            previousSelection: selectedIds,
          },
        });
      }

      // Show selection UI again after a brief delay to allow auto-layout sync
      setTimeout(() => {
        setShowSelectionUI(true);
      }, 10);

      if (
        activeTool !== "select" &&
        tools.isCreating &&
        mouseDownPoint &&
        canvasRef.current
      ) {
        // Complete creation tool interaction
        const endPoint = getWorldCoordinatesFromEvent(
          event.nativeEvent,
          canvasRef.current,
          viewport,
        );

        dispatch({
          type: "tool.interaction.completed",
          payload: {
            tool: activeTool,
            endPoint,
            startPoint: mouseDownPoint,
          },
        });

        if (activeTool === "make") {
          // After make creation, open a new chat with it attached
          setTimeout(() => {
            const state = useAppStore.getState();
            const makeId = state.selection.selectedIds[0];
            if (makeId && state.objects[makeId]?.type === "make") {
              window.dispatchEvent(new CustomEvent("ai-assistant-show"));
              window.dispatchEvent(
                new CustomEvent("ai-start-new-chat", {
                  detail: { objectIds: [makeId] },
                }),
              );
            }
          }, 0);
        }
      } else if (
        isSelectionRegion &&
        selectionRegionStart &&
        selectionRegionCurrent
      ) {
        // Complete selection region
        // TODO: Implement final selection based on region bounds
        // For now, just clean up
        setIsSelectionRegion(false);
        setSelectionRegionStart(null);
        setSelectionRegionCurrent(null);
      }

      // Clear selection UI timeout (restore will happen via setTimeout after drag completion)
      // setShowSelectionUI(true); // Removed - now handled with delay after drag

      // Clean up mouse tracking state
      setMouseDownPoint(null);
      setDragPrepared(false);
      setShiftWasPressed(false);
      setCmdWasPressed(false);

      // Clean up selection region state
      setIsSelectionRegion(false);
      setSelectionRegionStart(null);
      setSelectionRegionCurrent(null);

      // Handle potential region cleanup (if threshold was never reached)
      if (potentialRegion && !isSelectionRegion) {
        // Check if we just exited text edit mode - if so, don't deselect
        if (checkAndClearRecentlyExitedTextObject()) {
          setPotentialRegion(null);
          return;
        }

        // This was just a click without enough movement - handle deselection
        const selectionData = potentialRegion.selectionData;
        if (
          selectionData.selectedIds.length === 0 &&
          selectedIds.length > 0
        ) {
          dispatch({
            type: "selection.changed",
            payload: {
              selectedIds: [],
              previousSelection: selectedIds,
            },
          });
        }
      }

      // Clean up any stored multi-selection data if drag didn't happen
      const originalMultiSelection = (window as any)
        .__originalMultiSelectionForDrag;
      const draggedMultiSelection2 = (window as any).__draggedMultiSelection;

      if (originalMultiSelection) {
        delete (window as any).__originalMultiSelectionForDrag;
      }

      if (draggedMultiSelection2) {
        delete (window as any).__draggedMultiSelection;
      }

      // Clear potential region state
      setPotentialRegion(null);

      // Release pointer capture
      if (canvasRef.current) {
        canvasRef.current.releasePointerCapture(event.pointerId);
      }
    },
    [
      hasActiveDrag,
      hasActiveResize,
      activeTool,
      tools.isCreating,
      mouseDownPoint,
      completeDrag,
      completeResize,
      setShowSelectionUI,
      dragPrepared,
      dispatch,
      viewport,
      isSelectionRegion,
      selectionRegionStart,
      selectionRegionCurrent,
      potentialRegion,
      selectedIds,
    ],
  );

  // Handle pointer leave events
  const handlePointerLeave = useCallback(
    (event: React.PointerEvent) => {
      if (hasActiveDrag) {
        completeDrag(event);
      }

      // Clean up mouse tracking state
      setMouseDownPoint(null);
      setDragPrepared(false);
      setShiftWasPressed(false);
      setCmdWasPressed(false);

      // Reset cursor and hover states when leaving canvas (unless actively resizing)
      const store = useAppStore.getState();
      if (!store.isResizing) {
        store.resetCursor();
        store.setIsHoveringResizeHandle(false);
      } else {
        // Even if resizing, clear hover state since we're leaving the canvas
        store.setIsHoveringResizeHandle(false);
      }
    },
    [hasActiveDrag, completeDrag],
  );

  // Handle selection box clicks (for dragging selection groups)
  const handleSelectionBoxClick = useCallback(
    (event: React.PointerEvent, groupIds: string[]) => {
      // Don't start drag operations in creation mode
      if (activeTool !== "select") {
        return;
      }

      // If we're starting a drag operation, prepare the drag state
      if (!event.shiftKey) {
        // Don't start drag if CMD is pressed - allow Canvas to handle CMD+drag for selection region
        const cmdPressed = event.metaKey || event.ctrlKey;
        if (cmdPressed) {
          return;
        }

        // Flush any lingering resize state so CanvasObject reads dragPosition
        // instead of stale resizeState during the upcoming drag.
        useTransientStore.getState().clearResize();

        const currentViewport = useAppStore.getState().viewport;
        const worldPoint = getWorldCoordinatesFromEvent(
          event.nativeEvent,
          canvasRef.current!,
          currentViewport,
        );

        // IMPORTANT: Drag the ENTIRE selection, not just the clicked group
        // This ensures all selected objects move together when dragging any selection box
        const allSelectedIds = selectedIds;

        // Read the freshest objects from the store (not the closure) so that
        // positions committed by a just-completed resize are picked up.
        const freshObjects = useAppStore.getState().objects;

        // Prepare drag positions for the entire selection
        // For auto layout children, use DOM-based positions to avoid stale state values
        const initialPositions: Record<string, { x: number; y: number }> = {};
        const initialParents: Record<string, string | undefined> = {};

        allSelectedIds.forEach((id: string) => {
          const obj = freshObjects[id];
          if (obj) {
            const bounds = getVisualBoundsFromDOM(id, freshObjects, currentViewport);
            initialPositions[id] = {
              x: bounds.x,
              y: bounds.y,
            };
            initialParents[id] = obj.parentId;
          }
        });

        // Start drag with the entire selection, not just the clicked group
        startDrag(
          allSelectedIds,
          worldPoint,
          initialPositions,
          initialParents,
          event.shiftKey,
          event,
        );
      }
    },
    [startDrag, selectedIds, activeTool],
  );

  // Handle selection box clear clicks (click without drag)
  const handleSelectionBoxClearClick = useCallback(
    (event: React.PointerEvent) => {
      // Try to find what's underneath and select it directly
      const selectionResult = handleSelection(event);

      // If we found something underneath, the selection will have changed to that object
      // If we didn't find anything, clear the selection
      if (!selectionResult || selectionResult.selectedIds.length === 0) {
        dispatch({
          type: "selection.changed",
          payload: {
            selectedIds: [],
            previousSelection: selectedIds,
          },
        });
      }
    },
    [handleSelection, dispatch, selectedIds],
  );

  // Handle double-click events for deep selection and text editing
  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (activeTool !== "select") {
        return;
      }

      // Double-click on a paused make → play it
      const elementsUnder = document.elementsFromPoint(event.clientX, event.clientY);
      for (const el of elementsUnder) {
        const objId = el.getAttribute("data-object-id");
        const objType = el.getAttribute("data-object-type");
        if (objId && objType === "make") {
          const currentObjects = useAppStore.getState().objects;
          const makeObj = currentObjects[objId];
          if (makeObj && makeObj.properties.type === "make" && !makeObj.properties.playing) {
            dispatch({
              type: "object.updated",
              payload: {
                id: objId,
                changes: {
                  properties: { ...makeObj.properties, playing: true },
                },
                previousValues: { properties: makeObj.properties },
              },
            });
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          break;
        }
      }

      // Clear the reset timeout - we're in a double-click sequence
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }

      // First check if we should handle text editing - prioritize text editing over deep selection
      // Try to find text object by traversing DOM tree first
      let element = event.target as HTMLElement;
      let textObjectId: string | null = null;

      // Traverse up the DOM tree to find a text object
      while (element && element !== event.currentTarget) {
        const objectId = element.getAttribute("data-object-id");
        const objectType = element.getAttribute("data-object-type");

        if (objectId && objectType === "text") {
          textObjectId = objectId;
          break;
        }
        element = element.parentElement!;
      }

      // If DOM traversal didn't find a text object, check if we have a selected text object at this location
      if (!textObjectId && selectedIds.length === 1) {
        const selectedId = selectedIds[0];
        const selectedObject = objects[selectedId];

        if (selectedObject && selectedObject.type === "text") {
          // Check if the click is roughly within the text object bounds
          const objectElement = document.querySelector(
            `[data-object-id="${selectedId}"]`,
          );
          if (objectElement) {
            const rect = objectElement.getBoundingClientRect();
            if (
              event.clientX >= rect.left &&
              event.clientX <= rect.right &&
              event.clientY >= rect.top &&
              event.clientY <= rect.bottom
            ) {
              textObjectId = selectedId;
            }
          }
        }
      }

      // If we found a text object, enter edit mode and skip deep selection
      if (textObjectId) {
        const textObject = objects[textObjectId];

        if (textObject && textObject.type === "text") {
          // Enter edit mode for this text object
          dispatch({
            type: "object.updated",
            payload: {
              id: textObject.id,
              changes: {
                properties: {
                  ...textObject.properties,
                  isEditing: true,
                } as any,
              },
              previousValues: { properties: textObject.properties },
            },
          });

          // Also select this object if it's not already selected
          if (!selectedIds.includes(textObject.id)) {
            dispatch({
              type: "selection.changed",
              payload: {
                selectedIds: [textObject.id],
                previousSelection: selectedIds,
              },
            });
          }

          // Prevent further event handling
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      // Check if we have a single selected rectangle with a single image fill
      // If so, open the fill popover instead of doing deep selection
      if (selectedIds.length === 1) {
        const selectedObject = objects[selectedIds[0]];

        if (
          selectedObject &&
          selectedObject.type === "rectangle" &&
          selectedObject.fills &&
          selectedObject.fills.length === 1 &&
          selectedObject.fills[0].type === "image" &&
          selectedObject.fills[0].visible !== false
        ) {
          // Trigger fill popover opening by dispatching a custom event
          const fillPopoverEvent = new CustomEvent("openFillPopover", {
            detail: {
              objectId: selectedObject.id,
              fillId: selectedObject.fills[0].id,
              position: { x: event.clientX, y: event.clientY },
            },
          });
          window.dispatchEvent(fillPopoverEvent);

          // Prevent further event handling (skip deep selection)
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      // Only try deep selection if we didn't find a text object to edit

      // Check for depth-0 blocking before allowing deep selection
      try {
        const hitResults = getObjectsAtPoint(
          { x: event.clientX, y: event.clientY },
          {
            selectTopmost: true,
            ignoreLocked: true,
          },
        );

        const populatedResults = hitResults
          .map((result) => {
            const objectId = result.element.getAttribute("data-object-id");
            const object = objectId ? objects[objectId] : null;
            return {
              ...result,
              object: object || result.object,
            };
          })
          .filter(
            (result) =>
              result.object &&
              result.object.visible !== false &&
              !result.object.locked,
          );

        if (populatedResults.length > 0) {
          const bestTarget = getAdvancedSelectionTarget(
            populatedResults,
            selectedIds,
            objects,
            {
              isCmdClick: false,
              isShiftClick: false, // Double-click handler - not a shift click
              isClickingOnLabel: false,
              labelFrameId: undefined,
            },
          );

          // If getAdvancedSelectionTarget returns null (blocked by depth-0 logic),
          // don't proceed with deep selection
          if (!bestTarget) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }
      } catch (error) {
        console.warn(
          "Error checking depth-0 blocking for double-click:",
          error,
        );
      }

      const deepSelectionHandled = handleDeepSelection(event);
      if (deepSelectionHandled) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    },
    [activeTool, dispatch, selectedIds, objects, handleDeepSelection],
  );

  // Handle pointer move events - detect drag start with current selection
  const handleCanvasPointerMove = useCallback(
    (event: React.PointerEvent) => {
      // Handle active resize operations first
      if (hasActiveResize) {
        handleResizePointerMove(event);
        return;
      }

      // Handle active drag operations
      if (hasActiveDrag) {
        handleDragPointerMove(event);
        return;
      }

      // Check potential selection region threshold (5px movement required)
      if (potentialRegion && canvasRef.current) {
        const currentPoint = getWorldCoordinatesFromEvent(
          event.nativeEvent,
          canvasRef.current,
          viewport,
        );

        const deltaX = Math.abs(currentPoint.x - potentialRegion.startPoint.x);
        const deltaY = Math.abs(currentPoint.y - potentialRegion.startPoint.y);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (distance >= 5 && !isSpacePanning) {
          // Start the actual selection region (only if not space panning)
          setIsSelectionRegion(true);
          setSelectionRegionStart(potentialRegion.startPoint);
          setSelectionRegionCurrent(currentPoint);

          // Clear potential region
          setPotentialRegion(null);

          // Clear selection if not shift-clicking (from stored selection data)
          const selectionData = potentialRegion.selectionData;
          if (selectionData.selectedIds.length === 0) {
            dispatch({
              type: "selection.changed",
              payload: {
                selectedIds: [],
                previousSelection: selectedIds,
              },
            });
          }
        }
      }

      // Handle selection region updates
      if (isSelectionRegion && selectionRegionStart && canvasRef.current) {
        const currentPoint = getWorldCoordinatesFromEvent(
          event.nativeEvent,
          canvasRef.current,
          viewport,
        );

        setSelectionRegionCurrent(currentPoint);

        // Calculate selection region bounds
        const minX = Math.min(selectionRegionStart.x, currentPoint.x);
        const minY = Math.min(selectionRegionStart.y, currentPoint.y);
        const maxX = Math.max(selectionRegionStart.x, currentPoint.x);
        const maxY = Math.max(selectionRegionStart.y, currentPoint.y);
        const width = maxX - minX;
        const height = maxY - minY;

        // Only update selection if region has meaningful size
        if (width > 5 && height > 5) {
          const regionBounds = { x: minX, y: minY, width, height };
          const objectsInRegion = findObjectsInRegion(regionBounds, objects, {
            cmdPressed: event.metaKey || event.ctrlKey,
          });

          // Combine with existing selection if shift was pressed
          const newSelection = shiftWasPressed
            ? [...new Set([...selectedIds, ...objectsInRegion])]
            : objectsInRegion;

          // Update selection live
          dispatch({
            type: "selection.changed",
            payload: {
              selectedIds: newSelection,
              previousSelection: selectedIds,
            },
          });
        }

        return;
      }

      // Handle creation tool interactions
      if (activeTool !== "select" && tools.isCreating && canvasRef.current) {
        const currentPoint = getWorldCoordinatesFromEvent(
          event.nativeEvent,
          canvasRef.current,
          viewport,
        );

        // Ensure we have a valid start point before updating
        if (!mouseDownPoint) {
          return;
        }

        dispatch({
          type: "tool.interaction.updated",
          payload: {
            tool: activeTool,
            currentPoint,
            startPoint: mouseDownPoint,
            modifiers: {
              shift: event.shiftKey,
              alt: event.altKey,
              cmd: event.metaKey || event.ctrlKey,
            },
          },
        });
        return;
      }

      // Handle potential drag start when mouse is held down
      // BUT NOT if we're already in selection region mode
      if (
        mouseDownPoint &&
        !dragPrepared &&
        !shiftWasPressed &&
        activeTool === "select" &&
        !isSelectionRegion &&
        !potentialRegion
      ) {
        const currentWorldPoint = getWorldCoordinatesFromEvent(
          event.nativeEvent,
          canvasRef.current!,
          viewport,
        );

        const deltaX = currentWorldPoint.x - mouseDownPoint.x;
        const deltaY = currentWorldPoint.y - mouseDownPoint.y;
        const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const dragThreshold = 10 / viewport.zoom; // Increased from 3 to 10 pixels

        if (moveDistance > dragThreshold && !isSpacePanning) {
          // Check if CMD is pressed - if so, start selection region instead of drag
          const cmdPressed = cmdWasPressed;

          if (cmdPressed && !isSpacePanning) {
            // Switch to selection region mode (only if not space panning)
            setIsSelectionRegion(true);
            setSelectionRegionStart(mouseDownPoint);
            setSelectionRegionCurrent(currentWorldPoint);

            // Clear selection if not shift
            if (!shiftWasPressed) {
              dispatch({
                type: "selection.changed",
                payload: {
                  selectedIds: [],
                  previousSelection: selectedIds,
                },
              });
            }

            setDragPrepared(true); // Prevent further processing
            return;
          }

          // Check if we should use original multi-selection for drag
          const originalMultiSelection = (window as any)
            .__originalMultiSelectionForDrag;
          const dragSelection = originalMultiSelection || selectedIds;

          if (originalMultiSelection) {
            // Store the dragged selection to restore after drag completion
            (window as any).__draggedMultiSelection = dragSelection;

            // Clear the stored selection
            delete (window as any).__originalMultiSelectionForDrag;
          }

          // Prepare drag positions for drag selection
          const initialPositions: Record<string, { x: number; y: number }> = {};
          const initialParents: Record<string, string | undefined> = {};

          // Get all objects that will be dragged (selected + their descendants)
          const allDraggedObjectIds = new Set<string>();

          const collectDescendants = (objectId: string) => {
            allDraggedObjectIds.add(objectId);
            const obj = objects[objectId];
            if (obj && obj.childIds) {
              obj.childIds.forEach((childId: string) =>
                collectDescendants(childId),
              );
            }
          };

          // Collect all objects (selected + descendants)
          dragSelection.forEach(collectDescendants);

          // Capture initial positions and parents for ALL dragged objects
          Array.from(allDraggedObjectIds).forEach((id: string) => {
            const obj = objects[id];
            if (obj) {
              const absolutePosition = getAbsolutePosition(id, objects);
              initialPositions[id] = {
                x: absolutePosition.x,
                y: absolutePosition.y,
              };
              initialParents[id] = obj.parentId;
            }
          });

          // Filter dragSelection to ensure no parent/child conflicts before starting drag
          const filteredDragSelection = filterAncestorDescendantConflicts(
            dragSelection,
            objects,
          );

          // Start drag with filtered selection (no parent/child conflicts)
          startDrag(
            filteredDragSelection,
            mouseDownPoint,
            initialPositions,
            initialParents,
            shiftWasPressed,
            event,
          );

          setDragPrepared(true);
        }
      }
    },
    [
      hasActiveResize,
      handleResizePointerMove,
      hasActiveDrag,
      handleDragPointerMove,
      mouseDownPoint,
      dragPrepared,
      selectedIds,
      canvasRef,
      viewport,
      objects,
      startDrag,
      shiftWasPressed,
      isSelectionRegion,
      selectionRegionStart,
      selectionRegionCurrent,
      cmdWasPressed,
      potentialRegion,
    ],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // The original code had a cleanup function here, but it was not defined.
      // Assuming it was meant to be removed or replaced with a no-op if not defined.
      // Since the original code had it, but it wasn't defined, I'm removing it.
    };
  }, []);

  return (
    <CanvasContextMenu>
      <div
        ref={canvasRef}
        className={`relative w-full h-full overflow-hidden ${className}`}
        data-canvas-area="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={handleDoubleClick}
        style={{
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {/* World Space - Zoomable/pannable content */}
        <WorldSpace />

        {/* Rulers */}
        <Ruler
          type="horizontal"
          viewport={viewport}
          size={canvasRef.current?.offsetWidth || viewport.viewportBounds.width}
          offset={sidebarWidth}
        />
        <Ruler
          type="vertical"
          viewport={viewport}
          size={
            canvasRef.current?.offsetHeight || viewport.viewportBounds.height
          }
          offset={sidebarWidth}
        />

        {/* Pixel Grid - Shows at 400%+ zoom */}
        <PixelMatrix viewport={viewport} />

        {/* Screen Space - Fixed overlays */}
        <ScreenSpace
          isDragging={isDragging}
          showSelectionUI={showSelectionUI}
          showSelectionPreview={
            activeTool === "select" &&
            !isDragging &&
            !isSelectionRegion &&
            !isZooming &&
            !isPanning &&
            !isSpacePanning &&
            !hasActiveResize &&
            !cropMode.isActive
          }
          selectionPreviewTarget={selectionPreviewTarget}
          potentialParent={potentialParent}
          dragMousePosition={currentMouseWorldPosition || undefined}
          draggedIds={selectedIds}
          onSelectionBoxClick={handleSelectionBoxClick}
          onSelectionBoxClearClick={handleSelectionBoxClearClick}
          onResizeStart={startResize}
          isZooming={isZooming}
          isPanning={isPanning}
          selectionRegionStart={selectionRegionStart}
          selectionRegionCurrent={selectionRegionCurrent}
          isSelectionRegion={isSelectionRegion}
        />
      </div>
    </CanvasContextMenu>
  );
}
