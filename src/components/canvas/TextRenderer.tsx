"use client";

import { useAppStore } from "@/core/state/store";
import { effectsToCssStyles } from "@/core/utils/effects";
import { CanvasObject, LetterSpacing, LineHeight } from "@/types/canvas";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEditor, Descendant, Editor } from "slate";
import { withHistory } from "slate-history";
import { Editable, ReactEditor, Slate, withReact } from "slate-react";
import CustomTextSelection from "./CustomTextSelection";

// Helper function to convert LineHeight to CSS value
function lineHeightToCSSValue(
  lineHeight: LineHeight,
  fontSize?: number
): string | number {
  if (lineHeight.unit === "%") {
    return lineHeight.value / 100; // Convert percentage to ratio
  } else {
    return `${lineHeight.value}px`; // Use px value with unit
  }
}

// Helper function to convert LetterSpacing to CSS value
function letterSpacingToCSSValue(
  letterSpacing: LetterSpacing,
  fontSize?: number
): string | number {
  if (letterSpacing.unit === "%") {
    // Convert percentage to em units for CSS
    return `${letterSpacing.value / 100}em`;
  } else {
    return `${letterSpacing.value}px`; // Use px value with unit
  }
}

// Global state to track which object just exited text edit mode
let recentlyExitedTextObjectId: string | null = null;
let exitTimeout: NodeJS.Timeout | null = null;

// Export a function to check if a specific object just exited edit mode
export function checkAndClearJustExitedTextEditMode(objectId: string): boolean {
  const wasJustExited = recentlyExitedTextObjectId === objectId;
  if (wasJustExited && exitTimeout) {
    clearTimeout(exitTimeout);
    recentlyExitedTextObjectId = null;
    exitTimeout = null;
  }
  return wasJustExited;
}

// Export a function to check if ANY text object recently exited edit mode (for Canvas deselection logic)
export function checkAndClearRecentlyExitedTextObject(): boolean {
  const wasRecentlyExited = recentlyExitedTextObjectId !== null;
  if (wasRecentlyExited && exitTimeout) {
    clearTimeout(exitTimeout);
    recentlyExitedTextObjectId = null;
    exitTimeout = null;
  }
  return wasRecentlyExited;
}

export function isTextBeingEdited(): boolean {
  const activeElement = document.activeElement;
  return !!(
    activeElement && activeElement.getAttribute("contenteditable") === "true"
  );
}

export default function TextRenderer({
  object,
  style,
  baseClasses,
}: {
  object: CanvasObject;
  style: React.CSSProperties;
  baseClasses: string;
}) {
  const textProps =
    object.properties.type === "text" ? object.properties : null;

  // Early return BEFORE any hooks
  if (!textProps) return null;

  const dispatch = useAppStore((state) => state.dispatch);
  const viewportZoom = useAppStore((state) => state.viewport.zoom);

  const isEditing = textProps.isEditing || false;

  // Create stable editor instance
  const editor = useMemo(() => withHistory(withReact(createEditor())), []);

  // Create initial Slate value from text content or saved Slate content
  const initialValue = useMemo(() => {
    // Try to restore from saved Slate content first
    if (textProps.slateContent) {
      try {
        return JSON.parse(textProps.slateContent);
      } catch (error) {
        console.error("Error parsing saved Slate content:", error);
      }
    }

    // Fallback: create from plain text
    const lines = (textProps.content || "").split("\n");
    return lines.map((line) => ({
      type: "paragraph",
      children: [{ text: line }],
    }));
  }, [textProps.slateContent, textProps.content]);

  // Slate state - initialize once and let Slate manage it
  const [slateValue, setSlateValue] = useState(initialValue);

  // Update Slate value when the object's slateContent changes (from Properties Panel updates)
  useEffect(() => {
    setSlateValue(initialValue);

    // CRITICAL: Also update the editor's internal children to match
    // This ensures that Properties Panel analysis reads the correct content
    // Check if editor sync is needed (only log when syncing)

    if (JSON.stringify(editor.children) !== JSON.stringify(initialValue)) {
      editor.children = initialValue;
      // Normalize to ensure the editor state is valid
      Editor.normalize(editor, { force: true });
    }
  }, [initialValue, editor]);

  // Force editor layout recalculation when text properties change during editing
  useEffect(() => {
    if (isEditing && editorContainerRef.current) {
      // Force the editor to recalculate layout after property changes
      const editorElement = editorContainerRef.current.querySelector(
        '[data-slate-editor="true"]'
      );
      if (editorElement) {
        // Trigger a layout recalculation by temporarily changing display
        const originalDisplay = (editorElement as HTMLElement).style.display;
        (editorElement as HTMLElement).style.display = "none";

        // Force reflow
        editorElement.getBoundingClientRect();

        // Restore display
        (editorElement as HTMLElement).style.display = originalDisplay || "";

        // Force a more aggressive DOM refresh
        setTimeout(() => {
          if (editorElement) {
            // Force the browser to recalculate all layouts
            (editorElement as HTMLElement).style.contain = "none";
            editorElement.getBoundingClientRect();
            (editorElement as HTMLElement).style.contain = "layout";
          }

          // Also force React to re-render the editor
          ReactEditor.focus(editor);
        }, 0);
      }
    }
  }, [
    isEditing,
    textProps.fontSize,
    textProps.lineHeight,
    textProps.letterSpacing,
    editor,
  ]);

  // Mouse tracking for blur detection
  const [isMouseDownInEditor, setIsMouseDownInEditor] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Exit edit mode helper
  const exitEditMode = useCallback(() => {
    // Set global flag to indicate we just exited text edit mode
    recentlyExitedTextObjectId = object.id;
    exitTimeout = setTimeout(() => {
      recentlyExitedTextObjectId = null;
      exitTimeout = null;
    }, 100); // Clear flag after a short delay

    // Save the current Slate state
    const slateContent = JSON.stringify(slateValue);

    // Extract plain text for backward compatibility
    const plainText = slateValue
      .map((node: any) => {
        if (node.children) {
          return node.children.map((child: any) => child.text || "").join("");
        }
        return "";
      })
      .join("\n");

    // Check if the text is empty using the same logic as the overlay
    const trimmed = plainText.trim();
    const isEmpty =
      !trimmed || trimmed === "" || trimmed === "\n" || /^\s*$/.test(trimmed);

    if (isEmpty) {
      // Delete the empty text node
      dispatch({
        type: "object.deleted",
        payload: {
          id: object.id,
          object: object, // Store for undo
        },
      });
      return;
    }

    dispatch({
      type: "object.updated",
      payload: {
        id: object.id,
        changes: {
          properties: {
            ...textProps,
            isEditing: false,
            content: plainText,
            slateContent: slateContent,
          },
        },
        previousValues: { properties: textProps },
      },
    });

    // Select the text object after a delay
    setTimeout(() => {
      dispatch({
        type: "selection.changed",
        payload: {
          selectedIds: [object.id],
          previousSelection: [],
        },
      });
    }, 100);
  }, [dispatch, object.id, object, slateValue, textProps]);

  // Handle blur events
  const handleBlur = useCallback(
    (event: React.FocusEvent) => {
      const relatedTarget = event.relatedTarget as HTMLElement;

      // Don't exit if clicking on properties panel or UI controls
      if (relatedTarget) {
        const isPropertiesPanel =
          relatedTarget.closest('[data-preserve-text-editing="true"]') ||
          relatedTarget.closest('[class*="properties"]') ||
          relatedTarget.closest('[role="button"]') ||
          relatedTarget.closest("button") ||
          relatedTarget.closest("input") ||
          relatedTarget.closest("select") ||
          relatedTarget.closest('[class*="panel"]') ||
          relatedTarget.closest('[class*="Typography"]') ||
          relatedTarget.closest("[data-radix-select-content]") ||
          relatedTarget.closest("[data-radix-select-item]") ||
          relatedTarget.closest("[data-radix-select-trigger]") ||
          relatedTarget.closest("[data-radix-dropdown-menu-content]") ||
          relatedTarget.closest("[data-radix-dropdown-menu-item]") ||
          relatedTarget.closest('[id="portal-root"]') ||
          relatedTarget.tagName === "SELECT" ||
          relatedTarget.tagName === "INPUT";

        if (isPropertiesPanel) {
          return;
        }
      }

      // Also don't exit if blur is caused by focusing on properties panel input
      // This handles programmatic focus changes
      if (!relatedTarget) {
        const activeElement = document.activeElement as HTMLElement;
        if (
          activeElement &&
          (activeElement.closest('[data-preserve-text-editing="true"]') ||
            activeElement.tagName === "INPUT" ||
            activeElement.tagName === "SELECT")
        ) {
          return;
        }
      }

      // Exit edit mode after a short delay
      setTimeout(() => {
        if (isEditing) {
          exitEditMode();
        }
      }, 10);
    },
    [exitEditMode, isEditing]
  );

  // State for custom selection control
  const [showCustomSelection, setShowCustomSelection] = useState(false);
  const [customSelectionActive, setCustomSelectionActive] = useState(false);
  const [selectionUpdateTrigger, setSelectionUpdateTrigger] = useState(0);

  // Get resize mode (default to auto-width for backward compatibility)
  const resizeMode = textProps.resizeMode || "auto-width";

  // Simple auto-sizing with ResizeObserver
  const isUpdatingSize = useRef(false);
  const mountTimeRef = useRef(Date.now());
  // Track current dimensions in refs to avoid re-creating the observer on every size change
  const currentWidthRef = useRef(object.width);
  const currentHeightRef = useRef(object.height);
  currentWidthRef.current = object.width;
  currentHeightRef.current = object.height;

  useEffect(() => {
    // Only set up ResizeObserver for auto-width and auto-height modes
    if (resizeMode === "fixed") return;
    if (!editorContainerRef.current) return;

    const editorElement = editorContainerRef.current.querySelector(
      '[data-slate-editor="true"]'
    ) as HTMLElement;
    if (!editorElement) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      // Prevent infinite loops
      if (isUpdatingSize.current) return;

      // Skip resize updates shortly after mount. This prevents a cascade of
      // ResizeObserver dispatches when many text objects load simultaneously
      // (e.g., on page refresh from persistence, or after bulk extraction).
      // The observer will pick up real content changes (editing, font changes)
      // after the skip window.
      const timeSinceMount = Date.now() - mountTimeRef.current;
      if (timeSinceMount < 2000 && !isEditing) {
        return;
      }

      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const newWidth = Math.max(1, Math.round(width * 100) / 100);
        const newHeight = Math.max(1, Math.round(height * 100) / 100);

        const curWidth = currentWidthRef.current;
        const curHeight = currentHeightRef.current;

        const RESIZE_TOLERANCE = 0.5;

        let changes: any = {};
        let previousValues: any = {};

        if (resizeMode === "auto-width") {
          if (
            Math.abs(newWidth - curWidth) > RESIZE_TOLERANCE ||
            Math.abs(newHeight - curHeight) > RESIZE_TOLERANCE
          ) {
            changes = { width: newWidth, height: newHeight };
            previousValues = { width: curWidth, height: curHeight };
          }
        } else if (resizeMode === "auto-height") {
          if (Math.abs(newHeight - curHeight) > RESIZE_TOLERANCE) {
            changes = { height: newHeight };
            previousValues = { height: curHeight };
          }
        }

        if (Object.keys(changes).length > 0) {
          isUpdatingSize.current = true;

          // Update refs immediately so the next observer callback
          // sees the dispatched values and doesn't re-fire.
          if (changes.width != null) currentWidthRef.current = changes.width;
          if (changes.height != null) currentHeightRef.current = changes.height;

          dispatch({
            type: "object.updated",
            payload: {
              id: object.id,
              changes,
              previousValues,
              context: "text-resize-observer",
            },
          });

          setSelectionUpdateTrigger((prev) => prev + 1);

          Promise.resolve().then(() => {
            isUpdatingSize.current = false;
          });
        }
      }
    });

    resizeObserver.observe(editorElement);

    return () => {
      resizeObserver.disconnect();
    };
    // Intentionally exclude object.width/height — we use refs to read current values
    // without re-creating the observer on every dimension change.
    // Must include properties that appear in the Slate `key` (fontSize, lineHeight,
    // letterSpacing) because changing them remounts Slate/Editable, destroying the
    // old DOM element the observer was watching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object.id, dispatch, resizeMode, isEditing,
      textProps.fontSize, textProps.lineHeight?.value, textProps.lineHeight?.unit,
      textProps.letterSpacing?.value]);

  // Handle Slate changes
  const handleSlateChange = useCallback((newValue: Descendant[]) => {
    setSlateValue(newValue);
  }, []);

  // Base text styles with dynamic sizing based on resize mode
  const nodeLineHeight = textProps.lineHeight || { value: 120, unit: "%" as const };
  const baseTextStyle: React.CSSProperties = {
    fontSize: textProps.fontSize || 16,
    fontFamily: textProps.fontFamily || "Inter, sans-serif",
    fontWeight: textProps.fontWeight || 400,
    textAlign: textProps.textAlign || "left",
    // Set lineHeight on the editor so paragraph <div>s inherit it.
    // Without this, paragraphs use browser-default "normal" which creates
    // a strut that can make lines taller than the leaf spans' lineHeight.
    lineHeight: lineHeightToCSSValue(nodeLineHeight),
    margin: 0,
    padding: 0,
    border: "none",
    outline: "none",
    resize: "none",
    backgroundColor: "transparent",
    whiteSpace: resizeMode === "auto-width" ? "pre" : "pre-wrap", // No wrapping for auto-width
    wordBreak: resizeMode === "auto-width" ? "normal" : "break-word",
    //  minHeight: "0",
    display: "block",

    // Dynamic sizing based on resize mode
    ...(resizeMode === "auto-width" && {
      width: "max-content",
      height: "auto",
      minWidth: "0px",
      maxWidth: "none",
      overflow: "visible",
      whiteSpace: "nowrap",
    }),

    ...(resizeMode === "auto-height" && {
      width:
        object.autoLayoutSizing?.horizontal === "fill"
          ? "100%"
          : (style.width ?? `${object.width}px`),
      height: "auto",
      minWidth:
        object.autoLayoutSizing?.horizontal === "fill"
          ? 0
          : (style.width ?? `${object.width}px`),
      maxWidth:
        object.autoLayoutSizing?.horizontal === "fill"
          ? "100%"
          : (style.width ?? `${object.width}px`),
      overflow: "visible",
    }),

    ...(resizeMode === "fixed" && {
      width:
        object.autoLayoutSizing?.horizontal === "fill"
          ? "100%"
          : (style.width ?? `${object.width}px`),
      ...(textProps.verticalAlign === "top" && {
        height:
          object.autoLayoutSizing?.vertical === "fill"
            ? "100%"
            : (style.height ?? `${object.height}px`),
        maxHeight:
          object.autoLayoutSizing?.vertical === "fill"
            ? "100%"
            : (style.height ?? `${object.height}px`),
      }),
      minWidth:
        object.autoLayoutSizing?.horizontal === "fill"
          ? 0
          : (style.width ?? `${object.width}px`),
      maxWidth:
        object.autoLayoutSizing?.horizontal === "fill"
          ? "100%"
          : (style.width ?? `${object.width}px`),
      overflow: "visible",
      boxSizing: "border-box",
    }),
  };

  // Apply formatting using Slate's native API - let Slate handle selection
  const applyTextFormatting = useCallback(
    (format: string, value: any = true) => {
      if (!editor.selection) {
        return;
      }

      try {
        // Ensure we're focused on the editor
        ReactEditor.focus(editor);

        // Apply the formatting - Slate will handle selection preservation automatically
        if (format === "bold") {
          const marks = Editor.marks(editor) as any;
          const isActive = marks?.bold === true;
          if (isActive) {
            Editor.removeMark(editor, "bold");
          } else {
            Editor.addMark(editor, "bold", true);
          }
        } else if (format === "italic") {
          const marks = Editor.marks(editor) as any;
          const isActive = marks?.italic === true;
          if (isActive) {
            Editor.removeMark(editor, "italic");
          } else {
            Editor.addMark(editor, "italic", true);
          }
        } else if (format === "underline") {
          const marks = Editor.marks(editor) as any;
          const isActive = marks?.underline === true;
          if (isActive) {
            Editor.removeMark(editor, "underline");
          } else {
            Editor.addMark(editor, "underline", true);
          }
        } else if (format === "fontSize") {
          Editor.addMark(editor, "fontSize", value);
          // Size will update automatically via ResizeObserver
        } else if (format === "fontWeight") {
          Editor.addMark(editor, "fontWeight", value);
        } else if (format === "fontFamily") {
          Editor.addMark(editor, "fontFamily", value);
          // Size will update automatically via ResizeObserver
        } else if (format === "lineHeight") {
          // Convert LineHeight object to CSS value for Slate
          const cssValue = lineHeightToCSSValue(value);
          Editor.addMark(editor, "lineHeight", cssValue);
          // Size will update automatically via ResizeObserver
        } else if (format === "letterSpacing") {
          // Convert LetterSpacing object to CSS value for Slate
          const cssValue = letterSpacingToCSSValue(value);
          Editor.addMark(editor, "letterSpacing", cssValue);
        } else if (format === "color") {
          Editor.addMark(editor, "color", value);
        }
      } catch (error) {
        console.error("🚨 Error applying text formatting:", error);
      }
    },
    [
      editor,
      slateValue,
      textProps,
      object.id,
      object.width,
      object.height,
      dispatch,
    ]
  );

  // Auto-select all text when entering edit mode using Slate's API
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  // Global interface for properties panel - always expose editor, but behavior changes based on edit mode
  useEffect(() => {

    // Always set up the global interface for this text object
    (window as any).currentTextEditor = {
      hasSelection: isEditing, // Only true when actually editing
      selectedText: "", // Will be updated by updateSelection
      applyFormatting: applyTextFormatting,
      editor: editor, // Always expose editor for advanced operations
      isEditing: isEditing,
      objectId: object.id, // For debugging
      // New function for programmatic formatting when not editing
      applyFormattingToAllText: (format: string, value?: any) => {
        // Temporarily select all text
        const end = Editor.end(editor, []);
        const start = Editor.start(editor, []);
        const originalSelection = editor.selection;
        editor.selection = { anchor: start, focus: end };

        // Apply formatting using the existing function
        applyTextFormatting(format, value);

        // Restore original selection (or clear it if not editing)
        editor.selection = isEditing ? originalSelection : null;

        // Save the updated Slate content back to the object (debounced)
        const saveTimeout = setTimeout(() => {
          const updatedSlateContent = JSON.stringify(editor.children);

          // Only save if content actually changed
          if (updatedSlateContent !== textProps.slateContent) {
            dispatch({
              type: "object.updated",
              payload: {
                id: object.id,
                changes: {
                  properties: {
                    ...textProps,
                    slateContent: updatedSlateContent,
                  } as any,
                },
                previousValues: { properties: textProps },
              },
            });
          }
        }, 50); // Increased debounce time

        // Force a size update trigger after formatting
        setTimeout(() => {
          setSelectionUpdateTrigger((prev) => prev + 1);
        }, 10);
      },
    };

    if (isEditing) {
      let lastSelectionState = "";

      const updateSelection = () => {
        // Check if we have a Slate selection that spans text (not just cursor)
        const hasSlateSelection =
          editor.selection &&
          editor.selection.anchor &&
          editor.selection.focus &&
          (editor.selection.anchor.offset !== editor.selection.focus.offset ||
            JSON.stringify(editor.selection.anchor.path) !==
              JSON.stringify(editor.selection.focus.path));

        // Get selected text using Slate's API
        const selectedText =
          hasSlateSelection && editor.selection
            ? Editor.string(editor, editor.selection)
            : "";

        // Only log when selection actually changes
        const currentSelectionState = `${hasSlateSelection}:${selectedText}`;
        if (currentSelectionState !== lastSelectionState) {
          lastSelectionState = currentSelectionState;
        }

        // Update the global interface
        if ((window as any).currentTextEditor) {
          (window as any).currentTextEditor.hasSelection =
            !!hasSlateSelection || hasAutoSelected;
          (window as any).currentTextEditor.selectedText = selectedText;
          (window as any).currentTextEditor.isAllTextSelected =
            hasAutoSelected && !!hasSlateSelection;
        }
      };

      // Update immediately and then periodically
      updateSelection();
      const interval = setInterval(updateSelection, 100);

      return () => {
        clearInterval(interval);
        delete (window as any).currentTextEditor;
      };
    }
  }, [isEditing, applyTextFormatting, editor, hasAutoSelected]);

  useEffect(() => {
    if (isEditing && !hasAutoSelected) {
      // Small delay to ensure the editor is focused and ready
      setTimeout(() => {
        try {
          // Clear any existing selection first
          editor.selection = null;

          // Force focus
          ReactEditor.focus(editor);

          // Select all content using Slate's range API
          const end = Editor.end(editor, []);
          const start = Editor.start(editor, []);
          const range = { anchor: start, focus: end };
          editor.selection = range;

          // Mark that we've auto-selected for this edit session
          setHasAutoSelected(true);
        } catch (error) {
          console.error("Error auto-selecting text:", error);
        }
      }, 150); // Slightly longer delay for reliability
    }

    // Reset auto-select flag when exiting edit mode
    if (!isEditing) {
      setHasAutoSelected(false);
    }
  }, [isEditing, hasAutoSelected, editor]);

  // Render leaf function for formatting
  const renderLeaf = useCallback(
    ({ attributes, children, leaf }: any) => {
      let style: React.CSSProperties = {};

      if (leaf.bold) style.fontWeight = "bold";
      if (leaf.italic) style.fontStyle = "italic";
      if (leaf.underline)
        style.textDecoration = (style.textDecoration || "") + " underline";
      if (leaf.fontSize) {
        style.fontSize = `${leaf.fontSize}px`;
      }
      if (leaf.lineHeight) {
        // Use the explicit leaf-level line height mark
        style.lineHeight = leaf.lineHeight;
      } else {
        // Use the node-level default line height from object properties
        const defaultLineHeight = textProps.lineHeight || {
          value: 120,
          unit: "%",
        };
        style.lineHeight = lineHeightToCSSValue(defaultLineHeight);
      }
      if (leaf.fontWeight) style.fontWeight = leaf.fontWeight;
      if (leaf.fontFamily) style.fontFamily = leaf.fontFamily;
      if (leaf.color) style.color = leaf.color;
      if (leaf.letterSpacing) {
        // Handle both string values (legacy) and LetterSpacing objects
        if (typeof leaf.letterSpacing === "string") {
          style.letterSpacing = leaf.letterSpacing;
        } else {
          const cssValue = letterSpacingToCSSValue(leaf.letterSpacing);
          style.letterSpacing = cssValue;
        }
      }

      // If no leaf-level letter spacing is set, use the node-level default
      if (!leaf.letterSpacing) {
        const defaultLetterSpacing = textProps.letterSpacing || {
          value: 0,
          unit: "px",
        };
        style.letterSpacing = letterSpacingToCSSValue(defaultLetterSpacing);
      }

      return (
        <span {...attributes} style={style}>
          {children}
        </span>
      );
    },
    [textProps]
  );

  // Toggle for testing - remove in production
  const useCustomSelection = false; // Set to false to use default browser selection

  return (
    <div
      ref={editorContainerRef}
      className={baseClasses}
      style={{
        ...style,
        pointerEvents: "auto",
        // Keep absolute positioning from style prop - don't override with relative
        // Apply node-level blend mode
        ...(object.blendMode &&
          object.blendMode !== "normal" && {
            mixBlendMode:
              object.blendMode as React.CSSProperties["mixBlendMode"],
          }),
        // Apply effects (shadows, blurs)
        ...effectsToCssStyles(object.effects),

        // Apply resize mode constraints and vertical alignment to container.
        // Use style.width / style.height (from CanvasObject) when available
        // so live resize dimensions are reflected during drag, not just on release.
        ...(resizeMode === "fixed" && {
          width:
            object.autoLayoutSizing?.horizontal === "fill"
              ? "100%"
              : (style.width ?? `${object.width}px`),
          height:
            object.autoLayoutSizing?.vertical === "fill"
              ? "100%"
              : (style.height ?? `${object.height}px`),
          maxWidth:
            object.autoLayoutSizing?.horizontal === "fill"
              ? "100%"
              : (style.width ?? `${object.width}px`),
          maxHeight:
            object.autoLayoutSizing?.vertical === "fill"
              ? "100%"
              : (style.height ?? `${object.height}px`),
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent:
            textProps.verticalAlign === "top"
              ? "flex-start"
              : textProps.verticalAlign === "middle"
              ? "center"
              : textProps.verticalAlign === "bottom"
              ? "flex-end"
              : "flex-start",
        }),

        ...(resizeMode === "auto-height" && {
          width:
            object.autoLayoutSizing?.horizontal === "fill"
              ? "100%"
              : (style.width ?? `${object.width}px`),
          minWidth:
            object.autoLayoutSizing?.horizontal === "fill"
              ? 0
              : (style.width ?? `${object.width}px`),
          maxWidth:
            object.autoLayoutSizing?.horizontal === "fill"
              ? "100%"
              : (style.width ?? `${object.width}px`),
          overflow: "visible",
        }),

        ...(resizeMode === "auto-width" && {
          width: isEditing ? "max-content" : style.width,
          minWidth: isEditing ? "0px" : style.minWidth,
          maxWidth: isEditing ? "800px" : style.maxWidth,
          overflow: isEditing ? "visible" : "visible",
          whiteSpace: isEditing ? "nowrap" : style.whiteSpace,
        }),
      }}
      data-object-id={object.id}
      data-object-type={object.type}
      data-locked={object.locked}
      data-nested={false}
      onPointerDown={(e) => {
        setIsMouseDownInEditor(true);
        // Don't stop propagation - let Slate handle the click
      }}
      onPointerUp={(e) => {
        setIsMouseDownInEditor(false);
        // Don't stop propagation - let Slate handle the release
      }}
      onPointerMove={(e) => {
        if (isEditing) {
          // Only stop propagation during move to prevent Canvas drag interference
          e.stopPropagation();
        }
      }}
    >
      {/* Custom Caret Styles */}
      {isEditing && (
        <style>
          {`
            .custom-caret-editor {
              caret-color: transparent;
            }
            @keyframes blink {
              0%, 50% { opacity: 1; }
              51%, 100% { opacity: 0; }
            }
          `}
        </style>
      )}

      {/* Hide default browser selection when using custom selection */}
      {customSelectionActive && (
        <style>
          {`
            .custom-selection-active ::selection {
              background: transparent;
            }
            .custom-selection-active ::-moz-selection {
              background: transparent;
            }
          `}
        </style>
      )}

      {/* Custom Selection Overlay */}
      <CustomTextSelection
        editor={editor}
        selection={editor.selection}
        containerRef={editorContainerRef}
        isActive={isEditing && customSelectionActive}
        scale={viewportZoom}
        updateTrigger={selectionUpdateTrigger} // Force recalculation after size updates
      />

      <Slate
        key={`${object.id}-${textProps.fontSize}-${textProps.lineHeight?.value}-${textProps.letterSpacing?.value}`}
        editor={editor}
        initialValue={slateValue}
        onChange={handleSlateChange}
        onSelectionChange={() => {
          // Update selection for properties panel - reduced logging
          const selection = window.getSelection();
          const hasSelection = selection && !selection.isCollapsed;
          const selectedText = hasSelection ? selection.toString() : "";

          // Control custom selection visibility
          // Disable CustomTextSelection when TypographyPanel handles overlays
          setCustomSelectionActive(false);

          if ((window as any).currentTextEditor) {
            (window as any).currentTextEditor.hasSelection = !!hasSelection;
            (window as any).currentTextEditor.selectedText = selectedText;
          }
        }}
      >
        <Editable
          style={baseTextStyle}
          className={`${
            customSelectionActive ? "custom-selection-active" : ""
          } ${isEditing ? "custom-caret-editor" : ""}`}
          renderLeaf={renderLeaf}
          readOnly={!isEditing}
          autoFocus={isEditing}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              exitEditMode();
            }
          }}
          onBlur={handleBlur}
          onFocus={() => {}}
          onMouseDown={() => {}}
          onMouseUp={() => {}}
          onClick={() => {}}
        />
      </Slate>
    </div>
  );
}
