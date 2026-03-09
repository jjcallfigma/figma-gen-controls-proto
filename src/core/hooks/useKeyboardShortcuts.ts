import { useCallback, useEffect } from "react";

// Keyboard shortcut definition
export interface KeyboardShortcut {
  key?: string; // Key value (e.g., "a", "1") - can be affected by modifiers
  code?: string; // Physical key code (e.g., "KeyA", "Digit1") - unaffected by modifiers
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  preventDefault?: boolean;
  callback: (event?: KeyboardEvent) => void; // Pass event to callback
  description?: string;
}

// Platform detection for proper modifier keys
const isMac =
  typeof window !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

// Helper to normalize key combinations across platforms
function normalizeShortcut(shortcut: KeyboardShortcut): KeyboardShortcut {
  // On Mac, use metaKey (CMD), on Windows/Linux use ctrlKey (CTRL)
  if (isMac && shortcut.metaKey) {
    return { ...shortcut, metaKey: true, ctrlKey: false };
  } else if (!isMac && shortcut.metaKey) {
    return { ...shortcut, metaKey: false, ctrlKey: true };
  }
  return shortcut;
}

// Check if event matches shortcut definition
function matchesShortcut(
  event: KeyboardEvent,
  shortcut: KeyboardShortcut
): boolean {
  const normalized = normalizeShortcut(shortcut);

  // Check modifiers first
  const modifiersMatch =
    !!event.metaKey === !!normalized.metaKey &&
    !!event.ctrlKey === !!normalized.ctrlKey &&
    !!event.shiftKey === !!normalized.shiftKey &&
    !!event.altKey === !!normalized.altKey;

  if (!modifiersMatch) return false;

  // Check key match - prefer code over key for physical key detection
  if (normalized.code) {
    return event.code === normalized.code;
  } else if (normalized.key) {
    return event.key.toLowerCase() === normalized.key.toLowerCase();
  }

  return false;
}

// Check if user is currently editing text (should bypass most global shortcuts)
function isTextBeingEdited(): boolean {
  // Check if focus is in an input, textarea, or contenteditable element
  const activeElement = document.activeElement;
  return !!(
    activeElement &&
    (activeElement.tagName === "INPUT" ||
      activeElement.tagName === "TEXTAREA" ||
      activeElement.getAttribute("contenteditable") === "true")
  );
}

// Main hook for keyboard shortcuts
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Check each shortcut for a match
      for (const shortcut of shortcuts) {
        if (matchesShortcut(event, shortcut)) {
          // Check if text is being edited BEFORE preventing default
          // This allows text input to work normally in editors
          const isEditingText = isTextBeingEdited();

          // Skip most shortcuts if text is being edited, except for some special cases
          const isSpecialShortcut =
            (event.key.toLowerCase() === "z" &&
              (event.metaKey || event.ctrlKey)) || // Undo/Redo
            event.key === "Escape"; // Escape to exit edit mode

          // Allow Delete/Backspace to pass through when the field is empty
          // AND the user hasn't typed in this focus session, so they can
          // delete selected canvas objects (e.g. a Make whose chat textarea
          // auto-focused on selection) without risking accidental deletion
          // when correcting typed text.
          const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
          const isDeleteOnEmpty =
            (event.key === "Backspace" || event.key === "Delete") &&
            isEditingText &&
            !el.value &&
            !el.dataset.hasTyped; // only before the user has typed anything

          if (isEditingText && !isSpecialShortcut && !isDeleteOnEmpty) {
            
            continue; // Skip this shortcut, let text editor handle it
          }

          // If delete-on-empty, blur the field first so focus returns to canvas
          if (isDeleteOnEmpty) {
            (el as HTMLElement).blur();
          }

          // Prevent default browser behavior if specified
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
            event.stopPropagation();
          }

          // Execute the callback
          shortcut.callback(event);
          break; // Only execute the first matching shortcut
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    // Attach to document to catch all keyboard events
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}

// Predefined common shortcuts
export const createUndoRedoShortcuts = (
  onUndo: (event?: KeyboardEvent) => void,
  onRedo: (event?: KeyboardEvent) => void
): KeyboardShortcut[] => [
  {
    key: "z",
    metaKey: true,
    shiftKey: false,
    callback: onUndo,
    description: "Undo last action",
  },
  {
    key: "z",
    metaKey: true,
    shiftKey: true,
    callback: onRedo,
    description: "Redo last undone action",
  },
];

// Helper for creating common shortcuts
export const shortcuts = {
  // File operations
  save: (callback: () => void): KeyboardShortcut => ({
    key: "s",
    metaKey: true,
    callback,
    description: "Save",
  }),

  // Selection
  selectAll: (callback: () => void): KeyboardShortcut => ({
    key: "a",
    metaKey: true,
    callback,
    description: "Select all",
  }),

  selectSiblings: (callback: () => void): KeyboardShortcut => ({
    key: "a",
    metaKey: true,
    shiftKey: true,
    callback,
    description: "Select siblings",
  }),

  selectAncestors: (callback: () => void): KeyboardShortcut => ({
    key: "a",
    metaKey: true,
    altKey: true,
    callback,
    description: "Select all ancestors",
  }),

  // Copy/Paste
  copy: (callback: () => void): KeyboardShortcut => ({
    key: "c",
    metaKey: true,
    callback,
    description: "Copy",
  }),

  paste: (callback: () => void): KeyboardShortcut => ({
    key: "v",
    metaKey: true,
    callback,
    description: "Paste",
  }),

  // Tools (common Figma shortcuts)
  selectTool: (callback: () => void): KeyboardShortcut => ({
    key: "v",
    callback,
    description: "Select tool",
  }),

  rectangleTool: (callback: () => void): KeyboardShortcut => ({
    key: "r",
    callback,
    description: "Rectangle tool",
  }),

  // Navigation
  zoomIn: (callback: () => void): KeyboardShortcut => ({
    key: "=",
    metaKey: true,
    callback,
    description: "Zoom in",
  }),

  zoomOut: (callback: () => void): KeyboardShortcut => ({
    key: "-",
    metaKey: true,
    callback,
    description: "Zoom out",
  }),

  zoomToFit: (callback: () => void): KeyboardShortcut => ({
    key: "1",
    metaKey: true,
    callback,
    description: "Zoom to fit",
  }),
};
