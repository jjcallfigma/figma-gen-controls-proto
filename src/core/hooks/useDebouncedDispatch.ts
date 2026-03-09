import { useAppStore } from "@/core/state/store";
import { useCallback, useRef } from "react";

interface DebouncedDispatchOptions {
  delay?: number;
  immediate?: boolean; // If true, fires immediately on first call, then debounces subsequent calls
}

/**
 * Custom hook for debouncing store dispatches to prevent excessive undo/redo entries.
 * Useful for color pickers, sliders, and other continuous input controls.
 */
export function useDebouncedDispatch(options: DebouncedDispatchOptions = {}) {
  const { delay = 300, immediate = false } = options;
  const dispatch = useAppStore((state) => state.dispatch);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastDispatchRef = useRef<any>(null);
  const isFirstCallRef = useRef(true);

  const debouncedDispatch = useCallback(
    (action: any) => {
      // Store the latest action
      lastDispatchRef.current = action;

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // If immediate mode and first call, dispatch immediately
      if (immediate && isFirstCallRef.current) {
        dispatch(action);
        isFirstCallRef.current = false;
        return;
      }

      // Set up new timeout
      timeoutRef.current = setTimeout(() => {
        if (lastDispatchRef.current) {
          dispatch(lastDispatchRef.current);
          lastDispatchRef.current = null;
        }
      }, delay);
    },
    [dispatch, delay, immediate]
  );

  // Immediately dispatch any pending action
  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (lastDispatchRef.current) {
      dispatch(lastDispatchRef.current);
      lastDispatchRef.current = null;
    }
  }, [dispatch]);

  // Cancel any pending dispatch
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    lastDispatchRef.current = null;
  }, []);

  // Reset the first call flag (useful when starting a new interaction)
  const reset = useCallback(() => {
    isFirstCallRef.current = true;
    cancel();
  }, [cancel]);

  return {
    debouncedDispatch,
    flush,
    cancel,
    reset,
  };
}
