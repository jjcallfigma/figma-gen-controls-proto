/**
 * Serialize a canvas design tree into a structured description
 * that an AI model can use to recreate the design in React + Tailwind.
 */

import { AutoLayoutMode, CanvasObject, FrameProperties, MakeProperties, TextProperties, VectorProperties } from "@/types/canvas";

// ─── Parent context for children ────────────────────────────────────

interface ParentContext {
  /** Parent's auto layout mode */
  layoutMode: AutoLayoutMode;
  /** Is the parent a flex-row (horizontal) or flex-column (vertical) */
  isVertical: boolean;
  /** Is the parent a CSS grid container */
  isGrid?: boolean;
}

// ─── Main serializer ────────────────────────────────────────────────

/**
 * Serialize a canvas object tree into a pseudo-HTML description.
 * The output is designed to be easily understood by an LLM to recreate
 * the design as React + Tailwind code.
 */
export function serializeDesignTree(
  rootId: string,
  objects: Record<string, CanvasObject>
): string {
  const root = objects[rootId];
  if (!root) return "";

  const lines: string[] = [];
  serializeNode(root, objects, 0, lines, true, null);
  return lines.join("\n");
}

function serializeNode(
  obj: CanvasObject,
  objects: Record<string, CanvasObject>,
  depth: number,
  lines: string[],
  isRoot: boolean,
  parentCtx: ParentContext | null
): void {
  const indent = "  ".repeat(depth);

  if (obj.type === "text") {
    serializeTextNode(obj, depth, lines, parentCtx);
    return;
  }

  if (obj.type === "frame" || obj.type === "rectangle" || obj.type === "ellipse") {
    serializeContainerNode(obj, objects, depth, lines, isRoot, parentCtx);
    return;
  }

  // Make nodes — serialize as a special block with metadata and code summary
  if (obj.type === "make") {
    const makeProps = obj.properties as MakeProperties;
    const attrs: string[] = [
      `id="${obj.id}"`,
      `name="${escapeAttr(obj.name)}"`,
      `mode="${makeProps.mode}"`,
      `width="${Math.round(obj.width)}px"`,
      `height="${Math.round(obj.height)}px"`,
    ];
    if (makeProps.description) {
      attrs.push(`description="${escapeAttr(makeProps.description)}"`);
    }

    // Include full code so the AI can plan edits and extractions
    // without needing a separate inspect_make call
    const codeSummary = makeProps.code || "(empty)";

    lines.push(`${indent}<make ${attrs.join(" ")}>`);
    lines.push(`${indent}  <code>`);
    for (const codeLine of codeSummary.split("\n")) {
      lines.push(`${indent}    ${codeLine}`);
    }
    lines.push(`${indent}  </code>`);
    lines.push(`${indent}</make>`);
    return;
  }

  // Vector nodes — serialize with fill/stroke info and actual SVG content
  if (obj.type === "vector") {
    const vectorProps = obj.properties as VectorProperties;
    const styles: string[] = [];

    // Auto-layout sizing for vectors
    if (parentCtx && parentCtx.layoutMode !== "none") {
      const sizingStyles = getChildSizingStyles(obj, parentCtx);
      styles.push(...sizingStyles);
    } else {
      styles.push(`width: ${Math.round(obj.width)}px`);
      styles.push(`height: ${Math.round(obj.height)}px`);
    }

    // Fill color
    const fillColor = getFirstSolidFillColor(obj);
    if (fillColor) {
      styles.push(`fill: ${fillColor}`);
    }

    // Stroke
    if (obj.strokes && obj.strokes.length > 0) {
      const stroke = obj.strokes[0];
      if (stroke.visible !== false && stroke.type === "solid" && stroke.color) {
        styles.push(`stroke: ${stroke.color}`);
        if (obj.strokeWidth) styles.push(`stroke-width: ${obj.strokeWidth}px`);
      }
    }

    // Opacity
    if (obj.opacity !== undefined && obj.opacity !== 1) {
      styles.push(`opacity: ${obj.opacity}`);
    }

    // Effects (shadows, blurs)
    const vectorEffectStyles = serializeEffects(obj);
    if (vectorEffectStyles.length > 0) {
      styles.push(...vectorEffectStyles);
    }

    const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";

    // Include actual SVG content so the AI can reuse it for icon reproduction
    if (vectorProps.svgContent) {
      lines.push(`${indent}<svg id="${obj.id}" name="${escapeAttr(obj.name)}"${styleAttr}>`);
      lines.push(`${indent}  ${vectorProps.svgContent}`);
      lines.push(`${indent}</svg>`);
    } else if (vectorProps.vectorPaths) {
      lines.push(`${indent}<svg id="${obj.id}" name="${escapeAttr(obj.name)}"${styleAttr}>`);
      lines.push(`${indent}  <path d="${escapeAttr(vectorProps.vectorPaths)}" />`);
      lines.push(`${indent}</svg>`);
    } else {
      lines.push(`${indent}<svg id="${obj.id}" name="${escapeAttr(obj.name)}"${styleAttr} />`);
    }
    return;
  }
}

// ─── Sizing helpers ─────────────────────────────────────────────────

/**
 * Compute width/height CSS for a child based on its autoLayoutSizing
 * and the parent's flex direction.
 */
function getChildSizingStyles(
  obj: CanvasObject,
  parentCtx: ParentContext | null
): string[] {
  const styles: string[] = [];
  if (!parentCtx || parentCtx.layoutMode === "none") {
    // No auto-layout parent — use fixed dimensions
    styles.push(`width: ${Math.round(obj.width)}px`);
    styles.push(`height: ${Math.round(obj.height)}px`);
    return styles;
  }

  const hSizing = obj.autoLayoutSizing?.horizontal || "fixed";
  const vSizing = obj.autoLayoutSizing?.vertical || "fixed";

  // Grid children use different sizing rules than flex children
  if (parentCtx.isGrid) {
    if (hSizing === "fill") {
      styles.push("width: 100%");
    } else if (hSizing === "hug") {
      styles.push("width: auto");
    } else {
      styles.push(`width: ${Math.round(obj.width)}px`);
    }

    if (vSizing === "fill") {
      styles.push("height: 100%");
    } else if (vSizing === "hug") {
      styles.push("height: auto");
    } else {
      styles.push(`height: ${Math.round(obj.height)}px`);
    }
    return styles;
  }

  // ── Width ──
  if (hSizing === "fill") {
    if (parentCtx.isVertical) {
      // Cross-axis fill in a column → stretch (handled by align-self or align-items)
      styles.push("align-self: stretch");
    } else {
      // Main-axis fill in a row → flex: 1
      styles.push("flex: 1");
    }
  } else if (hSizing === "hug") {
    styles.push("width: auto");
  } else {
    styles.push(`width: ${Math.round(obj.width)}px`);
  }

  // ── Height ──
  if (vSizing === "fill") {
    if (!parentCtx.isVertical) {
      // Cross-axis fill in a row → stretch
      styles.push("align-self: stretch");
    } else {
      // Main-axis fill in a column → flex: 1
      // Only add flex: 1 if we didn't already add it from width
      if (hSizing !== "fill") {
        styles.push("flex: 1");
      }
    }
  } else if (vSizing === "hug") {
    styles.push("height: auto");
  } else {
    // Fixed height — always output it
    styles.push(`height: ${Math.round(obj.height)}px`);
  }

  return styles;
}

// ─── Text nodes ─────────────────────────────────────────────────────

function serializeTextNode(
  obj: CanvasObject,
  depth: number,
  lines: string[],
  parentCtx: ParentContext | null
): void {
  const indent = "  ".repeat(depth);
  const props = obj.properties as TextProperties;
  const styles: string[] = [];

  // Auto-layout sizing for text
  if (parentCtx && parentCtx.layoutMode !== "none") {
    const hSizing = obj.autoLayoutSizing?.horizontal || "fixed";
    const vSizing = obj.autoLayoutSizing?.vertical || "fixed";

    if (hSizing === "fill") {
      if (parentCtx.isVertical) {
        styles.push("align-self: stretch");
      } else {
        styles.push("flex: 1");
      }
    } else if (hSizing === "hug") {
      // Default for text — no explicit width needed
    } else {
      styles.push(`width: ${Math.round(obj.width)}px`);
    }

    if (vSizing === "fill") {
      if (!parentCtx.isVertical) {
        styles.push("align-self: stretch");
      }
    }
  }

  // Font
  if (props.fontFamily && props.fontFamily !== "Inter" && props.fontFamily !== "Inter, sans-serif") {
    styles.push(`font-family: ${props.fontFamily}`);
  }
  styles.push(`font-size: ${props.fontSize}px`);
  if (props.fontWeight && props.fontWeight !== 400) {
    styles.push(`font-weight: ${props.fontWeight}`);
  }
  if (props.textAlign && props.textAlign !== "left") {
    styles.push(`text-align: ${props.textAlign}`);
  }

  // Color from fills
  const color = getFirstSolidFillColor(obj);
  if (color) {
    styles.push(`color: ${color}`);
  }

  // Line height
  if (props.lineHeight) {
    if (typeof props.lineHeight === "object" && "value" in props.lineHeight) {
      const lh = props.lineHeight as any;
      if (lh.unit === "px") {
        styles.push(`line-height: ${lh.value}px`);
      } else if (lh.unit === "percent") {
        styles.push(`line-height: ${lh.value}%`);
      }
    }
  }

  // Letter spacing
  if (props.letterSpacing) {
    if (typeof props.letterSpacing === "object" && "value" in props.letterSpacing) {
      const ls = props.letterSpacing as any;
      if (ls.value !== 0) {
        styles.push(`letter-spacing: ${ls.value}${ls.unit === "px" ? "px" : "em"}`);
      }
    }
  }

  // Opacity
  if (obj.opacity !== undefined && obj.opacity !== 1) {
    styles.push(`opacity: ${obj.opacity}`);
  }

  // Effects (shadows, blurs)
  const effectStyles = serializeEffects(obj);
  if (effectStyles.length > 0) {
    styles.push(...effectStyles);
  }

  const content = escapeHtml(props.content || "");
  const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";

  lines.push(`${indent}<span id="${obj.id}" name="${escapeAttr(obj.name)}"${styleAttr}>${content}</span>`);
}

// ─── Container nodes (frames, rectangles, ellipses) ─────────────────

function serializeContainerNode(
  obj: CanvasObject,
  objects: Record<string, CanvasObject>,
  depth: number,
  lines: string[],
  isRoot: boolean,
  parentCtx: ParentContext | null
): void {
  const indent = "  ".repeat(depth);
  const styles: string[] = [];
  const attrs: string[] = [];

  attrs.push(`id="${obj.id}"`);
  attrs.push(`name="${escapeAttr(obj.name)}"`);

  // ── Dimensions ──
  if (isRoot) {
    attrs.push(`width="${Math.round(obj.width)}"`);
    attrs.push(`height="${Math.round(obj.height)}"`);
  } else {
    // Use auto-layout-aware sizing
    const sizingStyles = getChildSizingStyles(obj, parentCtx);
    styles.push(...sizingStyles);
  }

  // ── Auto layout (flexbox) ──
  let thisContext: ParentContext | null = null;

  if (obj.type === "frame") {
    const frameProps = obj.properties as FrameProperties;
    const al = frameProps.autoLayout;

    if (al && al.mode !== "none") {
      const isVertical = al.mode === "vertical";
      const isGrid = al.mode === "grid";
      thisContext = { layoutMode: al.mode, isVertical, isGrid };

      if (isGrid) {
        styles.push("display: grid");
        const cols = al.gridColumns ?? 4;
        const rows = al.gridRows ?? 3;
        styles.push(`grid-template-columns: repeat(${cols}, 1fr)`);
        styles.push(`grid-template-rows: repeat(${rows}, 1fr)`);
        const colGap = al.gap ?? 0;
        const rowGap = al.counterAxisSpacing ?? colGap;
        if (colGap > 0 || rowGap > 0) {
          if (colGap === rowGap) {
            styles.push(`gap: ${colGap}px`);
          } else {
            styles.push(`row-gap: ${rowGap}px`);
            styles.push(`column-gap: ${colGap}px`);
          }
        }
      } else {
        styles.push("display: flex");
        if (isVertical) {
          styles.push("flex-direction: column");
        }
        if (al.gap !== undefined && al.gap > 0) {
          styles.push(`gap: ${al.gap}px`);
        }
        if (al.wrap) {
          styles.push("flex-wrap: wrap");
        }
      }

      if (al.padding) {
        const { top, right, bottom, left } = al.padding;
        if (top === right && right === bottom && bottom === left) {
          if (top > 0) styles.push(`padding: ${top}px`);
        } else if (top === bottom && left === right) {
          if (top > 0 || right > 0) styles.push(`padding: ${top}px ${right}px`);
        } else {
          styles.push(`padding: ${top}px ${right}px ${bottom}px ${left}px`);
        }
      }
      styles.push(`align-items: ${al.alignItems || "start"}`);
      if (al.justifyContent && al.justifyContent !== "start") {
        styles.push(`justify-content: ${al.justifyContent}`);
      }
    }

    // Overflow
    if (frameProps.overflow === "hidden") {
      styles.push("overflow: hidden");
    }

    // Border radius
    const radius = frameProps.borderRadius;
    if (radius) {
      if (typeof radius === "number" && radius > 0) {
        styles.push(`border-radius: ${radius}px`);
      } else if (typeof radius === "object") {
        const r = radius as any;
        if (r.topLeft || r.topRight || r.bottomRight || r.bottomLeft) {
          styles.push(`border-radius: ${r.topLeft || 0}px ${r.topRight || 0}px ${r.bottomRight || 0}px ${r.bottomLeft || 0}px`);
        }
      }
    }
  }

  if (obj.type === "rectangle") {
    const rectProps = obj.properties as any;
    if (rectProps.borderRadius) {
      if (typeof rectProps.borderRadius === "number" && rectProps.borderRadius > 0) {
        styles.push(`border-radius: ${rectProps.borderRadius}px`);
      }
    }
  }

  if (obj.type === "ellipse") {
    styles.push("border-radius: 50%");
  }

  // ── Background fill ──
  const bgColor = getFirstSolidFillColor(obj);
  if (bgColor) {
    styles.push(`background: ${bgColor}`);
  }

  // Background image fill
  const imageFill = getFirstImageFill(obj);
  if (imageFill) {
    styles.push(`background-image: url(${imageFill})`);
    styles.push("background-size: cover");
    styles.push("background-position: center");
  }

  // ── Stroke / border ──
  if (obj.strokes && obj.strokes.length > 0) {
    const stroke = obj.strokes[0];
    if (stroke.visible !== false && stroke.type === "solid" && stroke.color) {
      const sw = obj.strokeWidth || 1;
      styles.push(`border: ${sw}px solid ${stroke.color}`);
    }
  } else if (obj.stroke) {
    const sw = obj.strokeWidth || 1;
    styles.push(`border: ${sw}px solid ${obj.stroke}`);
  }

  // ── Opacity ──
  if (obj.opacity !== undefined && obj.opacity !== 1) {
    styles.push(`opacity: ${obj.opacity}`);
  }

  // ── Effects (shadows, blurs) ──
  const effectStyles = serializeEffects(obj);
  if (effectStyles.length > 0) {
    styles.push(...effectStyles);
  }

  // ── Build tag ──
  const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
  const tag = "div";

  // ── Children ──
  const children = (obj.childIds || [])
    .map((id) => objects[id])
    .filter(Boolean)
    .filter((child) => child.visible !== false);

  if (children.length === 0) {
    lines.push(`${indent}<${tag} ${attrs.join(" ")}${styleAttr} />`);
  } else {
    lines.push(`${indent}<${tag} ${attrs.join(" ")}${styleAttr}>`);
    for (const child of children) {
      serializeNode(child, objects, depth + 1, lines, false, thisContext);
    }
    lines.push(`${indent}</${tag}>`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function getFirstSolidFillColor(obj: CanvasObject): string | null {
  if (obj.fills && obj.fills.length > 0) {
    for (const fill of obj.fills) {
      if (fill.visible !== false && fill.type === "solid" && fill.color) {
        if (fill.opacity !== undefined && fill.opacity < 1) {
          return hexToRgba(fill.color, fill.opacity);
        }
        return fill.color;
      }
    }
  }
  // Legacy fill
  if (obj.fill) return obj.fill;
  return null;
}

function getFirstImageFill(obj: CanvasObject): string | null {
  if (obj.fills && obj.fills.length > 0) {
    for (const fill of obj.fills) {
      if (fill.visible !== false && fill.type === "image" && (fill as any).imageUrl) {
        return (fill as any).imageUrl;
      }
    }
  }
  return null;
}

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)})`;
}

function serializeEffects(obj: CanvasObject): string[] {
  const styles: string[] = [];
  if (!obj.effects || obj.effects.length === 0) return styles;

  const visibleEffects = obj.effects.filter((e) => e.visible);
  if (visibleEffects.length === 0) return styles;

  const shadows: string[] = [];
  const filters: string[] = [];

  for (const effect of visibleEffects) {
    if (effect.type === "drop-shadow" || effect.type === "inner-shadow") {
      const { offsetX, offsetY, blur, spread, color, opacity } = effect;
      const rgba = hexToRgba(color, opacity);
      const inset = effect.type === "inner-shadow" ? "inset " : "";
      shadows.push(`${inset}${offsetX}px ${offsetY}px ${blur}px ${spread}px ${rgba}`);
    } else if (effect.type === "layer-blur") {
      filters.push(`blur(${effect.blur}px)`);
    }
  }

  if (shadows.length > 0) {
    styles.push(`box-shadow: ${shadows.join(", ")}`);
  }
  if (filters.length > 0) {
    styles.push(`filter: ${filters.join(" ")}`);
  }

  return styles;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Design tree diffing ─────────────────────────────────────────────

/**
 * Parse a serialized design tree line into its name and style properties.
 */
function parseElementLine(line: string): { name: string; styles: Record<string, string>; textContent?: string } {
  const nameMatch = line.match(/name="([^"]*)"/);
  const styleMatch = line.match(/style="([^"]*)"/);
  const name = nameMatch?.[1] || "";
  const styles: Record<string, string> = {};

  if (styleMatch) {
    for (const part of styleMatch[1].split(";")) {
      const [key, ...valParts] = part.split(":");
      if (key && valParts.length > 0) {
        styles[key.trim()] = valParts.join(":").trim();
      }
    }
  }

  // Extract text content for <span> elements
  let textContent: string | undefined;
  const spanMatch = line.match(/<span[^>]*>([^<]*)<\/span>/);
  if (spanMatch) {
    textContent = spanMatch[1];
  }

  return { name, styles, textContent };
}

// ─── Tree-aware element parser ────────────────────────────────────────

interface TreeElement {
  name: string;
  styles: Record<string, string>;
  textContent?: string;
  /** First text found in a descendant (for container identification) */
  containedText?: string;
  depth: number;
  ancestors: string[];
}

/**
 * Parse a serialized design tree into a flat list of elements,
 * each annotated with its ancestor chain for tree-aware matching.
 * Uses indentation to reconstruct the tree structure.
 * Container elements are enriched with their first descendant text content
 * to help identify them even when names are generic.
 */
function parseSerializedTree(serialized: string): TreeElement[] {
  const lines = serialized.split("\n");
  const elements: TreeElement[] = [];
  const stack: { name: string; depth: number }[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const leadingSpaces = rawLine.length - rawLine.trimStart().length;
    const depth = Math.floor(leadingSpaces / 2);

    if (trimmed.startsWith("</")) {
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      continue;
    }

    const parsed = parseElementLine(trimmed);
    if (!parsed.name) continue;

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    elements.push({
      name: parsed.name,
      styles: parsed.styles,
      textContent: parsed.textContent,
      depth,
      ancestors: stack.map((s) => s.name),
    });

    const isSelfClosing =
      trimmed.endsWith("/>") || (trimmed.includes("</") && trimmed.endsWith(">"));
    if (!isSelfClosing) {
      stack.push({ name: parsed.name, depth });
    }
  }

  // Second pass: annotate container elements with their first descendant text
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].textContent) continue;
    for (let j = i + 1; j < elements.length; j++) {
      if (elements[j].depth <= elements[i].depth) break;
      if (elements[j].textContent) {
        elements[i].containedText = elements[j].textContent;
        break;
      }
    }
  }

  return elements;
}

/** A name starting with an uppercase letter is likely a React component. */
function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/**
 * Build a human-readable label for an element, including parent context,
 * instance number (for duplicates), contained text, and component info.
 *
 * @param componentCounts - Map from component name to total instance count
 *   across the entire tree (only for React component names).
 */
function buildElementLabel(
  el: TreeElement,
  siblingCount: number,
  index: number,
  componentCounts?: Map<string, number>,
): string {
  const parts: string[] = [];

  // Component instance context
  const totalInstances = componentCounts?.get(el.name) ?? 0;
  if (isComponentName(el.name) && totalInstances > 1) {
    parts.push(`React component with ${totalInstances} instances in the design`);
  }

  // Full ancestor path for context
  if (el.ancestors.length > 0) {
    const pathStr = el.ancestors.join(" > ");
    if (siblingCount > 1) {
      parts.push(`instance ${index + 1} inside ${pathStr}`);
    } else {
      parts.push(`inside ${pathStr}`);
    }
  }

  // Text content hint for containers with generic names
  const text = el.containedText || el.textContent;
  if (text) {
    const truncated = text.length > 30 ? text.slice(0, 27) + "..." : text;
    parts.push(`contains "${truncated}"`);
  }

  const qualifier = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `"${el.name}"${qualifier}`;
}

/**
 * Compare two serialized design trees and return a human-readable list of differences.
 * Uses tree structure (ancestor chain) for element matching instead of flat name-only
 * matching, which correctly handles duplicate names (e.g., repeated list items).
 * Ignores layout/sizing differences since these are often representation noise.
 */
export function diffDesignTrees(original: string, modified: string): string[] {
  const origElements = parseSerializedTree(original);
  const modElements = parseSerializedTree(modified);

  const meaningfulProps = new Set([
    "background", "color", "border", "border-radius", "border-color",
    "box-shadow", "opacity", "fill", "stroke", "stroke-width",
    "font-size", "font-weight", "font-family", "text-align",
    "letter-spacing", "line-height", "text-decoration",
    "background-image",
  ]);

  // Count how many times each React component name appears in the modified
  // tree so we can annotate diffs with "this component has N instances".
  const componentCounts = new Map<string, number>();
  for (const el of modElements) {
    if (isComponentName(el.name)) {
      componentCounts.set(el.name, (componentCounts.get(el.name) || 0) + 1);
    }
  }

  // Key by tree path (ancestors > name) to preserve hierarchy.
  // Elements with identical paths (same-name siblings) are stored
  // as arrays and compared positionally.
  const origByPath = new Map<string, TreeElement[]>();
  const modByPath = new Map<string, TreeElement[]>();

  for (const el of origElements) {
    const path = [...el.ancestors, el.name].join(" > ");
    const arr = origByPath.get(path) || [];
    arr.push(el);
    origByPath.set(path, arr);
  }

  for (const el of modElements) {
    const path = [...el.ancestors, el.name].join(" > ");
    const arr = modByPath.get(path) || [];
    arr.push(el);
    modByPath.set(path, arr);
  }

  const diffs: string[] = [];
  const processedPaths = new Set<string>();

  for (const [path, modEls] of modByPath) {
    const origEls = origByPath.get(path) || [];
    processedPaths.add(path);

    for (let i = 0; i < modEls.length; i++) {
      const modEl = modEls[i];
      const origEl = origEls[i];

      const label = buildElementLabel(modEl, modEls.length, i, componentCounts);

      if (!origEl) {
        diffs.push(`ADDED element ${label}`);
        continue;
      }

      if (modEl.textContent !== undefined && origEl.textContent !== undefined) {
        if (modEl.textContent !== origEl.textContent) {
          diffs.push(`${label}: text content changed from "${origEl.textContent}" to "${modEl.textContent}"`);
        }
      }

      const allKeys = new Set([...Object.keys(origEl.styles), ...Object.keys(modEl.styles)]);
      for (const key of allKeys) {
        if (!meaningfulProps.has(key)) continue;
        const origVal = origEl.styles[key];
        const modVal = modEl.styles[key];
        if (origVal !== modVal) {
          if (!origVal) {
            diffs.push(`${label}: added ${key}: ${modVal}`);
          } else if (!modVal) {
            diffs.push(`${label}: removed ${key} (was: ${origVal})`);
          } else {
            diffs.push(`${label}: ${key} changed from "${origVal}" to "${modVal}"`);
          }
        }
      }
    }

    for (let i = modEls.length; i < origEls.length; i++) {
      diffs.push(`REMOVED element ${buildElementLabel(origEls[i], origEls.length, i, componentCounts)}`);
    }
  }

  for (const [path, origEls] of origByPath) {
    if (processedPaths.has(path)) continue;
    for (let i = 0; i < origEls.length; i++) {
      diffs.push(`REMOVED element ${buildElementLabel(origEls[i], origEls.length, i, componentCounts)}`);
    }
  }

  return diffs;
}

// ─── Update Make from Design prompt ──────────────────────────────────

/**
 * Build a prompt for the AI when updating a Make from a modified design.
 * If a baseline snapshot is available, computes a focused diff so the AI
 * only sees the actual user changes (not layout/sizing representation noise).
 */
export function buildUpdateMakePrompt(currentDesignTree: string, baselineSnapshot?: string): string {
  // If we have a baseline, compute a diff and send only the real changes
  if (baselineSnapshot) {
    const diffs = diffDesignTrees(baselineSnapshot, currentDesignTree);

    if (diffs.length === 0) {
      return `The user asked to update this Make from the design, but no visual differences were detected between the original generated design and the current one. Let the user know that no changes were found.`;
    }

    return `The user generated a static design from this Make's code, edited it visually on the canvas, and wants the React code updated to match.

Here are the SPECIFIC changes the user made (compared against the original generated design):

${diffs.map((d, i) => `${i + 1}. ${d}`).join("\n")}

Apply ONLY these changes to the current code. Do not change anything else.

ELEMENT IDENTIFICATION — use ALL available signals to find the correct element:
1. **Original CSS value**: The "changed from" value tells you what the element currently has in code. Search for that value (e.g. if background changed from "#F8F4E8", look for \`bg-[#F8F4E8]\` or \`background: #F8F4E8\` or similar Tailwind class).
2. **Text content hint**: When "(contains ...)" is shown, it tells you what text is inside the element — use this to confirm you found the right one.
3. **Parent context**: When "(inside X > Y)" is shown, it indicates where the element sits in the component tree.
4. **Instance number**: When multiple siblings share a name, "(instance N)" tells you which one.

Apply the change ONLY to the specific identified element — not to a parent, sibling, or wrapper.

For each change:
1. Locate the element using the signals above
2. Update the relevant Tailwind class or style value to match the new value
3. Output a search/replace patch

COMPONENT vs INSTANCE CHANGES:
When a change description mentions "React component with N instances", the user changed ONE specific instance on the canvas. Follow these rules:
- If the component has only 1 instance total, change the component definition directly.
- If the component has multiple instances, apply the change ONLY to the specific instance the user modified. Use a prop, conditional className, or inline style override on that one JSX usage — do NOT modify the component definition (which would affect all instances).
- Use the instance number and text content hint to identify which usage site to change.

COLOR MAPPING: Design uses exact hex colors. If a hex matches a Tailwind color, use the class. If not, use bracket notation: \`border-[#C7C7C7]\`, \`bg-[#1a2b3c]\`, \`text-[#666666]\`.

RULES:
- Use search/replace patches (Format B) — do NOT rewrite the full file
- Preserve ALL interactive behavior, state, event handlers, and animations
- Only apply the changes listed above — nothing else`;
  }

  // Fallback: no baseline available, send the full tree
  return `The user generated a static design from this Make's code, then edited it visually. Update the React code to match the design.

Updated design tree:
\`\`\`html
${currentDesignTree}
\`\`\`

Compare this against your current code and apply any visual differences (colors, text, borders, etc.) using search/replace patches. Preserve all interactive behavior.`;
}
