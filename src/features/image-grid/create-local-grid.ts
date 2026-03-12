/**
 * Creates an image grid deterministically without an LLM call.
 *
 * Uses executeActions to build the frame hierarchy, then stamps a genAiSpec
 * with controls and a generator. Image URLs are embedded directly in the
 * generator string so they remain stable across layout changes.
 */

import { LAYOUTS, type GridLayout } from "./layouts";
import type { ImageGridImageData } from "@/features/gen-ai/utils/intent";
import { executeActions, type ExecuteResult } from "@/features/gen-ai/adapter/action-adapter";
import type { ActionDescriptor, UISpec } from "@/features/gen-ai/types";
import { useAppStore } from "@/core/state/store";
import { GRID_LAYOUT_SVGS } from "@/features/gen-ai/components/controls/grid-selector-svgs";

function pickLayout(imageCount: number): GridLayout {
  const selectorLayouts = LAYOUTS.filter((l) => GRID_SELECTOR_LAYOUT_IDS.has(l.id));
  const exact = selectorLayouts.filter((l) => l.areas.length === imageCount);
  if (exact.length > 0) return exact[0];
  const closest = selectorLayouts.filter((l) => l.areas.length >= imageCount);
  if (closest.length > 0)
    return closest.reduce((a, b) =>
      Math.abs(a.areas.length - imageCount) <=
      Math.abs(b.areas.length - imageCount)
        ? a
        : b,
    );
  return selectorLayouts[selectorLayouts.length - 1] ?? LAYOUTS[0];
}

function buildActions(
  images: ImageGridImageData[],
  layout: GridLayout,
  gap: number,
  cornerRadius: number,
  bgColor: string,
): ActionDescriptor[] {
  const W = 800;
  const ratio = layout.rows / layout.cols;
  const H = Math.round(W * ratio);
  const colW = (W - gap * (layout.cols - 1)) / layout.cols;
  const rowH = (H - gap * (layout.rows - 1)) / layout.rows;

  const bgRgb = hexToRgb(bgColor);
  const actions: ActionDescriptor[] = [];

  actions.push({
    method: "createFrame",
    tempId: "root",
    args: {
      x: 0,
      y: 0,
      width: W,
      height: H,
      name: "Image Grid",
      clipContent: true,
    },
  });

  actions.push({
    method: "setFill",
    nodeId: "root",
    args: { fills: [{ type: "SOLID", color: bgRgb }] },
  });

  layout.areas.forEach((area, i) => {
    const img = images[i % images.length];
    const cx = (area.col - 1) * (colW + gap);
    const cy = (area.row - 1) * (rowH + gap);
    const cw = area.colSpan * colW + (area.colSpan - 1) * gap;
    const ch = area.rowSpan * rowH + (area.rowSpan - 1) * gap;
    const cellId = `cell${i}`;

    actions.push({
      method: "createFrame",
      parentId: "root",
      tempId: cellId,
      args: {
        x: cx,
        y: cy,
        width: cw,
        height: ch,
        clipContent: true,
        cornerRadius,
        name: `Cell ${i}`,
      },
    });

    actions.push({
      method: "createRectangle",
      parentId: cellId,
      args: { x: 0, y: 0, width: cw, height: ch, name: img.id },
    });

    actions.push({
      method: "setFill",
      nodeId: "__prev",
      args: {
        fills: [{ type: "IMAGE", imageUrl: img.url, scaleMode: "FILL" }],
      },
    });
  });

  return actions;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
  };
}

/**
 * Builds the generator string with real image URLs embedded directly.
 * This avoids placeholder resolution issues when layout changes reduce
 * the number of visible images in the tree.
 */
function buildGeneratorString(images: ImageGridImageData[]): string {
  const imgEntries = images
    .map((img, i) => `{id:"img${i}",url:${JSON.stringify(img.url)}}`)
    .join(",");

  return [
    `const LAYOUTS = ${JSON.stringify(LAYOUTS)};`,
    `const IMAGES = [${imgEntries}];`,
    `const layout = LAYOUTS.find(l => l.id === params.layout) || LAYOUTS[0];`,
    `const gap = params.gap || 8;`,
    `const radius = params.cornerRadius || 0;`,
    `const bgHex = params.bgColor || '#FFFFFF';`,
    `const W = 800;`,
    `const ratio = layout.rows / layout.cols;`,
    `const H = Math.round(W * ratio);`,
    `const colW = (W - gap * (layout.cols - 1)) / layout.cols;`,
    `const rowH = (H - gap * (layout.rows - 1)) / layout.rows;`,
    `const bg = lib.hexToRgb(bgHex);`,
    `const actions = [];`,
    `actions.push({ method: 'createFrame', tempId: 'root', args: { x: 0, y: 0, width: W, height: H, name: 'Image Grid', clipContent: true } });`,
    `actions.push({ method: 'setFill', nodeId: 'root', args: { fills: [{ type: 'SOLID', color: bg }] } });`,
    `layout.areas.forEach((area, i) => {`,
    `  const img = IMAGES[i % IMAGES.length];`,
    `  const cx = (area.col - 1) * (colW + gap);`,
    `  const cy = (area.row - 1) * (rowH + gap);`,
    `  const cw = area.colSpan * colW + (area.colSpan - 1) * gap;`,
    `  const ch = area.rowSpan * rowH + (area.rowSpan - 1) * gap;`,
    `  const cellId = 'cell' + i;`,
    `  actions.push({ method: 'createFrame', parentId: 'root', tempId: cellId, args: { x: cx, y: cy, width: cw, height: ch, clipContent: true, cornerRadius: radius, name: 'Cell ' + i } });`,
    `  actions.push({ method: 'createRectangle', parentId: cellId, args: { x: 0, y: 0, width: cw, height: ch, name: img.id } });`,
    `  actions.push({ method: 'setFill', nodeId: '__prev', args: { fills: [{ type: 'IMAGE', imageUrl: img.url, scaleMode: 'FILL' }] } });`,
    `});`,
    `return actions;`,
  ].join("\n");
}

const GRID_SELECTOR_MAPPING: { layoutId: string; svgKey: string; label: string }[] = [
  { layoutId: "2-up", svgKey: "2-up", label: "2-up" },
  { layoutId: "top-heavy", svgKey: "top-heavy", label: "Top Heavy" },
  { layoutId: "3-up", svgKey: "3-up", label: "3-up" },
  { layoutId: "spread", svgKey: "spread", label: "Spread" },
  { layoutId: "editorial-a", svgKey: "editorial", label: "Editorial" },
  { layoutId: "asymmetric", svgKey: "asymmetric", label: "Asymmetric" },
];

const GRID_SELECTOR_LAYOUT_IDS = new Set(GRID_SELECTOR_MAPPING.map((m) => m.layoutId));

function buildGridSelectorOptions(): { value: string; label: string; svg: string }[] {
  return GRID_SELECTOR_MAPPING
    .filter((m) => GRID_LAYOUT_SVGS[m.svgKey])
    .map((m) => ({ value: m.layoutId, label: m.label, svg: GRID_LAYOUT_SVGS[m.svgKey] }));
}

function buildSpec(images: ImageGridImageData[], layout: GridLayout): UISpec {
  return {
    replace: true,
    controls: [
      {
        id: "layout",
        type: "grid-selector",
        label: "Layout",
        props: {
          options: buildGridSelectorOptions(),
          defaultValue: layout.id,
        },
      },
      {
        id: "gap",
        type: "slider",
        label: "Gap",
        props: { min: 0, max: 40, step: 1, defaultValue: 8 },
      },
      {
        id: "cornerRadius",
        type: "slider",
        label: "Corner Radius",
        props: { min: 0, max: 40, step: 1, defaultValue: 0 },
      },
      {
        id: "bgColor",
        type: "color",
        label: "Background",
        props: { defaultValue: "#FFFFFF" },
      },
    ],
    generate: buildGeneratorString(images),
  };
}

export interface LocalGridResult {
  rootFrameId: string;
  spec: UISpec;
  executeResult: ExecuteResult;
}

/**
 * Creates an image grid on the canvas using local logic (no LLM call).
 * Returns the root frame ID and the UISpec for the custom controls popover.
 */
export function createLocalImageGrid(
  images: ImageGridImageData[],
): LocalGridResult | null {
  if (images.length < 2) return null;

  const layout = pickLayout(images.length);
  const gap = 8;
  const cornerRadius = 0;
  const bgColor = "#FFFFFF";

  const actions = buildActions(images, layout, gap, cornerRadius, bgColor);
  const result = executeActions(actions);

  if (!result.rootFrameId) {
    console.error("[image-grid] Failed to create root frame");
    return null;
  }

  const spec = buildSpec(images, layout);

  // Stamp genAiSpec + defaults on the root frame
  const defaultValues = {
    layout: layout.id,
    gap,
    cornerRadius,
    bgColor,
  };

  useAppStore.getState().dispatch({
    type: "object.updated",
    payload: {
      id: result.rootFrameId,
      changes: {
        genAiSpec: JSON.stringify(spec),
        genAiValues: JSON.stringify(defaultValues),
      },
      previousValues: {},
    },
  });

  // Center the created frame in the viewport
  const state = useAppStore.getState();
  const obj = state.objects[result.rootFrameId];
  if (obj) {
    const viewport = state.viewport;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const centerX = (-viewport.panX + screenW / 2) / viewport.zoom - obj.width / 2;
    const centerY = (-viewport.panY + screenH / 2) / viewport.zoom - obj.height / 2;

    state.dispatch({
      type: "object.updated",
      payload: {
        id: result.rootFrameId,
        changes: { x: centerX, y: centerY },
        previousValues: { x: obj.x, y: obj.y },
      },
    });
  }

  // Select the root frame
  useAppStore.getState().dispatch({
    type: "selection.set",
    payload: { selectedIds: [result.rootFrameId] },
  });

  return {
    rootFrameId: result.rootFrameId,
    spec,
    executeResult: result,
  };
}
