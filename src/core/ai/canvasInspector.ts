/**
 * Canvas inspection tools for full-canvas awareness.
 *
 * Generates summaries and detailed views of the canvas that the AI
 * can request on demand via tool calls.
 */

import type { CanvasObjectData } from "./designAnalysis";

// ─── Types ──────────────────────────────────────────────────────────

export interface PageData {
  id: string;
  name: string;
  objectIds: string[];
}

export interface CanvasOverview {
  pages: {
    id: string;
    name: string;
    objectCount: number;
    topLevelFrames: { id: string; name: string; x: number; y: number; width: number; height: number; childCount: number }[];
  }[];
  currentPageId: string;
  totalObjects: number;
  colorSummary: string[];
  fontSummary: string[];
}

// ─── Full canvas overview ───────────────────────────────────────────

export function getCanvasOverview(
  objects: Record<string, CanvasObjectData>,
  pages: Record<string, PageData>,
  pageIds: string[],
  currentPageId: string
): CanvasOverview {
  const colorSet = new Set<string>();
  const fontSet = new Set<string>();

  // Collect global stats
  for (const obj of Object.values(objects)) {
    if (obj.fills) {
      for (const fill of obj.fills) {
        if (fill.visible !== false && fill.type === "solid" && fill.color) {
          colorSet.add(fill.color.toUpperCase().replace(/^#/, "#"));
        }
      }
    }
    if (obj.type === "text" && obj.properties?.fontFamily) {
      fontSet.add(obj.properties.fontFamily);
    }
  }

  const pageData = pageIds.map((pageId) => {
    const page = pages[pageId];
    if (!page) return null;

    // Get objects for this page (top-level = no parent)
    const pageObjects = (page.objectIds || [])
      .map((id) => objects[id])
      .filter(Boolean);

    const topLevelFrames = pageObjects
      .filter((o) => !o.parentId && (o.type === "frame" || o.type === "rectangle"))
      .map((o) => ({
        id: o.id,
        name: o.name,
        x: Math.round(o.x || 0),
        y: Math.round(o.y || 0),
        width: Math.round(o.width),
        height: Math.round(o.height),
        childCount: o.childIds?.length || 0,
      }));

    return {
      id: pageId,
      name: page.name,
      objectCount: pageObjects.length,
      topLevelFrames,
    };
  }).filter(Boolean) as CanvasOverview["pages"];

  return {
    pages: pageData,
    currentPageId,
    totalObjects: Object.keys(objects).length,
    colorSummary: Array.from(colorSet).slice(0, 20),
    fontSummary: Array.from(fontSet),
  };
}

// ─── Inspect canvas (summary or detail) ─────────────────────────────

export function inspectCanvas(
  objects: Record<string, CanvasObjectData>,
  mode: "summary" | "detail",
  targetId?: string
): string {
  if (mode === "summary") {
    return inspectCanvasSummary(objects);
  }

  if (targetId) {
    return inspectCanvasDetail(objects, targetId);
  }

  // Detail mode without target: serialize all top-level frames
  const topLevel = Object.values(objects).filter(
    (o) => !o.parentId && o.visible !== false
  );

  if (topLevel.length === 0) return "Canvas is empty.";

  const trees = topLevel.map((obj) => serializeObjectTree(obj, objects, 0));
  return trees.join("\n\n");
}

// ─── Summary mode ───────────────────────────────────────────────────

function inspectCanvasSummary(objects: Record<string, CanvasObjectData>): string {
  const topLevel = Object.values(objects).filter(
    (o) => !o.parentId && o.visible !== false
  );

  if (topLevel.length === 0) return "Canvas is empty.";

  const lines: string[] = [`Canvas summary (${Object.keys(objects).length} total objects):\n`];

  for (const obj of topLevel) {
    const childCount = countDescendants(obj.id, objects);
    const pos = getAbsolutePosition(obj, objects);
    lines.push(
      `- "${obj.name}" (${obj.type}) — ${Math.round(obj.width)}x${Math.round(obj.height)} at (${pos.x}, ${pos.y}) — ${childCount} children`
    );

    // Show first-level children for context
    if (obj.childIds?.length > 0) {
      const children = obj.childIds
        .map((id) => objects[id])
        .filter(Boolean)
        .slice(0, 8);
      for (const child of children) {
        const grandChildCount = child.childIds?.length || 0;
        lines.push(
          `  - "${child.name}" (${child.type})${grandChildCount > 0 ? ` — ${grandChildCount} children` : ""}`
        );
      }
      if (obj.childIds.length > 8) {
        lines.push(`  - ... and ${obj.childIds.length - 8} more`);
      }
    }
  }

  return lines.join("\n");
}

// ─── Detail mode ────────────────────────────────────────────────────

function inspectCanvasDetail(
  objects: Record<string, CanvasObjectData>,
  targetId: string
): string {
  const root = objects[targetId];
  if (!root) return `Object ${targetId} not found.`;
  return serializeObjectTree(root, objects, 0);
}

// ─── Tree serialization (pseudo-HTML, same format as designSerializer) ─

function serializeObjectTree(
  obj: CanvasObjectData,
  objects: Record<string, CanvasObjectData>,
  depth: number
): string {
  const indent = "  ".repeat(depth);
  const isRoot = depth === 0;

  const pos = getAbsolutePosition(obj, objects);
  const posAttr = ` x="${pos.x}" y="${pos.y}"`;

  if (obj.type === "text") {
    const props = obj.properties || {};
    const styles: string[] = [];
    styles.push(`font-size: ${props.fontSize || 14}px`);
    if (props.fontWeight && props.fontWeight !== 400) {
      styles.push(`font-weight: ${props.fontWeight}`);
    }
    const color = getFirstSolidColor(obj.fills);
    if (color) styles.push(`color: ${color}`);
    const content = escapeHtml(props.content || "");
    const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
    return `${indent}<span id="${obj.id}" name="${escapeAttr(obj.name)}"${posAttr} w="${Math.round(obj.width)}" h="${Math.round(obj.height)}"${styleAttr}>${content}</span>`;
  }

  if (obj.type === "vector") {
    const styles: string[] = [];
    styles.push(`width: ${Math.round(obj.width)}px`);
    styles.push(`height: ${Math.round(obj.height)}px`);
    return `${indent}<svg id="${obj.id}" name="${escapeAttr(obj.name)}"${posAttr} style="${styles.join("; ")}" />`;
  }

  // Frame / rectangle / ellipse
  const styles: string[] = [];
  const attrs: string[] = [];
  attrs.push(`id="${obj.id}"`);
  attrs.push(`name="${escapeAttr(obj.name)}"`);
  attrs.push(`x="${pos.x}"`);
  attrs.push(`y="${pos.y}"`);

  if (isRoot) {
    attrs.push(`width="${Math.round(obj.width)}"`);
    attrs.push(`height="${Math.round(obj.height)}"`);
  }

  // Auto layout
  if (obj.properties?.autoLayout) {
    const al = obj.properties.autoLayout;
    if (al.mode !== "none") {
      styles.push("display: flex");
      if (al.mode === "vertical") styles.push("flex-direction: column");
      if (al.gap > 0) styles.push(`gap: ${al.gap}px`);
      if (al.padding) {
        const { top, right, bottom, left } = al.padding;
        styles.push(`padding: ${top}px ${right}px ${bottom}px ${left}px`);
      }
      styles.push(`align-items: ${al.alignItems || "start"}`);
    }
  }

  // Background
  const bg = getFirstSolidColor(obj.fills);
  if (bg) styles.push(`background: ${bg}`);

  // Border radius
  if (obj.properties?.borderRadius) {
    const br = obj.properties.borderRadius;
    if (typeof br === "number" && br > 0) styles.push(`border-radius: ${br}px`);
  }

  const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";

  const children = (obj.childIds || [])
    .map((id) => objects[id])
    .filter(Boolean)
    .filter((c) => c.visible !== false);

  if (children.length === 0) {
    return `${indent}<div ${attrs.join(" ")}${styleAttr} />`;
  }

  const childLines = children.map((c) => serializeObjectTree(c, objects, depth + 1));
  return [
    `${indent}<div ${attrs.join(" ")}${styleAttr}>`,
    ...childLines,
    `${indent}</div>`,
  ].join("\n");
}

// ─── Position helpers ────────────────────────────────────────────────

/** Compute absolute world position by walking up the parent chain */
function getAbsolutePosition(
  obj: CanvasObjectData,
  objects: Record<string, CanvasObjectData>
): { x: number; y: number } {
  let absX = obj.x || 0;
  let absY = obj.y || 0;
  let currentParentId = obj.parentId;
  while (currentParentId) {
    const parent = objects[currentParentId];
    if (!parent) break;
    absX += parent.x || 0;
    absY += parent.y || 0;
    currentParentId = parent.parentId;
  }
  return { x: Math.round(absX), y: Math.round(absY) };
}

// ─── Helpers ────────────────────────────────────────────────────────

function countDescendants(
  id: string,
  objects: Record<string, CanvasObjectData>
): number {
  const obj = objects[id];
  if (!obj?.childIds) return 0;
  let count = obj.childIds.length;
  for (const childId of obj.childIds) {
    count += countDescendants(childId, objects);
  }
  return count;
}

function getFirstSolidColor(
  fills?: Array<{ type: string; color?: string; opacity?: number; visible?: boolean }>
): string | null {
  if (!fills) return null;
  for (const fill of fills) {
    if (fill.visible !== false && fill.type === "solid" && fill.color) {
      return fill.color;
    }
  }
  return null;
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
