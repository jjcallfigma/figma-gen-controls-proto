"use client";

import { useAppStore } from "@/core/state/store";
import { resolveTextValues } from "@/core/utils/propertyUtils";
import { LetterSpacing, LineHeight } from "@/types/canvas";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor, Text, Transforms } from "slate";
import { Icon24TextAlignBottom } from "./icons/icon-24-text-align-bottom";
import { Icon24TextAlignCenter } from "./icons/icon-24-text-align-center";
import { Icon24TextAlignLeft } from "./icons/icon-24-text-align-left";
import { Icon24TextAlignMiddle } from "./icons/icon-24-text-align-middle";
import { Icon24TextAlignRight } from "./icons/icon-24-text-align-right";
import { Icon24TextAlignTop } from "./icons/icon-24-text-align-top";
import { Icon24TextLetterSpacing } from "./icons/icon-24-text-letter-spacing";
import { Icon24TextLineHeight } from "./icons/icon-24-text-line-height";
import { PropertyInput } from "./ui/PropertyInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

// Helper functions for LineHeight handling
function parseLineHeight(input: string): LineHeight {
  const trimmed = input.trim();
  if (trimmed.endsWith("%")) {
    const value = parseFloat(trimmed.slice(0, -1));
    return { value: isNaN(value) ? 100 : value, unit: "%" };
  } else {
    const value = parseFloat(trimmed);
    return { value: isNaN(value) ? 16 : value, unit: "px" };
  }
}

function formatLineHeight(lineHeight: LineHeight): string {
  if (lineHeight.unit === "%") {
    return `${lineHeight.value}%`;
  } else {
    return lineHeight.value.toString();
  }
}

function lineHeightToCSSValue(
  lineHeight: LineHeight,
  fontSize?: number
): string | number {
  if (lineHeight.unit === "%") {
    return lineHeight.value / 100; // Convert percentage to ratio
  } else {
    return `${lineHeight.value}px`; // Use px value with unit for CSS
  }
}

// Helper functions for LetterSpacing handling
function parseLetterSpacing(input: string): LetterSpacing {
  const trimmed = input.trim();
  if (trimmed.endsWith("%")) {
    const value = parseFloat(trimmed.slice(0, -1));
    return { value: isNaN(value) ? 0 : value, unit: "%" };
  } else {
    const value = parseFloat(trimmed);
    return { value: isNaN(value) ? 0 : value, unit: "px" };
  }
}

function formatLetterSpacing(letterSpacing: LetterSpacing): string {
  // Handle edge cases where letterSpacing might be malformed
  if (!letterSpacing || typeof letterSpacing.value === "undefined") {
    return "0";
  }

  if (letterSpacing.unit === "%") {
    return `${letterSpacing.value}%`;
  } else {
    return letterSpacing.value.toString();
  }
}

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

/**
 * Calculate the tallest element on a visual line with its position
 */
function calculateTallestOnVisualLineWithPosition(selectionRects: DOMRect[]): {
  height: number;
  top: number;
} {
  try {
    if (!selectionRects.length) {
      return { height: 0, top: 0 };
    }

    console.log(
      `🎯 BROWSER-BASED HEIGHT CALCULATION: Using ${selectionRects.length} browser selection rects`
    );

    // Debug: Log all selection rect heights to see what browser is giving us
    selectionRects.forEach((rect, i) => {
      console.log(
        `  📊 Selection rect ${i}: height=${rect.height.toFixed(
          1
        )}, top=${rect.top.toFixed(1)}`
      );
    });

    // Always check if the line itself has mixed text sizes (not just the selection)
    const minHeight = Math.min(...selectionRects.map((r) => r.height));
    const maxHeight = Math.max(...selectionRects.map((r) => r.height));

    console.log(
      `🔍 SELECTION ANALYSIS: min=${minHeight.toFixed(
        1
      )}, max=${maxHeight.toFixed(1)}`
    );

    // Always check line element height - if it's significantly larger than our selection,
    // it means there's taller text on the line that we should respect
    try {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;

        // Find the containing line element (Slate paragraph)
        let lineElement =
          container.nodeType === Node.TEXT_NODE
            ? container.parentElement
            : (container as Element);
        while (
          lineElement &&
          !lineElement.closest('[data-slate-node="element"]')
        ) {
          lineElement = lineElement.parentElement;
        }

        if (lineElement) {
          const lineElementContainer = lineElement.closest(
            '[data-slate-node="element"]'
          );
          if (lineElementContainer) {
            const lineRect = lineElementContainer.getBoundingClientRect();
            console.log(
              `📏 LINE ELEMENT HEIGHT: ${lineRect.height.toFixed(1)}`
            );

            // Use line element height if it's significantly larger than our max selection height
            // This means there's taller text on the line that affects the line box
            if (lineRect.height > maxHeight + 5) {
              console.log(
                `✅ USING LINE ELEMENT HEIGHT (line has taller text): ${lineRect.height.toFixed(
                  1
                )} (selection max was ${maxHeight.toFixed(1)})`
              );
              return { height: lineRect.height, top: lineRect.top };
            } else {
              console.log(
                `🎯 USING SELECTION HEIGHT (line matches selection): ${maxHeight.toFixed(
                  1
                )}`
              );
            }
          }
        }
      }
    } catch (error) {
      console.warn("Error getting line element height:", error);
    }

    // Fallback: use tallest selection rectangle
    const tallestRect = selectionRects.reduce((tallest, rect) =>
      rect.height > tallest.height ? rect : tallest
    );

    console.log(
      `✅ USING TALLEST SELECTION RECT: height=${tallestRect.height.toFixed(
        1
      )}, top=${tallestRect.top.toFixed(1)}`
    );

    return { height: tallestRect.height, top: tallestRect.top };
  } catch (error) {
    console.warn("Error using browser selection heights:", error);
    return {
      height: Math.max(...selectionRects.map((r) => r.height)),
      top: Math.min(...selectionRects.map((r) => r.top)),
    };
  }
}

/**
 * Calculate the tallest element on a visual line regardless of selection
 */
function calculateTallestOnVisualLine(lineBaseline: number): number {
  try {
    const textEditor = document.querySelector('[data-slate-editor="true"]');
    if (!textEditor) {
      return 0; // No minimum fallback height
    }

    console.log(
      `🔍 Finding tallest element on visual line at ${lineBaseline.toFixed(1)}`
    );

    const walker = document.createTreeWalker(
      textEditor,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      null
    );

    let maxHeight = 0; // Start with no minimum constraint
    let elementsFound = 0;

    let node;
    while ((node = walker.nextNode())) {
      try {
        let nodeRect: DOMRect;

        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          nodeRect = range.getBoundingClientRect();
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          nodeRect = (node as Element).getBoundingClientRect();
        } else {
          continue;
        }

        if (nodeRect.height > 0) {
          // Check if this element is on the same visual line
          const nodeTop = nodeRect.top;
          const nodeBottom = nodeRect.top + nodeRect.height;

          // Create a theoretical "line zone" around our baseline
          const lineZoneTop = lineBaseline - 20; // 20px above baseline
          const lineZoneBottom = lineBaseline + 80; // 80px below baseline (for tall elements)

          // Check if the element intersects with our line zone
          const intersects = !(
            nodeBottom <= lineZoneTop || nodeTop >= lineZoneBottom
          );
          const overlapHeight = intersects
            ? Math.min(nodeBottom, lineZoneBottom) -
              Math.max(nodeTop, lineZoneTop)
            : 0;

          // If there's any intersection with our line zone, consider it on the same line
          if (intersects && overlapHeight > 0) {
            elementsFound++;
            const oldMax = maxHeight;
            maxHeight = Math.max(maxHeight, nodeRect.height);

            console.log(
              `  📝 Element on line: height=${nodeRect.height.toFixed(
                1
              )}px, top=${nodeRect.top.toFixed(
                1
              )}, overlap=${overlapHeight.toFixed(1)}px ${
                nodeRect.height > oldMax ? "(NEW MAX!)" : ""
              }`
            );
          } else {
            console.log(
              `  ❌ Element EXCLUDED: height=${nodeRect.height.toFixed(
                1
              )}px, top=${nodeRect.top.toFixed(
                1
              )}, lineZone=${lineZoneTop.toFixed(1)}-${lineZoneBottom.toFixed(
                1
              )}, intersects=${intersects}`
            );
          }
        }
      } catch (e) {
        continue;
      }
    }

    console.log(
      `✅ Visual line scan complete: found ${elementsFound} elements, max height: ${maxHeight.toFixed(
        1
      )}px`
    );
    return maxHeight;
  } catch (error) {
    console.warn("Error calculating visual line height:", error);
    return 20; // Fallback
  }
}

/**
 * Calculate the actual tallest height on a line by scanning ALL elements, not just selected ones
 */
function calculateLineHeightSimple(selectionGroup: DOMRect[]): number {
  try {
    const textEditor = document.querySelector('[data-slate-editor="true"]');
    if (!textEditor || selectionGroup.length === 0) {
      return Math.max(...selectionGroup.map((r) => r.height));
    }

    // Use the selection's line position to find other elements on the same visual line
    const lineBaseline = selectionGroup[0].top;

    console.log(
      `🔍 Finding tallest element on line at ${lineBaseline.toFixed(
        1
      )} (NO tolerance - exact match only)`
    );

    // Get ALL elements (not just text nodes) that might be on this line
    const walker = document.createTreeWalker(
      textEditor,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      null
    );

    let maxHeight = Math.max(...selectionGroup.map((r) => r.height));
    let nodesFound = 0;

    let node;
    while ((node = walker.nextNode())) {
      try {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
          // Text node - create range to get its bounds
          const range = document.createRange();
          range.selectNodeContents(node);
          const nodeRect = range.getBoundingClientRect();

          const topDifference = Math.abs(nodeRect.top - lineBaseline);
          if (nodeRect.height > 0 && nodeRect.top === lineBaseline) {
            nodesFound++;
            const oldMax = maxHeight;
            maxHeight = Math.max(maxHeight, nodeRect.height);

            console.log(
              `  📝 Text node: top=${nodeRect.top.toFixed(
                1
              )}, height=${nodeRect.height.toFixed(
                1
              )}, diff=${topDifference.toFixed(1)}px ${
                nodeRect.height > oldMax ? "(NEW MAX!)" : ""
              }`
            );
          } else if (nodeRect.height > 0) {
            console.log(
              `  ❌ Text node EXCLUDED: top=${nodeRect.top.toFixed(
                1
              )}, height=${nodeRect.height.toFixed(
                1
              )}, diff=${topDifference.toFixed(1)}px (not exact match)`
            );
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // Element node - get its bounds directly
          const nodeRect = (node as Element).getBoundingClientRect();

          const topDifference = Math.abs(nodeRect.top - lineBaseline);
          if (nodeRect.height > 0 && nodeRect.top === lineBaseline) {
            nodesFound++;
            const oldMax = maxHeight;
            maxHeight = Math.max(maxHeight, nodeRect.height);

            console.log(
              `  🔷 Element node: top=${nodeRect.top.toFixed(
                1
              )}, height=${nodeRect.height.toFixed(
                1
              )}, diff=${topDifference.toFixed(1)}px ${
                nodeRect.height > oldMax ? "(NEW MAX!)" : ""
              }`
            );
          } else if (nodeRect.height > 0) {
            console.log(
              `  ❌ Element node EXCLUDED: top=${nodeRect.top.toFixed(
                1
              )}, height=${nodeRect.height.toFixed(
                1
              )}, diff=${topDifference.toFixed(1)}px (not exact match)`
            );
          }
        }
      } catch (e) {
        // Skip problematic nodes
        continue;
      }
    }

    console.log(
      `✅ Line scan complete: found ${nodesFound} elements, max height: ${maxHeight.toFixed(
        1
      )}px`
    );
    return maxHeight;
  } catch (error) {
    console.warn("Error calculating line height:", error);
    return Math.max(...selectionGroup.map((r) => r.height));
  }
}

/**
 * Optimizes selection rectangles for better visual appearance
 * - Combines rectangles on the same line
 * - Uses tallest height for line groups
 * - Always shows only ONE rectangle per line
 */
function optimizeSelectionRects(rects: DOMRect[]): DOMRect[] {
  const timestamp = Date.now();
  console.log(
    `🔄 OPTIMIZE CALLED with ${rects.length} rects (heights: ${rects
      .map((r) => r.height.toFixed(1))
      .join(", ")})`
  );
  console.log(
    "📊 INPUT RECTS:",
    rects.map((r) => ({
      top: r.top.toFixed(1),
      left: r.left.toFixed(1),
      width: r.width.toFixed(1),
      height: r.height.toFixed(1),
    }))
  );

  // Filter out invalid rectangles
  console.log(`🔍 FILTERING ${rects.length} rects...`);

  const validRects = rects.filter((rect) => {
    const isValid =
      rect.width > 0 &&
      rect.height > 0 &&
      !isNaN(rect.left) &&
      !isNaN(rect.top) &&
      isFinite(rect.left) &&
      isFinite(rect.top);

    if (!isValid) {
      console.log(
        `❌ FILTERED OUT: width=${rect.width}, height=${rect.height}, left=${rect.left}, top=${rect.top}`
      );
    }

    return isValid;
  });

  console.log(
    `🔍 VALID RECTS: ${validRects.length} (original: ${rects.length})`
  );

  if (validRects.length === 0) {
    console.log("❌ NO VALID RECTS - returning empty array");
    return [];
  }

  if (validRects.length === 1) {
    console.log("🔍 SINGLE RECT - still applying tallest height logic");
    // Even for single rects, we need to find the tallest height on the line
    const rect = validRects[0];
    console.log(
      `📏 SINGLE RECT INPUT: height=${rect.height.toFixed(
        1
      )}, top=${rect.top.toFixed(1)}`
    );
    const tallestInfo = calculateTallestOnVisualLineWithPosition([rect]);
    console.log(
      `📏 TALLEST ON LINE: height=${tallestInfo.height.toFixed(
        1
      )}, top=${tallestInfo.top.toFixed(1)}`
    );

    const adjustedRect = {
      left: rect.left,
      top: tallestInfo.top, // Use tallest element position for proper alignment
      width: rect.width,
      height: tallestInfo.height, // Use tallest element height
      right: rect.left + rect.width,
      bottom: tallestInfo.top + tallestInfo.height,
      x: rect.left,
      y: tallestInfo.top,
      toJSON: () => ({}),
    } as DOMRect;

    console.log(
      `🔧 ADJUSTED SINGLE RECT: height ${rect.height.toFixed(
        1
      )} → ${tallestInfo.height.toFixed(1)}`
    );
    console.log(
      `🎯 RETURNING SINGLE ADJUSTED RECT: height=${adjustedRect.height.toFixed(
        1
      )}`
    );
    return [adjustedRect];
  }

  // Simple approach: Just treat ALL rects as one group per visual line
  // Let the height calculation handle finding the max height for each line
  console.log("🔍 SIMPLIFIED APPROACH: Grouping by Y-coordinate clustering");

  const lineGroups: DOMRect[][] = [];

  // Sort rects by top position
  const sortedRects = [...validRects].sort((a, b) => a.top - b.top);

  console.log(
    "📊 Sorted rects by top:",
    sortedRects.map((r) => r.top.toFixed(1))
  );

  for (const rect of sortedRects) {
    let foundGroup = false;

    // Look for an existing group where rects overlap vertically
    for (const group of lineGroups) {
      const groupTop = Math.min(...group.map((r) => r.top));
      const groupBottom = Math.max(...group.map((r) => r.top + r.height));
      const rectTop = rect.top;
      const rectBottom = rect.top + rect.height;

      // Check if this rect has SIGNIFICANT overlap (indicating same line)
      // Calculate the overlap amount
      const overlapTop = Math.max(rectTop, groupTop);
      const overlapBottom = Math.min(rectBottom, groupBottom);
      const overlapHeight = Math.max(0, overlapBottom - overlapTop);

      // Require substantial overlap - at least 70% of the smaller rect's height
      const rectHeight = rectBottom - rectTop;
      const groupHeight = groupBottom - groupTop;
      const minHeight = Math.min(rectHeight, groupHeight);
      const overlapRatio = overlapHeight / minHeight;

      const hasSignificantOverlap = overlapRatio >= 0.7;

      if (hasSignificantOverlap) {
        console.log(
          `    ✅ SIGNIFICANT OVERLAP: rect ${rect.top.toFixed(1)}-${(
            rect.top + rect.height
          ).toFixed(1)} vs group ${groupTop.toFixed(1)}-${groupBottom.toFixed(
            1
          )} (overlap: ${overlapRatio.toFixed(2)} >= 0.7)`
        );
        group.push(rect);
        foundGroup = true;
        break;
      } else {
        console.log(
          `    ❌ INSUFFICIENT OVERLAP: rect ${rect.top.toFixed(1)}-${(
            rect.top + rect.height
          ).toFixed(1)} vs group ${groupTop.toFixed(1)}-${groupBottom.toFixed(
            1
          )} (overlap: ${overlapRatio.toFixed(2)} < 0.7)`
        );
      }
    }

    if (!foundGroup) {
      console.log(`    🆕 NEW GROUP: rect at ${rect.top.toFixed(1)}`);
      lineGroups.push([rect]);
    }
  }

  console.log(`📋 LINE GROUPS FORMED: ${lineGroups.length} groups`);
  lineGroups.forEach((group, i) => {
    console.log(
      `  Group ${i}: ${group.length} rects, tops: [${group
        .map((r) => r.top.toFixed(1))
        .join(", ")}], top range: ${Math.min(
        ...group.map((r) => r.top)
      ).toFixed(1)} - ${Math.max(...group.map((r) => r.top)).toFixed(1)}`
    );
  });

  // Process each line group - always combine into single spanning rectangle
  const optimizedRects: DOMRect[] = [];

  for (const group of lineGroups) {
    // Calculate bounds for the entire line
    const minLeft = Math.min(...group.map((r) => r.left));
    const maxRight = Math.max(...group.map((r) => r.right));

    // Calculate the actual tallest height on this visual line (not just selection)
    const lineBaseline = group[0].top;
    console.log(
      `📏 Line group with ${
        group.length
      } rects, using baseline: ${lineBaseline.toFixed(1)}`
    );
    console.log(
      `📏 Group rect tops:`,
      group.map((r) => r.top.toFixed(1))
    );
    const tallestInfo = calculateTallestOnVisualLineWithPosition(group);
    const normalizedHeight = tallestInfo.height;
    console.log(
      `📏 RESULT: height=${normalizedHeight.toFixed(
        1
      )}, top=${tallestInfo.top.toFixed(1)}`
    );
    const minTop = tallestInfo.top; // Use tallest element position for proper alignment
    const selectionMaxHeight = Math.max(...group.map((r) => r.height));

    console.log(
      `Line group: ${group.length} rects, tops:`,
      group.map((r) => r.top),
      `selection heights:`,
      group.map((r) => r.height),
      `selection max: ${selectionMaxHeight}, actual line max: ${normalizedHeight}`
    );

    // ALWAYS create ONE spanning rectangle per line, regardless of count
    const totalWidth = maxRight - minLeft;
    const combinedRect = {
      left: minLeft,
      top: minTop,
      width: totalWidth,
      height: normalizedHeight, // Global max height for consistency
      right: maxRight,
      bottom: minTop + normalizedHeight,
      x: minLeft,
      y: minTop,
      toJSON: () => ({}),
    } as DOMRect;

    // Debug overlay creation (can be removed later)
    console.log(
      `✅ Using tallest height ${normalizedHeight.toFixed(1)}px for overlay`
    );

    console.log(
      `    ✅ COMBINED ${
        group.length
      } rects into 1 spanning overlay (${minLeft.toFixed(1)}-${maxRight.toFixed(
        1
      )}) HEIGHT=${normalizedHeight.toFixed(1)}px TOP=${minTop.toFixed(1)}`
    );
    optimizedRects.push(combinedRect);
  }

  console.log(`🎯 RETURNING ${optimizedRects.length} optimized overlays`);
  console.log(
    "📊 OUTPUT RECT HEIGHTS:",
    optimizedRects.map((r) => r.height.toFixed(1))
  );
  console.log(
    "📊 OUTPUT RECTS:",
    optimizedRects.map((r) => ({
      top: r.top.toFixed(1),
      left: r.left.toFixed(1),
      width: r.width.toFixed(1),
      height: r.height.toFixed(1),
    }))
  );

  return optimizedRects;
}

/**
 * Typography Panel - Text-specific properties
 */
export default function TypographyPanel({ objects }: { objects: any[] }) {
  const dispatch = useAppStore((state) => state.dispatch);

  const textObjects = objects.filter((obj) => obj.type === "text");
  const values = useMemo(() => {
    return textObjects.length > 0 ? resolveTextValues(textObjects) : null;
  }, [textObjects]);

  const updateTextProperty = useCallback(
    (property: string, value: any) => {
      textObjects.forEach((obj) => {
        const currentProperties = obj.properties || {};

        if (property.startsWith("properties.")) {
          const propertyKey = property.replace("properties.", "");
          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: {
                properties: {
                  ...currentProperties,
                  [propertyKey]: value,
                },
              },
              previousValues: {
                properties: currentProperties,
              },
            },
          });
        } else {
          dispatch({
            type: "object.updated",
            payload: {
              id: obj.id,
              changes: { [property]: value },
              previousValues: { [property]: (obj as any)[property] },
            },
          });
        }
      });
    },
    [textObjects, dispatch]
  );

  // Apply formatting to selected text or current cursor position
  const applyFormatting = useCallback(
    (command: string, value?: any) => {
      // Check if we have the global text editor interface
      if ((window as any).currentTextEditor) {
        if ((window as any).currentTextEditor.isEditing) {
          // When editing, use the normal formatting (applies to selection/cursor)
          (window as any).currentTextEditor.applyFormatting(command, value);

          // Also sync node-level properties for the editing object
          const editingObjId = (window as any).currentTextEditor.objectId;
          const propertyCommands = [
            "lineHeight",
            "letterSpacing",
            "fontSize",
            "fontFamily",
            "fontWeight",
          ];
          if (editingObjId && propertyCommands.includes(command)) {
            const editingObj = textObjects.find(
              (obj) => obj.id === editingObjId
            );
            if (editingObj) {
              const propKey = command;
              let propValue = value;
              if (command === "fontWeight") {
                propValue =
                  typeof value === "string" ? parseInt(value) || 400 : value;
              }
              dispatch({
                type: "object.updated",
                payload: {
                  id: editingObjId,
                  changes: {
                    properties: {
                      ...editingObj.properties,
                      [propKey]: propValue,
                    },
                  },
                  previousValues: { properties: editingObj.properties },
                },
              });
            }
          }
          return;
        }

        // When not editing, update ALL selected text objects
        const propertyCommands = [
          "lineHeight",
          "letterSpacing",
          "fontSize",
          "fontFamily",
          "fontWeight",
        ];

        if (propertyCommands.includes(command)) {
          // Update properties and Slate content for every selected text object
          textObjects.forEach((obj) => {
            const textProps = obj.properties;
            if (textProps.type !== "text") return;

            const propKey = command;
            let propValue = value;
            if (command === "fontWeight") {
              propValue =
                typeof value === "string" ? parseInt(value) || 400 : value;
            }

            // Deep-clone properties to avoid shared-reference mutations
            const updatedProperties: any = {
              ...textProps,
              [propKey]: propValue,
            };

            // Also update the corresponding Slate marks in slateContent
            if (textProps.slateContent) {
              try {
                const parsed = JSON.parse(textProps.slateContent);
                const updateMarksInNodes = (nodes: any[]) => {
                  nodes.forEach((node: any) => {
                    if (node.children) {
                      node.children.forEach((child: any) => {
                        if (child.text !== undefined) {
                          if (command === "lineHeight") {
                            child.lineHeight = lineHeightToCSSValue(
                              value,
                              textProps.fontSize
                            );
                          } else if (command === "letterSpacing") {
                            child.letterSpacing = letterSpacingToCSSValue(
                              value,
                              textProps.fontSize
                            );
                          } else if (command === "fontSize") {
                            child.fontSize = value;
                          } else if (command === "fontFamily") {
                            child.fontFamily = value;
                          } else if (command === "fontWeight") {
                            child.fontWeight = propValue;
                          }
                        }
                      });
                    }
                  });
                };
                updateMarksInNodes(parsed);
                updatedProperties.slateContent = JSON.stringify(parsed);
              } catch (e) {
                // If parsing fails, just update the properties
              }
            }

            dispatch({
              type: "object.updated",
              payload: {
                id: obj.id,
                changes: { properties: updatedProperties },
                previousValues: { properties: textProps },
              },
            });
          });
          return;
        }

        // For other formatting (bold, italic, underline, color), use single object via Slate
        (window as any).currentTextEditor.applyFormattingToAllText(
          command,
          value
        );

        // Force an immediate UI refresh after applying formatting
        setTimeout(() => {
          // This will trigger the checkTextSelection function to re-analyze styles
        }, 100);
        return;
      }

      // No global text editor interface available
    },
    [textObjects, dispatch]
  );

  if (!values) return null;

  // Check if any text object is currently being edited
  const hasEditingText = textObjects.some(
    (obj) => obj.properties.type === "text" && obj.properties.isEditing
  );

  // Check if there's text selected in the editor
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [currentStyles, setCurrentStyles] = useState<{
    bold?: boolean | "mixed";
    italic?: boolean | "mixed";
    underline?: boolean | "mixed";
    fontSize?: number | "mixed";
    fontWeight?: number | "mixed";
    fontFamily?: string | "mixed";
    lineHeight?: LineHeight | "mixed";
    letterSpacing?: LetterSpacing | "mixed";
    color?: string | "mixed";
  }>({});

  // Use a flag to prevent hiding controls too quickly during formatting operations
  const [showExtendedControls, setShowExtendedControls] = useState(false);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ref to save selection when focusing on inputs
  const savedTextSelectionRef = useRef<any>(null);

  // Custom selection overlay state
  const [customSelectionOverlay, setCustomSelectionOverlay] = useState<{
    show: boolean;
    rects?: DOMRect[];
  }>({ show: false });

  // Get selected object - use the first text object from props, but allow multiple
  const selectedObject = textObjects.length > 0 ? textObjects[0] : null;

  // Only need zoom for overlay recalculation — pan changes don't affect text overlays
  const viewportZoom = useAppStore((state) => state.viewport.zoom);

  // Store captured bounds for updating on viewport changes
  const capturedBoundsRef = useRef<DOMRect[] | null>(null);

  // Track if we're actively editing in properties panel
  const isEditingInPropertiesRef = useRef(false);

  // Update overlay positions when viewport changes (zoom/pan) - immediate updates
  useEffect(() => {
    // Check if any text object is in edit mode using latest refs
    const hasEditingText = textObjectsRef.current.some(
      (obj) => obj.properties.type === "text" && obj.properties.isEditing
    );

    // Only update if we already have overlays showing and text is in edit mode
    // AND we're not currently editing in properties panel (to avoid conflicts)
    if (
      customSelectionOverlay.show &&
      customSelectionOverlay.rects &&
      customSelectionOverlay.rects.length > 0 &&
      hasEditingText &&
      !isEditingInPropertiesRef.current
    ) {
      // Recalculate overlay positions based on current DOM selection
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (!range.collapsed) {
          const clientRects = range.getClientRects();
          const rects = Array.from(clientRects).filter(
            (rect) => rect.width > 0 && rect.height > 0
          );

          if (rects.length > 0) {
            const optimizedRects = optimizeSelectionRects(rects);
            if (optimizedRects.length > 0) {
              setCustomSelectionOverlay({
                show: true,
                rects: optimizedRects,
              });
            }
          }
        }
      }
    }
  }, [viewportZoom]);

  // Monitor text selection changes to show custom overlay
  useEffect(() => {
    const handleSelectionChange = () => {
      // Don't hide overlay if we're actively editing in properties panel
      if (isEditingInPropertiesRef.current) {
        return;
      }

      const selection = window.getSelection();

      // Check if any text object is in edit mode using latest refs
      const hasEditingText = textObjectsRef.current.some(
        (obj) => obj.properties.type === "text" && obj.properties.isEditing
      );

      // Only show custom overlay if we have a text editor, selection, AND any text is in edit mode
      if (hasEditingText && selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);

        // Don't show overlay for collapsed (empty) selections
        if (range.collapsed) {
          setCustomSelectionOverlay({ show: false });
          return;
        }

        // Check if selection is within any text editor (support multiple text objects)
        const allTextEditors = document.querySelectorAll(
          '[data-slate-editor="true"]'
        );
        console.log(`🔍 OVERLAY: Found ${allTextEditors.length} text editors`);
        let activeTextEditor = null;

        // Find which text editor contains this selection
        for (const editor of allTextEditors) {
          if (editor.contains(range.commonAncestorContainer)) {
            activeTextEditor = editor;
            console.log(
              `✅ OVERLAY: Found active text editor containing selection`
            );
            break;
          }
        }

        if (!activeTextEditor) {
          console.log(
            `❌ OVERLAY: No active text editor found containing selection`
          );
        }

        if (activeTextEditor) {
          try {
            const clientRects = range.getClientRects();
            const rects = Array.from(clientRects).filter(
              (rect) => rect.width > 0 && rect.height > 0
            );

            if (rects.length > 0) {
              // Optimize rectangles to combine overlapping ones on same line
              const optimizedRects = optimizeSelectionRects(rects);
              if (optimizedRects.length > 0) {
                setCustomSelectionOverlay({
                  show: true,
                  rects: optimizedRects,
                });
                capturedBoundsRef.current = optimizedRects;
                return;
              }
            }
          } catch (error) {
            console.warn("Error processing selection rects:", error);
            // Fallback: hide overlay on error
            setCustomSelectionOverlay({ show: false });
            capturedBoundsRef.current = null;
            return;
          }
        }
      }

      // Hide overlay if no valid selection
      setCustomSelectionOverlay({ show: false });
      capturedBoundsRef.current = null;
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  // Use refs to access latest values without restarting the interval
  const textObjectsRef = useRef(textObjects);
  const hasEditingTextRef = useRef(hasEditingText);

  // Update refs when values change
  useEffect(() => {
    textObjectsRef.current = textObjects;
    hasEditingTextRef.current = hasEditingText;
  }, [textObjects, hasEditingText]);

  // Clear styles when switching between edit modes to prevent stale data
  useEffect(() => {
    setCurrentStyles({});
  }, [hasEditingText]);

  // Poll for text selection state and current styles
  useEffect(() => {
    const checkTextSelection = async () => {
      // Check for text objects

      if ((window as any).currentTextEditor) {
        const editor = (window as any).currentTextEditor;
        const slateEditor = editor.editor;
        const currentHasSelection = editor.hasSelection;

        setHasTextSelection(currentHasSelection);
        setSelectedText(editor.selectedText);

        // Get current styles from Slate editor
        if (slateEditor) {
          try {
            // Use statically imported Slate modules

            let marks: any = {};

            if (slateEditor.selection) {
              if (currentHasSelection) {
                // For text selection, get marks from the selected text
                const selectedNodes = Array.from(
                  Editor.nodes(slateEditor, {
                    at: slateEditor.selection,
                    match: (n: any) => Text.isText(n),
                  })
                );

                if (selectedNodes.length > 0) {
                  // Collect all marks from selected text nodes
                  const allMarks = selectedNodes.map((entry: any) => entry[0]);

                  // Check if all nodes have the same mark values
                  const markKeys = new Set<string>();
                  allMarks.forEach((node: any) => {
                    Object.keys(node).forEach((key) => {
                      if (key !== "text") markKeys.add(key);
                    });
                  });

                  // Always check for common formatting marks, even if not present in any nodes
                  const commonMarks = [
                    "bold",
                    "italic",
                    "underline",
                    "fontSize",
                    "fontWeight",
                    "fontFamily",
                    "color",
                  ];
                  const allMarkKeys = new Set([...markKeys, ...commonMarks]);

                  allMarkKeys.forEach((key) => {
                    // Get values from all nodes, treating undefined as the default value
                    const allValues = allMarks.map((node: any) => {
                      const value = node[key];
                      if (value === undefined) {
                        // Return default values for each mark type
                        switch (key) {
                          case "bold":
                          case "italic":
                          case "underline":
                            return false;
                          case "fontSize":
                            return 16; // Default font size
                          case "fontWeight":
                            return 400; // Default font weight
                          case "fontFamily":
                            return "Inter, sans-serif"; // Default font family
                          case "color":
                            return "#000000"; // Default color
                          default:
                            return undefined;
                        }
                      }
                      return value;
                    });

                    const definedValues = allValues.filter(
                      (v) => v !== undefined
                    );
                    const uniqueValues = [...new Set(definedValues)];

                    if (definedValues.length > 0) {
                      if (uniqueValues.length === 1) {
                        marks[key] = uniqueValues[0];
                      } else {
                        marks[key] = "mixed";
                      }
                    }
                  });
                }
              } else {
                // For cursor position, use Editor.marks() which gets pending marks
                marks = Editor.marks(slateEditor) || {};

                // If no pending marks, get marks from the current text node
                if (Object.keys(marks).length === 0) {
                  const nodeEntries = Array.from(
                    Editor.nodes(slateEditor, {
                      match: (n: any) => Text.isText(n),
                    }) as Iterable<any>
                  );

                  if (nodeEntries.length > 0) {
                    const [node] = nodeEntries[0];
                    marks = { ...(node as any) };
                    delete (marks as any).text; // Remove the text content, keep only marks
                  }
                }
              }
            }

            // Always update current styles based on marks, preserving mixed states
            const newStyles: {
              bold?: boolean | "mixed";
              italic?: boolean | "mixed";
              underline?: boolean | "mixed";
              fontSize?: number | "mixed";
              fontWeight?: number | "mixed";
              fontFamily?: string | "mixed";
              lineHeight?: LineHeight | "mixed";
              letterSpacing?: LetterSpacing | "mixed";
              color?: string | "mixed";
            } = {
              bold:
                (marks as any).bold === "mixed"
                  ? ("mixed" as const)
                  : (marks as any).bold === true,
              italic:
                (marks as any).italic === "mixed"
                  ? ("mixed" as const)
                  : (marks as any).italic === true,
              underline:
                (marks as any).underline === "mixed"
                  ? ("mixed" as const)
                  : (marks as any).underline === true,
              fontSize:
                (marks as any).fontSize === "mixed"
                  ? ("mixed" as const)
                  : (marks as any).fontSize || 16,
              fontWeight:
                (marks as any).fontWeight === "mixed"
                  ? ("mixed" as const)
                  : (marks as any).fontWeight || 400,
              fontFamily:
                (marks as any).fontFamily === "mixed"
                  ? ("mixed" as const)
                  : (marks as any).fontFamily || "Inter, sans-serif",
              lineHeight: (() => {
                const rawLH = (marks as any).lineHeight;
                if (rawLH === "mixed") return "mixed" as const;
                if (rawLH) {
                  // Convert CSS value back to LineHeight object
                  if (typeof rawLH === "string" && rawLH.endsWith("px")) {
                    return { value: parseFloat(rawLH), unit: "px" as const };
                  } else if (typeof rawLH === "number") {
                    return { value: rawLH * 100, unit: "%" as const };
                  }
                }
                // Fall back to the current text object's node-level property
                const editorObjId = (window as any).currentTextEditor?.objectId;
                const editorObj = editorObjId
                  ? textObjectsRef.current.find((o: any) => o.id === editorObjId)
                  : textObjectsRef.current[0];
                return editorObj?.properties.lineHeight || {
                  value: 19,
                  unit: "px" as const,
                };
              })(),
              letterSpacing: (() => {
                const rawLS = (marks as any).letterSpacing;
                if (rawLS === "mixed") return "mixed" as const;
                if (rawLS) {
                  // Convert CSS value back to LetterSpacing object
                  if (typeof rawLS === "string" && rawLS.endsWith("em")) {
                    return {
                      value: parseFloat(rawLS) * 100,
                      unit: "%" as const,
                    };
                  } else if (typeof rawLS === "string" && rawLS.endsWith("px")) {
                    return { value: parseFloat(rawLS), unit: "px" as const };
                  } else if (typeof rawLS === "object" && rawLS.value !== undefined) {
                    return rawLS;
                  }
                }
                const editorObjId = (window as any).currentTextEditor?.objectId;
                const editorObj = editorObjId
                  ? textObjectsRef.current.find((o: any) => o.id === editorObjId)
                  : textObjectsRef.current[0];
                return editorObj?.properties.letterSpacing || {
                  value: 0,
                  unit: "px" as const,
                };
              })(),
              color:
                (marks as any).color === "mixed"
                  ? ("mixed" as const)
                  : (marks as any).color || "#000000",
            };

            // Style analysis complete

            setCurrentStyles(newStyles);
          } catch (error) {
            console.warn("Error reading Slate marks:", error);
            setCurrentStyles({});
          }
        }

        // Show extended controls if we have selection or are actively editing
        if (currentHasSelection || hasEditingText) {
          setShowExtendedControls(true);
          // Clear any pending hide timeout
          if (hideControlsTimeoutRef.current) {
            clearTimeout(hideControlsTimeoutRef.current);
            hideControlsTimeoutRef.current = null;
          }
        } else {
          // Delay hiding controls to prevent flicker during formatting
          if (hideControlsTimeoutRef.current) {
            clearTimeout(hideControlsTimeoutRef.current);
          }
          hideControlsTimeoutRef.current = setTimeout(() => {
            setShowExtendedControls(false);
          }, 300); // 300ms delay
        }

        // Note: Current selection is active
      } else {
        setHasTextSelection(false);
        setSelectedText("");
        setShowExtendedControls(false);

        // When not editing, analyze the Slate content for current styles
        if (textObjectsRef.current.length > 0) {
          const textObj = textObjectsRef.current[0];

          // Always analyze the stored slateContent directly when not editing
          if (textObj.properties.slateContent) {
            try {
              const parsedContent = JSON.parse(textObj.properties.slateContent);
              const allTextNodes: any[] = [];

              // Extract all text nodes from the parsed content
              const extractTextNodes = (nodes: any[]) => {
                nodes.forEach((node) => {
                  if (node.type === "paragraph" && node.children) {
                    node.children.forEach((child: any) => {
                      if (child.text !== undefined) {
                        allTextNodes.push(child);
                      }
                    });
                  }
                });
              };

              extractTextNodes(parsedContent);

              // Analyze for mixed states from stored content
              const analyzeMixedProperty = (property: string) => {
                const values = allTextNodes.map((node) => {
                  const value = node[property];
                  switch (property) {
                    case "bold":
                    case "italic":
                    case "underline":
                      return value === true;
                    case "fontSize":
                      return value || textObj.properties.fontSize || 16;
                    case "fontWeight":
                      return value || textObj.properties.fontWeight || 400;
                    case "fontFamily":
                      return (
                        value ||
                        textObj.properties.fontFamily ||
                        "Inter, sans-serif"
                      );
                    case "color":
                      return value || "#000000";
                    default:
                      return value;
                  }
                });

                const uniqueValues = [...new Set(values)];
                return uniqueValues.length === 1 ? uniqueValues[0] : "mixed";
              };

              setCurrentStyles({
                bold: analyzeMixedProperty("bold"),
                italic: analyzeMixedProperty("italic"),
                underline: analyzeMixedProperty("underline"),
                fontSize: analyzeMixedProperty("fontSize"),
                fontWeight: analyzeMixedProperty("fontWeight"),
                fontFamily: analyzeMixedProperty("fontFamily"),
                lineHeight: analyzeMixedProperty("lineHeight"),
                color: analyzeMixedProperty("color"),
              });
            } catch (error) {
              console.warn("Error analyzing stored text content:", error);
              setCurrentStyles({});
            }
          } else {
            setCurrentStyles({});
          }
        } else {
          setCurrentStyles({});
        }

        setHasTextSelection(false);
        setSelectedText("");
        setShowExtendedControls(false);
      }

      // Non-edit mode analysis - check if we have text objects but are not editing
      if (textObjectsRef.current.length > 0 && !hasEditingTextRef.current) {
        const textObj = textObjectsRef.current[0];

        // Always analyze the stored slateContent directly when not editing
        if (textObj.properties.slateContent) {
          try {
            const parsedContent = JSON.parse(textObj.properties.slateContent);
            const allTextNodes: any[] = [];

            // Extract all text nodes from the parsed content
            const extractTextNodes = (nodes: any[]) => {
              nodes.forEach((node) => {
                if (node.type === "paragraph" && node.children) {
                  node.children.forEach((child: any) => {
                    if (child.text !== undefined) {
                      allTextNodes.push(child);
                    }
                  });
                }
              });
            };

            extractTextNodes(parsedContent);

            // Analyze stored content for mixed states

            // Analyze for mixed states from stored content
            const analyzeMixedProperty = (property: string) => {
              const values = allTextNodes.map((node) => {
                const value = node[property];
                switch (property) {
                  case "bold":
                  case "italic":
                  case "underline":
                    return value === true;
                  case "fontSize":
                    return value || textObj.properties.fontSize || 16;
                  case "fontWeight":
                    return value || textObj.properties.fontWeight || 400;
                  case "fontFamily":
                    return (
                      value ||
                      textObj.properties.fontFamily ||
                      "Inter, sans-serif"
                    );
                  case "lineHeight":
                    // lineHeight in Slate marks is stored as CSS value, convert back to LineHeight object
                    if (value) {
                      if (typeof value === "string" && value.endsWith("px")) {
                        return { value: parseFloat(value), unit: "px" };
                      } else if (typeof value === "number") {
                        return { value: value * 100, unit: "%" };
                      }
                    }
                    return (
                      textObj.properties.lineHeight || { value: 19, unit: "px" }
                    );
                  case "color":
                    return value || "#000000";
                  default:
                    return value;
                }
              });

              const uniqueValues = [...new Set(values)];
              return uniqueValues.length === 1 ? uniqueValues[0] : "mixed";
            };

            setCurrentStyles({
              bold: analyzeMixedProperty("bold"),
              italic: analyzeMixedProperty("italic"),
              underline: analyzeMixedProperty("underline"),
              fontSize: analyzeMixedProperty("fontSize"),
              fontWeight: analyzeMixedProperty("fontWeight"),
              fontFamily: analyzeMixedProperty("fontFamily"),
              lineHeight: analyzeMixedProperty("lineHeight"),
              letterSpacing: analyzeMixedProperty("letterSpacing"),
              color: analyzeMixedProperty("color"),
            });
          } catch (error) {
            console.warn("Error analyzing stored text content:", error);
            setCurrentStyles({});
          }
        } else {
          // No slateContent, use basic properties
          setCurrentStyles({
            bold: false,
            italic: false,
            underline: false,
            fontSize: textObj.properties.fontSize || 16,
            fontWeight: textObj.properties.fontWeight || 400,
            fontFamily: textObj.properties.fontFamily || "Inter, sans-serif",
            lineHeight: textObj.properties.lineHeight || {
              value: 19,
              unit: "px",
            },
            letterSpacing: textObj.properties.letterSpacing || {
              value: 0,
              unit: "px",
            },
            color: "#000000",
          });
        }
      }
    };

    const interval = setInterval(checkTextSelection, 100);
    return () => {
      clearInterval(interval);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, []); // Keep empty deps to avoid continuous restarts, but use refs for latest values

  // Simple selection restoration - just refocus the editor
  // Capture visual selection bounds for custom overlay (for input focus)
  const captureSelectionBounds = useCallback(() => {
    // Try DOM selection first (this is most reliable for visual bounds)
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);

      // Don't capture collapsed selections
      if (range.collapsed) {
        console.log("❌ Cannot capture collapsed selection");
        return null;
      }

      // Use getClientRects() to get individual rectangles for each line
      const clientRects = range.getClientRects();
      const rects = Array.from(clientRects).filter(
        (rect) => rect.width > 0 && rect.height > 0
      );

      if (rects.length > 0) {
        console.log("📍 Captured DOM selection rects for input focus:", rects);
        // Don't update the overlay state here - we want to preserve whatever is already showing
        return rects;
      }
    }

    // Fallback: try to find Slate's selection highlight
    const slateEditor = document.querySelector('[data-slate-editor="true"]');
    if (slateEditor) {
      // Look for any element with text selection styling
      const selectedElements = slateEditor.querySelectorAll(
        'span[style*="background"]'
      );
      if (selectedElements.length > 0) {
        // Get individual bounds for each selected element
        const rects = Array.from(selectedElements)
          .map((el) => el.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0);

        if (rects.length > 0) {
          console.log(
            "📍 Captured Slate styled selection rects for input focus:",
            rects
          );
          return rects;
        }
      }
    }

    console.log("❌ Could not capture selection bounds");
    return null;
  }, []);

  const restoreSelection = useCallback(() => {
    console.log("🔄 Restoring selection...");
    // Hide custom overlay temporarily
    setCustomSelectionOverlay({ show: false });

    if (
      (window as any).currentTextEditor?.editor &&
      savedTextSelectionRef.current
    ) {
      const editor = (window as any).currentTextEditor.editor;

      try {
        console.log(
          "✅ Restoring Slate selection:",
          savedTextSelectionRef.current
        );
        // Restore the saved selection using static import
        Transforms.select(editor, savedTextSelectionRef.current);

        // Focus the editor
        const editorElement = document.querySelector(
          '[data-slate-editor="true"]'
        ) as HTMLElement;
        if (editorElement) {
          editorElement.focus();
        }
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
    }
  }, []);

  return (
    <>
      {/* Always hide native text selection when text is in edit mode - use only our custom overlay */}
      {selectedObject?.type === "text" &&
        selectedObject?.properties?.isEditing && (
          <style>
            {`
            [data-slate-editor="true"] *::selection {
              background: transparent !important;
              color: inherit !important;
            }
            [data-slate-editor="true"] *::-moz-selection {
              background: transparent !important;
              color: inherit !important;
            }
            [data-slate-editor="true"] ::selection {
              background: transparent !important;
              color: inherit !important;
            }
            [data-slate-editor="true"] ::-moz-selection {
              background: transparent !important;
              color: inherit !important;
            }
          `}
          </style>
        )}

      <div
        className=""
        data-preserve-text-editing="true"
        onMouseDown={(e) => {
          // Only prevent default if we're NOT clicking on an input or interactive element
          const target = e.target as HTMLElement;
          const isInteractiveElement =
            target.tagName === "INPUT" ||
            target.tagName === "BUTTON" ||
            target.tagName === "SELECT" ||
            target.closest("input") ||
            target.closest("button") ||
            target.closest('[role="button"]') ||
            target.closest("[data-radix-select-trigger]") ||
            target.closest("[data-radix-select-content]");

          if (!isInteractiveElement) {
            // Prevent text editor from losing focus when clicking on non-interactive areas
            e.preventDefault();
          }
        }}
      >
        <div
          className="text-xs font-medium h-10 flex items-center px-4"
          style={{ color: "var(--color-text)" }}
        >
          Typography
        </div>
        <div className="space-y-3 pb-2">
          {/* Text Formatting - Always show for selected text objects */}
          {textObjects.length > 0 && (
            <div className="">
              {/* Font Family */}
              <div className="grid grid-cols-[1fr_24px] gap-2 h-8 items-center pl-4 pr-2">
                <Select
                  value={
                    currentStyles.fontFamily === "mixed"
                      ? "__mixed__"
                      : typeof currentStyles.fontFamily === "string"
                      ? currentStyles.fontFamily
                      : ""
                  }
                  onValueChange={(value) => {
                    // Ignore the mixed placeholder value
                    if (value === "__mixed__") return;
                    restoreSelection();
                    applyFormatting("fontFamily", value);
                  }}
                  onOpenChange={(open) => {
                    if (open) {
                      isEditingInPropertiesRef.current = true;
                    } else {
                      isEditingInPropertiesRef.current = false;
                      // Restore focus to editor after closing
                      restoreSelection();
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        currentStyles.fontFamily === "mixed"
                          ? "Mixed"
                          : "Select font"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {currentStyles.fontFamily === "mixed" && (
                      <SelectItem value="__mixed__">Mixed</SelectItem>
                    )}
                    <SelectItem value="Inter, sans-serif">Inter</SelectItem>
                    <SelectItem value="system-ui, sans-serif">
                      System UI
                    </SelectItem>
                    <SelectItem value="Georgia, serif">Georgia</SelectItem>
                    <SelectItem value="'Times New Roman', serif">
                      Times New Roman
                    </SelectItem>
                    <SelectItem value="'Courier New', monospace">
                      Courier New
                    </SelectItem>
                    <SelectItem value="Monaco, monospace">Monaco</SelectItem>
                    <SelectItem value="'Helvetica Neue', sans-serif">
                      Helvetica Neue
                    </SelectItem>
                    <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* <div className="flex gap-1">
              <button
                onClick={() => applyFormatting("bold")}
                className={`flex items-center justify-center w-8 h-6 text-xs font-bold border rounded hover:bg-gray-100 ${
                  currentStyles.bold === true
                    ? "border-blue-500 bg-blue-100 text-blue-700"
                    : currentStyles.bold === "mixed"
                    ? "border-orange-500 bg-orange-50 text-orange-700"
                    : "border-gray-300"
                }`}
                title="Bold (Cmd+B)"
                disabled={!hasEditingText}
              >
                B
              </button>
              <button
                onClick={() => applyFormatting("italic")}
                className={`flex items-center justify-center w-8 h-6 text-xs italic border rounded hover:bg-gray-100 ${
                  currentStyles.italic === true
                    ? "border-blue-500 bg-blue-100 text-blue-700"
                    : currentStyles.italic === "mixed"
                    ? "border-orange-500 bg-orange-50 text-orange-700"
                    : "border-gray-300"
                }`}
                title="Italic (Cmd+I)"
                disabled={!hasEditingText}
              >
                I
              </button>
              <button
                onClick={() => applyFormatting("underline")}
                className={`flex items-center justify-center w-8 h-6 text-xs underline border rounded hover:bg-gray-100 ${
                  currentStyles.underline === true
                    ? "border-blue-500 bg-blue-100 text-blue-700"
                    : currentStyles.underline === "mixed"
                    ? "border-orange-500 bg-orange-50 text-orange-700"
                    : "border-gray-300"
                }`}
                title="Underline (Cmd+U)"
                disabled={!hasEditingText}
              >
                U
              </button>
            </div> */}

              {/* Extended formatting controls - Always show for text objects */}

              <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center pl-4 pr-2">
                {/* Font Weight */}
                <div>
                  <Select
                    value={
                      currentStyles.fontWeight === "mixed"
                        ? "__mixed__"
                        : typeof currentStyles.fontWeight === "number"
                        ? currentStyles.fontWeight.toString()
                        : ""
                    }
                    onValueChange={(value) => {
                      // Ignore the mixed placeholder value
                      if (value === "__mixed__") return;
                      restoreSelection();
                      applyFormatting("fontWeight", value);
                    }}
                    onOpenChange={(open) => {
                      if (open) {
                        isEditingInPropertiesRef.current = true;
                      } else {
                        isEditingInPropertiesRef.current = false;
                        // Restore focus to editor after closing
                        restoreSelection();
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          currentStyles.fontWeight === "mixed"
                            ? "Mixed"
                            : "Select weight"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent position="item-aligned">
                      {currentStyles.fontWeight === "mixed" && (
                        <SelectItem value="__mixed__">Mixed</SelectItem>
                      )}
                      <SelectItem value="100">Thin</SelectItem>
                      <SelectItem value="200">Extra Light</SelectItem>
                      <SelectItem value="300">Light</SelectItem>
                      <SelectItem value="400">Normal</SelectItem>
                      <SelectItem value="500">Medium</SelectItem>
                      <SelectItem value="600">Semi Bold</SelectItem>
                      <SelectItem value="700">Bold</SelectItem>
                      <SelectItem value="800">Extra Bold</SelectItem>
                      <SelectItem value="900">Black</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Font Size */}
                <div>
                  <PropertyInput
                    label="Font Size"
                    value={
                      currentStyles.fontSize === "mixed"
                        ? "mixed"
                        : currentStyles.fontSize || 16
                    }
                    onChange={(value) => {
                      const size = parseInt(String(value));
                      if (!isNaN(size) && size >= 1) {
                        applyFormatting("fontSize", size);
                      }
                    }}
                    type="number"
                    min={1}
                    updateMode="blur"
                  />
                </div>
              </div>

              {/* Line Height */}
              <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center pl-4 pr-2">
                <PropertyInput
                  label="Line Height"
                  value={
                    currentStyles.lineHeight === "mixed"
                      ? "mixed"
                      : currentStyles.lineHeight
                      ? formatLineHeight(currentStyles.lineHeight)
                      : "16"
                  }
                  onChange={(value) => {
                    const parsedLineHeight = parseLineHeight(String(value));
                    if (parsedLineHeight.value > 0) {
                      applyFormatting("lineHeight", parsedLineHeight);
                    }
                  }}
                  type="text"
                  updateMode="blur"
                  leadingIcon={
                    <Icon24TextLineHeight className="text-secondary" />
                  }
                />

                <PropertyInput
                  label="Letter Spacing"
                  value={
                    currentStyles.letterSpacing === "mixed"
                      ? "mixed"
                      : currentStyles.letterSpacing
                      ? formatLetterSpacing(currentStyles.letterSpacing)
                      : "0"
                  }
                  onChange={(value) => {
                    const parsedLetterSpacing = parseLetterSpacing(
                      String(value)
                    );
                    applyFormatting("letterSpacing", parsedLetterSpacing);
                  }}
                  type="text"
                  updateMode="blur"
                  leadingIcon={
                    <Icon24TextLetterSpacing className="text-secondary" />
                  }
                />
              </div>

              {/* Text Color */}
              <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center pl-4 pr-2">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={
                      typeof currentStyles.color === "string"
                        ? currentStyles.color
                        : "#000000"
                    }
                    className="w-8 h-6 border rounded cursor-pointer"
                    onFocus={(e) => {
                      isEditingInPropertiesRef.current = true;
                      restoreSelection();
                    }}
                    onBlur={() => {
                      isEditingInPropertiesRef.current = false;
                    }}
                    onChange={(e) => {
                      restoreSelection();
                      applyFormatting("color", e.target.value);
                    }}
                  />
                  <PropertyInput
                    label="Color"
                    value={
                      currentStyles.color === "mixed"
                        ? "mixed"
                        : typeof currentStyles.color === "string"
                        ? currentStyles.color
                        : "#000000"
                    }
                    onChange={(value) => {
                      if (String(value).match(/^#[0-9A-Fa-f]{6}$/)) {
                        applyFormatting("color", value);
                      }
                    }}
                    type="text"
                    updateMode="blur"
                  />
                </div>
              </div>

              {/* Text Alignment */}
              <div className="grid grid-cols-[1fr_1fr_24px] gap-2 h-8 items-center pl-4 pr-2">
                {/* Horizontal Alignment */}
                <ToggleGroup
                  type="single"
                  value={values?.textAlign || "left"}
                  onValueChange={(value) => {
                    if (value) {
                      updateTextProperty("properties.textAlign", value);
                    }
                  }}
                  className="w-full bg-secondary rounded-[5px]"
                >
                  <ToggleGroupItem value="left">
                    <Icon24TextAlignLeft />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="center">
                    <Icon24TextAlignCenter />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="right">
                    <Icon24TextAlignRight />
                  </ToggleGroupItem>
                </ToggleGroup>

                {/* Vertical Alignment */}
                <ToggleGroup
                  type="single"
                  value={values?.verticalAlign || "top"}
                  onValueChange={(value) => {
                    if (value) {
                      updateTextProperty("properties.verticalAlign", value);
                    }
                  }}
                  className="w-full bg-secondary rounded-[5px]"
                >
                  <ToggleGroupItem value="top">
                    <Icon24TextAlignTop />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="middle">
                    <Icon24TextAlignMiddle />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="bottom">
                    <Icon24TextAlignBottom />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          )}

          {/* Basic text properties removed - all styling now uses the advanced interface above */}
        </div>

        {/* Custom selection overlay when input is focused */}
        {customSelectionOverlay.show &&
          customSelectionOverlay.rects &&
          customSelectionOverlay.rects.map((rect, index) => {
            console.log(
              `✅ RENDERING OVERLAY: height=${rect.height.toFixed(1)}px`
            );

            // Success! The overlay is using the tallest height on the line

            return (
              <div
                key={index}
                style={{
                  position: "fixed",
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                  backgroundColor: "rgba(0, 100, 255, 0.3)", // Blue for all overlays
                  pointerEvents: "none",
                  zIndex: 9999,
                }}
              />
            );
          })}
      </div>
    </>
  );
}
