/**
 * Cursor system types for the Figma clone
 *
 * This system provides global cursor management that goes beyond CSS hover states,
 * allowing for cursor changes based on application state, tools, and interactions.
 */

// Available cursor types from our UI3 cursor assets
export type CursorType =
  | "default"
  | "pointer"
  | "grab"
  | "grabbing"
  // Navigation and movement
  | "hand"
  | "hand-press"
  | "move"
  | "pan"
  // Resize cursors for different directions
  | "resize-n"
  | "resize-ne"
  | "resize-e"
  | "resize-se"
  | "resize-s"
  | "resize-sw"
  | "resize-w"
  | "resize-nw"
  | "resize-scale"
  // Tools
  | "crosshair"
  | "text"
  | "pen"
  | "pencil"
  | "frame"
  | "brush"
  | "dropper"
  | "zoom-in"
  | "zoom-out"
  // Interactions
  | "not-allowed"
  | "click"
  | "duplicate"
  | "snap"
  | "break"
  | "convert"
  // Special states
  | "invisible";

// Cursor state interface
export interface CursorState {
  type: CursorType;
  // Optional custom cursor image URL (for specific cursors)
  customUrl?: string;
  // Hot spot coordinates for custom cursors
  hotspot?: { x: number; y: number };
  // Priority for cursor conflicts (higher wins)
  priority?: number;
  // Source of the cursor change for debugging
  source?: string;
}

// Cursor action types for state management
export type CursorAction =
  | { type: "SET_CURSOR"; payload: CursorState }
  | { type: "RESET_CURSOR" }
  | { type: "PUSH_CURSOR"; payload: CursorState } // Stack-based cursor management
  | { type: "POP_CURSOR" };

// Resize handle to cursor mapping
export const RESIZE_HANDLE_CURSORS: Record<string, CursorType> = {
  "top-left": "resize-nw",
  "top-center": "resize-n",
  "top-right": "resize-ne",
  "middle-left": "resize-w",
  "middle-right": "resize-e",
  "bottom-left": "resize-sw",
  "bottom-center": "resize-s",
  "bottom-right": "resize-se",
};

// Tool to default cursor mapping
export const TOOL_CURSORS: Record<string, CursorType> = {
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
  make: "crosshair",
};

// Cursor rotation mapping (in degrees)
export const CURSOR_ROTATIONS: Record<CursorType, number> = {
  "resize-n": 90, // Vertical resize (rotate horizontal cursor 90°)
  "resize-ne": -45, // Diagonal NE (↗)
  "resize-e": 0, // Horizontal resize (no rotation)
  "resize-se": -135, // Diagonal SE (↘)
  "resize-s": 90, // Vertical resize (rotate horizontal cursor 90°)
  "resize-sw": -45, // Diagonal SW (↙)
  "resize-w": 0, // Horizontal resize (no rotation)
  "resize-nw": -135, // Diagonal NW (↖)
  default: 0,
  move: 0,
  "resize-scale": 0,
  crosshair: 0,
  hand: 0,
  "hand-press": 0,
  pen: 0,
  pencil: 0,
  frame: 0,
  brush: 0,
  dropper: 0,
  "zoom-in": 0,
  "zoom-out": 0,
  "not-allowed": 0,
  click: 0,
  duplicate: 0,
  snap: 0,
  break: 0,
  convert: 0,
  invisible: 0,
  pointer: 0,
  grab: 0,
  grabbing: 0,
  text: 0,
  pan: 0,
};

// Cursor hotspot mapping (where the click point is)
export const CURSOR_HOTSPOTS: Record<CursorType, { x: number; y: number }> = {
  // Default cursor hotspot at tip
  default: { x: 4, y: 4 },

  // Resize cursors - center of the cursor for best precision
  "resize-n": { x: 16, y: 16 },
  "resize-ne": { x: 16, y: 16 },
  "resize-e": { x: 16, y: 16 },
  "resize-se": { x: 16, y: 16 },
  "resize-s": { x: 16, y: 16 },
  "resize-sw": { x: 16, y: 16 },
  "resize-w": { x: 16, y: 16 },
  "resize-nw": { x: 16, y: 16 },
  "resize-scale": { x: 16, y: 16 },

  // Movement and interaction cursors - center
  move: { x: 16, y: 16 },
  crosshair: { x: 16, y: 16 },
  hand: { x: 16, y: 16 },
  "hand-press": { x: 16, y: 16 },

  // Drawing tools - tip for precision
  pen: { x: 0, y: 31 }, // Bottom tip of pen
  pencil: { x: 0, y: 31 }, // Bottom tip of pencil
  brush: { x: 16, y: 16 }, // Center for brush
  frame: { x: 16, y: 16 }, // Center for frame tool
  text: { x: 16, y: 16 }, // Center for text tool

  // Standard browser cursors - center or tip as appropriate
  pointer: { x: 0, y: 0 },
  grab: { x: 16, y: 16 },
  grabbing: { x: 16, y: 16 },
  "zoom-in": { x: 16, y: 16 },
  "zoom-out": { x: 16, y: 16 },
  "not-allowed": { x: 16, y: 16 },
  click: { x: 0, y: 0 },
  duplicate: { x: 8, y: 8 },
  snap: { x: 16, y: 16 },
  break: { x: 16, y: 16 },
  convert: { x: 16, y: 16 },
  invisible: { x: 16, y: 16 },
  dropper: { x: 16, y: 16 },
  pan: { x: 16, y: 16 },
};

// Cursor asset paths (relative to public folder)
export const CURSOR_ASSETS = {
  default: "/cursors/cursor-black-ui3.svg",
  move: "/cursors/cursor-move-ui3.svg",
  "resize-n": "/cursors/cursor-resize-ui3.svg",
  "resize-s": "/cursors/cursor-resize-ui3.svg",
  "resize-e": "/cursors/cursor-resize-ui3.svg",
  "resize-w": "/cursors/cursor-resize-ui3.svg",
  "resize-nw": "/cursors/cursor-resize-ui3.svg",
  "resize-ne": "/cursors/cursor-resize-ui3.svg",
  "resize-sw": "/cursors/cursor-resize-ui3.svg",
  "resize-se": "/cursors/cursor-resize-ui3.svg",
  "resize-scale": "/cursors/cursor-resize-scale-ui3.svg",
  crosshair: "/cursors/cursor-crosshair-ui3.svg",
  hand: "/cursors/cursor-hand-new-ui3.svg",
  "hand-press": "/cursors/cursor-hand-press-ui3.svg",
  pen: "/cursors/cursor-pen-ui3.svg",
  pencil: "/cursors/cursor-pencil-ui3.svg",
  frame: "/cursors/cursor-frame-ui3.svg",
  brush: "/cursors/cursor-brush.svg",
  dropper: "/cursors/cursor-dropper-ui3.svg",
  "zoom-in": "/cursors/cursor-zoom-in-ui3.svg",
  "zoom-out": "/cursors/cursor-zoom-out-ui3.svg",
  "not-allowed": "/cursors/cursor-not-allowed-ui3.svg",
  click: "/cursors/cursor-click-ui3.svg",
  duplicate: "/cursors/cursor-duplicate-ui3.svg",
  snap: "/cursors/cursor-snap-ui3.svg",
  break: "/cursors/cursor-break-ui3.svg",
  convert: "/cursors/cursor-convert-ui3.svg",
  invisible: "/cursors/cursor-invisible.svg",
} as const;
