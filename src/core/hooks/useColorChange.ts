import { useAppStore } from "@/core/state/store";
import { useCallback, useRef } from "react";
import { useDebouncedDispatch } from "./useDebouncedDispatch";

interface UseColorChangeOptions {
  /** Delay in ms before recording the change in undo/redo history (default: 500ms) */
  undoDelay?: number;
}

/**
 * Hook for handling color changes with immediate visual feedback but debounced undo/redo.
 * This prevents the undo stack from being flooded with intermediate color values during dragging.
 *
 * The strategy is:
 * 1. Immediate color changes use a ".preview" event type that doesn't get saved to undo history
 * 2. Final color changes use the regular event type that gets saved to undo history
 * 3. The debounced dispatch ensures only the final color gets recorded for undo
 */
export function useColorChange(options: UseColorChangeOptions = {}) {
  const { undoDelay = 500 } = options;
  const dispatch = useAppStore((state) => state.dispatch);
  const { debouncedDispatch, flush, reset } = useDebouncedDispatch({
    delay: undoDelay,
    immediate: false,
  });

  // Track the original values to create proper undo entries
  const originalValuesRef = useRef<{ [key: string]: any }>({});
  const isActiveInteractionRef = useRef(false);

  /**
   * Start a color change interaction. Call this when user begins dragging/changing color.
   * This captures the original state for undo/redo.
   */
  const startColorChange = useCallback(
    (stateKey: string, originalValue: any) => {
      if (!isActiveInteractionRef.current) {
        originalValuesRef.current[stateKey] = originalValue;
        isActiveInteractionRef.current = true;
        reset(); // Reset debounce state for new interaction
      }
    },
    [reset]
  );

  /**
   * Update color with immediate visual feedback and debounced undo entry.
   */
  const updateColor = useCallback(
    (action: any, stateKey?: string) => {
      // Create immediate visual feedback using a ".preview" event type
      // These preview events won't be saved to undo history
      let previewAction;
      if (action.type === "object.updated") {
        previewAction = {
          type: "object.updated.preview",
          payload: action.payload,
        };
      } else if (action.type === "canvas.background.changed") {
        previewAction = {
          type: "canvas.background.changed.preview",
          payload: action.payload,
        };
      } else if (action.type === "canvas.background.opacity.changed") {
        previewAction = {
          type: "canvas.background.opacity.changed.preview",
          payload: action.payload,
        };
      } else {
        previewAction = action;
      }

      // Dispatch immediate preview
      dispatch(previewAction);

      // Schedule the undoable action with original values
      if (stateKey && originalValuesRef.current[stateKey] !== undefined) {
        const undoableAction = {
          ...action,
          payload: {
            ...action.payload,
            // Ensure we use the original values for proper undo
            ...(action.type === "object.updated" && {
              previousValues: originalValuesRef.current[stateKey],
            }),
            ...(action.type === "canvas.background.changed" && {
              previousBackgroundColor: originalValuesRef.current[stateKey],
            }),
            ...(action.type === "canvas.background.opacity.changed" && {
              previousBackgroundOpacity: originalValuesRef.current[stateKey],
            }),
          },
        };
        debouncedDispatch(undoableAction);
      } else {
        debouncedDispatch(action);
      }
    },
    [dispatch, debouncedDispatch]
  );

  /**
   * Finish a color change interaction. Call this when user stops dragging/changing color.
   * This ensures any pending undo entry is immediately committed.
   */
  const finishColorChange = useCallback(() => {
    if (isActiveInteractionRef.current) {
      flush(); // Immediately commit any pending undo entry
      originalValuesRef.current = {};
      isActiveInteractionRef.current = false;
    }
  }, [flush]);

  /**
   * Cancel a color change interaction without recording an undo entry.
   * Useful if user presses escape or cancels the interaction.
   */
  const cancelColorChange = useCallback(() => {
    isActiveInteractionRef.current = false;
    originalValuesRef.current = {};
    reset();
  }, [reset]);

  return {
    startColorChange,
    updateColor,
    finishColorChange,
    cancelColorChange,
    isActive: isActiveInteractionRef.current,
  };
}
