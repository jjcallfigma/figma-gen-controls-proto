import { useAppStore } from "@/core/state/store";
import {
  getNextDeepSelection,
  getSiblingsOfObjects,
  type DeepSelectionState,
} from "@/core/utils/deepSelection";
import { useCallback, useRef } from "react";

export interface UseDeepSelectionProps {
  objects: Record<string, any>;
  selection: any;
  activeTool: string;
}

export function useDeepSelection({
  objects,
  selection,
  activeTool,
}: UseDeepSelectionProps) {
  const dispatch = useAppStore((state) => state.dispatch);
  const deepSelectionStateRef = useRef<DeepSelectionState | undefined>(undefined);

  /**
   * Handle double-click for deep selection
   */
  const handleDeepSelection = useCallback(
    (event: React.MouseEvent): boolean => {
      if (activeTool !== "select") return false;

      // Get the next deep selection
      const result = getNextDeepSelection(
        objects,
        selection.selectedIds,
        event.clientX,
        event.clientY,
        deepSelectionStateRef.current
      );

      if (result.selectedIds.length > 0) {
        // Update the deep selection state
        deepSelectionStateRef.current = result.newDeepSelection;

        // Dispatch selection change
        dispatch({
          type: "selection.changed",
          payload: {
            selectedIds: result.selectedIds,
            previousSelection: selection.selectedIds,
          },
        });

        return true; // Handled
      }

      return false; // Not handled
    },
    [activeTool, objects, selection.selectedIds, dispatch]
  );

  /**
   * Handle sibling selection - select all siblings of currently selected objects
   */
  const selectSiblings = useCallback(() => {
    if (selection.selectedIds.length === 0) {
      return false;
    }

    // Get all siblings of currently selected objects
    const siblings = getSiblingsOfObjects(objects, selection.selectedIds);

    if (siblings.length > 0) {
      // Select all siblings (replace current selection)
      dispatch({
        type: "selection.changed",
        payload: {
          selectedIds: siblings,
          previousSelection: selection.selectedIds,
        },
      });

      return true; // Handled
    }

    return false; // Not handled
  }, [objects, selection.selectedIds, dispatch]);

  /**
   * Handle ancestor selection - select all ancestors of currently selected objects
   */
  const selectAncestors = useCallback(() => {
    if (selection.selectedIds.length === 0) {
      return false;
    }

    // Get all ancestors of currently selected objects
    const ancestors = new Set<string>();

    for (const selectedId of selection.selectedIds) {
      let currentParentId = objects[selectedId]?.parentId;
      while (currentParentId && objects[currentParentId]) {
        ancestors.add(currentParentId);
        currentParentId = objects[currentParentId].parentId;
      }
    }

    const ancestorIds = Array.from(ancestors);

    if (ancestorIds.length > 0) {
      // Select all ancestors (replace current selection)
      dispatch({
        type: "selection.changed",
        payload: {
          selectedIds: ancestorIds,
          previousSelection: selection.selectedIds,
        },
      });

      return true; // Handled
    }

    return false; // Not handled
  }, [objects, selection.selectedIds, dispatch]);

  /**
   * Reset deep selection state (call when selection changes through other means)
   */
  const resetDeepSelection = useCallback(() => {
    const now = Date.now();
    const lastDeepSelection = deepSelectionStateRef.current;

    // Don't reset if we just did a deep selection very recently (within 500ms)
    // This prevents resetting during double-click sequences
    if (lastDeepSelection && now - lastDeepSelection.timestamp < 500) {
      return;
    }

    deepSelectionStateRef.current = undefined;
  }, []);

  return {
    handleDeepSelection,
    selectSiblings,
    selectAncestors,
    resetDeepSelection,
    deepSelectionState: deepSelectionStateRef.current,
  };
}
