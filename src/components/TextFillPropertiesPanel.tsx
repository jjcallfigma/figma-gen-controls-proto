"use client";

import { useAppStore } from "@/core/state/store";
import { createSolidFill } from "@/core/utils/fills";
import { CanvasObject } from "@/types/canvas";
import Color from "color";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Editor, Text, Transforms } from "slate";
import FillPopoverContent from "./ui/FillPopoverContent";
import FillTrigger from "./ui/FillTrigger";
import PropertyPopover from "./ui/PropertyPopover";
import PropertyPopoverHeader from "./ui/PropertyPopoverHeader";

interface TextFillPropertiesPanelProps {
  objects: CanvasObject[];
}

// Helper functions to convert between hex and rgba
const hexToRgba = (hex: string, alpha: number = 1) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b, a: alpha };
};

const rgbaToHex = (rgba: { r: number; g: number; b: number; a: number }) => {
  return Color.rgb(rgba.r, rgba.g, rgba.b).hex().toUpperCase();
};

export default function TextFillPropertiesPanel({
  objects,
}: TextFillPropertiesPanelProps) {
  const dispatch = useAppStore((state) => state.dispatch);
  const fillSectionRef = useRef<HTMLDivElement>(null);

  // State for color picker popover
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 });

  // State for text selection and current styles
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const [currentStyles, setCurrentStyles] = useState<any>({});
  const [isEditingText, setIsEditingText] = useState(false);

  // Prevent selection monitoring during property panel interactions
  const isEditingInPropertiesRef = useRef(false);

  // Save text selection when opening popover
  const savedTextSelectionRef = useRef<any>(null);

  // Extract text color and convert to fill format
  const textFill = useMemo(() => {
    if (objects.length === 0) return null;

    // If text is being edited and we have current selection styles, use those
    if (isEditingText && currentStyles.color) {
      const color =
        currentStyles.color === "mixed" ? "#000000" : currentStyles.color;
      const fill = createSolidFill(color, 1, true);

      console.log("🎨 TEXT FILL FROM SELECTION:", {
        isEditingText,
        currentStyles,
        resultColor: color,
        isMixed: currentStyles.color === "mixed",
      });

      if (currentStyles.color === "mixed") {
        return { ...fill, mixed: true };
      }
      return fill;
    }

    // Get the first text object's color
    const textObject = objects[0];
    if (textObject.type !== "text" || !textObject.properties) return null;

    const textProps = textObject.properties as any;

    // Try to get color from rich text content first
    let color = "#000000"; // Default black
    let opacity = 1;

    // Check if there's Slate content with color information
    if (textProps.slateContent) {
      try {
        const slateData = JSON.parse(textProps.slateContent);
        // Look for color in the first text leaf
        if (slateData && slateData.length > 0) {
          const firstNode = slateData[0];
          if (firstNode.children && firstNode.children.length > 0) {
            const firstLeaf = firstNode.children[0];
            if (firstLeaf.color) {
              color = firstLeaf.color;
            }
          }
        }
      } catch (e) {
        console.warn("Failed to parse slate content for color:", e);
      }
    }

    // Check if all selected text objects have the same color
    const isMixed =
      objects.length > 1 &&
      objects.some((obj) => {
        if (obj.type !== "text" || !obj.properties) return false;
        const objProps = obj.properties as any;

        // Get color from this object's slate content
        let objColor = "#000000";
        if (objProps.slateContent) {
          try {
            const slateData = JSON.parse(objProps.slateContent);
            if (slateData && slateData.length > 0) {
              const firstNode = slateData[0];
              if (firstNode.children && firstNode.children.length > 0) {
                const firstLeaf = firstNode.children[0];
                if (firstLeaf.color) {
                  objColor = firstLeaf.color;
                }
              }
            }
          } catch (e) {
            console.warn("Failed to parse slate content for color:", e);
          }
        }

        return objColor !== color;
      });

    const fill = createSolidFill(color, opacity, true);

    if (isMixed) {
      // Add a mixed property to indicate mixed state
      return { ...fill, mixed: true };
    }

    return fill;
  }, [objects, isEditingText, currentStyles, activePopover]); // Add activePopover to force updates

  // Check if any text object is currently being edited
  const hasEditingText = objects.some(
    (obj) =>
      obj.type === "text" && obj.properties && (obj.properties as any).isEditing
  );

  // Monitor text selection state and current styles
  useEffect(() => {
    const checkTextSelection = async () => {
      // Don't update styles if we're editing in properties panel
      if (isEditingInPropertiesRef.current) {
        return;
      }

      if ((window as any).currentTextEditor) {
        const editor = (window as any).currentTextEditor;
        const currentHasSelection = editor.hasSelection;
        const editing = editor.isEditing;

        setHasTextSelection(currentHasSelection);
        setIsEditingText(editing);

        // Get current color from selection or cursor position
        if (editor.editor?.selection) {
          try {
            // Use the same logic as TypographyPanel to get current styles
            if (currentHasSelection) {
              // Get color from selected text
              const selectedNodes = Array.from(
                Editor.nodes(editor.editor, {
                  at: editor.editor.selection,
                  match: (n: any) => Text.isText(n),
                })
              );

              if (selectedNodes.length > 0) {
                const colors = selectedNodes.map(
                  (entry: any) => entry[0].color || "#000000"
                );
                const uniqueColors = [...new Set(colors)];

                console.log("🎨 DETECTED SELECTION COLORS:", {
                  colors,
                  uniqueColors,
                  hasSelection: currentHasSelection,
                });

                if (uniqueColors.length === 1) {
                  setCurrentStyles({ color: uniqueColors[0] });
                } else {
                  setCurrentStyles({ color: "mixed" });
                }
              }
            } else {
              // Get color at cursor position
              const marks = Editor.marks(editor.editor) || {};
              const cursorColor = (marks as any).color || "#000000";
              console.log("🎨 DETECTED CURSOR COLOR:", cursorColor);
              setCurrentStyles({ color: cursorColor });
            }
          } catch (e) {
            // Fallback to default
            setCurrentStyles({ color: "#000000" });
          }
        }
      } else {
        setHasTextSelection(false);
        setIsEditingText(false);
        setCurrentStyles({});
      }
    };

    if (hasEditingText) {
      const interval = setInterval(checkTextSelection, 100);
      return () => clearInterval(interval);
    }
  }, [hasEditingText]);

  // Save current text selection
  const saveSelection = useCallback(() => {
    if ((window as any).currentTextEditor?.editor) {
      const editor = (window as any).currentTextEditor.editor;
      if (editor.selection) {
        const newSelection = { ...editor.selection };
        const wasAlreadySaved = !!savedTextSelectionRef.current;
        const isSameAsBefore =
          wasAlreadySaved &&
          JSON.stringify(savedTextSelectionRef.current) ===
            JSON.stringify(newSelection);

        savedTextSelectionRef.current = newSelection;
        console.log("💾 SAVED TEXT SELECTION:", {
          selection: savedTextSelectionRef.current,
          anchor: savedTextSelectionRef.current.anchor,
          focus: savedTextSelectionRef.current.focus,
          isCollapsed:
            savedTextSelectionRef.current.anchor.offset ===
              savedTextSelectionRef.current.focus.offset &&
            JSON.stringify(savedTextSelectionRef.current.anchor.path) ===
              JSON.stringify(savedTextSelectionRef.current.focus.path),
          wasAlreadySaved,
          isSameAsBefore,
          saveReason: wasAlreadySaved
            ? isSameAsBefore
              ? "same-selection"
              : "selection-changed"
            : "first-save",
        });
      } else {
        console.log("⚠️ NO SELECTION TO SAVE - editor.selection is null");
      }
    } else {
      console.log("⚠️ NO TEXT EDITOR TO SAVE FROM");
    }
  }, []);

  // Restore text selection after property panel interaction
  const restoreSelection = useCallback(() => {
    if (
      (window as any).currentTextEditor?.editor &&
      savedTextSelectionRef.current
    ) {
      const editor = (window as any).currentTextEditor.editor;

      try {
        console.log(
          "✅ RESTORING TEXT SELECTION:",
          savedTextSelectionRef.current
        );
        // Restore the saved selection using Slate's Transforms
        Transforms.select(editor, savedTextSelectionRef.current);

        // Focus the editor
        const editorElement = document.querySelector(
          '[data-slate-editor="true"]'
        ) as HTMLElement;
        if (editorElement) {
          editorElement.focus();
        }

        console.log("✅ SELECTION RESTORED SUCCESSFULLY - EDITOR FOCUSED");
      } catch (error) {
        console.warn("Could not restore text selection:", error);
        // Fallback: just focus the editor
        const editorElement = document.querySelector(
          '[data-slate-editor="true"]'
        ) as HTMLElement;
        if (editorElement) {
          editorElement.focus();
        }
      }
    } else {
      console.warn("⚠️ CANNOT RESTORE SELECTION:", {
        hasTextEditor: !!(window as any).currentTextEditor?.editor,
        hasSavedSelection: !!savedTextSelectionRef.current,
        savedSelection: savedTextSelectionRef.current,
      });
    }
  }, []);

  // Apply formatting to selected text or current cursor position
  const applyFormatting = useCallback(
    (command: string, value?: any) => {
      // Check if we have the global text editor interface
      if ((window as any).currentTextEditor) {
        const editor = (window as any).currentTextEditor.editor;
        const isEditing = (window as any).currentTextEditor.isEditing;

        // Check if there's an active selection in the editor (same logic as TextRenderer)
        const hasActiveSelection =
          isEditing &&
          editor?.selection &&
          editor.selection.anchor &&
          editor.selection.focus &&
          (editor.selection.anchor.offset !== editor.selection.focus.offset ||
            JSON.stringify(editor.selection.anchor.path) !==
              JSON.stringify(editor.selection.focus.path));

        console.log("🎯 APPLY FORMATTING DECISION:", {
          command,
          value,
          isEditing,
          hasActiveSelection,
          hasTextSelection,
          editorSelection: editor?.selection,
          currentEditorSelection: editor?.selection
            ? {
                anchor: editor.selection.anchor,
                focus: editor.selection.focus,
                isCollapsed:
                  editor.selection.anchor.offset ===
                    editor.selection.focus.offset &&
                  JSON.stringify(editor.selection.anchor.path) ===
                    JSON.stringify(editor.selection.focus.path),
              }
            : null,
          savedSelection: savedTextSelectionRef.current,
        });

        if (isEditing && hasActiveSelection) {
          // When editing with selection, apply only to selected text
          console.log("✅ APPLYING TO SELECTION");
          (window as any).currentTextEditor.applyFormatting(command, value);
        } else if (isEditing && !hasActiveSelection) {
          // When editing but no selection (cursor only), apply to cursor position
          console.log("✅ APPLYING TO CURSOR POSITION");
          (window as any).currentTextEditor.applyFormatting(command, value);
        } else {
          // When not editing, apply to all text
          console.log("✅ APPLYING TO ALL TEXT");
          (window as any).currentTextEditor.applyFormattingToAllText(
            command,
            value
          );
        }
        return;
      }
    },
    [hasTextSelection]
  );

  const openPopover = (event: React.MouseEvent) => {
    if (!textFill) return;

    // If text is not in edit mode, we can still work with it via the fallback path
    // Save current selection before opening popover
    saveSelection();

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const x = rect.left;
    const y = rect.bottom + 8;

    setPickerPosition({ x, y });
    setActivePopover("text-color");
  };

  const closePopover = () => {
    setActivePopover(null);
    isEditingInPropertiesRef.current = false;
  };

  const handleColorChange = (color: string) => {
    // Check if this is the first change or a subsequent one
    const colorChangeCount = (handleColorChange as any).callCount || 0;
    (handleColorChange as any).callCount = colorChangeCount + 1;

    console.log("🎨 HANDLE COLOR CHANGE:", {
      color,
      changeNumber: colorChangeCount + 1,
      isEditingText,
      hasTextEditor: !!(window as any).currentTextEditor,
      isEditingInProperties: isEditingInPropertiesRef.current,
      savedSelection: !!savedTextSelectionRef.current,
      savedSelectionDetails: savedTextSelectionRef.current,
      currentStyles,
      currentEditorSelection: (window as any).currentTextEditor?.editor
        ?.selection,
      editorSelectionsMatch:
        savedTextSelectionRef.current &&
        (window as any).currentTextEditor?.editor?.selection
          ? JSON.stringify(savedTextSelectionRef.current) ===
            JSON.stringify((window as any).currentTextEditor.editor.selection)
          : null,
    });

    // Debug which path we're taking
    console.log("🔍 CHECKING PATHS:", {
      hasTextEditor: !!(window as any).currentTextEditor,
      isEditingText,
      willUseFormattingAPI:
        !!(window as any).currentTextEditor && isEditingText,
      willUseFallback: !((window as any).currentTextEditor && isEditingText),
    });

    // If we have a text editor active and text is being edited, use the formatting API
    if ((window as any).currentTextEditor && isEditingText) {
      console.log(
        "🔄 TAKING FORMATTING API PATH - ABOUT TO RESTORE SELECTION AND APPLY COLOR"
      );

      // Check if current editor selection differs from saved selection
      const currentEditorSelection = (window as any).currentTextEditor.editor
        .selection;
      if (currentEditorSelection && savedTextSelectionRef.current) {
        const selectionsMatch =
          JSON.stringify(savedTextSelectionRef.current) ===
          JSON.stringify(currentEditorSelection);
        console.log("🔍 SELECTION COMPARISON:", {
          selectionsMatch,
          savedSelection: savedTextSelectionRef.current,
          currentSelection: currentEditorSelection,
        });

        if (!selectionsMatch) {
          console.log("⚠️ SELECTION DRIFTED - UPDATING SAVED SELECTION");
          savedTextSelectionRef.current = { ...currentEditorSelection };
        }
      }

      // CRITICAL: Restore selection on every color change (like TypographyPanel)
      restoreSelection();

      // Check if selection was actually restored
      const editorAfterRestore = (window as any).currentTextEditor.editor;
      console.log("🔍 SELECTION AFTER RESTORE:", {
        hasSelection: !!editorAfterRestore?.selection,
        selection: editorAfterRestore?.selection,
        isCollapsed: editorAfterRestore?.selection
          ? editorAfterRestore.selection.anchor.offset ===
              editorAfterRestore.selection.focus.offset &&
            JSON.stringify(editorAfterRestore.selection.anchor.path) ===
              JSON.stringify(editorAfterRestore.selection.focus.path)
          : null,
      });

      applyFormatting("color", color);

      // Update current styles immediately to reflect the change in the picker
      setCurrentStyles({ color });
      console.log("🎨 UPDATED CURRENT STYLES TO:", { color });

      return;
    }

    console.log("🔄 TAKING FALLBACK PATH - NO FORMATTING API AVAILABLE");

    // Fallback: Update text color directly via Slate content
    // Check if we have saved selection data to apply to specific range
    if (savedTextSelectionRef.current && objects.length === 1) {
      const object = objects[0];
      if (object.type === "text" && object.properties) {
        const textProps = object.properties as any;

        console.log("🎨 FALLBACK: APPLYING COLOR TO SAVED SELECTION RANGE:", {
          color,
          savedSelection: savedTextSelectionRef.current,
          objectId: object.id,
        });

        if (textProps.slateContent) {
          try {
            const slateData = JSON.parse(textProps.slateContent);
            const selection = savedTextSelectionRef.current;

            // For now, implement a simpler approach: if we have saved selection,
            // we know user intended to change selection color, so apply to the target leaf
            const updateTargetLeafColor = (
              nodes: any[],
              targetPath: number[]
            ) => {
              const targetNode = nodes[targetPath[0]];
              if (targetNode && targetNode.children && targetPath.length > 1) {
                // Navigate deeper
                const remainingPath = targetPath.slice(1);
                updateTargetLeafColor(targetNode.children, remainingPath);
              } else if (targetNode && targetNode.text !== undefined) {
                // Found the target leaf
                console.log("🎯 APPLYING COLOR TO TARGET LEAF:", {
                  targetPath,
                  leafText: targetNode.text,
                  newColor: color,
                });
                targetNode.color = color;
              }
            };

            // Apply color to the leaf at the anchor path
            updateTargetLeafColor(slateData, selection.anchor.path);

            dispatch({
              type: "object.updated",
              payload: {
                id: object.id,
                changes: {
                  properties: {
                    ...textProps,
                    slateContent: JSON.stringify(slateData),
                  },
                },
                previousValues: {
                  properties: textProps,
                },
              },
            });

            return; // Early return after applying to selection
          } catch (e) {
            console.warn("Failed to update text color in selection range:", e);
          }
        }
      }
    }

    // Final fallback: Update text color for all selected text objects
    console.log("🎨 FINAL FALLBACK: APPLYING COLOR TO ALL TEXT");
    objects.forEach((object) => {
      if (object.type !== "text" || !object.properties) return;

      const textProps = object.properties as any;

      // Update color in Slate content
      if (textProps.slateContent) {
        try {
          const slateData = JSON.parse(textProps.slateContent);

          // Update color in all text leaves
          const updateLeafColor = (node: any) => {
            if (node.children) {
              node.children.forEach((child: any) => {
                if (child.text !== undefined) {
                  // This is a leaf node
                  child.color = color;
                } else {
                  // This is a parent node, recurse
                  updateLeafColor(child);
                }
              });
            }
          };

          slateData.forEach((node: any) => updateLeafColor(node));

          dispatch({
            type: "object.updated",
            payload: {
              id: object.id,
              changes: {
                properties: {
                  ...textProps,
                  slateContent: JSON.stringify(slateData),
                },
              },
              previousValues: {
                properties: textProps,
              },
            },
          });
        } catch (e) {
          console.warn("Failed to update text color in slate content:", e);
        }
      }
    });
  };

  const handleRgbaColorChange = (rgba: {
    r: number;
    g: number;
    b: number;
    a: number;
  }) => {
    const hexColor = rgbaToHex(rgba);
    handleColorChange(hexColor);
  };

  const handleOpacityChange = (opacity: number) => {
    // For text, we might want to handle opacity differently
    // For now, we'll just treat it as alpha in the color
    console.log("Text opacity change:", opacity);
    // TODO: Implement text opacity if needed
  };

  if (!textFill) {
    return null;
  }

  return (
    <div className="" ref={fillSectionRef}>
      <div
        className="text-xs font-medium text-gray-900 h-10 grid grid-cols-[1fr_auto] items-center pl-4 pr-2"
        style={{
          color: "var(--color-text)",
        }}
      >
        <div className="hover:text-default">
          Fill
          {isEditingText && hasTextSelection && (
            <span className="ml-1 text-xs text-blue-500">(Selection)</span>
          )}
          {isEditingText && !hasTextSelection && (
            <span className="ml-1 text-xs text-secondary">(Cursor)</span>
          )}
        </div>
      </div>

      {/* Text Color Popover */}
      <PropertyPopover
        isOpen={activePopover !== null}
        onClose={closePopover}
        position={pickerPosition}
        onPositionChange={setPickerPosition}
        width={240}
        protectedZoneRef={fillSectionRef}
        debug={true}
      >
        <PropertyPopoverHeader onClose={closePopover} />

        <FillPopoverContent
          activeTab="solid" // Text only supports solid colors
          onTabChange={() => {
            // Text only supports solid colors, so no tab changes
          }}
          activeFill={textFill}
          onBlendModeChange={() => {
            // Text doesn't support blend modes for now
          }}
          onColorChange={handleColorChange}
          onRgbaChange={handleRgbaColorChange}
          onImageFitChange={() => {}}
          onImageRotation={() => {}}
          onImageUpload={() => {}}
          onImageAdjustmentChange={() => {}}
        />
      </PropertyPopover>

      <div className="">
        <div className="grid grid-cols-[1fr_auto] gap-2 h-8 items-center pl-4 pr-2">
          <div
            onFocus={() => {
              isEditingInPropertiesRef.current = true;
              restoreSelection();
            }}
            onBlur={() => {
              isEditingInPropertiesRef.current = false;
            }}
          >
            <FillTrigger
              fill={textFill}
              onTriggerClick={(e) => {
                console.log("🖱️ TRIGGER CLICK - OPENING COLOR PICKER");
                isEditingInPropertiesRef.current = true;
                saveSelection(); // Save selection first
                restoreSelection(); // Then restore to ensure focus
                openPopover(e);
              }}
              onColorChange={handleColorChange}
              onOpacityChange={handleOpacityChange}
              size="sm"
              showLabel={true}
              showOpacity={false} // Text color doesn't need opacity for now
            />
          </div>
        </div>
      </div>
    </div>
  );
}
