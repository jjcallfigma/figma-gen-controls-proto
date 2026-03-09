/**
 * Converts figma-clone CanvasObject(s) into the gen-ai plugin's
 * SelectionContext / NodeDescriptor format for prompt composition.
 */

import type { CanvasObject, Fill, SolidFill, LinearGradientFill, Stroke, Effect } from "@/types/canvas";
import type {
  SelectionContext,
  NodeDescriptor,
  FillDescriptor,
  StrokeDescriptor,
  EffectDescriptor,
  ChildSummary,
} from "../types";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function convertFill(fill: Fill): FillDescriptor | null {
  if (!fill.visible) return null;

  if (fill.type === "solid") {
    const s = fill as SolidFill;
    return { type: "SOLID", color: hexToRgb(s.color), opacity: s.opacity ?? 1 };
  }

  if (fill.type === "linear-gradient") {
    const g = fill as LinearGradientFill;
    return {
      type: "GRADIENT_LINEAR",
      gradientStops: g.stops.map((s) => ({
        position: s.position,
        color: { ...hexToRgb(s.color), a: s.opacity ?? 1 },
      })),
      opacity: g.opacity ?? 1,
    };
  }

  return null;
}

function convertStroke(stroke: Stroke, obj: CanvasObject): StrokeDescriptor | null {
  if (!stroke.visible) return null;
  if (stroke.type !== "solid") return null;

  const s = stroke as { color: string; opacity?: number };
  return {
    color: hexToRgb(s.color),
    opacity: s.opacity ?? 1,
    weight: obj.strokeWidth ?? 1,
    alignment: "CENTER" as const,
  };
}

function convertEffect(effect: Effect): EffectDescriptor | null {
  if (effect.visible === false) return null;

  if (effect.type === "drop-shadow" || effect.type === "inner-shadow") {
    const e = effect as {
      color: string;
      opacity: number;
      offsetX: number;
      offsetY: number;
      blur: number;
      spread?: number;
      visible: boolean;
    };
    return {
      type: effect.type === "drop-shadow" ? "DROP_SHADOW" : "INNER_SHADOW",
      color: { ...hexToRgb(e.color), a: e.opacity ?? 0.25 },
      offset: { x: e.offsetX ?? 0, y: e.offsetY ?? 0 },
      radius: e.blur ?? 0,
      spread: e.spread ?? 0,
      visible: e.visible !== false,
    };
  }

  if (effect.type === "layer-blur") {
    const e = effect as { blur: number; visible: boolean };
    return {
      type: "LAYER_BLUR",
      radius: e.blur ?? 0,
      visible: e.visible !== false,
    };
  }

  return null;
}

function objectToDescriptor(
  obj: CanvasObject,
  objects: Record<string, CanvasObject>,
): NodeDescriptor {
  const parent = obj.parentId ? objects[obj.parentId] : null;
  const children = obj.childIds
    .map((id) => objects[id])
    .filter(Boolean);

  const childSummaries: ChildSummary[] | undefined =
    children.length > 0
      ? children.map((c) => ({ id: c.id, type: c.type, name: c.name }))
      : undefined;

  const fills: FillDescriptor[] = (obj.fills ?? [])
    .map(convertFill)
    .filter((f): f is FillDescriptor => f !== null);

  const strokes: StrokeDescriptor[] = (obj.strokes ?? [])
    .map((s) => convertStroke(s, obj))
    .filter((s): s is StrokeDescriptor => s !== null);

  const effects: EffectDescriptor[] = (obj.effects ?? [])
    .map(convertEffect)
    .filter((e): e is EffectDescriptor => e !== null);

  const desc: NodeDescriptor = {
    id: obj.id,
    type: obj.type.toUpperCase(),
    name: obj.name,
    x: Math.round(obj.x),
    y: Math.round(obj.y),
    width: Math.round(obj.width),
    height: Math.round(obj.height),
    rotation: obj.rotation ?? 0,
    opacity: obj.opacity ?? 1,
    visible: obj.visible,
    fills,
    strokes,
    effects,
    parentId: obj.parentId ?? null,
    parentName: parent?.name ?? null,
    childCount: obj.childIds.length,
    children: childSummaries,
  };

  // Text properties
  if (obj.type === "text" && obj.properties?.type === "text") {
    const tp = obj.properties as {
      content?: string;
      fontSize?: number;
      fontFamily?: string;
      fontWeight?: number;
      textAlign?: string;
    };
    desc.characters = tp.content;
    desc.fontSize = tp.fontSize;
    desc.fontName = { family: tp.fontFamily ?? "Inter", style: String(tp.fontWeight ?? 400) };
    desc.textAlignHorizontal = tp.textAlign;
  }

  // Vector properties
  if (obj.type === "vector" && obj.properties?.type === "vector") {
    const vp = obj.properties as { vectorPaths?: string; svgContent?: string };
    if (vp.vectorPaths) {
      desc.vectorPaths = [vp.vectorPaths];
    }
  }

  return desc;
}

const MAX_NODES = 40;

/**
 * Build a SelectionContext from the currently selected clone objects.
 * If a selected frame has a genAiSpec, include it for re-apply support.
 */
export function buildSelectionContext(
  selectedIds: string[],
  objects: Record<string, CanvasObject>,
): SelectionContext {
  if (selectedIds.length === 0) {
    return { nodes: [], truncated: false };
  }

  const nodes: NodeDescriptor[] = [];
  let pluginSpec: string | undefined;
  let pluginMessages: string | undefined;

  for (const id of selectedIds) {
    const obj = objects[id];
    if (!obj) continue;
    if (nodes.length >= MAX_NODES) break;

    nodes.push(objectToDescriptor(obj, objects));

    // If the selected object has gen-ai spec data, include it
    if (obj.genAiSpec && !pluginSpec) {
      pluginSpec = obj.genAiSpec;
    }
  }

  return {
    nodes,
    truncated: selectedIds.length > MAX_NODES,
    pluginSpec,
    pluginMessages,
  };
}
