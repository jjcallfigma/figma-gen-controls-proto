import { nanoid } from "nanoid";
import { store } from "../state/store";
import { convertFigmaCornerRadii } from "../utils/borderRadius";

// Helper function to convert Figma's rich text format to Slate.js format
function convertFigmaRichTextToSlate(
  characters: string,
  characterStyleOverrides?: number[],
  styleOverrideTable?: { [key: number]: any },
  baseStyle?: any
) {
  if (!characters) {
    return [{ type: "paragraph", children: [{ text: "" }] }];
  }

  // If no rich text data, return simple text
  if (!characterStyleOverrides || !styleOverrideTable) {
    return [{ type: "paragraph", children: [{ text: characters }] }];
  }

  console.log("🎨 CONVERTING RICH TEXT:", {
    charactersLength: characters.length,
    overridesLength: characterStyleOverrides.length,
    hasStyleOverrides: Object.keys(styleOverrideTable).length > 0,
  });

  // Build text segments based on style changes
  const segments: any[] = [];
  let currentText = "";
  let currentStyle: any = null;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const overrideId = characterStyleOverrides[i] || 0;

    // Get style for this character (0 means use base style)
    const charStyle =
      overrideId === 0 ? baseStyle : styleOverrideTable[overrideId];

    // Check if style changed
    const styleChanged =
      JSON.stringify(currentStyle) !== JSON.stringify(charStyle);

    if (styleChanged && currentText) {
      // Save previous segment
      segments.push({
        text: currentText,
        ...convertFigmaStyleToSlateMarks(currentStyle, baseStyle),
      });
      currentText = "";
    }

    currentText += char;
    currentStyle = charStyle;
  }

  // Add final segment
  if (currentText) {
    segments.push({
      text: currentText,
      ...convertFigmaStyleToSlateMarks(currentStyle, baseStyle),
    });
  }

  return [{ type: "paragraph", children: segments }];
}

// Helper function to convert Figma style to Slate marks
function convertFigmaStyleToSlateMarks(style: any, baseStyle: any) {
  if (!style) return {};

  const marks: any = {};

  // Font weight (bold)
  if (style.fontWeight && style.fontWeight > (baseStyle?.fontWeight || 400)) {
    marks.bold = true;
  }

  // Font style (italic)
  if (style.fontStyle === "italic") {
    marks.italic = true;
  }

  // Font size
  if (style.fontSize && style.fontSize !== baseStyle?.fontSize) {
    marks.fontSize = style.fontSize;
  }

  // Font family
  if (style.fontFamily && style.fontFamily !== baseStyle?.fontFamily) {
    marks.fontFamily = style.fontFamily;
  }

  // Color (fills)
  if (style.fills && style.fills.length > 0) {
    const fill = style.fills[0];
    if (fill.type === "SOLID") {
      const { r, g, b } = fill.color;
      const alpha = fill.opacity || 1;
      marks.color = `rgba(${Math.round(r * 255)}, ${Math.round(
        g * 255
      )}, ${Math.round(b * 255)}, ${alpha})`;

      console.log("🎨 APPLYING TEXT FILL:", {
        fillType: fill.type,
        color: marks.color,
        originalColor: fill.color,
        opacity: alpha,
      });
    }
  }

  // Text decoration
  if (style.textDecoration === "UNDERLINE") {
    marks.underline = true;
  }

  // Letter spacing (from style overrides)
  if (typeof style.letterSpacing === "number") {
    console.log("🔤 ADDING LETTER SPACING MARK:", {
      value: style.letterSpacing,
      baseValue: baseStyle?.letterSpacing,
      isDifferent: style.letterSpacing !== baseStyle?.letterSpacing,
    });
    marks.letterSpacing = {
      value: style.letterSpacing,
      unit: "px",
    };
  }

  // Line height (from style overrides)
  // Use typeof check instead of truthiness to allow 0 values
  if (
    typeof style.lineHeight !== "undefined" &&
    style.lineHeight !== baseStyle?.lineHeight
  ) {
    // Convert to our LineHeight format if it's a raw number
    if (typeof style.lineHeight === "number") {
      marks.lineHeight = {
        value: style.lineHeight,
        unit: "px",
      };
    } else {
      marks.lineHeight = style.lineHeight;
    }
  }

  if (Object.keys(marks).length > 0) {
    console.log("🎭 CONVERTED STYLE TO MARKS:", { marks });
  }

  return marks;
}

// Helper function to convert Figma Auto Layout properties to our format
function convertFigmaAutoLayoutToCanvas(node: any) {
  // Check if this node has Auto Layout enabled
  if (node.layoutMode === "NONE" || !node.layoutMode) {
    return undefined;
  }

  console.log("🏗️ CONVERTING AUTO LAYOUT:", {
    nodeName: node.name,
    layoutMode: node.layoutMode,
    primaryAxisSizingMode: node.primaryAxisSizingMode,
    counterAxisSizingMode: node.counterAxisSizingMode,
    primaryAxisAlignItems: node.primaryAxisAlignItems,
    counterAxisAlignItems: node.counterAxisAlignItems,
    itemSpacing: node.itemSpacing,
    counterAxisSpacing: node.counterAxisSpacing,
    layoutWrap: node.layoutWrap,
    paddingLeft: node.paddingLeft,
    paddingRight: node.paddingRight,
    paddingTop: node.paddingTop,
    paddingBottom: node.paddingBottom,
  });

  // Convert layout mode
  let mode: "horizontal" | "vertical" | "grid" = "horizontal";
  if (node.layoutMode === "VERTICAL") {
    mode = "vertical";
  } else if (node.layoutMode === "HORIZONTAL") {
    mode = "horizontal";
  } else if (node.layoutMode === "GRID") {
    mode = "grid";
  }

  // Convert alignment properties
  const convertPrimaryAxisAlign = (align: string) => {
    switch (align) {
      case "MIN":
        return "start";
      case "CENTER":
        return "center";
      case "MAX":
        return "end";
      case "SPACE_BETWEEN":
        return "space-between";
      default:
        return "start";
    }
  };

  const convertCounterAxisAlign = (align: string) => {
    switch (align) {
      case "MIN":
        return "start";
      case "CENTER":
        return "center";
      case "MAX":
        return "end";
      case "STRETCH":
        return "stretch";
      default:
        return "start";
    }
  };

  // Note: Frame sizing modes are handled by convertFigmaFrameSizingToAutoLayoutSizing()
  // This function focuses on auto layout properties only

  const autoLayoutProperties: Record<string, any> = {
    mode,
    gap: node.itemSpacing || 0,
    counterAxisSpacing: node.counterAxisSpacing || 0,
    wrap: node.layoutWrap === "WRAP",
    padding: {
      top: node.paddingTop || 0,
      right: node.paddingRight || 0,
      bottom: node.paddingBottom || 0,
      left: node.paddingLeft || 0,
    },
    alignItems: convertCounterAxisAlign(node.counterAxisAlignItems || "MIN"),
    justifyContent: convertPrimaryAxisAlign(
      node.primaryAxisAlignItems || "MIN"
    ),
  };

  if (mode === "grid") {
    autoLayoutProperties.gridColumns = node.gridColumnCount ?? 4;
    autoLayoutProperties.gridRows = node.gridRowCount ?? 3;
  }

  console.log("✅ CONVERTED AUTO LAYOUT PROPERTIES:", autoLayoutProperties);

  return autoLayoutProperties;
}

// Helper function to convert Figma frame sizing to unified autoLayoutSizing
function convertFigmaFrameSizingToAutoLayoutSizing(node: any) {
  console.log("🏗️ CONVERTING FRAME SIZING:", {
    nodeName: node.name,
    nodeType: node.type,
    layoutMode: node.layoutMode,
    primaryAxisSizingMode: node.primaryAxisSizingMode,
    counterAxisSizingMode: node.counterAxisSizingMode,
    // Debug: Check if the node also has layoutSizing properties (newer API)
    layoutSizingHorizontal: node.layoutSizingHorizontal,
    layoutSizingVertical: node.layoutSizingVertical,
    // Check for layoutGrow (might indicate fill behavior)
    layoutGrow: node.layoutGrow,
    layoutAlign: node.layoutAlign,
    // Debug: Check all layout-related properties
    allLayoutProps: Object.keys(node).filter(
      (key) => key.includes("layout") || key.includes("Sizing")
    ),
    // Also check if this frame is a child of another auto layout frame
    hasParent: !!node.parent,
    parentType: node.parent?.type,
    parentLayoutMode: node.parent?.layoutMode,
  });

  if (node.layoutMode === "NONE" || !node.layoutMode) {
    // Non-auto-layout frames might still have sizing properties if they're children of auto layout frames
    // In this case, treat them like any other child and check their layoutSizing properties
    if (
      node.layoutSizingHorizontal ||
      node.layoutSizingVertical ||
      node.layoutGrow
    ) {
      console.log("📦 NON-AUTO-LAYOUT FRAME WITH CHILD SIZING PROPERTIES:", {
        nodeName: node.name,
        layoutSizingHorizontal: node.layoutSizingHorizontal,
        layoutSizingVertical: node.layoutSizingVertical,
        layoutGrow: node.layoutGrow,
      });

      // Use child sizing logic for non-auto-layout frames that are children
      const convertLayoutSizing = (
        sizing: string | undefined,
        grow: number
      ) => {
        if (grow === 1) return "fill";
        switch (sizing) {
          case "FIXED":
            return "fixed";
          case "HUG":
            return "hug";
          case "FILL":
            return "fill";
          default:
            return "fixed";
        }
      };

      return {
        horizontal: convertLayoutSizing(
          node.layoutSizingHorizontal,
          node.layoutGrow || 0
        ),
        vertical: convertLayoutSizing(node.layoutSizingVertical, 0),
      };
    }

    // True non-auto-layout frames default to fixed sizing
    return {
      horizontal: "fixed" as const,
      vertical: "fixed" as const,
    };
  }

  // Convert frame sizing modes with comprehensive Figma API support
  const convertSizingMode = (sizingMode: string | undefined) => {
    switch (sizingMode) {
      case "FIXED":
        return "fixed" as const;
      case "AUTO":
      case "HUG": // Current Figma API uses HUG
        return "hug" as const;
      case "FILL":
      case "FILL_CONTAINER": // Frame can fill its container in some cases
        return "fill" as const;
      default:
        return "fixed" as const;
    }
  };

  // For auto layout frames, use the sizing modes
  // Prefer newer layoutSizingHorizontal/Vertical if available, fall back to primaryAxis/counterAxis
  const horizontalSizing =
    node.layoutSizingHorizontal || node.primaryAxisSizingMode || "FIXED";
  const verticalSizing =
    node.layoutSizingVertical || node.counterAxisSizingMode || "FIXED";

  // Special handling for frames that might have layoutGrow (indicating fill behavior)
  const convertSizingModeWithGrow = (sizingMode: string, grow: number = 0) => {
    // layoutGrow takes precedence for fill behavior
    if (grow === 1) return "fill";
    return convertSizingMode(sizingMode);
  };

  const result = {
    horizontal: convertSizingModeWithGrow(
      horizontalSizing,
      node.layoutGrow || 0
    ),
    vertical: convertSizingModeWithGrow(verticalSizing, 0), // layoutGrow typically only applies to primary axis
  };

  console.log("✅ CONVERTED FRAME SIZING:", {
    ...result,
    source: {
      horizontalSizing,
      verticalSizing,
      layoutGrow: node.layoutGrow,
      usedLayoutSizing: !!(
        node.layoutSizingHorizontal || node.layoutSizingVertical
      ),
      usedPrimaryAxis: !!(
        node.primaryAxisSizingMode || node.counterAxisSizingMode
      ),
      usedLayoutGrow: !!node.layoutGrow,
    },
  });
  return result;
}

// Helper function to convert child Auto Layout properties
function convertChildAutoLayoutProperties(node: any) {
  // Always provide autoLayoutSizing - all objects need these properties

  console.log("👶 CONVERTING CHILD AUTO LAYOUT PROPERTIES:", {
    nodeName: node.name,
    nodeType: node.type,
    nodeId: node.id,
    layoutAlign: node.layoutAlign,
    layoutGrow: node.layoutGrow,
    layoutSizingHorizontal: node.layoutSizingHorizontal,
    layoutSizingVertical: node.layoutSizingVertical,
    // Check parent context
    hasParent: !!node.parent,
    parentLayoutMode: node.parent?.layoutMode,
    parentType: node.parent?.type,
    // Debug: Check all layout-related properties
    allLayoutProps: Object.keys(node).filter((key) => key.includes("layout")),
    // Show actual property values
    allLayoutValues: Object.keys(node)
      .filter((key) => key.includes("layout"))
      .reduce((acc, key) => ({ ...acc, [key]: node[key] }), {}),
  });

  const convertLayoutSizing = (sizing: string | undefined, grow: number) => {
    console.log(`🔄 CONVERTING LAYOUT SIZING:`, {
      inputSizing: sizing,
      inputGrow: grow,
      nodeName: node.name,
    });

    // Check for layoutGrow first (takes precedence for FILL)
    if (grow === 1) {
      console.log(`✅ CONVERTED TO FILL (layoutGrow=1)`);
      return "fill";
    }

    // Convert Figma sizing modes to our internal system
    let result: string;
    switch (sizing) {
      case "FIXED":
        result = "fixed";
        break;
      case "HUG":
        result = "hug";
        break;
      case "FILL":
      case "FILL_CONTAINER": // Some Figma versions use this
        result = "fill";
        break;
      default:
        // Default to fixed for objects that don't have auto layout sizing
        result = "fixed";
        break;
    }

    console.log(`✅ CONVERTED SIZING: "${sizing}" → "${result}"`);
    return result;
  };

  const childProperties = {
    horizontal: convertLayoutSizing(
      node.layoutSizingHorizontal,
      node.layoutGrow || 0
    ),
    vertical: convertLayoutSizing(
      node.layoutSizingVertical,
      0 // layoutGrow typically only applies to primary axis in Figma
    ),
  };

  console.log("✅ CONVERTED CHILD AUTO LAYOUT PROPERTIES:", {
    ...childProperties,
    source: {
      layoutSizingHorizontal: node.layoutSizingHorizontal,
      layoutSizingVertical: node.layoutSizingVertical,
      layoutGrow: node.layoutGrow,
      hasAnyLayoutProps: !!(
        node.layoutSizingHorizontal ||
        node.layoutSizingVertical ||
        node.layoutGrow ||
        node.layoutAlign
      ),
    },
  });

  return childProperties;
}

class FigmaImportService {
  // Store reference for dispatch
  private store = store;

  async importFromUrl(): Promise<void> {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const figmaToken = urlParams.get("figma-token");
      const figmaFile = urlParams.get("figma-file");

      if (!figmaToken || !figmaFile) {
        console.log("No Figma token or file ID in URL");
        return;
      }

      console.log("🎯 FigmaImportService: Starting import...", {
        token: "***present***",
        fileId: figmaFile,
      });

      const response = await fetch(
        `https://api.figma.com/v1/files/${figmaFile}`,
        {
          headers: {
            "X-Figma-Token": figmaToken,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const firstPage = data.document.children[0];

      if (firstPage) {
        await this.importFigmaObjects(firstPage, figmaToken, figmaFile);
        console.log("🎯 FigmaImportService: Import completed successfully");
      }
    } catch (error) {
      console.error("FigmaImportService: Import failed:", error);
    }
  }

  private async importFigmaObjects(
    firstPage: any,
    urlToken: string,
    urlFileId: string
  ): Promise<void> {
    // Import objects using their exact Figma coordinates

    // No offset - preserve exact Figma positioning
    let offsetX = 0;
    let offsetY = 0;

    console.log(
      "📍 IMPORT POSITIONING: Using exact Figma coordinates (no offset)"
    );
    console.log(
      "🏗️ AUTO LAYOUT IMPORT: Enhanced to import Auto Layout properties from Figma API"
    );

    // Create ID mapping from Figma IDs to new nanoid IDs
    const idMapping = new Map<string, string>();
    let zIndexCounter = 0; // Track z-index for proper layering

    // First pass: collect all nodes with images and their image references
    const imageNodeIds = new Set<string>();
    const imageRefToNodeMap = new Map<string, string>();
    const collectImageRefs = (node: any) => {
      if (node.fills) {
        node.fills.forEach((fill: any) => {
          if (fill.type === "IMAGE" && fill.imageRef) {
            console.log("Found image fill:", {
              nodeId: node.id,
              nodeType: node.type,
              imageRef: fill.imageRef,
              scaleMode: fill.scaleMode,
            });
            imageNodeIds.add(node.id);
            imageRefToNodeMap.set(fill.imageRef, node.id);
          }
        });
      }
      if (node.children) {
        node.children.forEach(collectImageRefs);
      }
    };

    if (firstPage.children) {
      firstPage.children.forEach(collectImageRefs);
    }

    console.log("Image mapping collected:", {
      nodeIds: Array.from(imageNodeIds),
      refToNodeMap: Object.fromEntries(imageRefToNodeMap),
    });

    // Fetch all image URLs from Figma API using image fills endpoint
    const imageFills = new Map<string, string>();
    if (imageRefToNodeMap.size > 0) {
      try {
        // Use image references directly instead of node IDs
        const imageRefs = Array.from(imageRefToNodeMap.keys()).join(",");

        console.log("Fetching image fills with:", {
          fileId: urlFileId,
          imageRefs,
          totalImageRefs: imageRefToNodeMap.size,
          token: urlToken ? "***present***" : "missing",
        });

        // Use the Image Fills API to get pure image URLs by image reference
        // This gives us the original images without any frame transformations
        const response = await fetch(
          `https://api.figma.com/v1/files/${urlFileId}/images`,
          {
            headers: {
              "X-Figma-Token": urlToken,
              "Content-Type": "application/json",
            },
          }
        );

        console.log(
          "Image Fills API response:",
          response.status,
          response.statusText
        );

        if (response.ok) {
          const data = await response.json();
          console.log("Image Fills API data:", data);

          if (data.meta && data.meta.images) {
            // Map from imageRef -> imageUrl directly
            Object.entries(data.meta.images).forEach(([imageRef, url]) => {
              if (typeof url === "string" && imageRefToNodeMap.has(imageRef)) {
                imageFills.set(imageRef, url);
                console.log("✅ Mapped image fill:", {
                  imageRef,
                  url: url.substring(0, 50) + "...",
                  nodeId: imageRefToNodeMap.get(imageRef),
                });
              }
            });
          }
        } else {
          const errorData = await response.json();
          console.error("Image Fills API error:", errorData);

          // Fallback: use the old Images API approach if image fills fails
          console.log("Falling back to Images API with node IDs...");
          const imageIds = Array.from(imageNodeIds).join(",");

          const fallbackResponse = await fetch(
            `https://api.figma.com/v1/images/${urlFileId}?ids=${imageIds}&format=png&scale=2`,
            {
              headers: {
                "X-Figma-Token": urlToken,
              },
            }
          );

          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            console.log("Fallback Images API data:", fallbackData);
            if (fallbackData.images) {
              // Map from nodeId -> imageUrl, then map to imageRef -> imageUrl
              Object.entries(fallbackData.images).forEach(([nodeId, url]) => {
                if (typeof url === "string") {
                  Array.from(imageRefToNodeMap.entries()).forEach(
                    ([imageRef, mappedNodeId]) => {
                      if (mappedNodeId === nodeId) {
                        imageFills.set(imageRef, url);
                      }
                    }
                  );
                }
              });
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch image URLs:", error);
      }
    }

    console.log("Final image fills mapping:", {
      totalImageRefs: imageRefToNodeMap.size,
      successfulMappings: imageFills.size,
      mappedFills: Object.fromEntries(imageFills),
    });

    // Convert nodes to canvas objects
    const convertNode = (
      node: any,
      parentId?: string,
      parentBounds?: { x: number; y: number }
    ): string | null => {
      if (!node) return null;

      // Check if this node was already processed (prevent infinite loops)
      if (idMapping.has(node.id)) {
        console.warn("Node already processed:", node.id);
        return idMapping.get(node.id)!;
      }

      let canvasObject = null;
      const newId = nanoid(); // Generate new ID for this object
      idMapping.set(node.id, newId); // Map Figma ID to new ID
      const currentZIndex = zIndexCounter++; // Assign and increment z-index

      // Calculate relative coordinates for nested objects
      let relativeX = (node.absoluteBoundingBox?.x || 0) + offsetX;
      let relativeY = (node.absoluteBoundingBox?.y || 0) + offsetY;

      if (parentBounds) {
        // If this object has a parent, make coordinates relative to parent
        relativeX = (node.absoluteBoundingBox?.x || 0) - parentBounds.x;
        relativeY = (node.absoluteBoundingBox?.y || 0) - parentBounds.y;

        // Debug logging for nested objects
        console.log(`🔍 NESTED OBJECT COORDS:`, {
          nodeName: node.name,
          nodeType: node.type,
          absoluteBoundingBox: node.absoluteBoundingBox,
          parentBounds,
          calculatedRelative: { x: relativeX, y: relativeY },
        });
      }

      // Round coordinates and dimensions to 2 decimal places for cleaner values
      const roundedX = Math.round(relativeX * 100) / 100;
      const roundedY = Math.round(relativeY * 100) / 100;

      // Debug: show rounding effect
      if (parentBounds) {
        console.log(`🔢 ROUNDING:`, {
          nodeName: node.name,
          beforeRounding: { x: relativeX, y: relativeY },
          afterRounding: { x: roundedX, y: roundedY },
        });
      }
      const width =
        Math.round((node.absoluteBoundingBox?.width || 100) * 100) / 100;

      // For text nodes, calculate height more intelligently when missing
      let height;
      if (node.type === "TEXT" && !node.absoluteBoundingBox?.height) {
        // If Figma doesn't provide height (e.g., due to line-height 0),
        // calculate based on font size as a reasonable fallback
        const fontSize = node.style?.fontSize || 16;
        height = Math.round(fontSize * 100) / 100;
      } else {
        height =
          Math.round((node.absoluteBoundingBox?.height || 100) * 100) / 100;
      }

      // Convert child Auto Layout properties (always provide defaults)
      const autoLayoutSizing = convertChildAutoLayoutProperties(node) || {
        horizontal: "fixed" as const,
        vertical: "fixed" as const,
      };

      // Enhanced logging for import debugging
      console.log(`📦 IMPORTING NODE - ${node.type} "${node.name}":`, {
        nodeId: node.id,
        nodeType: node.type,
        rawAutoLayoutProps: {
          layoutSizingHorizontal: node.layoutSizingHorizontal,
          layoutSizingVertical: node.layoutSizingVertical,
          layoutGrow: node.layoutGrow,
          layoutAlign: node.layoutAlign,
        },
        hasParent: !!node.parent,
        parentInfo: node.parent
          ? {
              parentType: node.parent.type,
              parentLayoutMode: node.parent.layoutMode,
              parentName: node.parent.name,
            }
          : null,
        finalAutoLayoutSizing: autoLayoutSizing,
        allLayoutKeys: Object.keys(node).filter((k) => k.includes("layout")),
      });

      // 🔍 LOG: All Figma nodes to see what we're getting
      console.log(
        `🔍 FigmaImportService - Figma Node: ${node.type} - "${node.name}"`,
        {
          type: node.type,
          name: node.name,
          id: node.id,
          hasChildren: !!node.children && node.children.length > 0,
          childrenCount: node.children?.length || 0,
          booleanOperation: (node as any).booleanOperation,
          componentId: (node as any).componentId, // For instances
          bounds: node.absoluteBoundingBox,
        }
      );

      switch (node.type) {
        case "FRAME":
          const frameOverflow =
            node.clipsContent === false
              ? ("visible" as const)
              : ("hidden" as const);

          const frameSizing = convertFigmaFrameSizingToAutoLayoutSizing(node);

          console.log("🖼️ FRAME IMPORT:", {
            name: node.name,
            nodeId: node.id,
            clipsContent: node.clipsContent,
            overflow: frameOverflow,
            importedAutoLayoutSizing: frameSizing,
            rawLayoutMode: node.layoutMode,
            rawSizingModes: {
              primaryAxisSizingMode: node.primaryAxisSizingMode,
              counterAxisSizingMode: node.counterAxisSizingMode,
              layoutSizingHorizontal: node.layoutSizingHorizontal,
              layoutSizingVertical: node.layoutSizingVertical,
              layoutGrow: node.layoutGrow,
            },
          });

          canvasObject = {
            id: newId,
            type: "frame" as const,
            name: node.name || "Frame",
            createdAt: Date.now(),
            x: roundedX,
            y: roundedY,
            width,
            height,
            rotation: 0,
            parentId,
            childIds: [],
            zIndex: currentZIndex,
            visible: node.visible !== false,
            locked: false,
            autoLayoutSizing: frameSizing,
            fills: this.convertFills(node.fills || [], imageFills),
            // New stroke system
            strokes: this.convertStrokes(node.strokes || []),
            strokeWidth: node.strokeWeight || 1,
            strokePosition: this.convertStrokePosition(node.strokeAlign),
            strokeWidths: this.convertIndividualStrokeWidths(node),
            // Legacy stroke properties for backward compatibility
            stroke: this.convertStroke(node.strokes?.[0]),
            opacity: node.opacity || 1,
            blendMode: this.convertFigmaBlendMode(
              node.blendMode,
              `NODE: ${node.name}`
            ),
            properties: {
              type: "frame" as const,
              overflow: frameOverflow,
              borderRadius: convertFigmaCornerRadii(
                node.cornerRadius,
                node.rectangleCornerRadii
              ),
              autoLayout: convertFigmaAutoLayoutToCanvas(node),
            },
          };
          break;

        case "RECTANGLE":
          console.log("🔳 RECTANGLE IMPORT:", {
            name: node.name,
            nodeId: node.id,
            importedAutoLayoutSizing: autoLayoutSizing,
            rawLayoutProps: {
              layoutSizingHorizontal: node.layoutSizingHorizontal,
              layoutSizingVertical: node.layoutSizingVertical,
              layoutGrow: node.layoutGrow,
            },
          });

          canvasObject = {
            id: newId,
            type: "rectangle" as const,
            name: node.name || "Rectangle",
            createdAt: Date.now(),
            x: roundedX,
            y: roundedY,
            width,
            height,
            rotation: 0,
            parentId,
            childIds: [],
            zIndex: currentZIndex,
            visible: node.visible !== false,
            locked: false,
            autoLayoutSizing,
            fills: this.convertFills(node.fills || [], imageFills),
            // New stroke system
            strokes: this.convertStrokes(node.strokes || []),
            strokeWidth: node.strokeWeight || 1,
            strokePosition: this.convertStrokePosition(node.strokeAlign),
            strokeWidths: this.convertIndividualStrokeWidths(node),
            // Legacy stroke properties for backward compatibility
            stroke: this.convertStroke(node.strokes?.[0]),
            opacity: node.opacity || 1,
            blendMode: this.convertFigmaBlendMode(
              node.blendMode,
              `NODE: ${node.name}`
            ),
            properties: {
              type: "rectangle" as const,
              borderRadius: convertFigmaCornerRadii(
                node.cornerRadius,
                node.rectangleCornerRadii
              ),
            },
          };
          break;

        case "TEXT":
          // Helper function to convert Figma's textAutoResize to our resize mode
          const convertTextAutoResize = (
            figmaAutoResize: string | undefined
          ) => {
            console.log("🔄 CONVERTING TEXT AUTO RESIZE:", {
              figmaValue: figmaAutoResize,
              nodeName: node.name,
              hasTextAutoResize: figmaAutoResize !== undefined,
              hasStyle: !!node.style,
              styleKeys: node.style ? Object.keys(node.style) : [],
            });

            // Handle undefined case explicitly
            if (figmaAutoResize === undefined || figmaAutoResize === null) {
              console.log(
                "📝 TEXT AUTO RESIZE UNDEFINED - using fixed fallback for node:",
                node.name,
                {
                  hasStyleObject: !!node.style,
                  styleFontSize: node.style?.fontSize,
                  styleFontFamily: node.style?.fontFamily,
                  textContent: node.characters?.substring(0, 30) + "...",
                  reasoning:
                    "undefined textAutoResize typically means fixed dimensions",
                }
              );

              // When textAutoResize is undefined, text typically has fixed dimensions
              console.log("📝 FALLBACK: undefined → fixed");
              return "fixed" as const;
            }

            let result: string;
            switch (figmaAutoResize) {
              case "WIDTH_AND_HEIGHT":
                // Both width and height adjust to content -> auto-width (text shrinks/grows to fit content)
                result = "auto-width";
                break;
              case "HEIGHT":
                // Height adjusts to content -> text height grows/shrinks, width is fixed
                result = "auto-height";
                break;
              case "NONE":
                // No auto-resize -> text has fixed dimensions, doesn't resize to fit content
                result = "fixed";
                break;
              default:
                console.warn(
                  "⚠️ Unknown textAutoResize value:",
                  figmaAutoResize,
                  "for node:",
                  node.name
                );
                result = "auto-height"; // More sensible default
                break;
            }

            console.log(`📝 FIGMA TEXT RESIZE CONVERSION:`, {
              nodeName: node.name,
              figmaValue: figmaAutoResize,
              convertedValue: result,
              mapping: `${figmaAutoResize} → ${result}`,
            });

            return result as "fixed" | "auto-width" | "auto-height";
          };

          // Debug the actual node structure before conversion
          console.log("🔍 TEXT NODE STRUCTURE DEBUG:", {
            nodeName: node.name,
            nodeId: node.id,
            hasStyle: !!node.style,
            styleTextAutoResize: node.style?.textAutoResize,
            allStyleProps: node.style ? Object.keys(node.style).sort() : [],
            textAutoResizeDirectly: (node as any).textAutoResize, // Check if it's at root level
          });

          const figmaResizeMode = convertTextAutoResize(
            node.style?.textAutoResize
          );

          // Note: Figma REST API DOES provide character-level styling via:
          // - characterStyleOverrides: array mapping each character to a style override ID
          // - styleOverrideTable: map from override IDs to actual style objects

          // Debug: Log the actual structure of letterSpacing and lineHeight from Figma API
          console.log("🔍 FIGMA TEXT IMPORT DEBUG:", {
            nodeName: node.name,
            nodeId: node.id,
            fullStyle: node.style,
            letterSpacing: node.style?.letterSpacing,
            letterSpacingType: typeof node.style?.letterSpacing,
            letterSpacingKeys: node.style?.letterSpacing
              ? Object.keys(node.style.letterSpacing)
              : null,
            lineHeightUnit: node.style?.lineHeightUnit,
            lineHeightPx: node.style?.lineHeightPx,
            lineHeightPercent: node.style?.lineHeightPercent,
            lineHeightPercentFontSize: node.style?.lineHeightPercentFontSize,
            // Rich text styling properties
            characterStyleOverrides: (node as any).characterStyleOverrides,
            styleOverrideTable: (node as any).styleOverrideTable,
            characters: node.characters,
            charactersLength: node.characters?.length,
          });

          // Additional debug for the full style object
          console.log("📝 TEXT IMPORT:", {
            name: node.name,
            nodeId: node.id,
            importedAutoLayoutSizing: autoLayoutSizing,
            rawLayoutProps: {
              layoutSizingHorizontal: node.layoutSizingHorizontal,
              layoutSizingVertical: node.layoutSizingVertical,
              layoutGrow: node.layoutGrow,
            },
            textAutoResize: node.textAutoResize,
            characters:
              node.characters?.substring(0, 50) +
              (node.characters?.length > 50 ? "..." : ""),
          });

          console.log(
            "🔍 FULL STYLE OBJECT:",
            JSON.stringify(node.style, null, 2)
          );

          canvasObject = {
            id: newId,
            type: "text" as const,
            name: node.name || "Text",
            createdAt: Date.now(),
            x: roundedX,
            y: roundedY,
            width,
            height,
            rotation: 0,
            parentId,
            childIds: [],
            zIndex: currentZIndex,
            visible: node.visible !== false,
            locked: false,
            autoLayoutSizing,
            fills: this.convertFills(node.fills || [], imageFills),
            // New stroke system
            strokes: this.convertStrokes(node.strokes || []),
            strokeWidth: node.strokeWeight || 1,
            strokePosition: this.convertStrokePosition(node.strokeAlign),
            strokeWidths: this.convertIndividualStrokeWidths(node),
            // Legacy stroke properties for backward compatibility
            stroke: this.convertStroke(node.strokes?.[0]),
            opacity: node.opacity || 1,
            blendMode: this.convertFigmaBlendMode(
              node.blendMode,
              `NODE: ${node.name}`
            ),
            properties: {
              type: "text" as const,
              content: node.characters || "Text",
              // Add rich text content if available
              slateContent: (() => {
                const characterStyleOverrides = (node as any)
                  .characterStyleOverrides;
                const styleOverrideTable = (node as any).styleOverrideTable;

                if (characterStyleOverrides && styleOverrideTable) {
                  // Merge node-level fills with base style for proper text coloring
                  const baseStyleWithFills = {
                    ...node.style,
                    // Use node-level fills if style doesn't have fills
                    fills: node.style?.fills || node.fills || [],
                  };

                  console.log("🎨 TEXT BASE STYLE WITH FILLS:", {
                    nodeName: node.name,
                    styleFills: node.style?.fills,
                    nodeFills: node.fills,
                    mergedFills: baseStyleWithFills.fills,
                  });

                  const richTextContent = convertFigmaRichTextToSlate(
                    node.characters || "",
                    characterStyleOverrides,
                    styleOverrideTable,
                    baseStyleWithFills
                  );

                  console.log("💾 STORING RICH TEXT AS JSON:", richTextContent);

                  // Store as JSON string for TextRenderer
                  return JSON.stringify(richTextContent);
                }

                // Even if no character style overrides, check if we have node-level fills
                // that should be applied to the entire text
                if (node.fills && node.fills.length > 0) {
                  console.log("🎨 TEXT NODE FILLS WITHOUT OVERRIDES:", {
                    nodeName: node.name,
                    nodeFills: node.fills,
                    hasStyleFills: !!node.style?.fills,
                  });

                  // Create simple slate content with node-level fills applied
                  const baseStyleWithFills = {
                    ...node.style,
                    fills: node.fills,
                  };

                  const fillMarks = convertFigmaStyleToSlateMarks(
                    baseStyleWithFills,
                    {}
                  );

                  const simpleSlateContent = [
                    {
                      type: "paragraph",
                      children: [
                        {
                          text: node.characters || "Text",
                          ...fillMarks,
                        },
                      ],
                    },
                  ];

                  console.log(
                    "💾 STORING SIMPLE TEXT WITH FILLS:",
                    simpleSlateContent
                  );
                  return JSON.stringify(simpleSlateContent);
                }

                return null; // Will fall back to simple content
              })(),
              fontSize: node.style?.fontSize || 16,
              fontFamily: node.style?.fontFamily || "Inter, sans-serif",
              fontWeight: node.style?.fontWeight || 400,
              textAlign:
                (node.style?.textAlignHorizontal?.toLowerCase() as
                  | "left"
                  | "center"
                  | "right") || "left",
              verticalAlign: (() => {
                const figmaVerticalAlign = node.style?.textAlignVertical;
                console.log("📝 CONVERTING VERTICAL TEXT ALIGNMENT:", {
                  nodeName: node.name,
                  figmaValue: figmaVerticalAlign,
                });

                switch (figmaVerticalAlign) {
                  case "TOP":
                    return "top" as const;
                  case "CENTER":
                    return "middle" as const;
                  case "BOTTOM":
                    return "bottom" as const;
                  default:
                    console.log(
                      `📝 VERTICAL ALIGN FALLBACK: ${figmaVerticalAlign} → top`
                    );
                    return "top" as const; // Default to top alignment
                }
              })(),
              lineHeight: (() => {
                const figmaLineHeightUnit = node.style?.lineHeightUnit;

                let result;

                // Handle different line height units from Figma API
                if (figmaLineHeightUnit === "FONT_SIZE_%") {
                  // Use percentage format - lineHeightPercentFontSize is the actual percentage value
                  // Use nullish coalescing to allow 0 values
                  result = {
                    value: node.style?.lineHeightPercentFontSize ?? 120,
                    unit: "%" as const,
                  };
                } else {
                  // Default to pixels (PIXELS unit or any other)
                  // Use nullish coalescing to allow 0 values
                  result = {
                    value: node.style?.lineHeightPx ?? 19,
                    unit: "px" as const,
                  };
                }

                console.log("🔍 LINE HEIGHT CONVERSION:", {
                  nodeName: node.name,
                  originalUnit: figmaLineHeightUnit,
                  originalPercent: node.style?.lineHeightPercent,
                  originalPx: node.style?.lineHeightPx,
                  convertedValue: result,
                  allowsZero: "Using ?? operator to preserve 0 values",
                });

                return result;
              })(),
              letterSpacing: (() => {
                const figmaLetterSpacing = node.style?.letterSpacing;

                let result;

                // Handle different possible formats from Figma API
                if (
                  figmaLetterSpacing &&
                  typeof figmaLetterSpacing === "object"
                ) {
                  // If it's already an object with value and unit
                  if (
                    "value" in figmaLetterSpacing &&
                    "unit" in figmaLetterSpacing
                  ) {
                    result = {
                      value: figmaLetterSpacing.value || 0,
                      unit: figmaLetterSpacing.unit === "PERCENT" ? "%" : "px",
                    };
                  } else {
                    result = { value: 0, unit: "px" as const };
                  }
                } else if (typeof figmaLetterSpacing === "number") {
                  // Figma API returns letter spacing as pixel values
                  // even when displayed as percentages in the Figma UI
                  result = {
                    value: figmaLetterSpacing,
                    unit: "px" as const,
                  };
                } else {
                  // Default fallback
                  result = {
                    value: 0,
                    unit: "px" as const,
                  };
                }

                console.log("🔍 LETTER SPACING CONVERSION:", {
                  nodeName: node.name,
                  originalFigmaValue: figmaLetterSpacing,
                  convertedValue: result,
                });

                return result;
              })(),
              resizeMode: figmaResizeMode, // Use converted resize mode from Figma
            },
          };

          // Comprehensive text import validation and logging
          console.log("✅ TEXT NODE IMPORTED:", {
            nodeName: node.name,
            nodeId: node.id,
            originalTextAutoResize: node.style?.textAutoResize,
            convertedResizeMode: figmaResizeMode,
            fontSize: node.style?.fontSize,
            fontFamily: node.style?.fontFamily,
            textContent:
              node.characters?.substring(0, 50) +
              (node.characters?.length > 50 ? "..." : ""),
            textLength: node.characters?.length,
            hasRichText: !!(node as any).characterStyleOverrides,
            nodeWidth: node.absoluteBoundingBox?.width,
            nodeHeight: node.absoluteBoundingBox?.height,
          });

          // Validate critical text properties
          if (!node.characters && node.characters !== "") {
            console.warn("⚠️ TEXT NODE MISSING CHARACTERS:", {
              nodeName: node.name,
              nodeId: node.id,
            });
          }

          if (!node.style?.fontSize) {
            console.warn("⚠️ TEXT NODE MISSING FONT SIZE:", {
              nodeName: node.name,
              nodeId: node.id,
              style: node.style,
            });
          }

          if (!node.style?.fontFamily) {
            console.warn("⚠️ TEXT NODE MISSING FONT FAMILY:", {
              nodeName: node.name,
              nodeId: node.id,
              style: node.style,
            });
          }

          break;

        case "VECTOR":
          // For vectors, we'll export them as SVG images since vector path data
          // is not available in the standard Figma API response
          console.log(
            "Importing VECTOR node as image (FigmaImportService):",
            node.name,
            node.id
          );

          // Create a placeholder vector object that will be populated with SVG data
          canvasObject = {
            id: newId,
            type: "vector" as const,
            name: node.name || "Vector",
            createdAt: Date.now(),
            x: roundedX,
            y: roundedY,
            width,
            height,
            rotation: 0,
            parentId,
            childIds: [],
            zIndex: currentZIndex,
            visible: node.visible !== false,
            locked: false,
            autoLayoutSizing,
            fills: this.convertFills(node.fills || [], imageFills),
            // New stroke system
            strokes: this.convertStrokes(node.strokes || []),
            strokeWidth: node.strokeWeight || 1,
            strokePosition: this.convertStrokePosition(node.strokeAlign),
            strokeWidths: this.convertIndividualStrokeWidths(node),
            // Legacy stroke properties for backward compatibility
            stroke: this.convertStroke(node.strokes?.[0]),
            opacity: node.opacity || 1,
            blendMode: this.convertFigmaBlendMode(
              node.blendMode,
              `NODE: ${node.name}`
            ),
            properties: {
              type: "vector" as const,
              vectorPaths: "", // Will be populated with SVG data from export
              handleMirroring: node.handleMirroring || "NONE",
              figmaNodeId: node.id, // Store for SVG export
            },
          };
          break;

        case "BOOLEAN_OPERATION":
          // 🎯 Boolean operations - treat exactly like vectors but with operation info
          console.log(
            "✅ Found BOOLEAN_OPERATION in FigmaImportService:",
            node.name,
            {
              operation: (node as any).booleanOperation,
              hasChildren: !!node.children && node.children.length > 0,
            }
          );

          // Create a placeholder vector object that will be populated with SVG data
          canvasObject = {
            id: newId,
            type: "vector" as const, // Treat as vector since it exports as SVG
            name: node.name || "Boolean Operation",
            createdAt: Date.now(),
            x: roundedX,
            y: roundedY,
            width,
            height,
            rotation: 0,
            parentId,
            childIds: [],
            zIndex: currentZIndex,
            visible: node.visible !== false,
            locked: false,
            autoLayoutSizing,
            fills: this.convertFills(node.fills || [], imageFills),
            // New stroke system
            strokes: this.convertStrokes(node.strokes || []),
            strokeWidth: node.strokeWeight || 1,
            strokePosition: this.convertStrokePosition(node.strokeAlign),
            strokeWidths: this.convertIndividualStrokeWidths(node),
            // Legacy stroke properties for backward compatibility
            stroke: this.convertStroke(node.strokes?.[0]),
            opacity: node.opacity || 1,
            blendMode: this.convertFigmaBlendMode(
              node.blendMode,
              `NODE: ${node.name}`
            ),
            properties: {
              type: "vector" as const,
              vectorPaths: "", // Will be populated with SVG data from export
              handleMirroring: "NONE",
              figmaNodeId: node.id, // Store for SVG export
              booleanOperation: (node as any).booleanOperation || "UNION",
              isBoolean: true, // Flag as boolean operation
            },
          };
          break;

        case "COMPONENT":
          // 🧩 Component - detach during import, treat as frame with children
          console.log(
            "🧩 Found COMPONENT in FigmaImportService (detaching):",
            node.name,
            {
              hasChildren: !!node.children && node.children.length > 0,
              childrenCount: node.children?.length || 0,
              absoluteBoundingBox: node.absoluteBoundingBox,
            }
          );

          // Import component as a regular frame (detached from component system)
          // This effectively "detaches" the component during import
          const componentFrameOverflow =
            node.clipsContent === false
              ? ("visible" as const)
              : ("hidden" as const);

          canvasObject = {
            id: newId,
            type: "frame" as const, // Convert component to frame
            name: node.name || "Component (detached)",
            createdAt: Date.now(),
            x: roundedX,
            y: roundedY,
            width,
            height,
            rotation: 0,
            parentId,
            childIds: [],
            zIndex: currentZIndex,
            visible: node.visible !== false,
            locked: false,
            autoLayoutSizing,
            fills: this.convertFills(node.fills || [], imageFills),
            // New stroke system
            strokes: this.convertStrokes(node.strokes || []),
            strokeWidth: node.strokeWeight || 1,
            strokePosition: this.convertStrokePosition(node.strokeAlign),
            strokeWidths: this.convertIndividualStrokeWidths(node),
            // Legacy stroke properties for backward compatibility
            stroke: this.convertStroke(node.strokes?.[0]),
            opacity: node.opacity || 1,
            blendMode: this.convertFigmaBlendMode(
              node.blendMode,
              `NODE: ${node.name}`
            ),
            properties: {
              type: "frame" as const,
              overflow: componentFrameOverflow,
              borderRadius: convertFigmaCornerRadii(
                node.cornerRadius,
                node.rectangleCornerRadii
              ),
              autoLayout: convertFigmaAutoLayoutToCanvas(node),
              // Add metadata about original component status
              originalFigmaType: "COMPONENT",
              detachedComponent: true,
            },
          };
          break;

        case "INSTANCE":
          // 📋 Instance - detach during import, treat as frame with children
          console.log(
            "📋 Found INSTANCE in FigmaImportService (detaching):",
            node.name,
            {
              componentId: (node as any).componentId,
              hasChildren: !!node.children && node.children.length > 0,
              childrenCount: node.children?.length || 0,
              absoluteBoundingBox: node.absoluteBoundingBox,
            }
          );

          // Import instance as a regular frame (detached from component system)
          // This effectively "detaches" the instance during import
          const instanceFrameOverflow =
            node.clipsContent === false
              ? ("visible" as const)
              : ("hidden" as const);

          canvasObject = {
            id: newId,
            type: "frame" as const, // Convert instance to frame
            name: node.name || "Instance (detached)",
            createdAt: Date.now(),
            x: roundedX,
            y: roundedY,
            width,
            height,
            rotation: 0,
            parentId,
            childIds: [],
            zIndex: currentZIndex,
            visible: node.visible !== false,
            locked: false,
            autoLayoutSizing,
            fills: this.convertFills(node.fills || [], imageFills),
            // New stroke system
            strokes: this.convertStrokes(node.strokes || []),
            strokeWidth: node.strokeWeight || 1,
            strokePosition: this.convertStrokePosition(node.strokeAlign),
            strokeWidths: this.convertIndividualStrokeWidths(node),
            // Legacy stroke properties for backward compatibility
            stroke: this.convertStroke(node.strokes?.[0]),
            opacity: node.opacity || 1,
            blendMode: this.convertFigmaBlendMode(
              node.blendMode,
              `NODE: ${node.name}`
            ),
            properties: {
              type: "frame" as const,
              overflow: instanceFrameOverflow,
              borderRadius: convertFigmaCornerRadii(
                node.cornerRadius,
                node.rectangleCornerRadii
              ),
              autoLayout: convertFigmaAutoLayoutToCanvas(node),
              // Add metadata about original instance status
              originalFigmaType: "INSTANCE",
              detachedInstance: true,
              originalComponentId: (node as any).componentId,
            },
          };
          break;
      }

      if (canvasObject) {
        // Process children first to get their IDs
        let childIds: string[] = [];
        if (node.children) {
          const currentBounds = {
            x: node.absoluteBoundingBox?.x || 0,
            y: node.absoluteBoundingBox?.y || 0,
          };

          for (const child of node.children) {
            const childId = convertNode(child, newId, currentBounds); // Pass parent bounds
            if (childId) {
              childIds.push(childId);
            }
          }
        }

        // Update canvas object with childIds before dispatching (avoid separate update)
        (canvasObject as any).childIds = childIds;

        // Single dispatch with complete object including children
        this.store.getState().dispatch({
          type: "object.created",
          payload: { object: canvasObject },
        });

        return newId; // Return the new ID
      }

      return null; // Return null if no object was created
    };

    // Convert all top-level frames
    if (firstPage.children) {
      for (const child of firstPage.children) {
        convertNode(child);
      }
    }

    // After importing all objects, fetch SVG data for vector objects
    console.log("🎯 About to call fetchVectorSVGs...");
    await this.fetchVectorSVGs(urlToken, urlFileId);
    console.log("🎯 fetchVectorSVGs completed");
  }

  // Function to fetch SVG data for all vector objects
  private async fetchVectorSVGs(token: string, fileId: string): Promise<void> {
    console.log("🎯 fetchVectorSVGs called with:", {
      token: token ? "***present***" : "missing",
      fileId,
    });

    // Wait a moment for the store to be updated with the new objects
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get all vector objects from the store
    const currentState = this.store.getState();
    console.log("🎯 Current state objects:", Object.keys(currentState.objects));
    console.log(
      "🎯 All objects:",
      Object.values(currentState.objects).map((obj) => ({
        id: obj.id,
        type: obj.type,
        name: obj.name,
      }))
    );

    const vectorObjects = Object.values(currentState.objects).filter(
      (obj) =>
        obj.type === "vector" &&
        obj.properties.type === "vector" &&
        (obj.properties as any).figmaNodeId
    );

    console.log(
      "🎯 Found vector objects:",
      vectorObjects.length,
      vectorObjects.map((obj) => ({
        id: obj.id,
        name: obj.name,
        figmaNodeId: (obj.properties as any).figmaNodeId,
      }))
    );

    if (vectorObjects.length === 0) {
      console.log("🎯 No vector objects found, skipping SVG fetch");
      return;
    }

    console.log(
      `Fetching SVG data for ${vectorObjects.length} vector objects...`
    );

    try {
      // Get SVG exports for all vector nodes in one API call
      const nodeIds = vectorObjects
        .map((obj) => (obj.properties as any).figmaNodeId)
        .join(",");
      const exportUrl = `https://api.figma.com/v1/images/${fileId}?ids=${nodeIds}&format=svg`;

      const response = await fetch(exportUrl, {
        headers: {
          "X-Figma-Token": token,
        },
      });

      if (!response.ok) {
        console.warn("Failed to fetch vector SVGs:", response.statusText);
        return;
      }

      const exportData = await response.json();
      console.log("SVG export response:", exportData);

      // Update each vector object with its SVG URL
      vectorObjects.forEach((vectorObj) => {
        const figmaNodeId = (vectorObj.properties as any).figmaNodeId;
        const svgUrl = exportData.images?.[figmaNodeId];

        if (svgUrl) {
          console.log("🎨 Updating vector object:", {
            id: vectorObj.id,
            name: vectorObj.name,
            figmaNodeId,
            svgUrl,
            currentVectorPaths: (vectorObj.properties as any).vectorPaths,
            newProperties: {
              ...vectorObj.properties,
              vectorPaths: svgUrl,
            },
          });

          this.store.getState().dispatch({
            type: "object.updated",
            payload: {
              id: vectorObj.id,
              changes: {
                properties: {
                  ...vectorObj.properties,
                  vectorPaths: svgUrl, // Store the SVG URL
                },
              },
            },
          });
        }
      });
    } catch (error) {
      console.error("Error fetching vector SVGs:", error);
    }
  }

  private convertFigmaBlendMode(
    figmaBlendMode?: string,
    context?: string
  ): string | undefined {
    // Handle PASS_THROUGH vs explicit NORMAL distinction
    if (!figmaBlendMode || figmaBlendMode === "PASS_THROUGH") {
      // PASS_THROUGH means "no blend mode set at node level"
      // Return undefined to allow fill blend mode promotion logic
      return undefined;
    }

    // Map Figma blend modes to our supported CSS blend modes
    const blendModeMapping: Record<string, string> = {
      NORMAL: "normal",
      MULTIPLY: "multiply",
      SCREEN: "screen",
      OVERLAY: "overlay",
      SOFT_LIGHT: "soft-light",
      HARD_LIGHT: "hard-light",
      COLOR_DODGE: "color-dodge",
      COLOR_BURN: "color-burn",
      DARKEN: "darken",
      LIGHTEN: "lighten",
      DIFFERENCE: "difference",
      EXCLUSION: "exclusion",
      HUE: "hue",
      SATURATION: "saturation",
      COLOR: "color",
      LUMINOSITY: "luminosity",
      PLUS_DARKER: "plus-darker",
      PLUS_LIGHTER: "plus-lighter",
    };

    const convertedValue = blendModeMapping[figmaBlendMode] || "normal";

    return convertedValue;
  }

  private convertFigmaRotation(figmaRotation?: number): number {
    // Figma rotation is in radians, convert to degrees
    // Figma rotation is clockwise, our system uses clockwise as well
    return figmaRotation ? (figmaRotation * 180) / Math.PI : 0;
  }

  private convertFills(
    figmaFills: any[],
    imageFills: Map<string, string> = new Map()
  ) {
    return figmaFills
      .filter((fill) => fill.visible !== false)
      .map((fill) => {
        if (fill.type === "SOLID") {
          return {
            id: Math.random().toString(36).substr(2, 9),
            type: "solid" as const,
            color: this.rgbaToHex(fill.color),
            opacity: fill.opacity || 1,
            visible: true,
            blendMode: this.convertFigmaBlendMode(
              fill.blendMode,
              `FILL: ${fill.type}`
            ),
          };
        } else if (fill.type === "IMAGE") {
          // Handle image fills - use pre-fetched image URL
          const imageUrl = imageFills.get(fill.imageRef) || "";

          // If we couldn't fetch the image, create a placeholder solid fill
          if (!imageUrl) {
            console.warn(
              "No image URL found for imageRef:",
              fill.imageRef,
              "- creating placeholder"
            );
            return {
              id: Math.random().toString(36).substr(2, 9),
              type: "solid" as const,
              color: "#E5E5E5", // Light gray placeholder
              opacity: fill.opacity || 1,
              visible: true,
              blendMode: this.convertFigmaBlendMode(
                fill.blendMode,
                `FILL: ${fill.type}`
              ),
            };
          }

          return {
            id: Math.random().toString(36).substr(2, 9),
            type: "image" as const,
            imageUrl,
            opacity: fill.opacity || 1,
            visible: true,
            blendMode: this.convertFigmaBlendMode(
              fill.blendMode,
              `FILL: ${fill.type}`
            ),
            fit: this.convertFigmaScaleMode(fill.scaleMode),
            rotation: this.convertFigmaRotation(fill.rotation),
            // Extract positioning and scaling from imageTransform matrix
            ...this.convertFigmaImageTransform(fill.imageTransform),
            // Import image adjustments from Figma
            adjustments: this.convertFigmaImageAdjustments(fill.filters),
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  private convertStroke(figmaStroke: any) {
    if (!figmaStroke || figmaStroke.type !== "SOLID") return undefined;
    return this.rgbaToHex(figmaStroke.color);
  }

  // Convert Figma strokes to our new stroke system
  private convertStrokes(figmaStrokes: any[]): any[] {
    if (!figmaStrokes || !Array.isArray(figmaStrokes)) return [];

    return figmaStrokes
      .filter((stroke) => stroke.type === "SOLID" && stroke.visible !== false)
      .map((stroke, index) => ({
        id: `stroke-${Date.now()}-${index}`,
        type: "solid" as const,
        color: this.rgbaToHex(stroke.color),
        opacity: stroke.opacity || 1,
        visible: stroke.visible !== false,
        blendMode: this.convertFigmaBlendMode(stroke.blendMode) || "normal",
      }));
  }

  // Convert Figma stroke alignment to our stroke position
  private convertStrokePosition(
    figmaStrokeAlign: string | undefined
  ): "inside" | "center" | "outside" {
    switch (figmaStrokeAlign) {
      case "INSIDE":
        return "inside";
      case "CENTER":
        return "center";
      case "OUTSIDE":
        return "outside";
      default:
        return "inside"; // Default to inside like Figma
    }
  }

  // Convert individual stroke weights (if available)
  private convertIndividualStrokeWidths(node: any): any {
    // Check if Figma provides individual stroke weights
    if (node.individualStrokeWeights) {
      return {
        top: node.individualStrokeWeights.top || 0,
        right: node.individualStrokeWeights.right || 0,
        bottom: node.individualStrokeWeights.bottom || 0,
        left: node.individualStrokeWeights.left || 0,
      };
    }
    return undefined;
  }

  private rgbaToHex(rgba: { r: number; g: number; b: number; a?: number }) {
    const r = Math.round(rgba.r * 255)
      .toString(16)
      .padStart(2, "0");
    const g = Math.round(rgba.g * 255)
      .toString(16)
      .padStart(2, "0");
    const b = Math.round(rgba.b * 255)
      .toString(16)
      .padStart(2, "0");
    return `#${r}${g}${b}`;
  }

  private convertFigmaScaleMode(scaleMode: string | undefined) {
    // Convert Figma scale modes to our canvas scale modes
    switch (scaleMode) {
      case "FILL":
        return "fill" as const;
      case "FIT":
        return "fit" as const;
      case "STRETCH":
        return "crop" as const;
      case "TILE":
        return "tile" as const;
      default:
        return "fill" as const; // Default to fill
    }
  }

  private convertFigmaImageTransform(imageTransform: any) {
    // Convert Figma's imageTransform matrix to positioning/scaling properties
    if (!imageTransform || !Array.isArray(imageTransform)) {
      return {}; // No transform, use defaults
    }

    // Figma's imageTransform is a 2x3 affine transformation matrix: [[a, b, tx], [c, d, ty]]
    // Standard 2D affine transform: [a b tx] [c d ty] where:
    // a, d = scale; b, c = skew/rotation; tx, ty = translation
    try {
      if (
        imageTransform.length >= 2 &&
        Array.isArray(imageTransform[0]) &&
        Array.isArray(imageTransform[1]) &&
        imageTransform[0].length >= 3 &&
        imageTransform[1].length >= 3
      ) {
        const [[a, b, tx], [c, d, ty]] = imageTransform;

        // Extract scale factors - Figma uses clean 2D transforms
        // For standard scaling without rotation: a=scaleX, d=scaleY, b=c=0
        const scaleX = Math.abs(a); // Direct X scale factor
        const scaleY = Math.abs(d); // Direct Y scale factor

        // Store both X and Y scales separately for proper handling
        // Don't average them - CSS can handle non-uniform scaling

        // The transformation matrix is applied to the image within the frame
        // However, CSS background-position works in the opposite direction
        // When Figma moves image right (+tx), CSS needs negative offset to show left part
        const offsetX = -tx;
        const offsetY = -ty;

        const result = {
          scaleX: scaleX !== 1 ? scaleX : undefined,
          scaleY: scaleY !== 1 ? scaleY : undefined,
          offsetX: offsetX !== 0 ? offsetX : undefined,
          offsetY: offsetY !== 0 ? offsetY : undefined,
        };

        return result;
      }
    } catch (error) {
      console.warn("Failed to parse imageTransform matrix:", error);
    }

    return {}; // Fallback to defaults
  }

  private convertFigmaImageAdjustments(filters: any) {
    // Convert Figma's filters to our ImageAdjustments format
    if (!filters) return undefined;

    console.log("🖼️ IMPORTING FIGMA IMAGE ADJUSTMENTS:", filters);

    const adjustments: any = {};

    // Figma's filters properties (based on Figma API documentation)
    // Values from Figma are typically in -1 to 1 range, convert to -100 to 100
    if (typeof filters.exposure === "number") {
      adjustments.exposure = filters.exposure * 100;
    }
    if (typeof filters.contrast === "number") {
      adjustments.contrast = filters.contrast * 100;
    }
    if (typeof filters.saturation === "number") {
      adjustments.saturation = filters.saturation * 100;
    }
    if (typeof filters.temperature === "number") {
      adjustments.temperature = filters.temperature * 100;
    }
    if (typeof filters.tint === "number") {
      adjustments.tint = filters.tint * 100;
    }
    if (typeof filters.highlights === "number") {
      adjustments.highlights = filters.highlights * 100;
    }
    if (typeof filters.shadows === "number") {
      adjustments.shadows = filters.shadows * 100;
    }

    // Return undefined if no adjustments found
    return Object.keys(adjustments).length > 0 ? adjustments : undefined;
  }
}

export default new FigmaImportService();
