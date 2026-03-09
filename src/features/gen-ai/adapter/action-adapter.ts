/**
 * Translates gen-ai plugin ActionDescriptor[] into figma-clone store.dispatch() calls.
 *
 * This is the bridge between the plugin's action format and the clone's
 * Zustand event-sourced store.
 */

import { nanoid } from "nanoid";
import type {
  CanvasObject,
  CanvasObjectProperties,
} from "@/types/canvas";
import { getDefaultAutoLayoutSizing } from "@/types/canvas";
import { useAppStore } from "@/core/state/store";
import type { ActionDescriptor } from "../types";
import {
  pluginFillsToClone,
  pluginStrokeToClone,
  pluginEffectToClone,
  rgbToHex,
} from "./fill-converter";

// ─── Types ───────────────────────────────────────────────────────────

export interface ExecuteResult {
  createdIds: string[];
  rootFrameId: string | undefined;
  tempIdMap: Map<string, string>;
}

type Args = Record<string, unknown>;

// ─── Resolve node ID ─────────────────────────────────────────────────

function resolveId(
  rawId: string | undefined,
  tempIdMap: Map<string, string>,
): string | undefined {
  if (!rawId) return undefined;
  return tempIdMap.get(rawId) ?? rawId;
}

// ─── Build a CanvasObject shell ──────────────────────────────────────

function buildBaseObject(
  id: string,
  type: CanvasObject["type"],
  args: Args,
  parentId?: string,
): CanvasObject {
  return {
    id,
    type,
    name: (args.name as string) ?? type,
    createdAt: Date.now(),
    x: (args.x as number) ?? 0,
    y: (args.y as number) ?? 0,
    width: (args.width as number) ?? 100,
    height: (args.height as number) ?? 100,
    rotation: 0,
    autoLayoutSizing: getDefaultAutoLayoutSizing(),
    fills: [],
    strokes: [],
    effects: [],
    parentId,
    childIds: [],
    zIndex: 0,
    visible: true,
    locked: false,
    properties: { type: type as "rectangle" },
  };
}

// ─── Type-specific property builders ─────────────────────────────────

function frameProperties(args: Args) {
  const props: Record<string, unknown> = {
    type: "frame",
    overflow: (args.clipsContent === false) ? "visible" : "hidden",
  };
  if (args.layoutMode && args.layoutMode !== "NONE") {
    props.autoLayout = {
      mode: (args.layoutMode as string).toLowerCase(),
      gap: (args.itemSpacing as number) ?? 0,
      padding: {
        top: (args.paddingTop as number) ?? (args.padding as number) ?? 0,
        right: (args.paddingRight as number) ?? (args.padding as number) ?? 0,
        bottom: (args.paddingBottom as number) ?? (args.padding as number) ?? 0,
        left: (args.paddingLeft as number) ?? (args.padding as number) ?? 0,
      },
    };
  }
  if (args.cornerRadius != null || args.borderRadius != null) {
    props.borderRadius = (args.cornerRadius ?? args.borderRadius) as number;
  }
  return props;
}

function rectangleProperties(args: Args) {
  const props: Record<string, unknown> = { type: "rectangle" };
  if (args.cornerRadius != null) {
    props.borderRadius = args.cornerRadius as number;
  }
  return props;
}

function ellipseProperties() {
  return { type: "ellipse" };
}

function vectorProperties(args: Args) {
  return {
    type: "vector",
    vectorPaths: (args.data as string) ?? "",
    windingRule: (args.windingRule as string) ?? undefined,
  };
}

function textProperties(args: Args) {
  return {
    type: "text",
    content: (args.characters as string) ?? "",
    fontSize: (args.fontSize as number) ?? 14,
    fontFamily: (args.fontFamily as string) ?? "Inter",
    fontWeight: (args.fontWeight as number) ?? 400,
    textAlign: "left" as const,
    lineHeight: { value: 1.2, unit: "px" as const },
    letterSpacing: { value: 0, unit: "px" as const },
  };
}

// ─── Action handlers ─────────────────────────────────────────────────

function handleCreate(
  action: ActionDescriptor,
  type: CanvasObject["type"],
  propertiesFn: (args: Args) => Record<string, unknown>,
  tempIdMap: Map<string, string>,
  createdIds: string[],
): string {
  const dispatch = useAppStore.getState().dispatch;
  const args = (action.args ?? {}) as Args;
  const realId = nanoid();

  if (action.tempId) {
    tempIdMap.set(action.tempId, realId);
  }

  const parentId = resolveId(action.parentId, tempIdMap);
  const obj = buildBaseObject(realId, type, args, parentId);
  obj.properties = propertiesFn(args) as unknown as CanvasObject["properties"];

  // Apply fills if provided in args
  if (args.fills && Array.isArray(args.fills)) {
    obj.fills = pluginFillsToClone(args.fills as Record<string, unknown>[]);
  }

  // Apply a background color for frames
  if (type === "frame" && args.fills && Array.isArray(args.fills)) {
    obj.fills = pluginFillsToClone(args.fills as Record<string, unknown>[]);
  }

  dispatch({
    type: "object.created",
    payload: { object: obj },
  });

  createdIds.push(realId);
  return realId;
}

function handleSetFill(action: ActionDescriptor, tempIdMap: Map<string, string>) {
  const dispatch = useAppStore.getState().dispatch;
  const args = (action.args ?? {}) as Args;
  const nodeId = resolveId(action.nodeId, tempIdMap);
  if (!nodeId) return;

  const objects = useAppStore.getState().objects;
  const obj = objects[nodeId];
  if (!obj) return;

  if (args.fills && Array.isArray(args.fills)) {
    const fills = pluginFillsToClone(args.fills as Record<string, unknown>[]);
    dispatch({
      type: "object.updated",
      payload: {
        id: nodeId,
        changes: { fills },
        previousValues: { fills: obj.fills },
      },
    });
    return;
  }

  // Hex string → solid fill
  if (typeof args.value === "string" && (args.value as string).startsWith("#")) {
    dispatch({
      type: "object.updated",
      payload: {
        id: nodeId,
        changes: {
          fills: [{
            id: nanoid(),
            type: "solid" as const,
            color: args.value as string,
            opacity: 1,
            visible: true,
          }],
        },
        previousValues: { fills: obj.fills },
      },
    });
    return;
  }

  // Color object { r, g, b } → solid fill
  if (args.property === "color" && typeof args.value === "object" && args.value !== null) {
    const c = args.value as { r: number; g: number; b: number };
    dispatch({
      type: "object.updated",
      payload: {
        id: nodeId,
        changes: {
          fills: [{
            id: nanoid(),
            type: "solid" as const,
            color: rgbToHex(c.r, c.g, c.b),
            opacity: 1,
            visible: true,
          }],
        },
        previousValues: { fills: obj.fills },
      },
    });
  }
}

function handleSetStroke(action: ActionDescriptor, tempIdMap: Map<string, string>) {
  const dispatch = useAppStore.getState().dispatch;
  const args = (action.args ?? {}) as Args;
  const nodeId = resolveId(action.nodeId, tempIdMap);
  if (!nodeId) return;

  const obj = useAppStore.getState().objects[nodeId];
  if (!obj) return;

  const changes: Partial<CanvasObject> = {};
  if (args.strokes && Array.isArray(args.strokes)) {
    changes.strokes = (args.strokes as Record<string, unknown>[]).map((s) =>
      pluginStrokeToClone(s as { type: "SOLID"; color: { r: number; g: number; b: number }; opacity?: number }),
    );
  }
  if (typeof args.weight === "number") {
    changes.strokeWidth = args.weight;
  }

  dispatch({
    type: "object.updated",
    payload: {
      id: nodeId,
      changes,
      previousValues: { strokes: obj.strokes, strokeWidth: obj.strokeWidth },
    },
  });
}

function handleSetEffect(action: ActionDescriptor, tempIdMap: Map<string, string>) {
  const dispatch = useAppStore.getState().dispatch;
  const args = (action.args ?? {}) as Args;
  const nodeId = resolveId(action.nodeId, tempIdMap);
  if (!nodeId) return;

  const obj = useAppStore.getState().objects[nodeId];
  if (!obj) return;

  if (args.effects && Array.isArray(args.effects)) {
    dispatch({
      type: "object.updated",
      payload: {
        id: nodeId,
        changes: {
          effects: (args.effects as Record<string, unknown>[]).map((e) =>
            pluginEffectToClone(e as { type: string; color?: { r: number; g: number; b: number; a?: number }; offset?: { x: number; y: number }; radius?: number; spread?: number; visible?: boolean }),
          ),
        },
        previousValues: { effects: obj.effects },
      },
    });
  }
}

function handleSetProperty(action: ActionDescriptor, tempIdMap: Map<string, string>) {
  const dispatch = useAppStore.getState().dispatch;
  const args = (action.args ?? {}) as Args;
  const nodeId = resolveId(action.nodeId, tempIdMap);
  if (!nodeId) return;

  const obj = useAppStore.getState().objects[nodeId];
  if (!obj) return;

  const property = args.property as string;
  const value = args.value;

  const propMap: Record<string, string> = {
    opacity: "opacity",
    visible: "visible",
    locked: "locked",
    name: "name",
  };

  const cloneProp = propMap[property] ?? property;
  dispatch({
    type: "object.updated",
    payload: {
      id: nodeId,
      changes: { [cloneProp]: value } as Partial<CanvasObject>,
      previousValues: { [cloneProp]: (obj as unknown as Record<string, unknown>)[cloneProp] } as Partial<CanvasObject>,
    },
  });
}

function handleResize(action: ActionDescriptor, tempIdMap: Map<string, string>) {
  const dispatch = useAppStore.getState().dispatch;
  const args = (action.args ?? {}) as Args;
  const nodeId = resolveId(action.nodeId, tempIdMap);
  if (!nodeId) return;

  const obj = useAppStore.getState().objects[nodeId];
  if (!obj) return;

  const changes: Partial<CanvasObject> = {};
  if (typeof args.width === "number") changes.width = args.width;
  if (typeof args.height === "number") changes.height = args.height;

  dispatch({
    type: "object.updated",
    payload: {
      id: nodeId,
      changes,
      previousValues: { width: obj.width, height: obj.height },
    },
  });
}

function handleDeleteNode(action: ActionDescriptor, tempIdMap: Map<string, string>) {
  const dispatch = useAppStore.getState().dispatch;
  const nodeId = resolveId(action.nodeId, tempIdMap);
  if (!nodeId) return;

  const obj = useAppStore.getState().objects[nodeId];
  if (!obj) return;

  dispatch({
    type: "object.deleted",
    payload: { id: nodeId, object: obj },
  });
}

function handleDeleteChildren(action: ActionDescriptor, tempIdMap: Map<string, string>) {
  const dispatch = useAppStore.getState().dispatch;
  const nodeId = resolveId(action.nodeId, tempIdMap);
  if (!nodeId) return;

  const objects = useAppStore.getState().objects;
  const parent = objects[nodeId];
  if (!parent || !parent.childIds.length) return;

  // Collect all descendants (depth-first) so we remove children before parents
  const toDelete: string[] = [];
  const collectDescendants = (id: string) => {
    const node = objects[id];
    if (!node) return;
    for (const childId of [...node.childIds].reverse()) {
      collectDescendants(childId);
    }
    toDelete.push(id);
  };
  for (const childId of parent.childIds) {
    collectDescendants(childId);
  }

  const deleteObjects: Record<string, CanvasObject> = {};
  for (const id of toDelete) {
    if (objects[id]) deleteObjects[id] = objects[id];
  }

  dispatch({
    type: "objects.deleted.batch",
    payload: { ids: toDelete, objects: deleteObjects },
  });
}

function handleSetCornerRadius(action: ActionDescriptor, tempIdMap: Map<string, string>) {
  const dispatch = useAppStore.getState().dispatch;
  const args = (action.args ?? {}) as Args;
  const nodeId = resolveId(action.nodeId, tempIdMap);
  if (!nodeId) return;

  const obj = useAppStore.getState().objects[nodeId];
  if (!obj) return;

  const radius = (args.radius ?? args.value) as number;
  const props = { ...obj.properties } as Record<string, unknown>;
  props.borderRadius = radius;

  dispatch({
    type: "object.updated",
    payload: {
      id: nodeId,
      changes: { properties: props as unknown as CanvasObject["properties"] },
      previousValues: { properties: obj.properties },
    },
  });
}

function handleApplyImageFill(action: ActionDescriptor, tempIdMap: Map<string, string>) {
  const dispatch = useAppStore.getState().dispatch;
  const args = (action.args ?? {}) as Args;
  const targetNodeIdRaw = (args.targetNodeId as string) ?? action.nodeId;
  const nodeId = resolveId(targetNodeIdRaw, tempIdMap);
  if (!nodeId) return;

  const obj = useAppStore.getState().objects[nodeId];
  if (!obj) return;

  let dataUrl: string | undefined;

  // Raw PNG bytes -> data URL
  if (Array.isArray(args.imageData)) {
    const bytes = args.imageData as number[];
    const uint8 = new Uint8Array(bytes);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    dataUrl = `data:image/png;base64,${btoa(binary)}`;
  } else if (typeof args.dataUrl === "string") {
    dataUrl = args.dataUrl as string;
  }

  if (!dataUrl) return;

  dispatch({
    type: "object.updated",
    payload: {
      id: nodeId,
      changes: {
        fills: [{
          id: nanoid(),
          type: "image" as const,
          imageUrl: dataUrl,
          fit: "fill" as const,
          opacity: 1,
          visible: true,
        }],
      },
      previousValues: { fills: obj.fills },
    },
  });
}

// ─── Main executor ───────────────────────────────────────────────────

/**
 * Execute an array of gen-ai ActionDescriptors against the figma-clone store.
 *
 * Handles tempId resolution, parent-child wiring, and all action methods.
 */
export function executeActions(
  actions: ActionDescriptor[],
  existingTempIdMap?: Map<string, string>,
): ExecuteResult {
  const tempIdMap = new Map<string, string>(existingTempIdMap ?? []);
  const createdIds: string[] = [];
  let rootFrameId: string | undefined;

  // "__prev" support: track last created node for chaining
  let lastCreatedId: string | undefined;

  for (const action of actions) {
    // Resolve "__prev" references
    if (action.nodeId === "__prev" && lastCreatedId) {
      action.nodeId = lastCreatedId;
    }
    if (action.parentId === "__prev" && lastCreatedId) {
      action.parentId = lastCreatedId;
    }

    try {
      switch (action.method) {
        case "createFrame": {
          const id = handleCreate(action, "frame", frameProperties, tempIdMap, createdIds);
          lastCreatedId = id;
          if (!action.parentId && !rootFrameId) rootFrameId = id;
          break;
        }
        case "createRectangle": {
          const id = handleCreate(action, "rectangle", rectangleProperties, tempIdMap, createdIds);
          lastCreatedId = id;
          break;
        }
        case "createEllipse": {
          const id = handleCreate(action, "ellipse", (a) => ellipseProperties(), tempIdMap, createdIds);
          lastCreatedId = id;
          break;
        }
        case "createVector": {
          const id = handleCreate(action, "vector", vectorProperties, tempIdMap, createdIds);
          lastCreatedId = id;
          break;
        }
        case "createText": {
          const id = handleCreate(action, "text", textProperties, tempIdMap, createdIds);
          lastCreatedId = id;
          break;
        }
        case "setFill":
          handleSetFill(action, tempIdMap);
          break;
        case "setStroke":
          handleSetStroke(action, tempIdMap);
          break;
        case "setEffect":
          handleSetEffect(action, tempIdMap);
          break;
        case "setProperty":
          handleSetProperty(action, tempIdMap);
          break;
        case "setCornerRadius":
          handleSetCornerRadius(action, tempIdMap);
          break;
        case "resize":
          handleResize(action, tempIdMap);
          break;
        case "deleteNode":
          handleDeleteNode(action, tempIdMap);
          break;
        case "deleteChildren":
          handleDeleteChildren(action, tempIdMap);
          break;
        case "applyImageFill":
          handleApplyImageFill(action, tempIdMap);
          break;
        default:
          console.warn(`[action-adapter] Unknown method: ${action.method}`);
      }
    } catch (err) {
      console.error(`[action-adapter] Error executing ${action.method}:`, err);
    }
  }

  return { createdIds, rootFrameId, tempIdMap };
}
