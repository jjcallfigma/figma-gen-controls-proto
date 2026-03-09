import { useAppStore } from "@/core/state/store";
import { AutoLayoutObserverAPI } from "@/core/utils/autoLayout";
import { CanvasObject, Viewport } from "@/types/canvas";
import { useCallback, useEffect, useRef, useState } from "react";

// Constants for zoom/pan behavior
const WHEEL_SCALE_SPEEDUP = 6;
const WHEEL_TRANSLATION_SPEEDUP = 2;
const DELTA_LINE_MULTIPLIER = 8;
const DELTA_PAGE_MULTIPLIER = 24;

// Zoom level constants
const ZOOM_LEVELS = [
  2, 3, 6, 13, 25, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600,
];
const DEFAULT_ZOOM_LEVEL = 100;

// Helper functions for zoom levels
function findClosestZoomLevel(currentZoom: number): number {
  const currentPercent = currentZoom * 100;
  return ZOOM_LEVELS.reduce((prev, curr) =>
    Math.abs(curr - currentPercent) < Math.abs(prev - currentPercent)
      ? curr
      : prev,
  );
}

function getNextZoomLevel(
  currentZoom: number,
  direction: "in" | "out",
): number {
  const currentPercent = currentZoom * 100;
  const currentIndex = ZOOM_LEVELS.findIndex(
    (level) => level >= currentPercent,
  );

  if (direction === "in") {
    // Zoom in - go to next higher level
    if (currentIndex === -1) return ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
    if (currentIndex === ZOOM_LEVELS.length - 1)
      return ZOOM_LEVELS[currentIndex];
    // If we're exactly at a level, go to next; otherwise go to current level we found
    const exactMatch = ZOOM_LEVELS[currentIndex] === currentPercent;
    return exactMatch
      ? ZOOM_LEVELS[Math.min(currentIndex + 1, ZOOM_LEVELS.length - 1)]
      : ZOOM_LEVELS[currentIndex];
  } else {
    // Zoom out - go to next lower level
    if (currentIndex === -1) return ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
    if (currentIndex === 0) return ZOOM_LEVELS[0];
    // If we're exactly at a level, go to previous; otherwise go to previous level
    const exactMatch = ZOOM_LEVELS[currentIndex] === currentPercent;
    return exactMatch
      ? ZOOM_LEVELS[Math.max(currentIndex - 1, 0)]
      : ZOOM_LEVELS[Math.max(currentIndex - 1, 0)];
  }
}
const MAX_WHEEL_DELTA = 24;

const MIN_SCALE = 0.02;
const MAX_SCALE = 256;

// Utility functions for zoom/pan
function limit(delta: number, max_delta: number) {
  return Math.sign(delta) * Math.min(max_delta, Math.abs(delta));
}

function normalizeWheel(e: WheelEvent) {
  let dx = e.deltaX;
  let dy = e.deltaY;
  if (e.shiftKey && dx === 0) {
    [dx, dy] = [dy, dx];
  }
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    dx *= DELTA_LINE_MULTIPLIER;
    dy *= DELTA_LINE_MULTIPLIER;
  } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    dx *= DELTA_PAGE_MULTIPLIER;
    dy *= DELTA_PAGE_MULTIPLIER;
  }
  return [limit(dx, MAX_WHEEL_DELTA), limit(dy, MAX_WHEEL_DELTA)];
}

interface UseZoomPanProps {
  viewport: Viewport;
  canvasRef: React.RefObject<HTMLElement | null>;
  onViewportChange: (viewport: Viewport) => void;
  onZoomingChange?: (isZooming: boolean) => void;
  disabled?: boolean;
  objects?: Record<string, CanvasObject>;
  layersExpanded?: boolean;
  layersPanelWidth?: number;
}

export function useZoomPan({
  viewport,
  canvasRef,
  onViewportChange,
  onZoomingChange,
  disabled = false,
  objects = {},
  layersExpanded = false,
  layersPanelWidth = 0,
}: UseZoomPanProps) {
  const [isZooming, setIsZooming] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const lastViewportRef = useRef(viewport);
  const viewportRef = useRef(viewport);
  const isSpaceKeyDownRef = useRef(false);
  const isDraggingWithSpaceRef = useRef(false);
  const lastMousePositionRef = useRef<{ x: number; y: number } | null>(null);
  // Shared ref so the auto-reset effect can tell the wheel handler to
  // re-announce isZooming/isPanning on the next wheel event.
  const isWheelActiveRef = useRef(false);
  // Tracks the current wheel gesture mode so we can re-announce state
  // when the user switches between pan and zoom (e.g. scroll → pinch).
  const wheelModeRef = useRef<"zoom" | "pan" | null>(null);

  // RAF-batching: accumulate viewport changes and flush once per frame
  const pendingViewportRef = useRef<Viewport | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const scheduleViewportUpdate = useCallback((newViewport: Viewport) => {
    // Always update the refs immediately so subsequent events within
    // the same frame read the latest computed viewport
    pendingViewportRef.current = newViewport;
    viewportRef.current = newViewport;
    lastViewportRef.current = newViewport;

    // Schedule a single flush per animation frame
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const pending = pendingViewportRef.current;
        if (pending) {
          pendingViewportRef.current = null;
          onViewportChangeRef.current(pending);
        }
      });
    }
  }, []);

  // Clean up any pending RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // Get cursor functions from store
  const setCursor = useAppStore((state) => state.setCursor);
  const resetCursor = useAppStore((state) => state.resetCursor);

  // Update viewport ref when viewport changes
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  // Force reset function that can be called from outside
  const forceReset = useCallback(() => {
    setIsZooming(false);
    setIsPanning(false);
    setIsSpacePanning(false);
    isDraggingWithSpaceRef.current = false;
    lastMousePositionRef.current = null;
    if (onZoomingChange) {
      onZoomingChange(false);
    }
  }, [onZoomingChange]);

  // Auto-reset effect — clears zoom/pan flags after a short idle period.
  // Auto-layout sync re-enable is handled separately with a longer delay
  // to avoid mid-gesture sync bursts that cause visual jumps.
  const enableSyncTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isZooming && !isPanning) return;

    // Disable auto-layout sync immediately when zooming/panning starts
    AutoLayoutObserverAPI.disableSync();
    // Cancel any pending re-enable
    if (enableSyncTimerRef.current) {
      clearTimeout(enableSyncTimerRef.current);
      enableSyncTimerRef.current = null;
    }

    const resetTimeout = setTimeout(() => {
      setIsZooming(false);
      setIsPanning(false);
      isWheelActiveRef.current = false;
      wheelModeRef.current = null;
      if (onZoomingChange) {
        onZoomingChange(false);
      }
      // Re-enable auto-layout sync with extra delay so the DOM
      // fully settles before any sync fires.
      enableSyncTimerRef.current = setTimeout(() => {
        enableSyncTimerRef.current = null;
        AutoLayoutObserverAPI.enableSync();
      }, 200);
    }, 300);

    return () => {
      clearTimeout(resetTimeout);
    };
  }, [isZooming, isPanning, onZoomingChange]);

  // Disable pointer-events on iframes inside the canvas while any
  // pan/zoom gesture is active so the iframe can't steal events mid-gesture.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (isPanning || isZooming || isSpacePanning) {
      canvas.setAttribute("data-canvas-panning", "true");
    } else {
      canvas.removeAttribute("data-canvas-panning");
    }
  }, [isPanning, isZooming, isSpacePanning, canvasRef]);

  // Also disable for space-panning
  useEffect(() => {
    if (isSpacePanning) {
      AutoLayoutObserverAPI.disableSync();
      if (enableSyncTimerRef.current) {
        clearTimeout(enableSyncTimerRef.current);
        enableSyncTimerRef.current = null;
      }
    }
  }, [isSpacePanning]);

  // Keyboard event handlers for space key panning
  useEffect(() => {
    if (disabled) return;

    // Check if text is being edited - same logic as in other keyboard handlers
    const isTextBeingEdited = () => {
      const activeElement = document.activeElement;
      return (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.getAttribute("contenteditable") === "true")
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle space key if text is being edited
      if (isTextBeingEdited()) {
        return;
      }

      if (e.code === "Space" && !isSpaceKeyDownRef.current) {
        e.preventDefault();
        isSpaceKeyDownRef.current = true;
        setIsSpacePanning(true);

        // Expose space panning state globally
        (window as any).__figmaCloneSpacePanning = true;

        // Set hand cursor for space panning
        setCursor({
          type: "hand",
          source: "space-pan-ready",
          priority: 100,
        });

        if (onZoomingChange) {
          onZoomingChange(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && isSpaceKeyDownRef.current) {
        e.preventDefault();
        isSpaceKeyDownRef.current = false;
        isDraggingWithSpaceRef.current = false;
        lastMousePositionRef.current = null;
        setIsSpacePanning(false);

        // Clear global space panning state FIRST
        (window as any).__figmaCloneSpacePanning = false;

        // Simple cursor reset - now that we use global state checking, this should work
        resetCursor();

        if (onZoomingChange) {
          onZoomingChange(false);
        }
      }
    };

    // Add global event listeners for keyboard events
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [disabled, onZoomingChange, setCursor, resetCursor]);

  // Mouse event handlers for space key panning
  useEffect(() => {
    if (disabled || !canvasRef.current) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (isSpaceKeyDownRef.current) {
        e.preventDefault();
        e.stopPropagation(); // Prevent event bubbling that might trigger browser navigation
        isDraggingWithSpaceRef.current = true;
        lastMousePositionRef.current = { x: e.clientX, y: e.clientY };

        // Change to pressed hand cursor
        setCursor({
          type: "hand-press",
          source: "space-pan-active",
          priority: 100,
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (
        isSpaceKeyDownRef.current &&
        isDraggingWithSpaceRef.current &&
        lastMousePositionRef.current
      ) {
        e.preventDefault();
        e.stopPropagation(); // Prevent event bubbling that might trigger browser navigation

        const deltaX = e.clientX - lastMousePositionRef.current.x;
        const deltaY = e.clientY - lastMousePositionRef.current.y;

        // Only update viewport if there's meaningful movement
        if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
          const currentViewport = viewportRef.current;
          const newViewport: Viewport = {
            ...currentViewport,
            panX: currentViewport.panX + deltaX,
            panY: currentViewport.panY + deltaY,
          };

          scheduleViewportUpdate(newViewport);
        }

        lastMousePositionRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDraggingWithSpaceRef.current) {
        e.preventDefault();
        e.stopPropagation(); // Prevent event bubbling that might trigger browser navigation
        isDraggingWithSpaceRef.current = false;
        lastMousePositionRef.current = null;

        // Return to ready hand cursor if space is still pressed
        if (isSpaceKeyDownRef.current) {
          setCursor({
            type: "hand",
            source: "space-pan-ready",
            priority: 100,
          });
        }
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        canvas.removeEventListener("mousedown", handleMouseDown);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [disabled, scheduleViewportUpdate, setCursor]);

  // Wheel event handler
  useEffect(() => {
    if (disabled || !canvasRef.current) return;

    const handleWheel = (e: WheelEvent) => {
      // Always handle wheel events for canvas panning and zooming
      e.preventDefault();
      e.stopPropagation();

      // Immediately mark canvas as panning so iframes lose pointer-events
      // before the next event can land inside them.
      canvasRef.current?.setAttribute("data-canvas-panning", "true");

      // Check if we're currently dragging/selecting
      if (canvasRef.current?.getAttribute("data-dragging") === "true") {
        return;
      }

      // Get mouse position relative to the canvas container
      const canvasRect = canvasRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - canvasRect.left;
      const mouseY = e.clientY - canvasRect.top;

      // Determine current gesture mode
      const isZoomGesture = e.ctrlKey || e.metaKey;
      const currentMode = isZoomGesture ? "zoom" : "pan";

      // Announce zoom/pan state — re-announce whenever the auto-reset has
      // cleared the flag OR the gesture mode changed (e.g. scroll → pinch).
      if (!isWheelActiveRef.current || wheelModeRef.current !== currentMode) {
        isWheelActiveRef.current = true;
        wheelModeRef.current = currentMode;
        if (isZoomGesture) {
          setIsZooming(true);
          setIsPanning(false);
        } else {
          setIsPanning(true);
          setIsZooming(false);
        }
        if (onZoomingChange) {
          onZoomingChange(isZoomGesture);
        }
      }

      // Use ref to get current viewport to avoid stale closure
      const currentViewport = viewportRef.current;

      if (isZoomGesture) {
        // Zoom — use raw deltaY with custom normalization instead of
        // normalizeWheel(), which clamps to MAX_WHEEL_DELTA and kills
        // the small deltas produced by trackpad pinch-to-zoom.
        //
        // Trackpad pinch: browser synthesizes wheel events with ctrlKey=true
        // and small deltaY (~0-15) at high frequency (~60 fps).
        // Mouse wheel + Ctrl/Cmd: large deltaY (~50-150) at low frequency.
        let zoomDelta = e.deltaY;
        if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
          zoomDelta *= DELTA_LINE_MULTIPLIER;
        } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
          zoomDelta *= DELTA_PAGE_MULTIPLIER;
        }

        // Normalize: boost small (trackpad) deltas for responsiveness,
        // compress large (mouse-wheel) deltas to prevent over-zooming per tick.
        const absDelta = Math.abs(zoomDelta);
        const PINCH_THRESHOLD = 15;
        const TRACKPAD_BOOST = 2.5;
        const MOUSE_WHEEL_COMPRESS = 1;
        const normalizedDelta =
          absDelta <= PINCH_THRESHOLD
            ? zoomDelta * TRACKPAD_BOOST
            : Math.sign(zoomDelta) *
              (PINCH_THRESHOLD +
                (absDelta - PINCH_THRESHOLD) * MOUSE_WHEEL_COMPRESS);

        // Exponential zoom: handles varying delta magnitudes naturally and
        // can never produce negative zoom values.
        const ZOOM_SPEED = 0.005;
        const newZoom =
          currentViewport.zoom * Math.exp(-normalizedDelta * ZOOM_SPEED);
        const clampedZoom = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newZoom));

        // Calculate the mouse position in world coordinates before and after zoom
        const worldX = (mouseX - currentViewport.panX) / currentViewport.zoom;
        const worldY = (mouseY - currentViewport.panY) / currentViewport.zoom;
        const newWorldX = (mouseX - currentViewport.panX) / clampedZoom;
        const newWorldY = (mouseY - currentViewport.panY) / clampedZoom;

        // Adjust viewport position to keep the mouse point fixed
        const newViewport: Viewport = {
          ...currentViewport,
          panX: currentViewport.panX + (newWorldX - worldX) * clampedZoom,
          panY: currentViewport.panY + (newWorldY - worldY) * clampedZoom,
          zoom: clampedZoom,
        };

        scheduleViewportUpdate(newViewport);
      } else {
        // Pan — use normalizeWheel() which clamps deltas for smooth panning
        const [dx, dy] = normalizeWheel(e);
        const newViewport: Viewport = {
          ...currentViewport,
          panX: currentViewport.panX - dx * WHEEL_TRANSLATION_SPEEDUP,
          panY: currentViewport.panY - dy * WHEEL_TRANSLATION_SPEEDUP,
        };

        scheduleViewportUpdate(newViewport);
      }

      // Clear any existing timer
      // The effect-based reset handles clearing the timer
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        canvas.removeEventListener("wheel", handleWheel);
        // The effect-based reset handles clearing the timer
      };
    }
  }, [canvasRef, scheduleViewportUpdate, onZoomingChange, disabled]);

  // Zoom to fit function
  const zoomToFit = useCallback(() => {
    if (!canvasRef.current || Object.keys(objects).length === 0) {
      return;
    }

    // Calculate bounding box of all objects
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    Object.values(objects).forEach((obj) => {
      if (obj) {
        const left = obj.x;
        const top = obj.y;
        const right = obj.x + obj.width;
        const bottom = obj.y + obj.height;

        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, right);
        maxY = Math.max(maxY, bottom);
      }
    });

    // If no valid objects found
    if (minX === Infinity) {
      return;
    }

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const contentCenterX = minX + contentWidth / 2;
    const contentCenterY = minY + contentHeight / 2;

    // Get available viewport size accounting for layers panel
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const availableWidth =
      canvasRect.width - (layersExpanded ? layersPanelWidth : 0);
    const availableHeight = canvasRect.height;

    // Add padding around content (10% of the smaller dimension)
    const padding = Math.min(availableWidth, availableHeight) * 0.1;
    const paddedAvailableWidth = availableWidth - padding * 2;
    const paddedAvailableHeight = availableHeight - padding * 2;

    // Calculate zoom to fit content
    const zoomX = paddedAvailableWidth / contentWidth;
    const zoomY = paddedAvailableHeight / contentHeight;
    const newZoom = Math.min(zoomX, zoomY, MAX_SCALE);

    // Clamp zoom to minimum scale
    const clampedZoom = Math.max(MIN_SCALE, newZoom);

    // Calculate pan to center content accounting for layers panel offset
    const layersOffset = layersExpanded ? layersPanelWidth : 0;
    const viewportCenterX = availableWidth / 2 + layersOffset;
    const viewportCenterY = availableHeight / 2;

    const newPanX = viewportCenterX - contentCenterX * clampedZoom;
    const newPanY = viewportCenterY - contentCenterY * clampedZoom;

    const newViewport: Viewport = {
      ...viewport,
      zoom: clampedZoom,
      panX: newPanX,
      panY: newPanY,
    };

    lastViewportRef.current = newViewport;
    onViewportChange(newViewport);
  }, [
    objects,
    canvasRef,
    viewport,
    onViewportChange,
    layersExpanded,
    layersPanelWidth,
  ]);

  // Zoom and pan to fit a specific set of objects (e.g. when opening a thread from history)
  const zoomToFitSelection = useCallback(
    (objectIds: string[]) => {
      if (!canvasRef.current || !objectIds.length || !objects) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const id of objectIds) {
        const obj = objects[id];
        if (!obj) continue;
        minX = Math.min(minX, obj.x);
        minY = Math.min(minY, obj.y);
        maxX = Math.max(maxX, obj.x + obj.width);
        maxY = Math.max(maxY, obj.y + obj.height);
      }
      if (minX === Infinity) return;
      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;
      const contentCenterX = minX + contentWidth / 2;
      const contentCenterY = minY + contentHeight / 2;
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const availableWidth =
        canvasRect.width - (layersExpanded ? layersPanelWidth : 0);
      const availableHeight = canvasRect.height;
      const padding = Math.min(availableWidth, availableHeight) * 0.1;
      const paddedAvailableWidth = availableWidth - padding * 2;
      const paddedAvailableHeight = availableHeight - padding * 2;
      const zoomX = paddedAvailableWidth / contentWidth;
      const zoomY = paddedAvailableHeight / contentHeight;
      const newZoom = Math.min(
        Math.max(MIN_SCALE, Math.min(zoomX, zoomY, MAX_SCALE)),
        MAX_SCALE,
      );
      const layersOffset = layersExpanded ? layersPanelWidth : 0;
      const viewportCenterX = availableWidth / 2 + layersOffset;
      const viewportCenterY = availableHeight / 2;
      const newPanX = viewportCenterX - contentCenterX * newZoom;
      const newPanY = viewportCenterY - contentCenterY * newZoom;
      const newViewport: Viewport = {
        ...viewport,
        zoom: newZoom,
        panX: newPanX,
        panY: newPanY,
      };
      lastViewportRef.current = newViewport;
      onViewportChange(newViewport);
    },
    [
      objects,
      canvasRef,
      viewport,
      onViewportChange,
      layersExpanded,
      layersPanelWidth,
    ],
  );

  // Zoom to 100% (keeping viewport centered)
  const zoomTo100 = useCallback(() => {
    if (!canvasRef.current) return;

    const targetZoom = DEFAULT_ZOOM_LEVEL / 100; // Convert percentage to decimal
    const canvasRect = canvasRef.current.getBoundingClientRect();

    // Calculate the effective visible canvas area (accounting for layers panel on left)
    // LayersPanel is fixed positioned and overlays the canvas from the left
    const layersOffset = layersExpanded ? layersPanelWidth : 0;
    const effectiveWidth = canvasRect.width - layersOffset;
    const centerX = layersOffset + effectiveWidth / 2;
    const centerY = canvasRect.height / 2;

    // Calculate world point at current center
    const worldCenterX = (centerX - viewport.panX) / viewport.zoom;
    const worldCenterY = (centerY - viewport.panY) / viewport.zoom;

    // Calculate new pan to keep the same world point at center
    const newPanX = centerX - worldCenterX * targetZoom;
    const newPanY = centerY - worldCenterY * targetZoom;

    const newViewport: Viewport = {
      ...viewport,
      zoom: targetZoom,
      panX: newPanX,
      panY: newPanY,
    };

    lastViewportRef.current = newViewport;
    onViewportChange(newViewport);
  }, [viewport, canvasRef, onViewportChange, layersExpanded, layersPanelWidth]);

  // Zoom in/out to closest zoom levels (keeping viewport centered)
  const zoomToLevel = useCallback(
    (direction: "in" | "out") => {
      if (!canvasRef.current) return;

      const targetZoomPercent = getNextZoomLevel(viewport.zoom, direction);
      const targetZoom = targetZoomPercent / 100;

      // Don't zoom if we're already at the target level
      if (Math.abs(targetZoom - viewport.zoom) < 0.001) return;

      const canvasRect = canvasRef.current.getBoundingClientRect();

      // Calculate the effective visible canvas area (accounting for layers panel on left)
      const layersOffset = layersExpanded ? layersPanelWidth : 0;
      const effectiveWidth = canvasRect.width - layersOffset;
      const centerX = layersOffset + effectiveWidth / 2;
      const centerY = canvasRect.height / 2;

      // Calculate world point at current center
      const worldCenterX = (centerX - viewport.panX) / viewport.zoom;
      const worldCenterY = (centerY - viewport.panY) / viewport.zoom;

      // Calculate new pan to keep the same world point at center
      const newPanX = centerX - worldCenterX * targetZoom;
      const newPanY = centerY - worldCenterY * targetZoom;

      const newViewport: Viewport = {
        ...viewport,
        zoom: targetZoom,
        panX: newPanX,
        panY: newPanY,
      };

      lastViewportRef.current = newViewport;
      onViewportChange(newViewport);
    },
    [viewport, canvasRef, onViewportChange, layersExpanded, layersPanelWidth],
  );

  // Zoom to specific percentage (keeping viewport centered)
  const zoomToPercent = useCallback(
    (percent: number) => {
      if (!canvasRef.current) return;

      const targetZoom = percent / 100;
      const canvasRect = canvasRef.current.getBoundingClientRect();

      // Calculate the effective visible canvas area (accounting for layers panel on left)
      const layersOffset = layersExpanded ? layersPanelWidth : 0;
      const effectiveWidth = canvasRect.width - layersOffset;
      const centerX = layersOffset + effectiveWidth / 2;
      const centerY = canvasRect.height / 2;

      // Calculate world point at current center
      const worldCenterX = (centerX - viewport.panX) / viewport.zoom;
      const worldCenterY = (centerY - viewport.panY) / viewport.zoom;

      // Calculate new pan to keep the same world point at center
      const newPanX = centerX - worldCenterX * targetZoom;
      const newPanY = centerY - worldCenterY * targetZoom;

      const newViewport: Viewport = {
        ...viewport,
        zoom: targetZoom,
        panX: newPanX,
        panY: newPanY,
      };

      lastViewportRef.current = newViewport;
      onViewportChange(newViewport);
    },
    [viewport, canvasRef, onViewportChange, layersExpanded, layersPanelWidth],
  );

  return {
    isZooming,
    isPanning,
    isSpacePanning,
    forceReset, // Expose force reset function
    zoomToFit, // Expose zoom to fit function
    zoomToFitSelection, // Zoom/pan to fit specific object IDs
    zoomTo100, // Expose zoom to 100% function
    zoomToLevel, // Expose zoom in/out function
    zoomToPercent, // Expose zoom to specific percentage function
  };
}
