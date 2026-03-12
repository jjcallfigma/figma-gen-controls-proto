import { current, isDraft } from "immer";

/** Safely unwrap an Immer draft. Returns the value as-is if it's already a plain object. */
function safeCurrentObjects<T>(value: T): T {
  return isDraft(value) ? current(value) : value;
}
import { nanoid } from "nanoid";
import { useMemo } from "react";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { nestingObserver } from "@/core/observers/nestingObserver";
import {
  getAllDescendantsForObjects,
  isValidReparenting,
} from "@/core/utils/selection";
import { SnapGuide } from "@/core/utils/snapping";
import {
  CanvasObject,
  ComponentDefinition,
  ScreenBounds,
  SelectionState,
  ToolState,
  Viewport,
} from "@/types/canvas";
import { CursorState, CursorType } from "@/types/cursor";
import { CanvasEvent, CreateEventOptions } from "@/types/events";
import {
  createComponentSyncObserver,
  StateSnapshot,
} from "../observers/componentSyncObserver";
import { triggerImmediateAutoLayoutSync } from "../utils/autoLayout";
import { resetInstanceToMainComponent } from "../utils/componentSync";
import { initializeAutoLayoutOrders } from "../utils/nesting";
import { CanvasPersistence } from "../utils/persistence";

import { applyEventToState } from "./reducer";

// Page interface
interface Page {
  id: string;
  name: string;
  objectIds: string[]; // Objects that belong to this page
}

// Core state interface (without actions)
interface CoreState {
  // Canvas objects
  objects: Record<string, CanvasObject>;
  objectIds: string[]; // Ordered list for z-index

  // Pages system
  pages: Record<string, Page>;
  pageIds: string[]; // Ordered list for page order
  currentPageId: string | null;

  // Component system
  components: Record<string, ComponentDefinition>;
  componentIds: string[]; // Ordered list for component creation order

  // Selection state
  selection: SelectionState;

  // Canvas settings
  canvasSettings: {
    backgroundColor: string;
    backgroundOpacity: number; // 0-1 range
  };

  // Event sourcing
  events: CanvasEvent[];

  // Note: viewport and tools are excluded from snapshots to prevent undo/redo from affecting zoom/pan and tool state
}

// Temporal state for undo/redo
interface TemporalState {
  pastStates: CoreState[];
  futureStates: CoreState[];
}

// Actions interface
interface Actions {
  // Event system
  dispatch: (eventOptions: CreateEventOptions<any>) => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Computed helpers
  getSelectedObjects: () => CanvasObject[];
  getVisibleObjects: () => CanvasObject[];
  getObjectById: (id: string) => CanvasObject | undefined;
  getObjectChildren: (id: string) => CanvasObject[];

  // Component helpers
  getComponentById: (id: string) => ComponentDefinition | undefined;
  getComponentByObjectId: (objectId: string) => ComponentDefinition | undefined;
  getInstancesOfComponent: (componentId: string) => CanvasObject[];
  createComponent: (name: string, selectedIds: string[]) => void;
  createInstance: (
    componentId: string,
    position: { x: number; y: number },
    parentId?: string
  ) => void;
  resetInstanceToMain: (instanceId: string) => void;
  initializeAutoLayoutOrders: () => void;

  // Page helpers
  getPageById: (id: string) => Page | undefined;
  getCurrentPage: () => Page | undefined;
  createPage: (name: string) => void;
  switchToPage: (pageId: string) => void;
  renamePage: (pageId: string, name: string) => void;
}

// Full app state
export type AppState = CoreState &
  TemporalState &
  Actions & {
    // Viewport state (stored separately from undo/redo snapshots)
    viewport: Viewport;
    // Tools state (stored separately from snapshots)
    tools: ToolState;
    // Cursor state (UI state, not part of undo/redo)
    cursor: CursorState;
    cursorStack: CursorState[];
    setCursor: (cursor: CursorType | CursorState, source?: string) => void;
    pushCursor: (cursor: CursorType | CursorState, source?: string) => void;
    popCursor: () => void;
    resetCursor: () => void;
    // Interaction state (UI state, not part of undo/redo)
    isResizing: boolean;
    setIsResizing: (isResizing: boolean) => void;
    isHoveringResizeHandle: boolean;
    setIsHoveringResizeHandle: (isHovering: boolean) => void;
    // Crop mode state (UI state, not part of undo/redo)
    cropMode: {
      isActive: boolean;
      objectId: string | null;
      fillId: string | null;
      originalDimensions: { width: number; height: number } | null;
      currentTransform: {
        imageWorldX: number;
        imageWorldY: number;
        imageWidth: number;
        imageHeight: number;
      } | null;
    };
    setCropMode: (
      isActive: boolean,
      objectId?: string,
      fillId?: string,
      originalDimensions?: { width: number; height: number }
    ) => void;
    updateCropModeTransform: (transform: {
      imageWorldX: number;
      imageWorldY: number;
      imageWidth: number;
      imageHeight: number;
    }) => void;
    // Snap guides state (UI state, not part of undo/redo)
    snapGuides: {
      horizontal: SnapGuide[];
      vertical: SnapGuide[];
    };
    setSnapGuides: (guides: {
      horizontal: SnapGuide[];
      vertical: SnapGuide[];
    }) => void;
    clearSnapGuides: () => void;
    // Selection preview state (UI state, not part of undo/redo)
    selectionPreviewTarget: string | null;
    selectionPreviewSource: "canvas" | "ui" | null;
    setSelectionPreviewTarget: (
      target: string | null,
      source?: "canvas" | "ui"
    ) => void;
    // Make editor state (UI state, not part of undo/redo)
    makeEditor: {
      isOpen: boolean;
      objectId: string | null; // Which Make node is being edited
      pendingMessage: string | null; // Auto-send message when editor opens (e.g. "Update from Design")
    };
    openMakeEditor: (objectId: string, pendingMessage?: string) => void;
    closeMakeEditor: () => void;
    /** On-canvas Make chat panel (lightweight alternative to full Make editor) */
    onCanvasMakeChat: {
      isOpen: boolean;
      makeId: string | null;
      pendingMessage: string | null;
    };
    openOnCanvasMakeChat: (makeId: string, pendingMessage?: string) => void;
    closeOnCanvasMakeChat: () => void;
    /** Extract mode: select elements inside a Make to extract as canvas objects */
    extractMode: {
      isActive: boolean;
      makeObjectId: string | null;
      selectedElements: Array<{ nodeId: number; name: string }>;
    };
    openExtractMode: (makeObjectId: string) => void;
    closeExtractMode: () => void;
    toggleExtractElement: (el: { nodeId: number; name: string }) => void;
    clearExtractElements: () => void;
    /** Record of Make object IDs currently being generated by AI */
    generatingMakeIds: Record<string, boolean>;
    setMakeGenerating: (objectId: string, generating: boolean) => void;
    /** Groups of object IDs being edited (one shimmer per group). Key = sessionId or "prompt-{id}" for entrypoint-open. */
    aiEditingGroups: Record<string, Record<string, true>>;
    setAiEditingObjectsGroup: (groupKey: string, objectIds: string[], editing: boolean) => void;
    setMakeSnapshot: (objectId: string, dataUrl: string) => void;
    /** On-canvas AI mini prompt state */
    onCanvasAiPrompt: {
      isOpen: boolean;
      selectionFingerprint: string | null;
      /** World-space anchor so the prompt follows pan/zoom */
      worldX: number;
      worldY: number;
      /** Session to resume (overlap match), or null for a fresh thread */
      resumeSessionId: string | null;
      resumeSessionTitle: string | null;
      /** When true, open with mini chat (chevron) expanded; used when last response was text-only */
      openWithMiniChatExpanded?: boolean;
    };
    setOnCanvasAiPromptOpenWithMiniChatExpanded: (value: boolean) => void;
    openOnCanvasAiPrompt: (
      fingerprint: string,
      worldX: number,
      worldY: number,
      resumeSessionId?: string | null,
      resumeSessionTitle?: string | null,
    ) => void;
    closeOnCanvasAiPrompt: () => void;
    /** Per-selection-fingerprint AI status: 'idle' | 'loading' | 'done' */
    aiSessionStatuses: Record<string, "idle" | "loading" | "done">;
    setAiSessionStatus: (fingerprint: string, status: "idle" | "loading" | "done") => void;
    /** Session IDs currently loading (multiple threads can run); used to show loading entrypoints per session */
    aiDesignChatLoadingSessionIds: Record<string, true>;
    addAiDesignChatLoadingSession: (sessionId: string) => void;
    removeAiDesignChatLoadingSession: (sessionId: string) => void;
    /** Done entrypoints per session (multiple threads); key = sessionId, value = objectIds + shownAt. Cleared when "seen". */
    aiDesignChatDoneEntrypoints: Record<string, { objectIds: string[]; shownAt: number }>;
    setAiDesignChatDoneEntrypointForSession: (sessionId: string, payload: { objectIds: string[]; shownAt: number } | null) => void;
    /** Session IDs for which the user has "seen" the done state (click or timeout); persistent done entrypoint is not shown again until the next completion. */
    aiDesignChatDoneSeenSessionIds: Record<string, true>;
    addAiDesignChatDoneSeenSession: (sessionId: string) => void;
    /** Clear "seen" for a session so the persistent done bubble can show again (e.g. when a new prompt completes). */
    removeAiDesignChatDoneSeenSession: (sessionId: string) => void;
    /** Latest short status text per session (shown in mini-prompt footer) */
    aiSessionLatestMessage: Record<string, string>;
    setAiSessionLatestMessage: (fingerprint: string, message: string | null) => void;
    /** AI-generated or initial thread title per session (not overwritten by each prompt) */
    aiSessionTitles: Record<string, string>;
    setAiSessionTitle: (sessionId: string, title: string | null) => void;
    /** Last submitted user prompt per session (for popover description) */
    aiSessionLastPrompt: Record<string, string>;
    setAiSessionLastPrompt: (sessionId: string, prompt: string | null) => void;
    /** Session IDs where the last completion had no design operations (text-only); used to open mini chat expanded when user clicks entrypoint */
    aiSessionLastResponseWasTextOnly: Record<string, true>;
    setAiSessionLastResponseWasTextOnly: (sessionId: string, value: boolean) => void;
    /** Last activity timestamp per session (message sent or AI completed); used to show "latest chats" in rail popover */
    aiDesignChatSessionLastActivity: Record<string, number>;
    touchAiDesignChatSessionActivity: (sessionId: string) => void;
  };

// Initial core state
const initialCoreState: CoreState = {
  objects: {},
  objectIds: [],
  pages: {
    "page-1": {
      id: "page-1",
      name: "Page 1",
      objectIds: [],
    },
  },
  pageIds: ["page-1"],
  currentPageId: "page-1",
  components: {},
  componentIds: [],
  selection: {
    selectedIds: [],
    hoveredId: undefined,
    selectionBounds: undefined,
  },
  canvasSettings: {
    backgroundColor: "#f5f5f5", // neutral-100 equivalent
    backgroundOpacity: 1, // Full opacity by default
  },
  events: [],
};

// Function to get initial state with persistence
function getInitialStateWithPersistence(): CoreState {
  // Never access localStorage during SSR - always start with initial state
  // Client-side persistence loading will happen after hydration via useClientSidePersistence
  if (typeof window === "undefined") {
    console.log("🆕 [PERSISTENCE] SSR: Starting with fresh canvas state");
    return initialCoreState;
  }

  // On client-side, still start with initial state to avoid hydration mismatch
  // The useClientSidePersistence hook will load saved state after hydration is complete
  console.log(
    "🆕 [PERSISTENCE] Client: Starting with fresh canvas state (persistence will load after hydration)"
  );
  return initialCoreState;
}

// Helper function to migrate existing objects to pages
const migrateObjectsToPages = (state: any) => {
  // If there are objects but no pages have objects, migrate them to the first page
  if (state.objectIds.length > 0 && state.pages && state.pageIds.length > 0) {
    const firstPageId = state.pageIds[0];
    const firstPage = state.pages[firstPageId];

    if (firstPage && firstPage.objectIds.length === 0) {
      // Migrate all existing objects to the first page
      firstPage.objectIds = [...state.objectIds];
    }
  }
};

// Create event helper
function createEvent<T extends CanvasEvent["type"]>(
  options: CreateEventOptions<T>
): CanvasEvent {
  return {
    id: options.id || nanoid(),
    type: options.type,
    payload: options.payload,
    timestamp: options.timestamp || Date.now(),
    userId: options.userId,
  } as CanvasEvent;
}

/**
 * Get the top-level component ancestor (main component or instance) for a given object
 */
function getComponentAncestor(
  objectId: string,
  objects: Record<string, CanvasObject>
): {
  id: string;
  isMainComponent: boolean;
  isInstance: boolean;
  componentId: string;
} | null {
  let currentId: string | undefined = objectId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const currentObj: CanvasObject | undefined = objects[currentId];

    if (!currentObj) break;

    // If we found a main component or instance, return it
    if (currentObj.isMainComponent || currentObj.isComponentInstance) {
      return {
        id: currentId,
        isMainComponent: !!currentObj.isMainComponent,
        isInstance: !!currentObj.isComponentInstance,
        componentId: currentObj.componentId || "",
      };
    }

    currentId = currentObj.parentId;
  }

  return null;
}

// Validation function to check if an object can be moved to a target parent
function validateReparenting(
  objectId: string,
  targetParentId: string | undefined,
  objects: Record<string, CanvasObject>
): boolean {
  // Basic hierarchy validation
  if (!isValidReparenting(objectId, targetParentId, objects)) {
    return false;
  }

  // Target parent must be a frame (if it exists)
  if (targetParentId && objects[targetParentId]?.type !== "frame") {
    return false;
  }

  // Component nesting validation - prevent invalid component relationships
  if (!targetParentId) return true; // Canvas root is always valid

  const targetParent = objects[targetParentId];
  if (!targetParent) return true;

  // Find the component ancestor of the target parent (if any)
  const targetComponentAncestor = getComponentAncestor(targetParentId, objects);

  // Get all descendants of the dragged object to validate them too
  const allDescendants = getAllDescendantsForObjects([objectId], objects);
  const allObjectsToCheck = [objectId, ...allDescendants];

  // Check validation rules for the dragged object and ALL its descendants
  for (const objToCheckId of allObjectsToCheck) {
    const objToCheck = objects[objToCheckId];
    if (!objToCheck) continue;

    // RULE 1: Instance cannot be nested inside main component (direct)
    if (objToCheck.isComponentInstance && targetParent.isMainComponent) {
      console.warn(
        "🚫 Prevented invalid reparenting: Instance cannot be nested inside main component",
        {
          instanceId: objToCheckId,
          mainComponentId: targetParentId,
          draggedObjectId: objectId,
          isDescendant: objToCheckId !== objectId,
        }
      );
      return false;
    }

    // RULE 1.5: Instance cannot be nested inside hierarchy of main component
    if (
      objToCheck.isComponentInstance &&
      targetComponentAncestor?.isMainComponent
    ) {
      console.warn(
        "🚫 Prevented invalid reparenting: Instance cannot be nested inside main component hierarchy",
        {
          instanceId: objToCheckId,
          mainComponentAncestorId: targetComponentAncestor.id,
          targetParentId: targetParentId,
          draggedObjectId: objectId,
          isDescendant: objToCheckId !== objectId,
        }
      );
      return false;
    }

    // RULE 2: Main component cannot be nested inside instance (direct)
    if (objToCheck.isMainComponent && targetParent.isComponentInstance) {
      console.warn(
        "🚫 Prevented invalid reparenting: Main component cannot be nested inside instance",
        {
          mainComponentId: objToCheckId,
          instanceId: targetParentId,
          draggedObjectId: objectId,
          isDescendant: objToCheckId !== objectId,
        }
      );
      return false;
    }

    // RULE 2.5: Main component cannot be nested inside hierarchy of instance
    if (objToCheck.isMainComponent && targetComponentAncestor?.isInstance) {
      console.warn(
        "🚫 Prevented invalid reparenting: Main component cannot be nested inside instance hierarchy",
        {
          mainComponentId: objToCheckId,
          instanceAncestorId: targetComponentAncestor.id,
          targetParentId: targetParentId,
          draggedObjectId: objectId,
          isDescendant: objToCheckId !== objectId,
        }
      );
      return false;
    }

    // RULE 3: Objects from different components cannot be mixed (direct)
    if (
      objToCheck.componentId &&
      targetParent.componentId &&
      objToCheck.componentId !== targetParent.componentId
    ) {
      console.warn(
        "🚫 Prevented invalid reparenting: Cannot mix objects from different components",
        {
          problematicObjectId: objToCheckId,
          problematicComponentId: objToCheck.componentId,
          targetParentId: targetParentId,
          targetComponentId: targetParent.componentId,
          draggedObjectId: objectId,
          isDescendant: objToCheckId !== objectId,
        }
      );
      return false;
    }

    // RULE 3.5: Objects from different components cannot be mixed (indirect via ancestor)
    if (
      objToCheck.componentId &&
      targetComponentAncestor?.componentId &&
      objToCheck.componentId !== targetComponentAncestor.componentId
    ) {
      console.warn(
        "🚫 Prevented invalid reparenting: Cannot mix objects from different components (via ancestor)",
        {
          problematicObjectId: objToCheckId,
          problematicComponentId: objToCheck.componentId,
          targetComponentAncestorId: targetComponentAncestor.id,
          targetParentId: targetParentId,
          draggedObjectId: objectId,
          isDescendant: objToCheckId !== objectId,
        }
      );
      return false;
    }

    // RULE 4: Component objects cannot be nested inside other component objects (direct)
    if (
      (objToCheck.isMainComponent || objToCheck.isComponentInstance) &&
      (targetParent.isMainComponent || targetParent.isComponentInstance) &&
      objToCheck.componentId !== targetParent.componentId
    ) {
      console.warn(
        "🚫 Prevented invalid reparenting: Components cannot be nested inside other components",
        {
          problematicObjectId: objToCheckId,
          problematicType: objToCheck.isMainComponent ? "main" : "instance",
          targetParentId: targetParentId,
          targetType: targetParent.isMainComponent ? "main" : "instance",
          draggedObjectId: objectId,
          isDescendant: objToCheckId !== objectId,
        }
      );
      return false;
    }

    // RULE 4.5: Component objects cannot be nested inside other component hierarchies
    if (
      (objToCheck.isMainComponent || objToCheck.isComponentInstance) &&
      targetComponentAncestor &&
      objToCheck.componentId !== targetComponentAncestor.componentId
    ) {
      console.warn(
        "🚫 Prevented invalid reparenting: Components cannot be nested inside other component hierarchies",
        {
          problematicObjectId: objToCheckId,
          problematicType: objToCheck.isMainComponent ? "main" : "instance",
          targetComponentAncestorId: targetComponentAncestor.id,
          targetParentId: targetParentId,
          draggedObjectId: objectId,
          isDescendant: objToCheckId !== objectId,
        }
      );
      return false;
    }

    // RULE 5: Instances of same component cannot be nested inside each other (direct)
    if (
      objToCheck.isComponentInstance &&
      targetParent.isComponentInstance &&
      objToCheck.componentId === targetParent.componentId
    ) {
      console.warn(
        "🚫 Prevented invalid reparenting: Instances of same component cannot be nested inside each other",
        {
          instanceId: objToCheckId,
          targetInstanceId: targetParentId,
          componentId: objToCheck.componentId,
          draggedObjectId: objectId,
          isDescendant: objToCheckId !== objectId,
        }
      );
      return false;
    }

    // RULE 5.5: Instances cannot be nested inside hierarchy of same component instance
    if (
      objToCheck.isComponentInstance &&
      targetComponentAncestor?.isInstance &&
      objToCheck.componentId === targetComponentAncestor.componentId
    ) {
      console.warn(
        "🚫 Prevented invalid reparenting: Instances cannot be nested inside same component instance hierarchy",
        {
          instanceId: objToCheckId,
          targetInstanceAncestorId: targetComponentAncestor.id,
          targetParentId: targetParentId,
          componentId: objToCheck.componentId,
          draggedObjectId: objectId,
          isDescendant: objToCheckId !== objectId,
        }
      );
      return false;
    }
  }

  return true;
}

// Main store
export const store = create<AppState>()(
  immer((set, get) => ({
    // Initialize core state with persistence (without viewport and tools which are stored separately)
    ...getInitialStateWithPersistence(),

    // Viewport state (stored separately from snapshots)
    viewport: {
      zoom: 1,
      panX: 0,
      panY: 0,
      viewportBounds: { x: 0, y: 0, width: 800, height: 600 } as ScreenBounds,
    },

    // Tools state (stored separately from snapshots)
    tools: {
      activeTool: "select" as const,
      isCreating: false,
      creationPreview: undefined,
    },

    // Cursor state (UI state, not part of undo/redo)
    cursor: {
      type: "default" as CursorType,
      priority: 0,
      source: "initial",
    },
    cursorStack: [],

    // Interaction state
    isResizing: false,
    isHoveringResizeHandle: false,

    // Crop mode state
    cropMode: {
      isActive: false,
      objectId: null,
      fillId: null,
      originalDimensions: null,
      currentTransform: null,
    },

    // Snap guides state
    snapGuides: {
      horizontal: [],
      vertical: [],
    },

    // Cursor actions
    setCursor: (cursor: CursorType | CursorState, source = "unknown") => {
      set((draft) => {
        // Determine priority based on source
        const getPriority = (src: string) => {
          if (src.startsWith("resize:")) return 10; // Highest priority
          if (src === "drag") return 8;
          if (src === "hover") return 6;
          if (src.startsWith("tool:")) return 2; // Lower priority for tool cursors
          if (src === "reset") return 0;
          return 1; // Default priority
        };

        const cursorState: CursorState =
          typeof cursor === "string"
            ? { type: cursor, priority: getPriority(source), source }
            : { priority: getPriority(source), source, ...cursor };

        // Only update cursor if new priority is higher than or equal to current
        const currentPriority = draft.cursor.priority ?? 0;
        const newPriority = cursorState.priority ?? 1;

        if (newPriority >= currentPriority) {
          draft.cursor = cursorState;
        }
      });
    },

    pushCursor: (cursor: CursorType | CursorState, source = "unknown") => {
      set((draft) => {
        // Save current cursor to stack
        draft.cursorStack.push({ ...draft.cursor });

        // Set new cursor
        const cursorState: CursorState =
          typeof cursor === "string"
            ? { type: cursor, priority: 1, source }
            : { priority: 1, source, ...cursor };

        draft.cursor = cursorState;
      });
    },

    popCursor: () => {
      set((draft) => {
        if (draft.cursorStack.length > 0) {
          const previousCursor = draft.cursorStack.pop();
          if (previousCursor) {
            draft.cursor = previousCursor;
          }
        } else {
          // Reset to default if stack is empty
          draft.cursor = {
            type: "default" as CursorType,
            priority: 0,
            source: "reset",
          };
        }
      });
    },

    resetCursor: () => {
      set((draft) => {
        const currentState = get();

        // Don't reset space panning cursors (but allow reset when space is released)
        const isSpacePanning = (window as any).__figmaCloneSpacePanning;
        if (
          isSpacePanning &&
          draft.cursor.source &&
          (draft.cursor.source.startsWith("space-pan") ||
            draft.cursor.source === "space-pan-ready" ||
            draft.cursor.source === "space-pan-active")
        ) {
          return; // Don't reset space panning cursors while space is held
        }

        // Smart reset: Don't override tool cursors during creation unless specifically needed
        // Only force reset if:
        // 1. Current cursor is a resize cursor, OR
        // 2. Current cursor has no source (initial state), OR
        // 3. We're not in creation mode with active tools
        const shouldForceReset =
          (draft.cursor.source && draft.cursor.source.startsWith("resize:")) ||
          !draft.cursor.source ||
          draft.cursor.source === "initial" ||
          (!currentState.tools.isCreating &&
            currentState.tools.activeTool === "select");

        if (shouldForceReset) {
          // If we have an active non-select tool, set tool cursor instead of default
          if (currentState.tools.activeTool !== "select") {
            // Import TOOL_CURSORS mapping for consistency
            const TOOL_CURSORS_MAP: Record<string, string> = {
              select: "default",
              frame: "crosshair",
              rectangle: "crosshair",
              ellipse: "crosshair",
              text: "text",
              pen: "pen",
              pencil: "pencil",
              brush: "brush",
              hand: "grab",
              zoom: "zoom-in",
            };
            const toolCursor =
              TOOL_CURSORS_MAP[currentState.tools.activeTool] || "default";

            draft.cursor = {
              type: toolCursor as CursorType,
              priority: 2,
              source: `tool:${currentState.tools.activeTool}`,
            };
          } else {
            draft.cursor = {
              type: "default" as CursorType,
              priority: 0,
              source: "reset",
            };
          }

          draft.cursorStack = [];
          // Also reset hover state when cursor is reset
          draft.isHoveringResizeHandle = false;
        }
      });
    },

    // Interaction actions
    setIsResizing: (isResizing: boolean) => {
      set((draft) => {
        draft.isResizing = isResizing;
      });
    },

    setIsHoveringResizeHandle: (isHovering: boolean) => {
      set((draft) => {
        draft.isHoveringResizeHandle = isHovering;
      });
    },

    setCropMode: (
      isActive: boolean,
      objectId?: string,
      fillId?: string,
      originalDimensions?: { width: number; height: number }
    ) => {
      set((draft) => {
        draft.cropMode.isActive = isActive;
        draft.cropMode.objectId = isActive ? objectId || null : null;
        draft.cropMode.fillId = isActive ? fillId || null : null;
        draft.cropMode.originalDimensions = isActive
          ? originalDimensions || null
          : null;
        draft.cropMode.currentTransform = isActive ? null : null; // Clear transform when exiting
      });
    },

    updateCropModeTransform: (transform) => {
      set((draft) => {
        draft.cropMode.currentTransform = transform;
      });
    },

    // Snap guides actions
    setSnapGuides: (guides: {
      horizontal: SnapGuide[];
      vertical: SnapGuide[];
    }) => {
      set((draft) => {
        draft.snapGuides = guides;
      });
    },

    clearSnapGuides: () => {
      set((draft) => {
        draft.snapGuides = {
          horizontal: [],
          vertical: [],
        };
      });
    },

    // Selection preview state (UI state, not part of undo/redo)
    selectionPreviewTarget: null,
    selectionPreviewSource: null,
    setSelectionPreviewTarget: (
      target: string | null,
      source: "canvas" | "ui" = "canvas"
    ) => {
      set((draft) => {
        draft.selectionPreviewTarget = target;
        draft.selectionPreviewSource = target ? source : null;
      });
    },

    // Make editor state (UI state, not part of undo/redo)
    makeEditor: {
      isOpen: false,
      objectId: null,
      pendingMessage: null,
    },
    openMakeEditor: (objectId: string, pendingMessage?: string) => {
      set((draft) => {
        draft.makeEditor.isOpen = true;
        draft.makeEditor.objectId = objectId;
        draft.makeEditor.pendingMessage = pendingMessage ?? null;
      });
    },
    closeMakeEditor: () => {
      set((draft) => {
        draft.makeEditor.isOpen = false;
        draft.makeEditor.objectId = null;
        draft.makeEditor.pendingMessage = null;
      });
    },
    onCanvasMakeChat: {
      isOpen: false,
      makeId: null,
      pendingMessage: null,
    },
    openOnCanvasMakeChat: (makeId: string, pendingMessage?: string) => {
      set((draft) => {
        draft.onCanvasMakeChat.isOpen = true;
        draft.onCanvasMakeChat.makeId = makeId;
        draft.onCanvasMakeChat.pendingMessage = pendingMessage ?? null;
      });
    },
    closeOnCanvasMakeChat: () => {
      set((draft) => {
        draft.onCanvasMakeChat.isOpen = false;
        draft.onCanvasMakeChat.makeId = null;
        draft.onCanvasMakeChat.pendingMessage = null;
      });
    },
    extractMode: {
      isActive: false,
      makeObjectId: null,
      selectedElements: [],
    },
    openExtractMode: (makeObjectId: string) => {
      set((draft) => {
        draft.extractMode.isActive = true;
        draft.extractMode.makeObjectId = makeObjectId;
        draft.extractMode.selectedElements = [];
      });
    },
    closeExtractMode: () => {
      set((draft) => {
        draft.extractMode.isActive = false;
        draft.extractMode.makeObjectId = null;
        draft.extractMode.selectedElements = [];
      });
    },
    toggleExtractElement: (el: { nodeId: number; name: string }) => {
      set((draft) => {
        const idx = draft.extractMode.selectedElements.findIndex(
          (e) => e.nodeId === el.nodeId
        );
        if (idx >= 0) {
          draft.extractMode.selectedElements.splice(idx, 1);
        } else {
          draft.extractMode.selectedElements.push(el);
        }
      });
    },
    clearExtractElements: () => {
      set((draft) => {
        draft.extractMode.selectedElements = [];
      });
    },
    generatingMakeIds: {},
    setMakeGenerating: (objectId: string, generating: boolean) => {
      set((draft) => {
        if (generating) {
          draft.generatingMakeIds[objectId] = true;
        } else {
          delete draft.generatingMakeIds[objectId];
        }
      });
    },
    aiEditingGroups: {},
    setAiEditingObjectsGroup: (groupKey: string, objectIds: string[], editing: boolean) => {
      set((draft) => {
        if (editing) {
          if (!draft.aiEditingGroups[groupKey]) draft.aiEditingGroups[groupKey] = {};
          for (const id of objectIds) {
            draft.aiEditingGroups[groupKey][id] = true;
          }
        } else {
          delete draft.aiEditingGroups[groupKey];
        }
      });
    },
    setMakeSnapshot: (objectId: string, dataUrl: string) => {
      set((draft) => {
        const obj = draft.objects[objectId];
        if (obj && obj.type === "make" && obj.properties.type === "make") {
          obj.properties.snapshot = dataUrl;
        }
      });
    },
    onCanvasAiPrompt: {
      isOpen: false,
      selectionFingerprint: null,
      worldX: 0,
      worldY: 0,
      resumeSessionId: null,
      resumeSessionTitle: null,
    },
    openOnCanvasAiPrompt: (
      fingerprint: string,
      worldX: number,
      worldY: number,
      resumeSessionId?: string | null,
      resumeSessionTitle?: string | null,
    ) => {
      const openWithMiniChatExpanded = !!(
        resumeSessionId && get().aiSessionLastResponseWasTextOnly?.[resumeSessionId]
      );
      set((draft) => {
        draft.onCanvasAiPrompt.isOpen = true;
        draft.onCanvasAiPrompt.selectionFingerprint = fingerprint;
        draft.onCanvasAiPrompt.worldX = worldX;
        draft.onCanvasAiPrompt.worldY = worldY;
        draft.onCanvasAiPrompt.resumeSessionId = resumeSessionId ?? null;
        draft.onCanvasAiPrompt.resumeSessionTitle = resumeSessionTitle ?? null;
        draft.onCanvasAiPrompt.openWithMiniChatExpanded = openWithMiniChatExpanded;
      });
    },
    closeOnCanvasAiPrompt: () => {
      set((draft) => {
        draft.onCanvasAiPrompt.isOpen = false;
        draft.onCanvasAiPrompt.selectionFingerprint = null;
        draft.onCanvasAiPrompt.resumeSessionId = null;
        draft.onCanvasAiPrompt.resumeSessionTitle = null;
        draft.onCanvasAiPrompt.openWithMiniChatExpanded = false;
      });
    },
    setOnCanvasAiPromptOpenWithMiniChatExpanded: (value: boolean) => {
      set((draft) => {
        draft.onCanvasAiPrompt.openWithMiniChatExpanded = value;
      });
    },
    aiSessionStatuses: {},
    setAiSessionStatus: (fingerprint: string, status: "idle" | "loading" | "done") => {
      set((draft) => {
        if (status === "idle") {
          delete draft.aiSessionStatuses[fingerprint];
        } else {
          draft.aiSessionStatuses[fingerprint] = status;
        }
      });
    },
    aiDesignChatLoadingSessionIds: {},
    addAiDesignChatLoadingSession: (sessionId: string) => {
      set((draft) => {
        draft.aiDesignChatLoadingSessionIds[sessionId] = true;
      });
    },
    removeAiDesignChatLoadingSession: (sessionId: string) => {
      set((draft) => {
        delete draft.aiDesignChatLoadingSessionIds[sessionId];
      });
    },
    aiDesignChatDoneEntrypoints: {},
    setAiDesignChatDoneEntrypointForSession: (sessionId: string, payload: { objectIds: string[]; shownAt: number } | null) => {
      set((draft) => {
        if (payload == null) {
          delete draft.aiDesignChatDoneEntrypoints[sessionId];
        } else {
          draft.aiDesignChatDoneEntrypoints[sessionId] = payload;
        }
      });
    },
    aiDesignChatDoneSeenSessionIds: {},
    addAiDesignChatDoneSeenSession: (sessionId: string) => {
      set((draft) => {
        draft.aiDesignChatDoneSeenSessionIds[sessionId] = true;
      });
    },
    removeAiDesignChatDoneSeenSession: (sessionId: string) => {
      set((draft) => {
        delete draft.aiDesignChatDoneSeenSessionIds[sessionId];
      });
    },
    aiSessionLatestMessage: {},
    setAiSessionLatestMessage: (fingerprint: string, message: string | null) => {
      set((draft) => {
        if (message === null) {
          delete draft.aiSessionLatestMessage[fingerprint];
        } else {
          draft.aiSessionLatestMessage[fingerprint] = message;
        }
      });
    },
    aiSessionTitles: {},
    setAiSessionTitle: (sessionId: string, title: string | null) => {
      set((draft) => {
        if (title === null) {
          delete draft.aiSessionTitles[sessionId];
        } else {
          draft.aiSessionTitles[sessionId] = title;
        }
      });
    },
    aiSessionLastPrompt: {},
    setAiSessionLastPrompt: (sessionId: string, prompt: string | null) => {
      set((draft) => {
        if (prompt === null) {
          delete draft.aiSessionLastPrompt[sessionId];
        } else {
          draft.aiSessionLastPrompt[sessionId] = prompt;
        }
      });
    },
    aiSessionLastResponseWasTextOnly: {},
    setAiSessionLastResponseWasTextOnly: (sessionId: string, value: boolean) => {
      set((draft) => {
        if (value) {
          draft.aiSessionLastResponseWasTextOnly[sessionId] = true;
        } else {
          delete draft.aiSessionLastResponseWasTextOnly[sessionId];
        }
      });
    },
    aiDesignChatSessionLastActivity: {},
    touchAiDesignChatSessionActivity: (sessionId: string) => {
      set((draft) => {
        draft.aiDesignChatSessionLastActivity[sessionId] = Date.now();
      });
    },

    // Temporal state
    pastStates: [],
    futureStates: [],

    // Event dispatcher - all state changes go through this
    dispatch: (eventOptions) => {
      const event = createEvent(eventOptions);

      // Fast-path for viewport changes: bypass Immer entirely.
      // Viewport updates happen at 60fps during zoom/pan and only
      // touch a single top-level key, so structural sharing is
      // unnecessary overhead.
      if (event.type === "viewport.changed") {
        set(
          { viewport: event.payload.viewport },
          false,
        );
        return;
      }

      // Fast-path for selection changes: bypass Immer, history, and auto-save.
      // Selection is UI state — not undoable and doesn't need persistence snapshots.
      if (event.type === "selection.changed") {
        const currentState = get();
        const { selectedIds } = event.payload;
        const prevIds = currentState.selection.selectedIds;

        // Check if any deselected text objects need to exit editing mode
        const deselectedIds = prevIds.filter(
          (id) => !selectedIds.includes(id)
        );
        let objectsUpdate: Record<string, any> | null = null;
        for (const id of deselectedIds) {
          const obj = currentState.objects[id];
          if (
            obj?.type === "text" &&
            obj.properties?.type === "text" &&
            (obj.properties as any).isEditing
          ) {
            if (!objectsUpdate) objectsUpdate = { ...currentState.objects };
            objectsUpdate[id] = {
              ...obj,
              properties: { ...obj.properties, isEditing: false },
            };
          }
        }

        const patch: any = {
          selection: {
            ...currentState.selection,
            selectedIds,
            selectionBounds: undefined,
          },
        };
        if (objectsUpdate) {
          patch.objects = objectsUpdate;
        }
        set(patch, false);
        return;
      }

      set((draft) => {
        // Migrate existing objects to pages if needed (one-time migration)
        migrateObjectsToPages(draft);
        // Validate reparenting operations
        if (event.type === "object.reparented") {
          const { objectId, newParentId } = event.payload;
          const isValid = validateReparenting(
            objectId,
            newParentId,
            draft.objects
          );

          if (!isValid) {
            console.warn("Invalid reparenting operation:", event.payload);
            return; // Don't apply invalid reparenting
          }
        }

        // Define which events should be saved to history
        const shouldSaveToHistory = () => {
          // Don't save object hover events
          if (event.type === "object.hovered") {
            return false;
          }

          // Skip drag.started from history — it does no state changes and
          // the snapshot (deep copying entire state tree) blocks the main
          // thread for ~1s. History is captured at drag.completed instead.
          if (event.type === "drag.started") {
            return false;
          }

          // Don't save tool changes
          if (event.type === "tool.changed") {
            return false;
          }

          // Don't save canvas state loading events (these are restoring state, not user actions)
          if (
            event.type === "canvas.state.loaded" ||
            event.type === "canvas.state.reset"
          ) {
            return false;
          }

          // Don't save creation tool intermediate events - only save the final completed event
          if (event.type === "tool.interaction.started") {
            return false; // Don't save creation start to history
          }

          if (event.type === "tool.interaction.updated") {
            return false; // Don't save creation preview updates to history
          }

          // Allow tool.interaction.completed to be saved (this creates the final object)

          // Don't save live reparenting events during drag (these are intermediate states)
          if (event.type === "object.reparented.withCoordinates") {
            return false;
          }

          // drag.completed saves history (captures pre-drag state for undo)

          // Don't save color picker preview events - these are intermediate visual updates
          if (
            event.type === "object.updated.preview" ||
            event.type === "canvas.background.changed.preview" ||
            event.type === "canvas.background.opacity.changed.preview"
          ) {
            return false;
          }

          // selection.changed is handled by the fast-path above and never reaches here.

          // Don't save resize.completed to history - we save resize.started instead
          if (event.type === "resize.completed") {
            return false;
          }

          // Don't save objects.updated.batch events during resize (they are intermediate states)
          // These will be part of the resize.started/completed transaction
          if (
            event.type === "objects.updated.batch" &&
            event.payload.context === "resize"
          ) {
            // Check if we're currently in a resize operation by looking for the most recent
            // resize.started vs resize.completed event in both current draft.events AND saved history
            let mostRecentResizeEvent: CanvasEvent | null = null;

            // First check current draft.events (more recent)
            for (let i = draft.events.length - 1; i >= 0; i--) {
              const e = draft.events[i];
              if (
                e.type === "resize.started" ||
                e.type === "resize.completed"
              ) {
                mostRecentResizeEvent = e;
                break;
              }
            }

            // If not found in current events, search through saved history states
            if (!mostRecentResizeEvent && draft.pastStates.length > 0) {
              // Look through the last few saved states for resize events
              for (
                let stateIndex = draft.pastStates.length - 1;
                stateIndex >= Math.max(0, draft.pastStates.length - 10);
                stateIndex--
              ) {
                const state = draft.pastStates[stateIndex];
                // Search backwards through events in this state
                for (
                  let eventIndex = state.events.length - 1;
                  eventIndex >= 0;
                  eventIndex--
                ) {
                  const e = state.events[eventIndex];
                  if (
                    e.type === "resize.started" ||
                    e.type === "resize.completed"
                  ) {
                    mostRecentResizeEvent = e;
                    break;
                  }
                }
                if (mostRecentResizeEvent) break;
              }
            }

            // If we found a resize.started without a subsequent resize.completed, we're still resizing
            const isCurrentlyResizing =
              mostRecentResizeEvent?.type === "resize.started";

            if (isCurrentlyResizing) {
              return false; // Don't save to history during resize
            }
          }

          // Don't save auto layout sync events - these are automatic DOM-to-state updates, not user actions
          if (
            event.type === "object.updated" &&
            event.payload.context?.startsWith("auto-layout-sync")
          ) {
            return false;
          }
          if (
            event.type === "objects.updated.batch" &&
            event.payload.context === "auto-layout-sync"
          ) {
            return false;
          }

          // Don't save object.updated events during different-parent resize (they are intermediate states)
          // For same-parent resize, we DO want to save object.updated events as they represent intentional position changes
          if (event.type === "object.updated") {
            // Check if we're currently in a different-parent resize operation
            // Look for the most recent resize.started event - if we find one without a subsequent resize.completed, we're mid-resize
            let mostRecentResizeStart = -1;
            let resizeType: "same-parent" | "different-parent" | null = null;

            // Search backwards for the most recent resize.started
            for (let i = draft.events.length - 1; i >= 0; i--) {
              const e = draft.events[i];
              if (e.type === "resize.started") {
                mostRecentResizeStart = i;
                resizeType = (e.payload as any).resizeType;
                break; // Found the most recent resize.started
              }
              if (e.type === "resize.completed") {
                // If we hit a resize.completed before finding resize.started,
                // then there's no active resize
                break;
              }
              // Stop searching if we've gone back too far
              if (i < draft.events.length - 50) {
                break;
              }
            }

            // Only block object.updated events for different-parent resizes
            const isCurrentlyResizingDifferentParents =
              mostRecentResizeStart !== -1 && resizeType === "different-parent";

            if (isCurrentlyResizingDifferentParents) {
              return false; // Don't save to history during different-parent resize
            }

            // For same-parent resizes, allow object.updated events through
            if (mostRecentResizeStart !== -1 && resizeType === "same-parent") {
            }
          }

          // Save all object creation, modification, deletion events
          // and meaningful selection changes
          return true;
        };

        // Save current state to history before applying changes
        const saveToHistory = shouldSaveToHistory();
        if (saveToHistory) {
          // Log the state we're about to save for debugging

          const currentCoreState: CoreState = {
            objects: safeCurrentObjects(draft.objects),
            objectIds: safeCurrentObjects(draft.objectIds),
            pages: safeCurrentObjects(draft.pages),
            pageIds: safeCurrentObjects(draft.pageIds),
            currentPageId: draft.currentPageId,
            components: safeCurrentObjects(draft.components),
            componentIds: safeCurrentObjects(draft.componentIds),
            selection: safeCurrentObjects(draft.selection),
            canvasSettings: safeCurrentObjects(draft.canvasSettings),
            events: safeCurrentObjects(draft.events),
          };

          // Clear future states when making new changes
          draft.futureStates = [];

          // Add current state to past states
          draft.pastStates.push(currentCoreState);

          // Limit history size (keep last 50 states)
          if (draft.pastStates.length > 50) {
            draft.pastStates = draft.pastStates.slice(-50);
          }
        }

        // Determine upfront whether we'll need component sync after applying
        // the event. If so, capture a before-snapshot using Immer's current()
        // instead of the much slower JSON.parse(JSON.stringify(...)).
        const isAutoLayoutSyncEventEarly =
          (event.type === "object.updated" &&
            event.payload.context?.startsWith("auto-layout-sync")) ||
          (event.type === "objects.updated.batch" &&
            event.payload.context === "auto-layout-sync");
        const needsComponentSync =
          !isAutoLayoutSyncEventEarly &&
          ![
            "canvas.background.changed",
            "tool.changed",
            "drag.started",
            "drag.completed",
            "resize.started",
            "resize.completed",
          ].includes(event.type);

        let beforeSnapshot: StateSnapshot | null = null;
        if (needsComponentSync) {
          beforeSnapshot = {
            objects: safeCurrentObjects(draft.objects),
            objectIds: safeCurrentObjects(draft.objectIds),
          };
        }

        // Apply the event using the reducer
        applyEventToState(draft, event);

        // Auto-save to localStorage after state changes
        // Simple approach: save whenever the core data model changes
        const shouldAutoSave = () => {
          // Don't save during state loading
          if (
            event.type === "canvas.state.loaded" ||
            event.type === "canvas.state.reset"
          ) {
            return false;
          }

          // Don't save UI-only events that don't affect the data model
          const uiOnlyEvents = [
            "object.hovered",
            "tool.changed",
            "tool.interaction.started",
            "tool.interaction.updated",
            "drag.started",
            "resize.started",
            "resize.completed",
          ];

          if (uiOnlyEvents.includes(event.type)) {
            return false;
          }

          // Don't auto-save for auto-layout sync or text resize observer events
          // These are automatic DOM-to-state reconciliation, not user actions
          if (
            event.type === "object.updated" &&
            (event.payload.context?.startsWith("auto-layout-sync") ||
              event.payload.context === "text-resize-observer" ||
              event.payload.context === "drag-start-sync")
          ) {
            return false;
          }
          if (
            event.type === "objects.updated.batch" &&
            event.payload.context === "auto-layout-sync"
          ) {
            return false;
          }

          return true;
        };

        if (shouldAutoSave()) {
          const stateToSave = {
            objects: safeCurrentObjects(draft.objects),
            objectIds: safeCurrentObjects(draft.objectIds),
            pages: safeCurrentObjects(draft.pages),
            pageIds: safeCurrentObjects(draft.pageIds),
            currentPageId: draft.currentPageId,
            components: safeCurrentObjects(draft.components),
            componentIds: safeCurrentObjects(draft.componentIds),
            canvasSettings: safeCurrentObjects(draft.canvasSettings),
            viewport: {
              zoom: get().viewport.zoom,
              panX: get().viewport.panX,
              panY: get().viewport.panY,
            },
          };

          CanvasPersistence.scheduleDebouncedSave(stateToSave, event.type);
        }

        // Apply holistic component synchronization (only when needed)
        if (needsComponentSync && beforeSnapshot) {
          const afterSnapshot: StateSnapshot = {
            objects: safeCurrentObjects(draft.objects),
            objectIds: safeCurrentObjects(draft.objectIds),
          };

          const observer = createComponentSyncObserver();
          const syncResult = observer.syncChangesToInstances(
            beforeSnapshot,
            afterSnapshot
          );

          // Apply sync results to state
          // Component sync results should NOT trigger new overrides - they respect existing ones
          // IMPORTANT: Merge changes instead of replacing objects to preserve overrides
          Object.entries(syncResult.updatedObjects).forEach(
            ([id, updatedObject]) => {
              if (draft.objects[id]) {
                const existingObject = draft.objects[id];

                // Calculate only the properties that actually changed
                const changes: Partial<CanvasObject> = {};
                Object.keys(updatedObject).forEach((key) => {
                  const newValue = (updatedObject as any)[key];
                  const currentValue = (existingObject as any)[key];
                  if (newValue !== currentValue) {
                    (changes as any)[key] = newValue;
                  }
                });

                // Check if we're accidentally syncing overrides
                if (changes.hasOwnProperty("overrides")) {
                  // Remove overrides from changes to prevent reset
                  delete (changes as any).overrides;
                }

                // Store overrides before applying changes
                const originalOverrides = existingObject.overrides;

                // Apply only the changed properties, preserving overrides and other object data
                Object.assign(existingObject, changes);

                // ALWAYS preserve overrides from original object, regardless of whether they exist in changes
                if (originalOverrides !== undefined) {
                  existingObject.overrides = originalOverrides;
                }

                // Track ALL childIds changes to instance parents
                if (
                  changes.hasOwnProperty("childIds") &&
                  existingObject.isComponentInstance
                ) {
                  const timestamp = Date.now();
                }
              }
            }
          );

          Object.entries(syncResult.newObjects).forEach(([id, newObject]) => {
            draft.objects[id] = newObject;
            if (!draft.objectIds.includes(id)) {
              draft.objectIds.push(id);
            }
          });

          syncResult.deletedObjectIds.forEach((id) => {
            delete draft.objects[id];
            draft.objectIds = draft.objectIds.filter((objId) => objId !== id);
          });
        } // Close the component sync if block

        // Trigger immediate auto layout sync for reorder events to provide instant visual feedback
        if (
          event.type === "object.reordered" ||
          event.type === "objects.reordered.batch"
        ) {
          const parentId = event.payload.parentId;
          // Schedule immediate sync after the state update completes
          setTimeout(() => {
            const currentState = get();
            triggerImmediateAutoLayoutSync(
              parentId,
              currentState.objects,
              currentState.viewport,
              currentState.dispatch
            );
          }, 0);
        }

        // Add event to history
        draft.events.push(event);

        // Notify nesting observer of changes
        if (
          event.type === "object.updated" ||
          event.type === "object.reparented" ||
          event.type === "objects.updated.batch"
        ) {
          const { payload } = event;
          if ("id" in payload) {
            // Object property changed - notify observer
            const objectId = payload.id;
            const object = draft.objects[objectId];

            if (object && "changes" in payload) {
              Object.entries(payload.changes).forEach(
                ([property, newValue]) => {
                  const oldValue =
                    payload.previousValues?.[property as keyof CanvasObject];
                  nestingObserver.notifyPropertyChange(
                    objectId,
                    property,
                    oldValue,
                    newValue
                  );
                }
              );
            }
          } else if ("objectId" in payload) {
            // Reparenting operation - notify observer
            nestingObserver.handleReparenting(
              payload.objectId,
              payload.previousParentId,
              payload.newParentId
            );
          } else if ("updates" in payload) {
            // Batch update - notify observer for each object
            payload.updates.forEach(({ id, changes, previousValues }) => {
              const object = draft.objects[id];
              if (object) {
                Object.entries(changes).forEach(([property, newValue]) => {
                  const oldValue =
                    previousValues?.[property as keyof CanvasObject];
                  nestingObserver.notifyPropertyChange(
                    id,
                    property,
                    oldValue,
                    newValue
                  );
                });
              }
            });
          }
        }
      });

      // After creating a Make node the selection changes, which triggers
      // the useEffect in page.tsx that auto-switches to the AI Assistant
      // sidebar — no need to open the full editor overlay here.
    },

    // Undo functionality
    undo: () => {
      set((draft) => {
        if (draft.pastStates.length === 0) {
          return;
        }

        // Save current state to future
        const currentState: CoreState = {
          objects: JSON.parse(JSON.stringify(draft.objects)),
          objectIds: [...draft.objectIds],
          pages: JSON.parse(JSON.stringify(draft.pages)),
          pageIds: [...draft.pageIds],
          currentPageId: draft.currentPageId,
          components: JSON.parse(JSON.stringify(draft.components)),
          componentIds: [...draft.componentIds],
          selection: { ...draft.selection },
          canvasSettings: { ...draft.canvasSettings },
          events: [...draft.events],
        };

        draft.futureStates.unshift(currentState);

        // Restore previous state
        const previousState = draft.pastStates.pop()!;
        Object.assign(draft, previousState);

        // Update nesting observer with restored objects
        nestingObserver.updateObjects(draft.objects);
      });

      // Auto-save after undo
      const currentState = get();
      const stateToSave = {
        objects: currentState.objects,
        objectIds: currentState.objectIds,
        pages: currentState.pages,
        pageIds: currentState.pageIds,
        currentPageId: currentState.currentPageId,
        components: currentState.components,
        componentIds: currentState.componentIds,
        canvasSettings: currentState.canvasSettings,
        viewport: {
          zoom: currentState.viewport.zoom,
          panX: currentState.viewport.panX,
          panY: currentState.viewport.panY,
        },
      };
      CanvasPersistence.scheduleDebouncedSave(stateToSave, "undo");
    },

    // Redo functionality
    redo: () => {
      set((draft) => {
        if (draft.futureStates.length === 0) {
          return;
        }

        // Save current state to past
        const currentState: CoreState = {
          objects: JSON.parse(JSON.stringify(draft.objects)),
          objectIds: [...draft.objectIds],
          pages: JSON.parse(JSON.stringify(draft.pages)),
          pageIds: [...draft.pageIds],
          currentPageId: draft.currentPageId,
          components: JSON.parse(JSON.stringify(draft.components)),
          componentIds: [...draft.componentIds],
          selection: { ...draft.selection },
          canvasSettings: { ...draft.canvasSettings },
          events: [...draft.events],
        };

        draft.pastStates.push(currentState);

        // Restore future state
        const futureState = draft.futureStates.shift()!;
        Object.assign(draft, futureState);

        // Update nesting observer with restored objects
        nestingObserver.updateObjects(draft.objects);
      });

      // Auto-save after redo
      const currentState = get();
      const stateToSave = {
        objects: currentState.objects,
        objectIds: currentState.objectIds,
        pages: currentState.pages,
        pageIds: currentState.pageIds,
        currentPageId: currentState.currentPageId,
        components: currentState.components,
        componentIds: currentState.componentIds,
        canvasSettings: currentState.canvasSettings,
        viewport: {
          zoom: currentState.viewport.zoom,
          panX: currentState.viewport.panX,
          panY: currentState.viewport.panY,
        },
      };
      CanvasPersistence.scheduleDebouncedSave(stateToSave, "redo");
    },

    // Computed properties
    get canUndo() {
      return get().pastStates.length > 0;
    },

    get canRedo() {
      return get().futureStates.length > 0;
    },

    // Helper methods
    getSelectedObjects: () => {
      const state = get();
      return state.selection.selectedIds
        .map((id) => state.objects[id])
        .filter(Boolean);
    },

    getVisibleObjects: () => {
      const state = get();
      return Object.values(state.objects).filter((obj) => obj.visible);
    },

    getObjectById: (id: string) => {
      return get().objects[id];
    },

    getObjectChildren: (id: string) => {
      const state = get();
      const object = state.objects[id];
      if (!object) return [];
      return object.childIds
        .map((childId) => state.objects[childId])
        .filter(Boolean);
    },

    // Component helpers
    getComponentById: (id: string) => {
      return get().components[id];
    },

    getComponentByObjectId: (objectId: string) => {
      const state = get();
      const object = state.objects[objectId];
      if (!object || !object.componentId) return undefined;
      return state.components[object.componentId];
    },

    getInstancesOfComponent: (componentId: string) => {
      const state = get();
      return Object.values(state.objects).filter(
        (obj) => obj.type === "instance" && obj.componentId === componentId
      );
    },

    createComponent: (name: string, selectedIds: string[]) => {
      const state = get();
      if (selectedIds.length === 0) {
        console.warn("Cannot create component: no objects selected");
        return;
      }

      // Collect all descendants of selected objects (deep selection)
      const collectDescendants = (objectId: string, collected: Set<string>) => {
        if (collected.has(objectId)) return; // Already processed

        const object = state.objects[objectId];
        if (!object) return;

        collected.add(objectId);

        // Recursively collect all children
        if (object.childIds && object.childIds.length > 0) {
          object.childIds.forEach((childId) => {
            collectDescendants(childId, collected);
          });
        }
      };

      const allObjectIds = new Set<string>();
      selectedIds.forEach((selectedId) => {
        collectDescendants(selectedId, allObjectIds);
      });

      const allObjectIdsArray = Array.from(allObjectIds);

      // Create component from current selection including all descendants
      state.dispatch({
        type: "component.created",
        payload: {
          component: {
            id: nanoid(),
            name,
            createdAt: Date.now(),
            mainObjectId: selectedIds[0], // Use first selected as main
            variants: [
              {
                id: nanoid(),
                name: "Default",
                properties: {},
                isDefault: true,
              },
            ],
          },
          sourceObjectIds: allObjectIdsArray, // Include all descendants
        },
      });
    },

    createInstance: (
      componentId: string,
      position: { x: number; y: number },
      parentId?: string
    ) => {
      const state = get();
      const component = state.components[componentId];
      const mainComponent = state.objects[component?.mainObjectId];

      if (!component || !mainComponent) {
        console.warn(
          "Cannot create instance: component or main component not found"
        );
        return;
      }

      // Helper function to deep clone component structure for instance
      const cloneComponentStructure = (
        sourceObjectId: string,
        newParentId?: string,
        idMap: Map<string, string> = new Map()
      ): CanvasObject => {
        const sourceObject = state.objects[sourceObjectId];
        if (!sourceObject) {
          throw new Error(`Source object ${sourceObjectId} not found`);
        }

        // Generate new ID and track mapping
        const newId = nanoid();
        idMap.set(sourceObjectId, newId);

        // Clone children first to get their IDs
        const newChildIds: string[] = [];
        if (sourceObject.childIds && sourceObject.childIds.length > 0) {
          sourceObject.childIds.forEach((childId) => {
            const childObject = cloneComponentStructure(childId, newId, idMap);
            newChildIds.push(childObject.id);
          });
        }

        // Create the cloned object
        const clonedObject: CanvasObject = {
          ...sourceObject,
          id: newId,
          parentId: newParentId,
          childIds: newChildIds,
          createdAt: Date.now(),
          // Instance-specific properties - preserve original type
          type: sourceObject.type, // Keep original type (frame, rectangle, etc.)
          componentId:
            sourceObjectId === component.mainObjectId
              ? component.id
              : undefined,
          variantId:
            sourceObjectId === component.mainObjectId
              ? component.variants[0]?.id
              : undefined,
          overrides: sourceObjectId === component.mainObjectId ? {} : undefined,
          isMainComponent: false,
          isComponentInstance: sourceObjectId === component.mainObjectId, // New flag for instances
          // Track which original object this corresponds to for ID-based mapping
          originalId: sourceObjectId,
        };

        // Update position for the main instance
        if (sourceObjectId === component.mainObjectId) {
          clonedObject.x = position.x;
          clonedObject.y = position.y;
          // Don't override properties - preserve original object properties
        }

        return clonedObject;
      };

      // Clone the entire component structure
      const idMap = new Map<string, string>();
      const allClonedObjects: CanvasObject[] = [];

      // Collect all cloned objects during the cloning process
      const cloneComponentStructureWithCollection = (
        sourceObjectId: string,
        newParentId?: string
      ): CanvasObject => {
        const sourceObject = state.objects[sourceObjectId];
        if (!sourceObject) {
          throw new Error(`Source object ${sourceObjectId} not found`);
        }

        // Generate new ID and track mapping
        const newId = nanoid();
        idMap.set(sourceObjectId, newId);

        // Clone children first to get their IDs
        const newChildIds: string[] = [];
        if (sourceObject.childIds && sourceObject.childIds.length > 0) {
          sourceObject.childIds.forEach((childId) => {
            const childObject = cloneComponentStructureWithCollection(
              childId,
              newId
            );
            newChildIds.push(childObject.id);
          });
        }

        // Create the cloned object
        const clonedObject: CanvasObject = {
          ...sourceObject,
          id: newId,
          parentId: newParentId,
          childIds: newChildIds,
          createdAt: Date.now(),
          // Instance-specific properties - preserve original type
          type: sourceObject.type, // Keep original type (frame, rectangle, etc.)
          // ALL objects in instance get componentId for sync tracking
          componentId: component.id, // Every object in instance gets componentId
          variantId:
            sourceObjectId === component.mainObjectId
              ? component.variants[0]?.id
              : undefined,
          overrides: sourceObjectId === component.mainObjectId ? {} : undefined,
          isMainComponent: false,
          isComponentInstance: sourceObjectId === component.mainObjectId, // Only top-level is instance
          // Critical for ID-based sync: maps back to original object in main component
          originalId: sourceObjectId,
        };

        // Update position for the main instance
        if (sourceObjectId === component.mainObjectId) {
          clonedObject.x = position.x;
          clonedObject.y = position.y;
          // Don't override properties - preserve original object properties
        }

        allClonedObjects.push(clonedObject);
        return clonedObject;
      };

      const instance = cloneComponentStructureWithCollection(
        component.mainObjectId,
        parentId
      );

      // Create all objects at once
      allClonedObjects.forEach((obj) => {
        state.dispatch({
          type: "object.created",
          payload: { object: obj },
        });
      });

      console.log("📦 Instance created with full structure:", {
        instanceId: instance.id,
        componentId: component.id,
        totalObjects: allClonedObjects.length,
        objectIds: allClonedObjects.map((obj) => obj.id),
      });
    },

    resetInstanceToMain: (instanceId: string) => {
      set((draft) => {
        const resetResult = resetInstanceToMainComponent(
          instanceId,
          draft.objects
        );

        if (resetResult.resetCount > 0) {
          // Apply all the reset changes
          Object.entries(resetResult.updatedObjects).forEach(
            ([id, updatedObject]) => {
              if (draft.objects[id]) {
                draft.objects[id] = updatedObject;
              }
            }
          );

          console.log("🔄 Instance reset to main component:", {
            instanceId,
            resetObjectCount: resetResult.resetCount,
            updatedObjectIds: Object.keys(resetResult.updatedObjects),
          });
        } else {
          console.log("ℹ️ No overrides to reset for instance:", instanceId);
        }
      });
    },

    // Page helpers
    getPageById: (id: string) => {
      return get().pages[id];
    },

    getCurrentPage: () => {
      const state = get();
      return state.currentPageId ? state.pages[state.currentPageId] : undefined;
    },

    createPage: (name: string) => {
      set((draft) => {
        const pageId = nanoid();
        const newPage: Page = {
          id: pageId,
          name,
          objectIds: [],
        };
        draft.pages[pageId] = newPage;
        draft.pageIds.push(pageId);
      });
    },

    switchToPage: (pageId: string) => {
      set((draft) => {
        if (draft.pages[pageId]) {
          draft.currentPageId = pageId;
          // Clear selection when switching pages
          draft.selection.selectedIds = [];
          draft.selection.hoveredId = undefined;
          draft.selection.selectionBounds = undefined;
        }
      });
    },

    renamePage: (pageId: string, name: string) => {
      set((draft) => {
        if (draft.pages[pageId]) {
          draft.pages[pageId].name = name;
        }
      });
    },

    // Initialize auto layout orders for existing objects
    initializeAutoLayoutOrders: () => {
      set((draft) => {
        initializeAutoLayoutOrders(draft.objects);
      });
    },
  }))
);

// Export the useAppStore hook
export const useAppStore = store;

// Hooks for common state selections
export const useSelectedObjects = () => {
  const selectedIds = useAppStore((state) => state.selection.selectedIds);
  const objects = useObjects(); // Use page-filtered objects

  // Use useMemo to prevent unnecessary recalculations
  return useMemo(() => {
    return selectedIds.map((id) => objects[id]).filter(Boolean);
  }, [selectedIds, objects]);
};

export const useVisibleObjects = () => {
  const objects = useObjects(); // Use page-filtered objects

  return useMemo(() => {
    return Object.values(objects).filter((obj) => obj.visible);
  }, [objects]);
};

export const useObjects = () => {
  const allObjects = useAppStore((state) => state.objects);
  const pages = useAppStore((state) => state.pages);
  const currentPageId = useAppStore((state) => state.currentPageId);

  return useMemo(() => {
    // Filter objects to show only current page objects
    const currentPage = currentPageId ? pages[currentPageId] : null;
    const currentPageObjectIds = currentPage?.objectIds || [];
    const pageObjects: Record<string, CanvasObject> = {};

    currentPageObjectIds.forEach((id) => {
      if (allObjects[id]) {
        pageObjects[id] = allObjects[id];
      }
    });

    return pageObjects;
  }, [allObjects, pages, currentPageId]);
};

export const useCanUndoRedo = () => {
  const canUndo = useAppStore((state) => state.canUndo);
  const canRedo = useAppStore((state) => state.canRedo);

  return { canUndo, canRedo };
};

// ─── Dev-mode: expose store on window.__debug ────────────────────────────────
// Access in the browser console:
//   __debug.store()                → dump current canvas state
//   __debug.storeRaw               → the raw Zustand store instance
//   __debug.storeState().objects   → current canvas objects map
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const w = window as unknown as { __debug: Record<string, unknown> };
  w.__debug = w.__debug ?? {};
  w.__debug.storeRaw = store;
  w.__debug.storeState = () => store.getState();
  w.__debug.store = () => {
    const s = store.getState();
    console.group("[debug] Canvas Store State");
    console.log("objects (%d):", Object.keys(s.objects).length, s.objects);
    console.log("selection:", s.selection);
    console.log("pages:", s.pages, "| current:", s.currentPageId);
    console.log("canUndo:", s.canUndo, "| canRedo:", s.canRedo);
    console.log("viewport:", s.viewport);
    console.groupEnd();
  };
}
