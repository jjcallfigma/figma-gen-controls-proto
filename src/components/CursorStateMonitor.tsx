"use client";

import { useAppStore } from "@/core/state/store";
import {
  getLastPointerPosition,
  isPointerOverResizeHandle,
} from "@/hooks/useCursor";
import { useEffect } from "react";

/**
 * Defensive component that periodically clears stuck resize cursors.
 *
 * The primary mechanism is the pointermove/pointerup hit-test in useToolCursor.
 * This monitor is the fallback for the case where the mouse is stationary
 * (e.g. after a viewport zoom via keyboard shortcut).
 */
export function CursorStateMonitor() {
  // Periodic hit-test fallback
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const state = useAppStore.getState();

      if (
        state.cursor.source &&
        state.cursor.source.startsWith("resize:") &&
        !state.isResizing
      ) {
        // Use actual DOM hit-testing instead of the unreliable
        // isHoveringResizeHandle flag (pointerleave often doesn't fire).
        const pos = getLastPointerPosition();
        const overHandle = pos
          ? isPointerOverResizeHandle(pos.x, pos.y)
          : false;

        if (!overHandle) {
          state.setIsHoveringResizeHandle(false);
          state.resetCursor();
        }
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, []);

  // Window focus: reset stuck resize cursors (pointer state is unreliable
  // when the window was blurred).
  useEffect(() => {
    const handleWindowFocus = () => {
      const state = useAppStore.getState();

      if (
        state.cursor.source &&
        state.cursor.source.startsWith("resize:") &&
        !state.isResizing
      ) {
        state.resetCursor();
        state.setIsHoveringResizeHandle(false);
      }
    };

    const handleWindowBlur = () => {
      const state = useAppStore.getState();
      if (!state.isResizing) {
        state.setIsHoveringResizeHandle(false);
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  // Escape key: reset stuck resize cursors
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const state = useAppStore.getState();

        if (
          state.cursor.source &&
          state.cursor.source.startsWith("resize:") &&
          !state.isResizing
        ) {
          state.resetCursor();
          state.setIsHoveringResizeHandle(false);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}
