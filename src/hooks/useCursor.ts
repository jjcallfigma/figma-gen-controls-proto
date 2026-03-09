import { useAppStore } from "@/core/state/store";
import {
  CursorState,
  CursorType,
  RESIZE_HANDLE_CURSORS,
  TOOL_CURSORS,
} from "@/types/cursor";
import { useCallback, useEffect } from "react";

// Last known pointer position for hit-testing when the mouse is stationary.
// Updated on every pointermove by useToolCursor.
let _lastPointerPos: { x: number; y: number } | null = null;

export function getLastPointerPosition() {
  return _lastPointerPos;
}

/** Hit-test the DOM to check if the given screen coords are over a resize handle. */
export function isPointerOverResizeHandle(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y);
  return !!el?.closest('[data-resize-handle="true"]');
}

/**
 * Hook for managing global cursor state
 *
 * This hook provides a clean interface for setting cursors based on:
 * - Tool states
 * - Resize handles
 * - Interaction states
 * - Custom cursor requirements
 */
export function useCursor() {
  const {
    cursor,
    setCursor: setStoreCursor,
    pushCursor: pushStoreCursor,
    popCursor: popStoreCursor,
    resetCursor: resetStoreCursor,
    tools,
  } = useAppStore();

  // Set cursor with optional priority and source tracking
  const setCursor = useCallback(
    (cursor: CursorType | CursorState, source?: string) => {
      setStoreCursor(cursor, source);
    },
    [setStoreCursor]
  );

  // Push cursor onto stack (useful for temporary cursor changes)
  const pushCursor = useCallback(
    (cursor: CursorType | CursorState, source?: string) => {
      pushStoreCursor(cursor, source);
    },
    [pushStoreCursor]
  );

  // Pop cursor from stack
  const popCursor = useCallback(() => {
    popStoreCursor();
  }, [popStoreCursor]);

  // Reset cursor to default
  const resetCursor = useCallback(() => {
    resetStoreCursor();
  }, [resetStoreCursor]);

  // Set cursor based on current tool
  const setToolCursor = useCallback(
    (toolId?: string) => {
      const tool = toolId || tools.activeTool;
      const cursorType = TOOL_CURSORS[tool] || "default";
      setCursor(cursorType, `tool:${tool}`);
    },
    [setCursor, tools.activeTool]
  );

  // Set cursor for resize handle
  const setResizeCursor = useCallback(
    (handleId: string) => {
      const cursorType = RESIZE_HANDLE_CURSORS[handleId];
      if (cursorType) {
        setCursor(cursorType, `resize:${handleId}`);
      }
    },
    [setCursor]
  );

  // Set cursor for drag operations
  const setDragCursor = useCallback(
    (isDragging: boolean) => {
      if (isDragging) {
        setCursor("grabbing", "drag:active");
      } else {
        setCursor("grab", "drag:hover");
      }
    },
    [setCursor]
  );

  // Set cursor for hovering over interactive elements
  const setHoverCursor = useCallback(
    (isHovering: boolean) => {
      if (isHovering) {
        setCursor("pointer", "hover:interactive");
      } else {
        setToolCursor(); // Reset to tool cursor
      }
    },
    [setCursor, setToolCursor]
  );

  // Set cursor for zoom operations
  const setZoomCursor = useCallback(
    (isZooming: "in" | "out" | null) => {
      switch (isZooming) {
        case "in":
          setCursor("zoom-in", "zoom:in");
          break;
        case "out":
          setCursor("zoom-out", "zoom:out");
          break;
        default:
          setToolCursor();
          break;
      }
    },
    [setCursor, setToolCursor]
  );

  // Set cursor for pan operations
  const setPanCursor = useCallback(
    (isPanning: boolean) => {
      if (isPanning) {
        setCursor("hand-press", "pan:active");
      } else {
        setCursor("hand", "pan:hover");
      }
    },
    [setCursor]
  );

  // Set cursor for not-allowed operations
  const setNotAllowedCursor = useCallback(() => {
    setCursor("not-allowed", "operation:not-allowed");
  }, [setCursor]);

  // Create a scoped cursor that automatically resets
  const withTemporaryCursor = useCallback(
    (
      tempCursor: CursorType | CursorState,
      callback: () => void | Promise<void>,
      source?: string
    ) => {
      return async () => {
        pushCursor(tempCursor, source);
        try {
          await callback();
        } finally {
          popCursor();
        }
      };
    },
    [pushCursor, popCursor]
  );

  return {
    // Current state
    cursor,

    // Basic cursor operations
    setCursor,
    pushCursor,
    popCursor,
    resetCursor,

    // Contextual cursor setters
    setToolCursor,
    setResizeCursor,
    setDragCursor,
    setHoverCursor,
    setZoomCursor,
    setPanCursor,
    setNotAllowedCursor,

    // Utility functions
    withTemporaryCursor,
  };
}

/**
 * Hook for resize handle cursor management
 *
 * This is a specialized hook for components that deal with resize handles.
 * It automatically manages cursor states based on handle interactions.
 */
export function useResizeCursor() {
  const { resetCursor } = useCursor();
  const { isResizing, setIsHoveringResizeHandle } = useAppStore();

  // Hover cursors are now handled by CSS `cursor` on the handle elements
  // themselves — no JavaScript state management needed for the hover case.
  // These handlers only track the flag for other consumers.
  const handleResizeHandleEnter = useCallback(
    (handleId: string) => {
      const isSpacePanning = (window as any).__figmaCloneSpacePanning;
      if (isSpacePanning) return;
      setIsHoveringResizeHandle(true);
    },
    [setIsHoveringResizeHandle]
  );

  const handleResizeHandleLeave = useCallback(() => {
    setIsHoveringResizeHandle(false);
  }, [setIsHoveringResizeHandle]);

  // When resize ends, clear the hover flag (pointer capture suppresses
  // pointerleave so the flag can be stale) and reset cursor.
  useEffect(() => {
    if (!isResizing) {
      setIsHoveringResizeHandle(false);

      const store = useAppStore.getState();
      if (store.cursor.source && store.cursor.source.startsWith("resize:")) {
        resetCursor();
      }
    }
  }, [isResizing, setIsHoveringResizeHandle, resetCursor]);

  // Component unmount cleanup
  useEffect(() => {
    return () => {
      const store = useAppStore.getState();
      if (store.cursor.source && store.cursor.source.startsWith("resize:")) {
        store.resetCursor();
        store.setIsHoveringResizeHandle(false);
      }
    };
  }, []);

  const handleResizeStart = useCallback(() => {}, []);
  const handleResizeEnd = useCallback(() => {}, []);

  return {
    handleResizeHandleEnter,
    handleResizeHandleLeave,
    handleResizeStart,
    handleResizeEnd,
  };
}

/**
 * Hook for drag cursor management
 *
 * Specialized hook for drag operations with proper cursor states.
 */
export function useDragCursor() {
  const { setDragCursor, resetCursor } = useCursor();

  const handleDragStart = useCallback(() => {
    setDragCursor(true);
  }, [setDragCursor]);

  const handleDragEnd = useCallback(() => {
    resetCursor();
  }, [resetCursor]);

  const handleDragHover = useCallback(
    (isHovering: boolean) => {
      // Don't override space panning cursors
      const store = useAppStore.getState();
      if (
        store.cursor.source &&
        (store.cursor.source.startsWith("space-pan") ||
          store.cursor.source === "space-pan-ready" ||
          store.cursor.source === "space-pan-active")
      ) {
        return;
      }

      if (isHovering) {
        setDragCursor(false);
      } else {
        resetCursor();
      }
    },
    [setDragCursor, resetCursor]
  );

  return {
    handleDragStart,
    handleDragEnd,
    handleDragHover,
  };
}

/**
 * Hook that automatically sets cursors based on the active tool
 * Use this in the Canvas component to enable tool-based cursors
 */
export function useToolCursor() {
  const { tools, cursor, isResizing } = useAppStore();
  const { activeTool, isCreating } = tools;
  const { setToolCursor, resetCursor } = useCursor();

  useEffect(() => {
    const isSpacePanning = (window as any).__figmaCloneSpacePanning;
    if (isSpacePanning) {
      return;
    }

    // setCursor's priority system already prevents tool cursors (priority 2)
    // from overriding active resize cursors (priority 10), so we only need
    // to guard on isResizing here.
    if (!isResizing) {
      setToolCursor(activeTool);
    }
  }, [activeTool, setToolCursor, isResizing, isCreating]);

  // During creation, if cursor gets reset to default, restore tool cursor
  useEffect(() => {
    const isSpacePanning = (window as any).__figmaCloneSpacePanning;
    if (isSpacePanning) {
      return;
    }

    if (
      isCreating &&
      !isResizing &&
      cursor.type === "default" &&
      cursor.source === "reset"
    ) {
      setToolCursor(activeTool);
    }
  }, [
    isCreating,
    cursor.type,
    cursor.source,
    isResizing,
    setToolCursor,
    activeTool,
  ]);

  // Fix stuck resize cursors via actual DOM hit-testing.
  // pointerleave is unreliable: it doesn't fire when pointer capture is active,
  // when elements move (viewport zoom/pan), or when elements are removed.
  // We use the real DOM as the source of truth on every pointermove/pointerup.
  useEffect(() => {
    const resetIfNotOverHandle = (e: PointerEvent) => {
      _lastPointerPos = { x: e.clientX, y: e.clientY };

      const state = useAppStore.getState();
      if (
        !state.isResizing &&
        state.cursor.source &&
        state.cursor.source.startsWith("resize:")
      ) {
        if (!isPointerOverResizeHandle(e.clientX, e.clientY)) {
          state.setIsHoveringResizeHandle(false);
          resetCursor();
        }
      }
    };

    // Also keep _lastPointerPos up-to-date even when cursor is fine
    const trackPosition = (e: PointerEvent) => {
      _lastPointerPos = { x: e.clientX, y: e.clientY };
    };

    document.addEventListener("pointermove", resetIfNotOverHandle);
    document.addEventListener("pointerup", resetIfNotOverHandle);
    // Capture phase so we always record position, even if something
    // calls stopPropagation in the bubble phase.
    document.addEventListener("pointermove", trackPosition, true);
    return () => {
      document.removeEventListener("pointermove", resetIfNotOverHandle);
      document.removeEventListener("pointerup", resetIfNotOverHandle);
      document.removeEventListener("pointermove", trackPosition, true);
    };
  }, [resetCursor]);

  return {
    activeTool,
    setToolCursor,
  };
}
