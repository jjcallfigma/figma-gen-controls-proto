import {
  CanvasObject,
  ComponentDefinition,
  ComponentOverrides,
  ToolType,
  Viewport,
  WorldPoint,
} from "./canvas";

// Base event interface
export interface BaseEvent {
  id: string;
  type: string;
  timestamp: number;
  userId?: string; // For future collaboration features
}

// Canvas events
export interface CanvasClearEvent extends BaseEvent {
  type: "canvas.clear";
  payload: {};
}

export interface CanvasBackgroundChangedEvent extends BaseEvent {
  type: "canvas.background.changed";
  payload: {
    backgroundColor: string;
    previousBackgroundColor: string;
  };
}

export interface CanvasBackgroundOpacityChangedEvent extends BaseEvent {
  type: "canvas.background.opacity.changed";
  payload: {
    backgroundOpacity: number;
    previousBackgroundOpacity: number;
  };
}

// Preview events for immediate visual feedback without undo history
export interface CanvasBackgroundChangedPreviewEvent extends BaseEvent {
  type: "canvas.background.changed.preview";
  payload: {
    backgroundColor: string;
  };
}

export interface CanvasBackgroundOpacityChangedPreviewEvent extends BaseEvent {
  type: "canvas.background.opacity.changed.preview";
  payload: {
    backgroundOpacity: number;
  };
}

// Canvas object events
export interface ObjectCreatedEvent extends BaseEvent {
  type: "object.created";
  payload: {
    object: CanvasObject;
  };
}

export interface ObjectUpdatedEvent extends BaseEvent {
  type: "object.updated";
  payload: {
    id: string;
    changes: Partial<CanvasObject>;
    previousValues: Partial<CanvasObject>;
    context?: string; // Optional context to identify the source of the update
    skipOverrideCreation?: boolean; // Skip creating manual overrides for this update
  };
}

export interface ObjectUpdatedPreviewEvent extends BaseEvent {
  type: "object.updated.preview";
  payload: {
    id: string;
    changes: Partial<CanvasObject>;
  };
}

export interface ObjectDeletedEvent extends BaseEvent {
  type: "object.deleted";
  payload: {
    id: string;
    object: CanvasObject; // Store for undo
  };
}

export interface ObjectsDeletedBatchEvent extends BaseEvent {
  type: "objects.deleted.batch";
  payload: {
    ids: string[];
    objects: Record<string, CanvasObject>; // Store for undo
  };
}

export interface ObjectsMovedEvent extends BaseEvent {
  type: "objects.moved";
  payload: {
    objectIds: string[];
    deltaX: number;
    deltaY: number;
  };
}

export interface DragStartedEvent extends BaseEvent {
  type: "drag.started";
  payload: {
    draggedObjectIds: string[];
    startPoint: { x: number; y: number };
  };
}

export interface DragCompletedEvent extends BaseEvent {
  type: "drag.completed";
  payload: {
    // Updates for live reparented objects
    reparentedUpdates: Array<{
      objectId: string;
      newPosition: { x: number; y: number };
      previousPosition: { x: number; y: number };
    }>;
    // Movement for non-reparented objects
    movedObjects: {
      objectIds: string[];
      deltaX: number;
      deltaY: number;
    } | null;
  };
}

export interface ResizeStartedEvent extends BaseEvent {
  type: "resize.started";
  payload: {
    selectedIds: string[];
    handle: string;
    originalBounds: { x: number; y: number; width: number; height: number };
    originalObjects: Record<
      string,
      { x: number; y: number; width: number; height: number }
    >;
    resizeType: "same-parent" | "different-parent";
  };
}

export interface ResizeCompletedEvent extends BaseEvent {
  type: "resize.completed";
  payload: {
    selectedIds: string[];
    handle: string;
  };
}

export interface ObjectsDuplicatedEvent extends BaseEvent {
  type: "objects.duplicated";
  payload: {
    originalIds: string[];
    duplicatedObjects: CanvasObject[];
    offset: WorldPoint;
  };
}

// Selection events
export interface SelectionChangedEvent extends BaseEvent {
  type: "selection.changed";
  payload: {
    selectedIds: string[];
    previousSelection: string[];
  };
}

export interface ObjectHoveredEvent extends BaseEvent {
  type: "object.hovered";
  payload: {
    objectId?: string; // undefined means no hover
  };
}

// Viewport events
export interface ViewportChangedEvent extends BaseEvent {
  type: "viewport.changed";
  payload: {
    viewport: Viewport;
    previousViewport: Viewport;
  };
}

// Tool events
export interface ToolChangedEvent extends BaseEvent {
  type: "tool.changed";
  payload: {
    tool: ToolType;
    previousTool: ToolType;
  };
}

export interface ToolInteractionStartedEvent extends BaseEvent {
  type: "tool.interaction.started";
  payload: {
    tool: ToolType;
    startPoint: WorldPoint;
    modifiers: {
      shift: boolean;
      alt: boolean;
      cmd: boolean;
    };
  };
}

export interface ToolInteractionUpdatedEvent extends BaseEvent {
  type: "tool.interaction.updated";
  payload: {
    tool: ToolType;
    currentPoint: WorldPoint;
    startPoint: WorldPoint;
    modifiers: {
      shift: boolean;
      alt: boolean;
      cmd: boolean;
    };
  };
}

export interface ToolInteractionCompletedEvent extends BaseEvent {
  type: "tool.interaction.completed";
  payload: {
    tool: ToolType;
    endPoint: WorldPoint;
    startPoint: WorldPoint;
    result?: CanvasObject | CanvasObject[]; // Created or modified objects
  };
}

// Hierarchy events
export interface ObjectReparentedEvent extends BaseEvent {
  type: "object.reparented";
  payload: {
    objectId: string;
    newParentId?: string;
    previousParentId?: string;
    newIndex: number;
    previousIndex: number;
  };
}

export interface ObjectReparentedWithCoordinatesEvent extends BaseEvent {
  type: "object.reparented.withCoordinates";
  payload: {
    objectId: string;
    newParentId?: string;
    previousParentId?: string;
    newIndex: number;
    previousIndex: number;
    // Coordinate conversion data for atomic undo
    newPosition: { x: number; y: number };
    previousPosition: { x: number; y: number };
    // Smart absolute positioning data for drag operations
    originalParentId?: string;
    wasOriginallyAbsolute?: boolean;
    shouldRestoreAbsolute?: boolean;
    // Flag to distinguish between live reparenting during drag vs final drop
    isLiveReparenting?: boolean;
  };
}

export interface ObjectReorderedEvent extends BaseEvent {
  type: "object.reordered";
  payload: {
    objectId: string;
    parentId: string;
    newIndex: number;
    previousIndex: number;
  };
}

export interface ObjectsBatchReorderedEvent extends BaseEvent {
  type: "objects.reordered.batch";
  payload: {
    parentId: string;
    reorders: Array<{
      objectId: string;
      newIndex: number;
      previousIndex: number;
    }>;
  };
}

export interface ObjectsUpdatedBatchEvent extends BaseEvent {
  type: "objects.updated.batch";
  payload: {
    updates: Array<{
      id: string;
      changes: Partial<CanvasObject>;
      previousValues: Partial<CanvasObject>;
    }>;
    context:
      | "resize"
      | "drag"
      | "auto-layout-sizing-from-resize-start"
      | "hug-to-fixed-on-resize"
      | "auto-layout-sync"
      | "text-resize-mode-from-resize-start"
      | `alignment-${string}`
      | "other";
    skipOverrideCreation?: boolean; // Skip creating manual overrides for batch updates
  };
}

// Component events
export interface ComponentCreatedEvent extends BaseEvent {
  type: "component.created";
  payload: {
    component: ComponentDefinition;
    sourceObjectIds: string[]; // Original objects that were converted
  };
}

export interface ComponentUpdatedEvent extends BaseEvent {
  type: "component.updated";
  payload: {
    componentId: string;
    changes: Partial<ComponentDefinition>;
    previousValues: Partial<ComponentDefinition>;
  };
}

export interface ComponentDeletedEvent extends BaseEvent {
  type: "component.deleted";
  payload: {
    componentId: string;
    component: ComponentDefinition; // Store for undo
  };
}

export interface InstanceCreatedEvent extends BaseEvent {
  type: "instance.created";
  payload: {
    instance: CanvasObject; // The instance object
    componentId: string;
    variantId?: string;
    position: { x: number; y: number };
  };
}

export interface InstanceUpdatedEvent extends BaseEvent {
  type: "instance.updated";
  payload: {
    instanceId: string;
    overrides: ComponentOverrides;
    previousOverrides: ComponentOverrides;
  };
}

export interface ComponentSyncedEvent extends BaseEvent {
  type: "component.synced";
  payload: {
    componentId: string;
    affectedInstanceIds: string[];
    changes: Array<{
      instanceId: string;
      objectUpdates: Array<{
        id: string;
        changes: Partial<CanvasObject>;
        previousValues: Partial<CanvasObject>;
      }>;
    }>;
  };
}

// Clipboard events
export interface ObjectsCopiedEvent extends BaseEvent {
  type: "objects.copied";
  payload: {
    copiedObjects: CanvasObject[];
    sourceIds: string[];
  };
}

export interface ObjectsCutEvent extends BaseEvent {
  type: "objects.cut";
  payload: {
    cutObjects: CanvasObject[];
    sourceIds: string[];
    removedObjectIds: string[]; // Objects immediately removed from canvas
  };
}

export interface ObjectsPastedEvent extends BaseEvent {
  type: "objects.pasted";
  payload: {
    pastedObjects: CanvasObject[];
    targetParentId?: string;
    position?: { x: number; y: number };
    /** If false, do not select the pasted objects (e.g. AI-generated). Default true. */
    selectPasted?: boolean;
  };
}

export interface ImagePastedEvent extends BaseEvent {
  type: "image.pasted";
  payload: {
    imageObject: CanvasObject; // Rectangle with image fill
    imageUrl: string;
    targetParentId?: string;
    position?: { x: number; y: number };
  };
}

// Demo scene events
export interface LoadDemoSceneEvent extends BaseEvent {
  type: "LOAD_DEMO_SCENE";
  payload: {
    objects: Record<string, CanvasObject>;
    objectIds: string[];
    pages: Record<string, any>;
    pageIds: string[];
    currentPageId: string | null;
  };
}

// Canvas persistence events
export interface CanvasStateLoadedEvent extends BaseEvent {
  type: "canvas.state.loaded";
  payload: {
    objects: Record<string, any>;
    objectIds: string[];
    pages: Record<string, any>;
    pageIds: string[];
    currentPageId: string | null;
    components: Record<string, any>;
    componentIds: string[];
    canvasSettings: any;
  };
}

export interface CanvasStateResetEvent extends BaseEvent {
  type: "canvas.state.reset";
  payload: {};
}

// Union type of all events
export type CanvasEvent =
  | CanvasClearEvent
  | CanvasBackgroundChangedEvent
  | CanvasBackgroundOpacityChangedEvent
  | CanvasBackgroundChangedPreviewEvent
  | CanvasBackgroundOpacityChangedPreviewEvent
  | ObjectCreatedEvent
  | ObjectUpdatedEvent
  | ObjectUpdatedPreviewEvent
  | ObjectDeletedEvent
  | ObjectsDeletedBatchEvent
  | ObjectsMovedEvent
  | ObjectsDuplicatedEvent
  | DragStartedEvent
  | DragCompletedEvent
  | ResizeStartedEvent
  | ResizeCompletedEvent
  | SelectionChangedEvent
  | ObjectHoveredEvent
  | ViewportChangedEvent
  | ToolChangedEvent
  | ToolInteractionStartedEvent
  | ToolInteractionUpdatedEvent
  | ToolInteractionCompletedEvent
  | ObjectReparentedEvent
  | ObjectReparentedWithCoordinatesEvent
  | ObjectReorderedEvent
  | ObjectsBatchReorderedEvent
  | ObjectsUpdatedBatchEvent
  | ComponentCreatedEvent
  | ComponentUpdatedEvent
  | ComponentDeletedEvent
  | InstanceCreatedEvent
  | InstanceUpdatedEvent
  | ComponentSyncedEvent
  | ObjectsCopiedEvent
  | ObjectsCutEvent
  | ObjectsPastedEvent
  | ImagePastedEvent
  | LoadDemoSceneEvent
  | CanvasStateLoadedEvent
  | CanvasStateResetEvent;

// Event payload types for easier typing
export type EventPayload<T extends CanvasEvent["type"]> = Extract<
  CanvasEvent,
  { type: T }
>["payload"];

// Helper type for creating events
export interface CreateEventOptions<T extends CanvasEvent["type"]> {
  type: T;
  payload: EventPayload<T>;
  id?: string;
  timestamp?: number;
  userId?: string;
}
