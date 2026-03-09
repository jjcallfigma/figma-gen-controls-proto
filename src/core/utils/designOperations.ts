/**
 * Parse AI design operations and apply them to the canvas via store.dispatch().
 *
 * Operations supported:
 *   - create: Add a new object to the canvas
 *   - update: Modify properties of an existing object
 *   - delete: Remove an object (and descendants)
 *   - reparent: Move an object to a different parent
 *   - duplicate: Deep-clone an object (and all descendants) with new IDs
 */

import { nanoid } from "nanoid";
import {
  AutoLayoutItemSizing,
  CanvasObject,
  DropShadowEffect,
  Effect,
  Fill,
  FrameProperties,
  InnerShadowEffect,
  LayerBlurEffect,
  SolidFill,
  SolidStroke,
  Stroke,
  TextProperties,
  VectorProperties,
} from "@/types/canvas";
import { useAppStore } from "@/core/state/store";
import { ClipboardService } from "@/core/services/clipboard";
import { triggerImmediateAutoLayoutSync } from "@/core/utils/autoLayout";

// ─── Operation types ────────────────────────────────────────────────

export interface CreateOperation {
  op: "create";
  tempId: string;
  object: {
    type: "frame" | "text" | "vector";
    name: string;
    width?: number;
    height?: number;
    autoLayoutSizing?: {
      horizontal?: string;
      vertical?: string;
    };
    opacity?: number;
    fills?: Array<{
      type: string;
      color: string;
      opacity?: number;
      visible?: boolean;
    }>;
    strokes?: Array<{
      type: string;
      color: string;
      opacity?: number;
      visible?: boolean;
    }>;
    strokeWidth?: number;
    properties: any;
  };
  parentId: string; // Existing object ID or a tempId from an earlier create
  insertIndex?: number;
}

export interface UpdateOperation {
  op: "update";
  targetId: string;
  changes: {
    name?: string;
    width?: number;
    height?: number;
    opacity?: number;
    fills?: Array<{
      type: string;
      color: string;
      opacity?: number;
      visible?: boolean;
    }>;
    strokes?: Array<{
      type: string;
      color: string;
      opacity?: number;
      visible?: boolean;
    }>;
    strokeWidth?: number;
    effects?: Array<{
      type: string;
      color?: string;
      opacity?: number;
      offsetX?: number;
      offsetY?: number;
      blur?: number;
      spread?: number;
      visible?: boolean;
    }>;
    autoLayoutSizing?: {
      horizontal?: string;
      vertical?: string;
    };
    properties?: any;
    /** World x position (or parent-relative for children) */
    x?: number;
    /** World y position (or parent-relative for children) */
    y?: number;
  };
}

export interface DeleteOperation {
  op: "delete";
  targetId: string;
}

export interface ReparentOperation {
  op: "reparent";
  targetId: string;
  newParentId: string;
  insertIndex?: number;
}

export interface DuplicateOperation {
  op: "duplicate";
  targetId: string;
  /** Optional new parent for the duplicate (defaults to same parent as original) */
  parentId?: string;
  /** Optional changes to apply to the duplicate after cloning (e.g. new name, position offset) */
  changes?: {
    name?: string;
    x?: number;
    y?: number;
  };
}

export type DesignOperation =
  | CreateOperation
  | UpdateOperation
  | DeleteOperation
  | ReparentOperation
  | DuplicateOperation;

// ─── Parse operations from AI response ──────────────────────────────

/**
 * Extract the JSON operations array from the full AI response text.
 * Tries multiple strategies:
 *   1. ```json ... ``` fenced blocks
 *   2. ``` ... ``` fenced blocks (no language tag)
 *   3. Top-level JSON array starting with [{"op":
 */
export function parseOperationsFromResponse(fullText: string): DesignOperation[] {
  // Strategy 1: ```json ... ``` fenced block
  let jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/);

  // Strategy 2: ``` ... ``` fenced block (no language tag)
  if (!jsonMatch) {
    jsonMatch = fullText.match(/```\s*([\s\S]*?)```/);
  }

  // Strategy 3: Find a raw JSON array containing operations
  if (!jsonMatch) {
    const arrayMatch = fullText.match(/\[\s*\{\s*"op"\s*:/);
    if (arrayMatch && arrayMatch.index !== undefined) {
      // Find the matching closing bracket
      let depth = 0;
      let start = arrayMatch.index;
      for (let i = start; i < fullText.length; i++) {
        if (fullText[i] === "[") depth++;
        else if (fullText[i] === "]") {
          depth--;
          if (depth === 0) {
            jsonMatch = [fullText.slice(start, i + 1), fullText.slice(start, i + 1)];
            break;
          }
        }
      }
    }
  }

  if (!jsonMatch) {
    console.warn("[designOperations] No JSON block found in response");
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[1].trim());
    // The AI may return the array directly or wrapped in an object
    const ops = Array.isArray(parsed) ? parsed : parsed.operations;
    if (!Array.isArray(ops)) {
      console.warn("[designOperations] Parsed JSON is not an array");
      return [];
    }
    return ops as DesignOperation[];
  } catch (err) {
    console.error("[designOperations] Failed to parse operations JSON:", err);
    return [];
  }
}

// ─── Apply operations ───────────────────────────────────────────────

/**
 * Apply an array of design operations to the canvas.
 *
 * Creates are batched into a single `objects.pasted` event (like the
 * make-to-design flow) so parent/child relationships are wired atomically
 * and the auto-layout DOM observer sees all objects at once — this is
 * critical for text nodes whose size is computed from DOM content.
 *
 * @param operations  The operations to apply
 * @param originX     For new root-level objects, world X position
 * @param originY     For new root-level objects, world Y position
 * @returns           Summary of what was applied
 */
export function applyDesignOperations(
  operations: DesignOperation[],
  originX: number = 0,
  originY: number = 0,
  /** Persistent temp-ID map for resolving cross-call references */
  persistentTempIdMap?: Map<string, string>
): { created: number; updated: number; deleted: number; reparented: number; duplicated: number; tempIdMap: Map<string, string>; updatedObjectIds: string[]; createdObjectIds: string[] } {
  const dispatch = useAppStore.getState().dispatch;

  // Map of tempId → real nanoid for newly created objects.
  // Merge with persistent map from earlier calls so cross-call references resolve.
  const tempIdMap = new Map<string, string>(persistentTempIdMap || []);
  const now = Date.now();

  const updatedObjectIds: string[] = [];
  const createdObjectIdsThisBatch: string[] = [];
  const result = { created: 0, updated: 0, deleted: 0, reparented: 0, duplicated: 0, tempIdMap, updatedObjectIds, createdObjectIds: createdObjectIdsThisBatch };

  // Track frames that need auto-layout sync after operations
  const framesNeedingSync = new Set<string>();

  // ── Phase 1: Collect all create operations into a batch ──────────

  const objectsToPaste: CanvasObject[] = [];
  let createIdx = 0;

  // Normalize a temp ID reference: strip common prefixes like "temp:", "temp_", "temp-"
  // that the AI may add when referencing parents but not when defining tempIds.
  function normalizeTempRef(id: string): string {
    if (id.startsWith("temp:")) return id.slice(5);
    if (id.startsWith("temp_")) return id.slice(5);
    if (id.startsWith("temp-")) return id.slice(5);
    return id;
  }

  const existingIds = new Set(Object.keys(useAppStore.getState().objects));

  function generateUniqueId(usedInBatch: Set<string>): string {
    let id: string;
    let attempts = 0;
    const maxAttempts = 100;
    do {
      id = nanoid();
      if (!existingIds.has(id) && !usedInBatch.has(id)) break;
      attempts++;
    } while (attempts < maxAttempts);
    return id;
  }

  const usedIdsThisBatch = new Set<string>();

  // Pre-assign IDs for all creates so cross-references between new
  // objects (e.g. a new frame + its new text child) resolve correctly.
  for (const op of operations) {
    if (op.op === "create") {
      const normalizedTempId = normalizeTempRef(op.tempId);
      const realId = generateUniqueId(usedIdsThisBatch);
      usedIdsThisBatch.add(realId);
      createdObjectIdsThisBatch.push(realId);
      // Store under both the original tempId and normalized form
      tempIdMap.set(op.tempId, realId);
      if (normalizedTempId !== op.tempId) {
        tempIdMap.set(normalizedTempId, realId);
      }
    }
  }

  // Topologically sort create operations: parents before children.
  // This ensures that when we process a child, its parent is already in objectsToPaste.
  const creates = operations.filter((op): op is CreateOperation => op.op === "create");
  const sortedCreates = topologicalSortCreates(creates, tempIdMap);

  // Space root-level frames side-by-side (horizontal gap between each)
  const ROOT_SPACING_GAP = 40;
  const DEFAULT_ROOT_WIDTH = 200;
  let rootOffsetX = 0;

  for (const op of sortedCreates) {
    const realId = tempIdMap.get(op.tempId)!;

    // Resolve parentId: try tempIdMap first (for temp references), then use as-is
    let resolvedParentId = op.parentId || "";

    if (resolvedParentId) {
      // Check if it's a tempId we know about — try the raw value and normalized form
      const mapped =
        tempIdMap.get(resolvedParentId) ||
        tempIdMap.get(normalizeTempRef(resolvedParentId));
      if (mapped) {
        resolvedParentId = mapped;
      } else {
        // Not in tempIdMap — check if it exists in the store as a real ID
        const existsInStore = !!useAppStore.getState().objects[resolvedParentId];
        if (!existsInStore) {
          // Unknown parent ID — it's not a temp we assigned and not in the store.
          // The AI may have used a stale or incorrect ID.
          // Instead of skipping the child (which cascades to skip all descendants),
          // create it as a root-level object so it's at least visible.
          console.warn(
            `[designOperations] Parent "${op.parentId}" not found for "${op.object.name}" (tempId: ${op.tempId}). ` +
            `Known temps: ${Array.from(tempIdMap.keys()).join(", ") || "none"}. Creating as root.`
          );
          resolvedParentId = "";
        }
      }
    }

    const isRoot = !resolvedParentId;
    const rootX = originX + rootOffsetX;
    const rootY = originY;

    const canvasObj = buildCanvasObject(
      realId,
      op.object,
      resolvedParentId || undefined,
      now + createIdx,
      createIdx,
      rootX,
      rootY,
      isRoot
    );

    objectsToPaste.push(canvasObj);
    createIdx++;
    result.created++;

    // For next root-level create, place it to the right of this one with a gap
    if (isRoot) {
      const w = canvasObj.width && canvasObj.width > 0 ? canvasObj.width : DEFAULT_ROOT_WIDTH;
      rootOffsetX += w + ROOT_SPACING_GAP;
    }

    // Track the parent frame for auto-layout sync
    if (resolvedParentId) {
      framesNeedingSync.add(resolvedParentId);
    }
  }

  // Dispatch all creates as a single batch (like aiGenerateDesign)
  // `objects.pasted` wires parent→child automatically. Don't auto-select AI-generated objects.
  if (objectsToPaste.length > 0) {
    dispatch({
      type: "objects.pasted" as any,
      payload: { pastedObjects: objectsToPaste, selectPasted: false },
    });
  }

  // ── Phase 2: Apply update, delete, and reparent operations ───────

  for (const op of operations) {
    switch (op.op) {
      case "create":
        // Already handled in Phase 1
        break;

      case "update": {
        // Resolve target ID (could be a tempId from a create in this or a previous batch)
        const resolvedTargetId = tempIdMap.get(op.targetId) || op.targetId;
        const targetObj = useAppStore.getState().objects[resolvedTargetId];
        if (!targetObj) {
          console.warn(
            `[designOperations] Target ${op.targetId} not found, skipping update`
          );
          break;
        }

        const changes = buildUpdateChanges(op.changes, targetObj);
        if (Object.keys(changes).length === 0) break;

        // Build previousValues for undo
        const previousValues: Partial<CanvasObject> = {};
        for (const key of Object.keys(changes) as (keyof CanvasObject)[]) {
          (previousValues as any)[key] = (targetObj as any)[key];
        }

        dispatch({
          type: "object.updated",
          payload: {
            id: resolvedTargetId,
            changes,
            previousValues,
          },
        });

        updatedObjectIds.push(resolvedTargetId);

        // Track parent for auto-layout sync
        if (targetObj.parentId) {
          framesNeedingSync.add(targetObj.parentId);
        }

        result.updated++;
        break;
      }

      case "delete": {
        const targetObj = useAppStore.getState().objects[op.targetId];
        if (!targetObj) {
          console.warn(
            `[designOperations] Target ${op.targetId} not found, skipping delete`
          );
          break;
        }

        // Collect all descendants
        const toDelete = collectDescendants(op.targetId);

        // Remove from parent's childIds first
        if (targetObj.parentId) {
          const parent =
            useAppStore.getState().objects[targetObj.parentId];
          if (parent) {
            dispatch({
              type: "object.updated",
              payload: {
                id: targetObj.parentId,
                changes: {
                  childIds: parent.childIds.filter(
                    (id) => id !== op.targetId
                  ),
                },
                previousValues: { childIds: parent.childIds },
                skipOverrideCreation: true,
              },
            });
            framesNeedingSync.add(targetObj.parentId);
          }
        }

        // Delete all descendants in a single batch
        const deletedObjs: Record<string, any> = {};
        for (const id of toDelete.reverse()) {
          const obj = useAppStore.getState().objects[id];
          if (obj) deletedObjs[id] = obj;
        }
        if (Object.keys(deletedObjs).length > 0) {
          dispatch({
            type: "objects.deleted.batch",
            payload: { ids: Object.keys(deletedObjs), objects: deletedObjs },
          });
        }

        result.deleted++;
        break;
      }

      case "reparent": {
        const targetObj = useAppStore.getState().objects[op.targetId];
        const newParent =
          useAppStore.getState().objects[op.newParentId];

        if (!targetObj || !newParent) {
          console.warn(
            `[designOperations] Reparent target or parent not found`
          );
          break;
        }

        const oldParentId = targetObj.parentId;
        const insertIdx =
          op.insertIndex !== undefined
            ? op.insertIndex
            : newParent.childIds.length;

        // Remove from old parent
        if (oldParentId) {
          const oldParent =
            useAppStore.getState().objects[oldParentId];
          if (oldParent) {
            dispatch({
              type: "object.updated",
              payload: {
                id: oldParentId,
                changes: {
                  childIds: oldParent.childIds.filter(
                    (id) => id !== op.targetId
                  ),
                },
                previousValues: { childIds: oldParent.childIds },
                skipOverrideCreation: true,
              },
            });
            framesNeedingSync.add(oldParentId);
          }
        }

        // Add to new parent
        const currentNewParent =
          useAppStore.getState().objects[op.newParentId];
        if (currentNewParent) {
          const newChildIds = [...currentNewParent.childIds];
          newChildIds.splice(
            Math.min(insertIdx, newChildIds.length),
            0,
            op.targetId
          );

          dispatch({
            type: "object.updated",
            payload: {
              id: op.newParentId,
              changes: { childIds: newChildIds },
              previousValues: {
                childIds: currentNewParent.childIds,
              },
              skipOverrideCreation: true,
            },
          });
        }

        // Update the object's parentId
        dispatch({
          type: "object.updated",
          payload: {
            id: op.targetId,
            changes: { parentId: op.newParentId },
            previousValues: { parentId: oldParentId },
            skipOverrideCreation: true,
          },
        });

        framesNeedingSync.add(op.newParentId);
        result.reparented++;
        break;
      }

      case "duplicate": {
        const sourceObj = useAppStore.getState().objects[op.targetId];
        if (!sourceObj) {
          console.warn(`[designOperations] Duplicate source not found: ${op.targetId}`);
          break;
        }

        const allObjects = useAppStore.getState().objects;
        const targetParentId = op.parentId || sourceObj.parentId;
        const parent = targetParentId ? allObjects[targetParentId] : null;
        const hasAutoLayout = parent?.properties?.type === "frame" &&
          (parent.properties as FrameProperties).autoLayout?.mode;

        const { duplicatedObjects, idMapping } = ClipboardService.prepareObjectsForDuplication(
          [sourceObj],
          {
            targetParentId,
            placementStrategy: hasAutoLayout ? "frame-autolayout" : "canvas-shift",
            allObjects,
          },
        );

        if (op.changes) {
          const rootDup = duplicatedObjects.find((o) => idMapping.get(op.targetId) === o.id);
          if (rootDup) {
            if (op.changes.name) rootDup.name = op.changes.name;
            if (op.changes.x !== undefined) rootDup.x = op.changes.x;
            if (op.changes.y !== undefined) rootDup.y = op.changes.y;
          }
        }

        if (duplicatedObjects.length > 0) {
          dispatch({
            type: "objects.duplicated",
            payload: {
              duplicatedObjects,
              originalIds: [op.targetId],
            },
          });

          const rootDupId = idMapping.get(op.targetId);
          if (rootDupId) {
            tempIdMap.set(`dup_${op.targetId}`, rootDupId);
          }
          if (targetParentId) framesNeedingSync.add(targetParentId);
          result.duplicated++;
          createdObjectIdsThisBatch.push(...duplicatedObjects.map((o) => o.id));
        }
        break;
      }

      default:
        console.warn(`[designOperations] Unknown operation: ${(op as any).op}`);
    }
  }

  // ── Phase 3: Trigger auto-layout sync for affected frames ────────
  //
  // Wait for the DOM to render the new/updated objects, then trigger
  // auto-layout sync.  Two passes: the first lets the DOM render and
  // measures initial sizes; the second catches anything that settled
  // late (e.g. text nodes whose fonts were still loading).
  if (framesNeedingSync.size > 0) {
    const runSync = () => {
      const currentState = useAppStore.getState();
      for (const frameId of framesNeedingSync) {
        triggerImmediateAutoLayoutSync(
          frameId,
          currentState.objects,
          currentState.viewport,
          currentState.dispatch
        );
      }
    };

    // First pass — DOM should be rendered
    setTimeout(runSync, 150);
    // Second pass — catches late-settling text measurements
    setTimeout(runSync, 500);
  }

  return result;
}

// ─── Helper: topologically sort creates (parents before children) ────

function topologicalSortCreates(
  creates: CreateOperation[],
  tempIdMap: Map<string, string>
): CreateOperation[] {
  // Normalize temp ID: strip common prefixes (temp:, temp_, temp-)
  function normalize(id: string): string {
    if (id.startsWith("temp:")) return id.slice(5);
    if (id.startsWith("temp_")) return id.slice(5);
    if (id.startsWith("temp-")) return id.slice(5);
    return id;
  }

  // Build a lookup: tempId → CreateOperation (store under both raw and normalized)
  const byTempId = new Map<string, CreateOperation>();
  for (const op of creates) {
    byTempId.set(op.tempId, op);
    const normalized = normalize(op.tempId);
    if (normalized !== op.tempId) {
      byTempId.set(normalized, op);
    }
  }

  const sorted: CreateOperation[] = [];
  const visited = new Set<string>();

  function visit(op: CreateOperation) {
    if (visited.has(op.tempId)) return;
    visited.add(op.tempId);

    // If this op's parent is also being created in the same batch, visit parent first
    // Try both the raw parentId and normalized form
    const parentOp = op.parentId
      ? byTempId.get(op.parentId) || byTempId.get(normalize(op.parentId))
      : undefined;
    if (parentOp) {
      visit(parentOp);
    }

    sorted.push(op);
  }

  for (const op of creates) {
    visit(op);
  }

  return sorted;
}

// ─── Helper: collect descendants ────────────────────────────────────

function collectDescendants(objectId: string): string[] {
  const objects = useAppStore.getState().objects;
  const result: string[] = [objectId];
  const obj = objects[objectId];
  if (obj?.childIds) {
    for (const childId of obj.childIds) {
      result.push(...collectDescendants(childId));
    }
  }
  return result;
}

// ─── Helper: estimate text dimensions via OffscreenCanvas / Canvas 2D ──

let _measureCanvas: HTMLCanvasElement | null = null;
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null; // SSR guard
  if (!_measureCanvas) {
    _measureCanvas = document.createElement("canvas");
  }
  return _measureCanvas.getContext("2d");
}

/**
 * Measures the approximate pixel width & height of a text string using
 * Canvas 2D `measureText`.  Falls back to a simple heuristic if the
 * canvas API is unavailable (e.g. during SSR / tests).
 */
function measureTextDimensions(
  text: string,
  fontSize: number,
  fontWeight: number,
  fontFamily: string,
  lineHeight: { value: number; unit: string }
): { width: number; height: number } {
  // Resolve line-height to px
  const lhPx =
    lineHeight.unit === "%"
      ? (lineHeight.value / 100) * fontSize
      : lineHeight.value;

  const lines = text.split("\n");
  const lineCount = Math.max(lines.length, 1);

  const ctx = getMeasureContext();
  if (ctx) {
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
    let maxWidth = 0;
    for (const line of lines) {
      const m = ctx.measureText(line || " ");
      if (m.width > maxWidth) maxWidth = m.width;
    }
    return {
      width: Math.ceil(maxWidth) + 2, // +2 for sub-pixel rounding safety
      height: Math.ceil(lhPx * lineCount),
    };
  }

  // Fallback heuristic: average character width ≈ fontSize * 0.6
  const longestLine = lines.reduce(
    (a, b) => (a.length >= b.length ? a : b),
    ""
  );
  return {
    width: Math.ceil(longestLine.length * fontSize * 0.6) + 4,
    height: Math.ceil(lhPx * lineCount),
  };
}

// ─── Helper: build a CanvasObject from AI node data ─────────────────

function buildCanvasObject(
  id: string,
  node: CreateOperation["object"],
  parentId: string | undefined,
  createdAt: number,
  zIndex: number,
  originX: number,
  originY: number,
  isRoot: boolean
): CanvasObject {
  const fills = buildFills(node.fills);
  const strokes = buildStrokes(node.strokes);
  const effects = buildEffects((node as any).effects);

  const autoLayoutSizing = {
    horizontal: (node.autoLayoutSizing?.horizontal ||
      "fixed") as AutoLayoutItemSizing,
    vertical: (node.autoLayoutSizing?.vertical ||
      "fixed") as AutoLayoutItemSizing,
  };

  const baseObj: Partial<CanvasObject> = {
    id,
    name: node.name || `node-${zIndex}`,
    createdAt,
    x: isRoot ? originX : 0,
    y: isRoot ? originY : 0,
    width: Math.round(node.width || 0),
    height: Math.round(node.height || 0),
    rotation: 0,
    autoLayoutSizing,
    fills,
    strokes,
    strokeWidth: node.strokeWidth || undefined,
    effects: effects.length > 0 ? effects : undefined,
    opacity: node.opacity ?? 1,
    parentId,
    childIds: [],
    zIndex,
    visible: true,
    locked: false,
  };

  if (node.type === "text") {
    const props = node.properties || {};
    const content = props.content || "";
    const fontSize = props.fontSize || 14;
    const fontWeight = props.fontWeight || 400;
    const fontFamily = props.fontFamily || "Inter, sans-serif";
    const lineHeight = props.lineHeight || {
      value: Math.round(fontSize * 1.43),
      unit: "px",
    };

    // Determine text resize mode:
    // - Explicit resizeMode in properties takes priority
    // - If autoLayoutSizing.horizontal is "fill", use auto-height (fills width, wraps text)
    // - Otherwise default to auto-width (natural width)
    let resizeMode: "auto-width" | "auto-height" | "fixed" = "auto-width";
    if (props.resizeMode === "auto-height" || props.resizeMode === "fixed") {
      resizeMode = props.resizeMode;
    } else if (
      node.autoLayoutSizing?.horizontal === "fill" ||
      node.autoLayoutSizing?.horizontal === "FILL"
    ) {
      resizeMode = "auto-height";
    }

    // Estimate text dimensions so the node isn't created at 0×0.
    // The auto-layout DOM sync will refine these later, but having a
    // reasonable starting size prevents invisible text nodes.
    const measured = measureTextDimensions(content, fontSize, fontWeight, fontFamily, lineHeight);

    if (resizeMode === "auto-width") {
      baseObj.width = measured.width;
      baseObj.height = measured.height;
    } else if (resizeMode === "auto-height") {
      // For auto-height, keep explicit width if provided (or a reasonable default),
      // height will be computed by layout engine
      baseObj.width = node.width && node.width > 0 ? Math.round(node.width) : measured.width;
      baseObj.height = measured.height;
    } else {
      // Fixed: use explicit dimensions
      baseObj.width = node.width && node.width > 0 ? Math.round(node.width) : measured.width;
      baseObj.height = node.height && node.height > 0 ? Math.round(node.height) : measured.height;
    }

    // Extract text color from fills
    const textColor = extractTextColor(node.fills);

    // Build Slate content with color marks
    const slateContent = buildSlateContent(
      content,
      textColor,
      fontSize,
      fontWeight,
      fontFamily
    );

    return {
      ...baseObj,
      type: "text",
      fills: undefined, // Text uses Slate content for color
      properties: {
        type: "text",
        content,
        fontSize,
        fontFamily,
        fontWeight,
        textAlign: props.textAlign || "left",
        lineHeight,
        letterSpacing: props.letterSpacing || { value: 0, unit: "px" },
        resizeMode,
        slateContent: JSON.stringify(slateContent),
      } as TextProperties,
    } as CanvasObject;
  }

  // Vector
  if (node.type === "vector") {
    const props = node.properties || {};
    const vectorProps: VectorProperties = {
      type: "vector",
      vectorPaths: props.vectorPaths || undefined,
      svgContent: props.svgContent || undefined,
    };

    return {
      ...baseObj,
      type: "vector",
      properties: vectorProps,
    } as CanvasObject;
  }

  // Frame
  const props = node.properties || {};
  const autoLayout = props.autoLayout || undefined;

  const frameProps: FrameProperties = {
    type: "frame",
    borderRadius: props.borderRadius ?? 0,
    overflow: props.overflow || "visible",
    autoLayout: autoLayout
      ? {
          mode: autoLayout.mode || "none",
          gap: autoLayout.gap || 0,
          padding: autoLayout.padding || {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          },
          alignItems: autoLayout.alignItems || "start",
          justifyContent: autoLayout.justifyContent || "start",
          wrap: autoLayout.wrap || false,
        }
      : { mode: "none" },
  };

  return {
    ...baseObj,
    type: "frame",
    properties: frameProps,
  } as CanvasObject;
}

// ─── Helper: build update changes ───────────────────────────────────

function buildUpdateChanges(
  aiChanges: UpdateOperation["changes"],
  existingObj: CanvasObject
): Partial<CanvasObject> {
  const changes: Partial<CanvasObject> = {};

  if (aiChanges.name !== undefined) {
    changes.name = aiChanges.name;
  }

  if (aiChanges.width !== undefined) {
    changes.width = Math.round(aiChanges.width);
  }

  if (aiChanges.height !== undefined) {
    changes.height = Math.round(aiChanges.height);
  }

  if (aiChanges.x !== undefined) {
    changes.x = Math.round(aiChanges.x);
  }

  if (aiChanges.y !== undefined) {
    changes.y = Math.round(aiChanges.y);
  }

  if (aiChanges.opacity !== undefined) {
    changes.opacity = aiChanges.opacity;
  }

  if (aiChanges.strokeWidth !== undefined) {
    changes.strokeWidth = aiChanges.strokeWidth;
  }

  if (aiChanges.autoLayoutSizing) {
    changes.autoLayoutSizing = {
      horizontal: (aiChanges.autoLayoutSizing.horizontal ||
        existingObj.autoLayoutSizing?.horizontal ||
        "fixed") as AutoLayoutItemSizing,
      vertical: (aiChanges.autoLayoutSizing.vertical ||
        existingObj.autoLayoutSizing?.vertical ||
        "fixed") as AutoLayoutItemSizing,
    };
  }

  // Fills — for text nodes, we need to update Slate content instead
  if (aiChanges.fills !== undefined) {
    if (existingObj.type === "text") {
      // For text nodes, extract color from fills and update Slate content
      const textColor = extractTextColor(aiChanges.fills);
      const textProps = existingObj.properties as TextProperties;
      const content = textProps.content || "";
      const fontSize = textProps.fontSize || 14;
      const fontWeight = textProps.fontWeight || 400;
      const fontFamily = textProps.fontFamily || "Inter, sans-serif";
      const slateContent = buildSlateContent(
        content,
        textColor,
        fontSize,
        fontWeight,
        fontFamily
      );
      // Merge the slate content into properties changes
      if (!aiChanges.properties) {
        changes.properties = {
          ...textProps,
          slateContent: JSON.stringify(slateContent),
        } as TextProperties;
      }
    } else {
      changes.fills = buildFills(aiChanges.fills);
    }
  }

  if (aiChanges.strokes !== undefined) {
    changes.strokes = buildStrokes(aiChanges.strokes);
  }

  if (aiChanges.effects !== undefined) {
    changes.effects = buildEffects(aiChanges.effects);
  }

  // Properties — merge carefully
  if (aiChanges.properties) {
    if (aiChanges.properties.type === "text") {
      const existingTextProps = existingObj.properties as TextProperties;
      const newContent =
        aiChanges.properties.content ?? existingTextProps.content;
      const newFontSize =
        aiChanges.properties.fontSize ?? existingTextProps.fontSize;
      const newFontWeight =
        aiChanges.properties.fontWeight ?? existingTextProps.fontWeight;
      const newFontFamily =
        aiChanges.properties.fontFamily ?? existingTextProps.fontFamily;

      // Rebuild Slate content if text properties change
      const textColor =
        aiChanges.fills !== undefined
          ? extractTextColor(aiChanges.fills)
          : extractTextColorFromSlate(existingTextProps.slateContent);

      const slateContent = buildSlateContent(
        newContent,
        textColor,
        newFontSize,
        newFontWeight,
        newFontFamily
      );

      changes.properties = {
        type: "text",
        content: newContent,
        fontSize: newFontSize,
        fontFamily: newFontFamily,
        fontWeight: newFontWeight,
        textAlign:
          aiChanges.properties.textAlign ?? existingTextProps.textAlign,
        lineHeight:
          aiChanges.properties.lineHeight ?? existingTextProps.lineHeight,
        letterSpacing:
          aiChanges.properties.letterSpacing ??
          existingTextProps.letterSpacing,
        resizeMode: existingTextProps.resizeMode || "auto-width",
        slateContent: JSON.stringify(slateContent),
      } as TextProperties;
    } else if (aiChanges.properties.type === "vector") {
      const existingVectorProps =
        existingObj.properties as VectorProperties;
      changes.properties = {
        type: "vector",
        vectorPaths:
          aiChanges.properties.vectorPaths ??
          existingVectorProps.vectorPaths,
        svgContent:
          aiChanges.properties.svgContent ??
          existingVectorProps.svgContent,
      } as VectorProperties;
    } else if (aiChanges.properties.type === "frame") {
      const existingFrameProps =
        existingObj.properties as FrameProperties;
      const newAutoLayout = aiChanges.properties.autoLayout || undefined;

      changes.properties = {
        type: "frame",
        borderRadius:
          aiChanges.properties.borderRadius ??
          existingFrameProps.borderRadius ??
          0,
        overflow:
          aiChanges.properties.overflow ??
          existingFrameProps.overflow ??
          "visible",
        autoLayout: newAutoLayout
          ? {
              mode: newAutoLayout.mode || "none",
              gap: newAutoLayout.gap ?? 0,
              padding: newAutoLayout.padding || {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              },
              alignItems: newAutoLayout.alignItems || "start",
              justifyContent: newAutoLayout.justifyContent || "start",
              wrap: newAutoLayout.wrap || false,
            }
          : existingFrameProps.autoLayout || { mode: "none" },
      } as FrameProperties;
    }
  }

  return changes;
}

// ─── Shared helpers (mirrored from aiDesignGenerator.ts) ────────────

function buildFills(
  aiFills?: Array<{
    type: string;
    color: string;
    opacity?: number;
    visible?: boolean;
  }>
): Fill[] {
  if (!aiFills || aiFills.length === 0) return [];

  return aiFills
    .filter((f) => f.visible !== false && f.color)
    .map((f) => ({
      id: nanoid(),
      type: "solid" as const,
      visible: true,
      opacity: f.opacity ?? 1,
      color: normalizeColor(f.color),
    })) as SolidFill[];
}

function buildStrokes(
  aiStrokes?: Array<{
    type: string;
    color: string;
    opacity?: number;
    visible?: boolean;
  }>
): Stroke[] {
  if (!aiStrokes || aiStrokes.length === 0) return [];

  return aiStrokes
    .filter((s) => s.visible !== false && s.color)
    .map((s) => ({
      id: nanoid(),
      type: "solid" as const,
      visible: true,
      opacity: s.opacity ?? 1,
      color: normalizeColor(s.color),
    })) as SolidStroke[];
}

function buildEffects(
  aiEffects?: Array<{
    type: string;
    color?: string;
    opacity?: number;
    offsetX?: number;
    offsetY?: number;
    blur?: number;
    spread?: number;
    visible?: boolean;
  }>
): Effect[] {
  if (!aiEffects || aiEffects.length === 0) return [];

  return aiEffects
    .filter((e) => e.visible !== false)
    .map((e) => {
      const id = nanoid();
      if (e.type === "drop-shadow") {
        return {
          id,
          type: "drop-shadow",
          visible: true,
          color: normalizeColor(e.color || "#000000"),
          opacity: e.opacity ?? 0.25,
          offsetX: e.offsetX ?? 0,
          offsetY: e.offsetY ?? 4,
          blur: e.blur ?? 8,
          spread: e.spread ?? 0,
        } as DropShadowEffect;
      } else if (e.type === "inner-shadow") {
        return {
          id,
          type: "inner-shadow",
          visible: true,
          color: normalizeColor(e.color || "#000000"),
          opacity: e.opacity ?? 0.25,
          offsetX: e.offsetX ?? 0,
          offsetY: e.offsetY ?? 2,
          blur: e.blur ?? 4,
          spread: e.spread ?? 0,
        } as InnerShadowEffect;
      } else if (e.type === "layer-blur") {
        return {
          id,
          type: "layer-blur",
          visible: true,
          blur: e.blur ?? 4,
        } as LayerBlurEffect;
      }
      // Unknown effect type, skip
      return null;
    })
    .filter(Boolean) as Effect[];
}

function normalizeColor(color: string): string {
  if (!color) return "#000000";
  if (!color.startsWith("#")) return `#${color}`;
  return color.toUpperCase();
}

function extractTextColor(
  fills?: Array<{
    type: string;
    color: string;
    opacity?: number;
    visible?: boolean;
  }>
): string | undefined {
  if (!fills || fills.length === 0) return undefined;
  const solidFill = fills.find(
    (f) => f.type === "solid" && f.visible !== false && f.color
  );
  if (!solidFill) return undefined;
  const color = normalizeColor(solidFill.color);
  if (color === "#000000") return undefined;
  return color;
}

function extractTextColorFromSlate(
  slateContentStr?: string
): string | undefined {
  if (!slateContentStr) return undefined;
  try {
    const slateContent = JSON.parse(slateContentStr);
    if (Array.isArray(slateContent) && slateContent.length > 0) {
      const firstChild = slateContent[0]?.children?.[0];
      if (firstChild?.color) return firstChild.color;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function buildSlateContent(
  content: string,
  color: string | undefined,
  fontSize: number,
  fontWeight: number,
  fontFamily: string
): Array<{ type: string; children: Array<Record<string, any>> }> {
  const lines = content.split("\n");
  return lines.map((line) => {
    const leaf: Record<string, any> = { text: line };
    if (color) leaf.color = color;
    if (fontWeight && fontWeight !== 400) leaf.fontWeight = fontWeight;
    if (fontFamily && fontFamily !== "Inter" && fontFamily !== "Inter, sans-serif") leaf.fontFamily = fontFamily;
    return {
      type: "paragraph",
      children: [leaf],
    };
  });
}
