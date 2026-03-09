import { create } from "zustand";

/**
 * Lightweight store for ephemeral UI state that changes at 60fps during
 * drag / resize. Separated from the main Immer store to avoid the overhead
 * of structural sharing and middleware on every mouse-move frame.
 *
 * CanvasObject subscribes to just `state.dragPositions[myId]` so only the
 * dragged object (and its parent frame) re-render — not the entire tree.
 */

interface TransientState {
  dragPositions: Record<string, { x: number; y: number }>;
  resizeStates: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >;
  draggedAutoLayoutChildren: Record<
    string,
    {
      parentId: string;
      originalIndex: number;
      isTemporarilyOutside?: boolean;
    }
  >;
  autoLayoutPlaceholderPositions: Record<
    string,
    { parentId: string; insertionIndex: number }
  >;
  isHoveringAutoLayout: boolean;
  draggedIds: string[];
  isCmdPressed: boolean;

  setDragPositions: (p: Record<string, { x: number; y: number }>) => void;
  setResizeStates: (
    s: Record<
      string,
      { x: number; y: number; width: number; height: number }
    >
  ) => void;
  setDragMeta: (meta: {
    draggedAutoLayoutChildren?: TransientState["draggedAutoLayoutChildren"];
    autoLayoutPlaceholderPositions?: TransientState["autoLayoutPlaceholderPositions"];
    isHoveringAutoLayout?: boolean;
    draggedIds?: string[];
    isCmdPressed?: boolean;
  }) => void;
  clearDrag: () => void;
  clearResize: () => void;
}

export const useTransientStore = create<TransientState>((set) => ({
  dragPositions: {},
  resizeStates: {},
  draggedAutoLayoutChildren: {},
  autoLayoutPlaceholderPositions: {},
  isHoveringAutoLayout: false,
  draggedIds: [],
  isCmdPressed: false,

  setDragPositions: (p) => set({ dragPositions: p }),
  setResizeStates: (s) => set({ resizeStates: s }),
  setDragMeta: (meta) => set(meta),
  clearDrag: () =>
    set({
      dragPositions: {},
      draggedAutoLayoutChildren: {},
      autoLayoutPlaceholderPositions: {},
      isHoveringAutoLayout: false,
      draggedIds: [],
    }),
  clearResize: () => set({ resizeStates: {} }),
}));
